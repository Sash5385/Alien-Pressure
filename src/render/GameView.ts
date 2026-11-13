import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { STEP, type GameState, type Unit } from '../game/types';
import { alienReactions, barrelAt, BLAST, canLaunch, launch, LAUNCH, throwSmoke, type GrenadeResult, canThrow, checkEnd, coverSource, faceToward, hitChance, isFlanked, peekTile, isVisible, los, moveRange, throwGrenade, updateVision, type ShotResult } from '../game/combat';
import { sfx, setAmbient, type Sfx } from '../audio';
import { spawnCover, spawnModel, type Spawned } from './models';
import { reachable, findPath } from '../game/pathfinding';
import { CD_PER_AP, orderAttack, orderMove } from '../game/rt';

let TS = 1; // масштаб времени (реальный режим: ×0.5 / ×1)
export const setTimeScale = (x: number) => { TS = x; };
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms / TS));
const SPEED = 3.6; // клеток в секунду (было 6,5 — медленнее по просьбе)
const BULLET_SPEED = 18; // клеток/с: пулю видно в полёте (было 60)
const BURST_GAP = 190; // мс между патронами очереди (было 75)
const ALIEN_SPEED = 2.2; // пришельцы идут медленнее, чтобы их ход было видно
const speedOf = (u?: Unit) => (u?.team === 'alien' ? ALIEN_SPEED : SPEED);

interface Float { sprite: THREE.Sprite; t: number }
export type Weather = 'clear' | 'rain' | 'fog' | 'dusk' | 'dawn' | 'night';
export const WEATHER_NAME: Record<Weather, string> = { clear: 'ясно', rain: '☔ дождь', fog: '🌫 туман', dusk: '🌆 сумерки', dawn: '🌅 рассвет', night: '🌙 ночь' };
/** Погода миссии: чисто визуальная, зависит от номера миссии и локации. */
export const weatherOf = (missionNo: number, biome: string): Weather => (['clear', 'clear', 'rain', 'fog', 'dawn', 'dusk', 'night', 'clear'] as const)[(missionNo * 7 + (biome === 'forest' ? 3 : biome === 'lake' ? 6 : 0)) % 8];

export class GameView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ray = new THREE.Raycaster();
  private ground: THREE.Mesh;
  private coverMeshes = new Map<string, THREE.Object3D>();
  private fogData!: Uint8Array;
  private fogTex!: THREE.DataTexture;
  private unitMeshes = new Map<number, THREE.Object3D>();
  private rigs = new Map<number, Spawned>();
  private anim = new Map<number, string>();
  private dying = new Set<number>();
  private corpses = new Map<number, THREE.Object3D>(); // трупы остаются на карте
  private clock = new THREE.Clock();
  private goals = new Map<number, THREE.Vector3>();
  private highlight = new THREE.Group();
  private floats: Float[] = [];
  private tweens: { t: number; dur: number; fn: (k: number) => void; done: () => void }[] = [];
  private lastPos = new Map<number, string>();
  private blast!: THREE.Mesh;
  private sun!: THREE.DirectionalLight;
  private composer: EffectComposer | null = null;
  private quality: 'high' | 'low' = 'high';
  private autoCam = true;
  private focus: THREE.Vector3 | null = null;
  private vel = new Map<number, number>();
  private dpr = 1;
  private ft = 0.016;
  private frames = 0;
  private beaconMeshes = new Map<string, THREE.Object3D>();
  private mineMeshes = new Map<string, THREE.Object3D>();
  private trenchMeshes = new Map<string, THREE.Object3D>();
  private bridgeMeshes = new Map<string, THREE.Object3D>();
  private houseMeshes = new Map<number, { g: THREE.Object3D; hs: { x: number; y: number; w: number; h: number } }>();
  private waterMat?: THREE.MeshStandardMaterial;
  // состояние для звуков: по изменениям определяем перезарядку, лечение, стойку и т.д. (в т.ч. у ИИ)
  private sndReady = false;
  private lastAmmo = new Map<number, number>();
  private lastHp = new Map<number, number>();
  private lastBleed = new Map<number, boolean>();
  private lastStance = new Map<number, string>();
  private lastOw = new Map<number, boolean>();
  private crumbleAt = 0;
  private barrelMeshes = new Map<string, THREE.Object3D>();
  private fireMeshes = new Map<string, THREE.Group>();
  private scorchMeshes = new Map<string, THREE.Object3D>();
  private waterTex: THREE.CanvasTexture | null = null;
  private raf = 0;
  private down = { x: 0, y: 0 };

  constructor(private host: HTMLElement, private state: GameState, private onChange: () => void) {
    const n = state.size;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.dpr = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // сохраняет цвета и светлее, чем ACES
    this.renderer.toneMappingExposure = 3.5;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0b0e0c);
    this.scene.fog = new THREE.Fog(0x0b0e0c, 36, Math.max(90, n * 2.4));

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 300);
    this.camera.position.set(n / 2, 16, n - 1); // сначала смотрим на точку высадки (юг карты)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(n / 2, 0, n - 13);
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 64;
    // ПКМ занят поворотом бойца; сдвиг камеры — средняя кнопка (на тач — двумя пальцами)
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null as unknown as THREE.MOUSE };
    // тач: один палец двигает карту, два — поворот и масштаб щипком; сдвиг по земле, а не по экрану
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.screenSpacePanning = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('start', () => { this.focus = null; });

    this.hemi = new THREE.HemisphereLight(0xc2d0e0, 0x5a5040, 1.3);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
    this.sun = sun;
    sun.position.set(n, 20, n * 0.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    const c = sun.shadow.camera;
    c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.far = 140; // тень только вокруг камеры
    sun.target.position.set(n / 2, 0, n - 13);
    this.scene.add(sun, sun.target);

    // земля — ступенчатый рельеф (геометрия строится в buildTerrain)
    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, side: THREE.DoubleSide }));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.fogData = new Uint8Array(n * n * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, n, n, THREE.RGBAFormat);
    this.fogTex.minFilter = this.fogTex.magFilter = THREE.LinearFilter;
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(n, n),
      new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false }),
    );
    fog.rotation.x = -Math.PI / 2;
    fog.position.set(n / 2, 4.2, n / 2);
    this.setQuality((() => { try { const q = localStorage.getItem('alien-pressure:gfx'); if (q === 'high' || q === 'low') return q; } catch { /* ignore */ } return matchMedia('(pointer: coarse)').matches ? 'low' : 'high'; })(), false);
    try { this.autoCam = localStorage.getItem('alien-pressure:cam') !== 'manual'; } catch { /* ignore */ }
    fog.renderOrder = 5;
    this.scene.add(fog);

    this.blast = new THREE.Mesh(
      new THREE.RingGeometry(BLAST - 0.08, BLAST, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4422, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.blast.rotation.x = -Math.PI / 2;
    this.blast.position.y = 0.03;
    this.blast.visible = false;
    this.scene.add(this.blast);

    this.buildTerrain();
    this.applyWeather();
    this.buildCover();
    this.buildHouses();
    this.buildZone();
    this.buildBeacons();
    this.buildBarrels();
    this.buildBridges();
    this.scene.add(this.highlight);
    this.syncUnits(true);

    const el = this.renderer.domElement;
    // долгое нажатие на тач-экране = ПКМ (поворот бойца / отмена гранаты)
    let lp: number | undefined;
    let longFired = false;
    const cancelLp = () => { if (lp) { clearTimeout(lp); lp = undefined; } };
    el.addEventListener('pointerdown', e => {
      this.down = { x: e.clientX, y: e.clientY };
      longFired = false;
      cancelLp();
      if (e.pointerType === 'touch' && e.isPrimary) lp = window.setTimeout(() => { longFired = true; lp = undefined; this.rightClick(e); }, 550);
    });
    el.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) >= 8) cancelLp(); });
    el.addEventListener('pointercancel', cancelLp);
    el.addEventListener('pointerup', e => {
      cancelLp();
      if (longFired) { longFired = false; return; }
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) >= 5) return;
      if (e.button === 2) this.rightClick(e);
      else if (e.button === 0) void this.click(e);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointermove', e => this.onHover(e));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const rawDt = this.clock.getDelta();
      const dt = Math.min(0.05, rawDt);
      this.stepRain(dt);
      for (const [id, m] of this.unitMeshes) {
        const g = this.goals.get(id);
        const u = this.state.units.find(v => v.id === id);
        if (g && !this.dying.has(id)) {
          // постоянная скорость к цели (без рывков); при большом отставании догоняем быстрее
          const dx = g.x - m.position.x, dz = g.z - m.position.z, dist = Math.hypot(dx, dz);
          // разгон и торможение; бег ускоряется вместе со скоростью
          const vel = this.vel.get(id) ?? 0;
          const want = (dist > 1.6 ? dist * 5 : dist > 0.04 ? speedOf(u) : 0) * TS;
          const nv = vel + (want - vel) * (1 - Math.exp(-(want > vel ? 14 : 22) * dt));
          this.vel.set(id, nv);
          if (dist > 0.001) {
            const step = Math.min(dist, nv * dt);
            m.position.x += (dx / dist) * step;
            m.position.z += (dz / dist) * step;
          }
          m.position.y += (g.y - m.position.y) * (1 - Math.exp(-14 * dt)); // плавный подъём/спуск по рельефу
          const runA = this.rigs.get(id)?.actions.get('Run');
          if (runA) runA.timeScale = 0.6 + nv * 0.18;
          if (dist > 0.12 && this.rigs.has(id)) this.play(id, 'Run');
          else if (this.anim.get(id) === 'Run') this.play(id, 'Idle');
        }
        const sp = this.rigs.get(id);
        if (sp && u && !this.dying.has(id)) {
          // стойка: колено — клип Duck, лёжа — модель ложится на живот (плавно)
          const wantIdle = u.stance === 'kneel' ? 'Duck' : 'Idle';
          const cur = this.anim.get(id);
          if ((cur === 'Idle' || cur === 'Duck') && cur !== wantIdle && sp.actions.has(wantIdle)) this.play(id, wantIdle, wantIdle === 'Duck');
          const tp = u.stance === 'prone' ? 1.45 : 0;
          sp.inner.rotation.x += (tp - sp.inner.rotation.x) * (1 - Math.exp(-9 * dt));
          const k = sp.inner.rotation.x / 1.45;
          sp.inner.position.z = -0.5 * k;
          sp.inner.position.y = 0.16 * k;
        }
        if (u) { // плавный поворот по кратчайшей дуге
          const d = Math.atan2(Math.sin(u.facing - m.rotation.y), Math.cos(u.facing - m.rotation.y));
          m.rotation.y += d * (1 - Math.exp(-14 * dt));
        }
        this.rigs.get(id)?.mixer.update(dt * TS);
      }
      const tt = this.clock.elapsedTime;
      for (const g of this.fireMeshes.values()) g.children.forEach((c, i) => { c.scale.y = 0.7 + 0.55 * Math.abs(Math.sin(tt * 9 + (g.userData.phase as number) + i)); });
      for (const tw of this.tweens) { tw.t += rawDt * TS; const k = Math.min(1, tw.t / tw.dur); tw.fn(k); if (k >= 1) tw.done(); }
      this.tweens = this.tweens.filter(tw => tw.t < tw.dur);
      for (const f of this.floats) {
        f.t += 0.016; f.sprite.position.y += 0.012;
        (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t / 1.1);
      }
      this.floats = this.floats.filter(f => (f.t < 1.1 ? true : (this.scene.remove(f.sprite), false)));
      if (this.waterTex) { this.waterTex.offset.x += rawDt * 0.03; this.waterTex.offset.y += rawDt * 0.015; }
      this.stepCamera(dt);
      this.controls.update();
      { // камера и тень не выходят за карту; тень следует за камерой
        const t = this.controls.target, cx = Math.max(0, Math.min(n, t.x)), cz = Math.max(0, Math.min(n, t.z));
        if (cx !== t.x || cz !== t.z) { this.camera.position.x += cx - t.x; this.camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
        this.sun.position.set(t.x + 14, 30, t.z + 8);
        this.sun.target.position.set(t.x, 0, t.z);
        this.sun.target.updateMatrixWorld();
      }
      this.adaptDpr(rawDt);
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Высота клетки в мире. */
  private hy(x: number, y: number) {
    const n = this.state.size;
    return (this.state.height[Math.max(0, Math.min(n - 1, Math.floor(y)))]?.[Math.max(0, Math.min(n - 1, Math.floor(x)))] ?? 0) * STEP;
  }

  /** Камень: полное — крупная глыба, половинное — валун. */
  private makeRock(t: 'half' | 'full', x: number, y: number, hash: number): THREE.Object3D {
    const g = new THREE.Group();
    g.position.set(x + 0.5, this.hy(x, y), y + 0.5);
    g.rotation.y = hash;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(t === 'full' ? 0.55 : 0.42, 0), new THREE.MeshStandardMaterial({ color: [0x7d7a72, 0x6e6c66, 0x8a867a][hash % 3], roughness: 1, flatShading: true }));
    rock.scale.set(1.05, t === 'full' ? 1.55 : 0.75, 0.95);
    rock.position.y = t === 'full' ? 0.62 : 0.26;
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
    if (t === 'full') {
      const small = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), rock.material);
      small.position.set(0.3, 0.2, 0.25); small.castShadow = true;
      g.add(small);
    }
    return g;
  }

  /** Дома: целые (деревня в лесу и у реки) или разрушенные (руины). Полное укрытие, не разрушаются. */
  private buildHouses() {
    const ruined = this.state.biome === 'ruins';
    const walls = [0xcfc3a8, 0xb8a58a, 0xd9cdb4, 0xa79883];
    this.state.houses.forEach((hs, i) => {
      const g = new THREE.Group();
      const w = hs.w * 0.94, d = hs.h * 0.94, H = 1.7;
      g.position.set(hs.x + hs.w / 2, this.hy(hs.x, hs.y), hs.y + hs.h / 2);
      const wall = new THREE.MeshStandardMaterial({ color: walls[i % 4], roughness: 1, flatShading: true });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1 });
      const add = (m: THREE.Mesh, px: number, py: number, pz: number) => { m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); };
      if (!ruined) {
        add(new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wall), 0, H / 2, 0);
        const r = Math.hypot(w, d) / 2;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.12, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 1, flatShading: true }));
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(w / (r * Math.SQRT2) * 1.08, 1, d / (r * Math.SQRT2) * 1.08);
        add(roof, 0, H + 0.5, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.06), dark), 0, 0.4, d / 2 + 0.02);
        for (const sx of [-w * 0.3, w * 0.3]) add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.06), dark), sx, 1.0, d / 2 + 0.02);
        for (const sz of [-d * 0.28, d * 0.28]) add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.32), dark), w / 2 + 0.02, 1.0, sz);
      } else {
        // разрушенные стены разной высоты и обломки внутри
        for (let k = 0; k < hs.w * 2; k++) for (const sz of [-1, 1]) {
          if (Math.random() < 0.18) continue;
          const hh = 0.5 + Math.random() * 1.1;
          add(new THREE.Mesh(new THREE.BoxGeometry(0.46, hh, 0.14), wall), -w / 2 + 0.25 + k * 0.5, hh / 2, (d / 2) * sz);
        }
        for (let k = 0; k < hs.h * 2; k++) for (const sx of [-1, 1]) {
          if (Math.random() < 0.18) continue;
          const hh = 0.5 + Math.random() * 1.1;
          add(new THREE.Mesh(new THREE.BoxGeometry(0.14, hh, 0.46), wall), (w / 2) * sx, hh / 2, -d / 2 + 0.25 + k * 0.5);
        }
        for (let k = 0; k < 5; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.3 + Math.random() * 0.3, 0.2 + Math.random() * 0.3, 0.3 + Math.random() * 0.3), dark), (Math.random() - 0.5) * (w - 0.5), 0.15, (Math.random() - 0.5) * (d - 0.5));
      }
      this.scene.add(g);
      this.houseMeshes.set(hs.id, { g, hs });
    });
  }

  /** Окопы: тёмная яма в кольце мешков с песком. */
  private syncTrenches() {
    const live = new Set(this.state.trenches.map(t => `${t.x},${t.y}`));
    for (const t of this.state.trenches) {
      const k = `${t.x},${t.y}`;
      if (this.trenchMeshes.has(k)) continue;
      const g = new THREE.Group();
      g.position.set(t.x + 0.5, this.hy(t.x, t.y), t.y + 0.5);
      const pit = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16), new THREE.MeshBasicMaterial({ color: 0x1c150d }));
      pit.rotation.x = -Math.PI / 2; pit.position.y = 0.03;
      g.add(pit);
      const bag = new THREE.MeshStandardMaterial({ color: 0x9a8a62, roughness: 1 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const sb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.17, 0.16), bag);
        sb.position.set(Math.cos(a) * 0.42, 0.09, Math.sin(a) * 0.42);
        sb.rotation.y = -a + Math.PI / 2;
        sb.castShadow = true;
        g.add(sb);
      }
      this.scene.add(g);
      this.trenchMeshes.set(k, g);
      if (this.sndReady) sfx('dig');
    }
    for (const [k, g] of this.trenchMeshes) if (!live.has(k)) { this.scene.remove(g); this.trenchMeshes.delete(k); }
  }

  /** Запасной вид: куст (половинное укрытие) или дерево из примитивов. */
  private makePlant(t: 'half' | 'full', x: number, y: number, hash: number): THREE.Object3D {
    const g = new THREE.Group();
    g.position.set(x + 0.5, this.hy(x, y), y + 0.5);
    g.rotation.y = hash;
    if (t === 'half') {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a2e, flatShading: true }));
      b.position.y = 0.3; b.scale.set(1.1, 0.8, 1.1); b.castShadow = true;
      g.add(b);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x5a3f25 }));
      trunk.position.y = 0.4; trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 7), new THREE.MeshStandardMaterial({ color: 0x2f6a2a, flatShading: true }));
      crown.position.y = 1.3; crown.castShadow = true;
      g.add(trunk, crown);
    }
    return g;
  }

  /** Ступенчатый рельеф: верх каждой клетки на своей высоте и отвесные стены между уровнями. */
  private buildGround() {
    const { size: n, height } = this.state;
    const pos: number[] = [], uvs: number[] = [], cols: number[] = [], idx: number[] = [];
    const quad = (p: number[][], uv: number[][], c: number[]) => {
      const i0 = pos.length / 3;
      p.forEach((v, k) => { pos.push(v[0], v[1], v[2]); uvs.push(uv[k][0], uv[k][1]); cols.push(c[0], c[1], c[2]); });
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    const H = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? -1.2 : height[y][x]) * STEP;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = H(x, y);
      const tone = 0.86 + height[y][x] * 0.07 + ((x * 31 + y * 17) % 5) * 0.012;
      quad([[x, h, y], [x, h, y + 1], [x + 1, h, y + 1], [x + 1, h, y]], [[x / 4, y / 4], [x / 4, (y + 1) / 4], [(x + 1) / 4, (y + 1) / 4], [(x + 1) / 4, y / 4]], [tone, tone, tone]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nh = H(x + dx, y + dy);
        if (nh >= h - 0.001) continue;
        const wx = dx === 1 ? x + 1 : x, wz = dy === 1 ? y + 1 : y;
        const [ax, az, bx, bz] = dx !== 0 ? [wx, y, wx, y + 1] : [x, wz, x + 1, wz];
        quad([[ax, h, az], [bx, h, bz], [bx, nh, bz], [ax, nh, az]], [[0, 0], [0.25, 0], [0.25, (h - nh) / 4], [0, (h - nh) / 4]], [1.25, 1.0, 0.72]); // обрыв: тёплый земляной цвет поверх зелёной текстуры
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.ground.geometry.dispose();
    this.ground.geometry = geo;
  }

  /** Земля по локации: цвет, трава (инстансы) и анимированная вода. */
  private buildTerrain() {
    const { size: n, biome, terrain, cover } = this.state;
    const ground = this.ground.material as THREE.MeshStandardMaterial;
    const pal = {
      ruins: { g: '#5a6050', alt: ['#666c58', '#4a4f40', '#6a6450'], hor: 0x50627a, top: 0x2a3a50, outer: 0x2c3128 },
      forest: { g: '#437a35', alt: ['#508c40', '#386a2c', '#609040'], hor: 0x3c6448, top: 0x1c3c2a, outer: 0x244a22 },
      lake: { g: '#4a8038', alt: ['#569244', '#3c6e2e', '#68984a'], hor: 0x4474a0, top: 0x203c5a, outer: 0x28522c },
    }[biome];
    // текстура земли: пятна травы/грунта
    const gcv = document.createElement('canvas');
    gcv.width = gcv.height = 256;
    const gcx = gcv.getContext('2d')!;
    gcx.fillStyle = pal.g; gcx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      gcx.fillStyle = pal.alt[i % 3]; gcx.globalAlpha = 0.18 + Math.random() * 0.22;
      gcx.beginPath(); gcx.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 9, 0, 6.3); gcx.fill();
    }
    gcx.globalAlpha = 0.22; gcx.strokeStyle = '#000'; gcx.lineWidth = 1; // сетка клеток: 4 клетки на текстуру
    for (let i = 0; i <= 4; i++) { const q = i * 64 + 0.5; gcx.beginPath(); gcx.moveTo(q, 0); gcx.lineTo(q, 256); gcx.moveTo(0, q); gcx.lineTo(256, q); gcx.stroke(); }
    const gt = new THREE.CanvasTexture(gcv);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(n / 4, n / 4);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.anisotropy = 4;
    ground.map = gt;
    ground.color.set(0xffffff);
    ground.needsUpdate = true;
    this.buildGround();
    // дальний план и небо, туман в цвет горизонта
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: pal.outer, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(n / 2, -0.75, n / 2);
    outer.receiveShadow = true;
    this.scene.add(outer);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { top: { value: new THREE.Color(pal.top) }, hor: { value: new THREE.Color(pal.hor) } },
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying float h; void main(){ gl_FragColor = vec4(mix(hor, top, smoothstep(0.0, 0.7, h)), 1.0); }',
      }),
    );
    sky.position.set(n / 2, 0, n / 2);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.background = new THREE.Color(pal.hor);
    (this.scene.fog as THREE.Fog).color.set(pal.hor);

    // трава: небольшие конусы на свободных клетках (в руинах — редкая и сухая)
    const dense = biome !== 'ruins';
    const spots: [number, number][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (cover[y][x] !== 'none' || terrain[y][x] === 'water') continue;
      const k = dense ? 4 : 1;
      for (let i = 0; i < k; i++) if (Math.random() < (dense ? 0.8 : 0.35)) spots.push([x + Math.random(), y + Math.random()]);
    }
    if (spots.length) {
      const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.3, 4), new THREE.MeshStandardMaterial({ roughness: 1 }), spots.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      spots.forEach(([px, pz], i) => {
        const s = 0.7 + Math.random() * 0.9;
        m4.compose(new THREE.Vector3(px, 0.13 * s + this.hy(Math.floor(px), Math.floor(pz)), pz), new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3)), new THREE.Vector3(s, s, s));
        blades.setMatrixAt(i, m4);
        blades.setColorAt(i, col.set(dense ? [0x4f8a2a, 0x5f9a34, 0x3f7a22, 0x7bb33f][i % 4] : [0x6b6a3a, 0x7a7340][i % 2]));
      });
      this.scene.add(blades);
    }

    // вода
    const tiles: [number, number][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (terrain[y][x] === 'water') tiles.push([x, y]);
    if (!tiles.length) return;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c2 = cv.getContext('2d')!;
    c2.fillStyle = '#2d78b6'; c2.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) {
      c2.strokeStyle = `rgba(190,225,255,${0.12 + Math.random() * 0.2})`;
      c2.lineWidth = 1 + Math.random() * 1.5;
      const x = Math.random() * 128, y = Math.random() * 128, w = 8 + Math.random() * 22;
      c2.beginPath(); c2.moveTo(x, y); c2.quadraticCurveTo(x + w / 2, y - 4, x + w, y); c2.stroke();
    }
    this.waterTex = new THREE.CanvasTexture(cv);
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    const water = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      (this.waterMat = new THREE.MeshStandardMaterial({ map: this.waterTex, color: 0xaad4ff, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.25, emissive: 0x0a2236 })),
      tiles.length,
    );
    const m4 = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    tiles.forEach(([x, y], i) => { m4.setPosition(x + 0.5, 0.03, y + 0.5); water.setMatrixAt(i, m4); });
    water.receiveShadow = true;
    this.scene.add(water);
  }

  private buildCover() {
    const { cover, size, look } = this.state;
    const mat = { half: new THREE.MeshStandardMaterial({ color: 0x6b6254 }), full: new THREE.MeshStandardMaterial({ color: 0x4a4f57 }) };
    const boxOf = (t: 'half' | 'full', x: number, y: number) => {
      const h = t === 'half' ? 0.6 : 1.4;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), mat[t]);
      box.position.set(x + 0.5, this.hy(x, y) + h / 2, y + 0.5);
      box.castShadow = box.receiveShadow = true;
      return box as THREE.Object3D;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = cover[y][x];
      const l = look[y][x];
      if (t === 'none' || l === 'house' || this.state.beacons.some(b => b.x === x && b.y === y && !b.done) || this.state.barrels.some(b => b.x === x && b.y === y)) continue;
      const hash = Math.abs((x * 7 + y * 13 + x * y) | 0);
      const placed = (o: THREE.Object3D | null) => { if (o) { o.position.set(x + 0.5, this.hy(x, y), y + 0.5); o.rotation.y = (hash % 4) * (Math.PI / 2); } return o; };
      let m: THREE.Object3D;
      if (l === 'tree') m = placed(spawnCover('tree', hash)) ?? this.makePlant('full', x, y, hash);
      else if (l === 'bush') m = this.makePlant('half', x, y, hash);
      else if (l === 'rock') m = this.makeRock(t, x, y, hash);
      else if (l === 'crate') m = placed(spawnCover('crate', hash)) ?? boxOf('half', x, y);
      else if (l === 'container') m = placed(spawnCover('container', hash)) ?? boxOf('full', x, y);
      else m = boxOf(t, x, y);
      this.scene.add(m);
      this.coverMeshes.set(`${x},${y}`, m);
    }
  }

  /** Бочки: красные, с жёлтой полосой; убираются при взрыве. */
  private buildBarrels() {
    for (const b of this.state.barrels) {
      const g = new THREE.Group();
      g.position.set(b.x + 0.5, this.hy(b.x, b.y), b.y + 0.5);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 14), new THREE.MeshStandardMaterial({ color: 0xb03030, roughness: 0.6 }));
      body.position.y = 0.375; body.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0xe8c02a }));
      band.position.y = 0.4;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 14), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
      lid.position.y = 0.76;
      g.add(body, band, lid);
      this.scene.add(g);
      this.barrelMeshes.set(`${b.x},${b.y}`, g);
    }
  }

  /** Мосты на бродах: доски и бортики поверх воды. */
  private buildBridges() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x5a4328, roughness: 1 });
    for (const b of this.state.bridges) {
      const g = new THREE.Group();
      g.position.set(b.x + 0.5, 0.07 + this.hy(b.x, b.y), b.y + 0.5);
      for (let i = 0; i < 4; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.05, 0.2), i % 2 ? wood : dark);
        plank.position.z = -0.36 + i * 0.24; plank.receiveShadow = plank.castShadow = true;
        g.add(plank);
      }
      this.scene.add(g);
      this.bridgeMeshes.set(`${b.x},${b.y}`, g);
    }
  }

  /** Огонь и выжженная земля. */
  private syncFire() {
    const live = new Set(this.state.fires.map(f => `${f.x},${f.y}`));
    for (const f of this.state.fires) {
      const k = `${f.x},${f.y}`;
      if (this.fireMeshes.has(k)) continue;
      const g = new THREE.Group();
      g.position.set(f.x + 0.5, this.hy(f.x, f.y), f.y + 0.5);
      g.userData.phase = Math.random() * 6;
      for (let i = 0; i < 4; i++) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb030 : 0xff5a1a, transparent: true, opacity: 0.9 }));
        flame.position.set((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5);
        g.add(flame);
      }
      this.scene.add(g);
      this.fireMeshes.set(k, g);
    }
    for (const [k, g] of this.fireMeshes) if (!live.has(k)) { this.scene.remove(g); this.fireMeshes.delete(k); }
    const { scorched, size } = this.state;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = `${x},${y}`;
      if (!scorched[y][x] || this.scorchMeshes.has(k)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x + 0.5, 0.022 + this.hy(x, y), y + 0.5);
      this.scene.add(m);
      this.scorchMeshes.set(k, m);
    }
  }

  /** Маяки диверсии: высокие светящиеся столбы (выше слоя тумана, видны всегда). */
  private buildBeacons() {
    for (const b of this.state.beacons) {
      const g = new THREE.Group();
      g.position.set(b.x + 0.5, this.hy(b.x, b.y), b.y + 0.5);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f46 }));
      base.position.y = 0.25; base.castShadow = true;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), new THREE.MeshBasicMaterial({ color: 0xff3347, transparent: true, opacity: 0.85 }));
      pillar.position.y = 1.9;
      const light = new THREE.PointLight(0xff3347, 4, 5);
      light.position.y = 1.2;
      g.add(base, pillar, light);
      this.scene.add(g);
      this.beaconMeshes.set(`${b.x},${b.y}`, g);
    }
  }

  /** Зона эвакуации. */
  private buildZone() {
    const z = this.state.zone;
    if (!z) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.3 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(z.x + z.w / 2, 0.015, z.y + z.h / 2);
    this.scene.add(m);
  }

  private play(id: number, name: string, once = false) {
    const r = this.rigs.get(id);
    const next = r?.actions.get(name);
    if (!r || !next) return;
    const prevName = this.anim.get(id);
    if (prevName === name && !once) return;
    const prev = prevName ? r.actions.get(prevName) : undefined;
    next.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = true;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.22, false);
    this.anim.set(id, name);
    if (once && name !== 'Death' && name !== 'Duck') setTimeout(() => { if (this.anim.get(id) === name) this.play(id, 'Idle'); }, next.getClip().duration * 1000);
  }

  /** glTF-модель из public/models/, а если её нет — примитив. */
  private makeUnit(u: Unit): THREE.Object3D {
    const height = { soldier: 1.05, trooper: 1.05, sniper: 1.15, psi: 1.05, heavy: 1.45, commander: 1.6 }[u.kind];
    const tint = { soldier: undefined, trooper: 0x7fd24a, sniper: 0x3f8f6a, psi: 0xb36bff, heavy: 0x6f8a2c, commander: 0xc0392b }[u.kind];
    const gun = u.team === 'human'
      ? { rifle: 'AK', smg: 'SMG', shotgun: 'Shotgun', sniper: 'Sniper', launcher: 'ShortCannon', mortar: 'ShortCannon', ags: 'ShortCannon' }[u.weapon]
      : { soldier: '', trooper: 'AK', sniper: 'Sniper_2', psi: '', heavy: 'ShortCannon', commander: 'Revolver' }[u.kind];
    const sp = spawnModel(u.team === 'human' ? 'Soldier' : u.kind === 'psi' ? 'Hazmat' : 'Enemy', height, tint, gun);
    if (!sp) { const p = this.makePrimitive(u); this.addBlob(p); return p; }
    this.rigs.set(u.id, sp);
    this.play(u.id, 'Idle');
    this.addBlob(sp.obj);
    return sp.obj;
  }

  /** Мягкая тень-пятно под юнитом — «привязывает» его к земле. */
  private addBlob(o: THREE.Object3D) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    b.rotation.x = -Math.PI / 2;
    b.position.y = 0.025;
    o.add(b);
  }

  private makePrimitive(u: Unit): THREE.Object3D {
    const g = new THREE.Group();
    const look: Record<Unit['kind'], { color: number; scale: number; glow?: number }> = {
      soldier: { color: 0x4f7fb5, scale: 1 },
      trooper: { color: 0x7fd24a, scale: 1 },
      sniper: { color: 0x3f8f6a, scale: 1.1 },
      psi: { color: 0xb36bff, scale: 1, glow: 0x401a70 },
      heavy: { color: 0x6f8a2c, scale: 1.4 },
      commander: { color: 0xc0392b, scale: 1.55 },
    };
    const l = look[u.kind];
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: l.color, emissive: l.glow ?? 0 }));
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    if (u.team === 'alien') {
      const psi = u.kind === 'psi';
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: psi ? 0xe0c0ff : 0x9be86a, emissive: psi ? 0x6a3aa8 : 0x1d3a0c }));
      head.position.y = psi ? 1.3 : 1.15; head.castShadow = true; g.add(head);
    }
    g.scale.setScalar(l.scale);
    return g;
  }

  syncUnits(instant = false) {
    updateVision(this.state);
    const tg = this.state.units.find(u => u.id === this.state.targetId);
    if (tg && !isVisible(this.state, tg)) this.state.targetId = null;
    if (this.state.targetBarrel && !barrelAt(this.state, this.state.targetBarrel.x, this.state.targetBarrel.y)) this.state.targetBarrel = null;
    const alive = new Set<number>();
    for (const u of this.state.units) {
      if (u.hp <= 0) continue;
      alive.add(u.id);
      let m = this.unitMeshes.get(u.id);
      const goal = new THREE.Vector3(u.x + 0.5, this.hy(u.x, u.y), u.y + 0.5);
      const key = `${u.x},${u.y}`, prev = this.lastPos.get(u.id);
      if (prev && prev !== key) { const [px, py] = prev.split(',').map(Number); u.facing = Math.atan2(u.x - px, u.y - py); }
      this.lastPos.set(u.id, key);
      const q: Sfx[] = [];
      const pa = this.lastAmmo.get(u.id), ph = this.lastHp.get(u.id), ps = this.lastStance.get(u.id);
      if (pa !== undefined && u.ammo > pa) q.push('reload');
      if (this.lastBleed.get(u.id) && !u.bleeding) q.push('bandage');
      if (ph !== undefined && u.hp > ph) q.push('heal');
      if (ps !== undefined && ps !== u.stance) q.push(u.stance === 'prone' ? 'stanceProne' : 'stance');
      if (this.lastOw.get(u.id) === false && u.overwatch) q.push('overwatch');
      this.lastAmmo.set(u.id, u.ammo); this.lastHp.set(u.id, u.hp); this.lastBleed.set(u.id, u.bleeding);
      this.lastStance.set(u.id, u.stance); this.lastOw.set(u.id, u.overwatch);
      if (this.sndReady && q.length && isVisible(this.state, u)) q.forEach((k, i) => setTimeout(() => sfx(k), i * 170));
      if (!m) { m = this.makeUnit(u); m.position.copy(goal); m.rotation.y = u.facing; this.unitMeshes.set(u.id, m); this.scene.add(m); }
      this.goals.set(u.id, goal);
      m.visible = isVisible(this.state, u);
      if (instant) m.position.copy(goal);
    }
    for (const [id, m] of this.unitMeshes) {
      if (alive.has(id) || this.dying.has(id)) continue;
      if (this.rigs.get(id)?.actions.has('Death')) {
        this.dying.add(id);
        this.play(id, 'Death', true);
        setTimeout(() => { this.corpses.set(id, m); this.unitMeshes.delete(id); this.goals.delete(id); this.dying.delete(id); }, 1300);
      } else { m.rotation.z = Math.PI / 2; m.position.y += 0.15; this.corpses.set(id, m); this.unitMeshes.delete(id); this.goals.delete(id); }
    }
    for (const m of this.corpses.values()) { const cx = Math.floor(m.position.x), cy = Math.floor(m.position.z); m.visible = !!this.state.seen[cy]?.[cx]; }
    this.syncSmoke();
    for (const [k, m] of this.coverMeshes) {
      const [cx, cy] = k.split(',').map(Number);
      if (this.state.cover[cy][cx] === 'none') {
        this.scene.remove(m); this.coverMeshes.delete(k);
        if (this.sndReady && performance.now() - this.crumbleAt > 400) { this.crumbleAt = performance.now(); sfx('crumble'); }
      }
    }
    for (const b of this.state.beacons) {
      const m = this.beaconMeshes.get(`${b.x},${b.y}`);
      if (b.done && m) {
        this.beaconMeshes.delete(`${b.x},${b.y}`);
        this.scene.remove(m);
        const p = new THREE.Vector3(b.x + 0.5, 0.5 + this.hy(b.x, b.y), b.y + 0.5);
        this.burst(p, 0xffb050, 30, 5, 650);
        this.burst(p, 0x555555, 16, 3, 800);
        sfx('grenade');
      }
    }
    // разрушенные дома (обломки) и мосты (вода)
    for (const [id, h] of this.houseMeshes) {
      if (this.state.houses.some(x => x.id === id)) continue;
      this.scene.remove(h.g);
      this.houseMeshes.delete(id);
      this.burst(new THREE.Vector3(h.hs.x + h.hs.w / 2, this.hy(h.hs.x, h.hs.y) + 0.6, h.hs.y + h.hs.h / 2), 0xb8a98a, 40, 4, 900);
      sfx('collapse');
      for (let yy = h.hs.y; yy < h.hs.y + h.hs.h; yy++) for (let xx = h.hs.x; xx < h.hs.x + h.hs.w; xx++) {
        const rk = this.makeRock('half', xx, yy, xx * 3 + yy);
        this.scene.add(rk);
        this.coverMeshes.set(`${xx},${yy}`, rk);
      }
    }
    for (const [k, g] of this.bridgeMeshes) {
      const [bx, by] = k.split(',').map(Number);
      if (this.state.bridges.some(b => b.x === bx && b.y === by)) continue;
      this.scene.remove(g);
      this.bridgeMeshes.delete(k);
      sfx('splash');
      if (this.waterMat) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.waterMat);
        pl.rotation.x = -Math.PI / 2; pl.position.set(bx + 0.5, 0.03, by + 0.5);
        this.scene.add(pl);
      }
    }
    this.syncFire();
    this.syncTrenches();
    for (const [k, o] of this.barrelMeshes) {
      const [bx, by] = k.split(',').map(Number);
      if (!this.state.barrels.some(b => b.x === bx && b.y === by)) { this.scene.remove(o); this.barrelMeshes.delete(k); }
    }
    // мины сапёра
    const live = new Set(this.state.mines.map(m => `${m.x},${m.y}`));
    for (const m of this.state.mines) {
      const k = `${m.x},${m.y}`;
      if (this.mineMeshes.has(k)) continue;
      const g = new THREE.Group();
      g.position.set(m.x + 0.5, this.hy(m.x, m.y), m.y + 0.5);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x2a2f2a }));
      disc.position.y = 0.04;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
      dot.rotation.x = -Math.PI / 2; dot.position.y = 0.075;
      g.add(disc, dot);
      this.scene.add(g);
      this.mineMeshes.set(k, g);
      if (this.sndReady) sfx('mine');
    }
    for (const [k, o] of this.mineMeshes) if (!live.has(k)) { this.scene.remove(o); this.mineMeshes.delete(k); }
    this.sndReady = true;
    this.updateFog();
    this.drawHighlight();
  }

  /** Перемещение с короткой паузой на анимацию. */
  /** Знак «!» над заметившими бойцов пришельцами. */
  alertFx(ids: number[]) {
    let any = false;
    for (const id of ids) {
      const u = this.state.units.find(v => v.id === id);
      if (u && isVisible(this.state, u)) { this.floatText(u.x + 0.5, u.y + 0.5, '!', '#ffd34d', 0.4); any = true; }
    }
    if (any) sfx('alert');
  }

  /** Шаги: два за клетку, тише вдали от камеры; пришельцы тяжелее (ниже тоном). */
  private stepFx(u: Unit) {
    const t = this.controls.target;
    const d = Math.hypot(u.x + 0.5 - t.x, u.y + 0.5 - t.z);
    const vol = Math.max(0.2, 1 - d / 28);
    const heavy = u.kind === 'heavy' || u.kind === 'commander';
    const pitch = u.team === 'alien' ? (heavy ? 0.7 : 0.85) : 1;
    sfx('step', { vol, pitch });
    setTimeout(() => sfx('step', { vol: vol * 0.8, pitch: pitch * 0.92 }), 1000 / speedOf(u) / 2);
  }

  /** Высота ствола/груди над землёй по стойке. */
  private eye(u: Unit) { return u.stance === 'prone' ? 0.3 : u.stance === 'kneel' ? 0.62 : 0.9; }

  async moved(u?: Unit) {
    this.syncUnits();
    if (u && u.team === 'alien' && !isVisible(this.state, u)) return; // в тумане не ждём: игрок этого не видит
    if (u) this.stepFx(u);
    if (u && isVisible(this.state, u)) this.focusOn(u.x, u.y);
    await sleep(Math.round(1000 / speedOf(u)));
  }

  /** Экранные координаты клетки (для отладки и тестов). */
  screenOf(x: number, y: number) {
    const v = new THREE.Vector3(x + 0.5, 0.3 + this.hy(x, y), y + 0.5).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
  }

  // --- камера и графика ---
  /** Переместить камеру в клетку (миникарта), независимо от режима «Камера: авто». */
  /** Откатить последний ход бойца (если он больше ничего не делал). */
  undoMove(): boolean {
    const s = this.state, k = s.undo;
    if (!k || s.busy || s.turn !== 'human') return false;
    const u = s.units.find(v => v.id === k.id && v.hp > 0);
    if (!u || `${u.x},${u.y},${u.ap},${u.ammo},${u.stance},${u.overwatch},${s.log.length}` !== k.fp) { s.undo = undefined; return false; }
    u.x = k.x; u.y = k.y; u.ap = k.ap; u.stance = k.stance; u.overwatch = k.overwatch; u.facing = k.facing;
    s.undo = undefined;
    this.syncUnits(true);
    return true;
  }
  panTo(x: number, y: number) { this.focus = new THREE.Vector3(x + 0.5, 0, y + 0.5); }
  focusOn(x: number, y: number) { if (this.autoCam && !this.state.rt) this.focus = new THREE.Vector3(x + 0.5, 0, y + 0.5); }
  unfocus() { this.focus = null; }
  /* ---------- погода, следы, подсказки ---------- */
  private hemi!: THREE.HemisphereLight;
  private weatherOn = (() => { try { return localStorage.getItem('alien-pressure:weather') !== 'off'; } catch { return true; } })();
  private rain: THREE.LineSegments | null = null;
  private torch: THREE.SpotLight | null = null;
  private smokeMeshes = new Map<string, THREE.Mesh>();
  private decals: THREE.Mesh[] = [];
  private pathLine: THREE.Line | null = null;
  hover: { sx: number; sy: number; text: string } | null = null;
  getWeather(): Weather { return (this.state.weather as Weather | undefined) ?? weatherOf(this.state.missionNo, this.state.biome); }
  isWeatherOn() { return this.weatherOn; }
  setWeatherOn(on: boolean) {
    this.weatherOn = on;
    try { localStorage.setItem('alien-pressure:weather', on ? 'on' : 'off'); } catch { /* ignore */ }
    this.applyWeather();
  }
  private baseFog: { color: number; near: number; far: number } | null = null;
  private applyWeather() {
    const fog = this.scene.fog as THREE.Fog;
    if (!this.baseFog) this.baseFog = { color: fog.color.getHex(), near: fog.near, far: fog.far };
    const w = this.weatherOn ? this.getWeather() : 'clear';
    fog.color.set(this.baseFog.color); fog.near = this.baseFog.near; fog.far = this.baseFog.far;
    this.renderer.toneMappingExposure = 3.5; this.sun.color.set(0xfff0d0); this.sun.intensity = 2.0; this.hemi.intensity = 1.3;
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
    if (this.torch) { this.scene.remove(this.torch, this.torch.target); this.torch = null; }
    this.sun.position.set(this.state.size, 20, this.state.size * 0.2);
    setAmbient(this.weatherOn ? (w === 'rain' ? 'rain' : this.state.biome === 'forest' ? 'wind' : this.state.biome === 'lake' ? 'water' : 'drone') : null);
    if (w === 'dawn') { this.renderer.toneMappingExposure = 3.0; this.sun.color.set(0xffb070); this.sun.intensity = 1.8; this.sun.position.set(this.state.size, 6, this.state.size * 0.1); this.hemi.intensity = 1.0; fog.color.lerp(new THREE.Color(0xd9a07a), 0.45); }
    if (w === 'night') {
      this.renderer.toneMappingExposure = 2.2; this.sun.color.set(0x8aa6ff); this.sun.intensity = 0.7; this.hemi.intensity = 0.55; fog.color.lerp(new THREE.Color(0x0c1424), 0.8); fog.near = 10; fog.far = 60;
      this.torch = new THREE.SpotLight(0xfff0c8, 120, 22, 0.55, 0.5, 1.2);
      this.scene.add(this.torch, this.torch.target);
    }
    if (w === 'fog') { fog.color.lerp(new THREE.Color(0x9aa6a2), 0.7); fog.near = 6; fog.far = 46; }
    if (w === 'dusk') { this.renderer.toneMappingExposure = 2.7; this.sun.color.set(0xff9a60); this.sun.intensity = 1.5; this.hemi.intensity = 0.9; fog.color.lerp(new THREE.Color(0x4a3a50), 0.5); }
    if (w === 'rain') {
      this.renderer.toneMappingExposure = 3.0; this.hemi.intensity = 1.0; this.sun.intensity = 1.3; fog.color.lerp(new THREE.Color(0x6a7480), 0.6); fog.near = 14; fog.far = 70;
      const n = 1600, pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 60, y = Math.random() * 26, z = (Math.random() - 0.5) * 60;
        pos.set([x, y, z, x - 0.05, y - 0.7, z], i * 6);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.35 }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
  }
  private stepRain(dt: number) {
    if (this.torch) {
      const u = this.state.units.find(v => v.id === this.state.selectedId && v.hp > 0) ?? this.state.units.find(v => v.team === 'human' && v.hp > 0);
      const m = u && this.unitMeshes.get(u.id);
      if (u && m) {
        this.torch.position.set(m.position.x, m.position.y + 1.6, m.position.z);
        this.torch.target.position.set(m.position.x + Math.sin(u.facing) * 6, m.position.y, m.position.z + Math.cos(u.facing) * 6);
      }
    }
    const r = this.rain; if (!r) return;
    const a = (r.geometry.getAttribute('position') as THREE.BufferAttribute), arr = a.array as Float32Array;
    for (let i = 0; i < arr.length; i += 6) {
      const fall = 26 * dt;
      arr[i + 1] -= fall; arr[i + 4] -= fall;
      if (arr[i + 4] < 0) { arr[i + 1] += 26; arr[i + 4] += 26; }
    }
    a.needsUpdate = true;
    r.position.set(this.controls.target.x, 0, this.controls.target.z);
  }
  private syncSmoke() {
    const live = new Set<string>();
    for (const m of this.state.smokes ?? []) {
      const k = `${m.x},${m.y}`; live.add(k);
      if (!this.smokeMeshes.has(k)) {
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbfc4c8, transparent: true, opacity: 0.62, depthWrite: false }));
        o.position.set(m.x + 0.5, this.hy(m.x, m.y) + 0.8, m.y + 0.5);
        o.scale.set(1, 1.1, 1);
        this.scene.add(o); this.smokeMeshes.set(k, o);
      }
      (this.smokeMeshes.get(k)!.material as THREE.MeshBasicMaterial).opacity = m.ttl >= 2 ? 0.62 : 0.4;
    }
    for (const [k, o] of this.smokeMeshes) if (!live.has(k)) { this.scene.remove(o); o.geometry.dispose(); (o.material as THREE.Material).dispose(); this.smokeMeshes.delete(k); }
  }

  /** Обломки: куски летят по дуге и остаются лежать. */
  private debris(pos: THREE.Vector3, color: number, count: number, power = 3) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08 + Math.random() * 0.1, 0.06 + Math.random() * 0.06, 0.08 + Math.random() * 0.1), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      m.position.copy(pos); m.castShadow = true;
      this.scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * power, 2 + Math.random() * power, (Math.random() - 0.5) * power);
      const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      const gy = this.hy(Math.floor(pos.x), Math.floor(pos.z)) + 0.05;
      let last = 0;
      void this.tween(900, k => {
        const d = ((k - last) * 900) / 1000; last = k;
        v.y -= 14 * d;
        m.position.addScaledVector(v, d); m.position.y = Math.max(gy, m.position.y);
        if (m.position.y > gy) m.rotation.x += spin.x * d, m.rotation.y += spin.y * d;
      }).then(() => { setTimeout(() => { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }, 12000); });
    }
  }

  /** Гильза: вылетает вправо-вверх от ствола и падает. */
  private casing(pos: THREE.Vector3, facing: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6), new THREE.MeshStandardMaterial({ color: 0xd4a84a, metalness: 0.8, roughness: 0.35 }));
    m.position.copy(pos); this.scene.add(m);
    const side = facing + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const v = new THREE.Vector3(Math.sin(side) * (1 + Math.random()), 1.6 + Math.random(), Math.cos(side) * (1 + Math.random()));
    const gy = this.hy(Math.floor(pos.x), Math.floor(pos.z)) + 0.03;
    let last = 0;
    void this.tween(650, k => {
      const d = ((k - last) * 650) / 1000; last = k;
      v.y -= 12 * d; m.position.addScaledVector(v, d); m.position.y = Math.max(gy, m.position.y); m.rotation.z += 12 * d;
    }).then(() => setTimeout(() => { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }, 6000));
  }

  /** Брызги крови в сторону от стрелка. */
  private spray(pos: THREE.Vector3, from: THREE.Vector3) {
    const dir = pos.clone().sub(from).setY(0).normalize();
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0x8a1212 }));
      m.position.copy(pos); this.scene.add(m);
      const v = new THREE.Vector3(dir.x * (1.5 + Math.random() * 2) + (Math.random() - 0.5), 1 + Math.random() * 1.5, dir.z * (1.5 + Math.random() * 2) + (Math.random() - 0.5));
      let last = 0;
      void this.tween(420, k => { const d = ((k - last) * 420) / 1000; last = k; v.y -= 11 * d; m.position.addScaledVector(v, d); }).then(() => { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
    }
  }

  /** Отброс цели от стрелка (мягко возвращается на клетку). */
  private knockback(t: Unit, a: Unit, amount = 0.18) {
    const m = this.unitMeshes.get(t.id); if (!m) return;
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
    m.position.x += (dx / d) * amount; m.position.z += (dy / d) * amount;
  }

  /** Тёмное пятно на земле: след от пули (промах), кровь (попадание, труп). */
  private decal(x: number, z: number, color: number, r: number, opacity = 0.6) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, this.hy(Math.floor(x), Math.floor(z)) + 0.03, z);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 80) { const o = this.decals.shift()!; this.scene.remove(o); o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
  }
  private clearPath() { if (this.pathLine) { this.scene.remove(this.pathLine); this.pathLine.geometry.dispose(); this.pathLine = null; } }
  private setHover(h: { sx: number; sy: number; text: string } | null) {
    const o = this.hover;
    const same = (!o && !h) || (o && h && o.text === h.text && Math.hypot(o.sx - h.sx, o.sy - h.sy) < 14);
    if (same) return;
    this.hover = h; this.onChange();
  }

  getQuality() { return this.quality; }
  getAutoCam() { return this.autoCam; }
  setAutoCam(on: boolean) {
    this.autoCam = on;
    if (!on) this.focus = null;
    try { localStorage.setItem('alien-pressure:cam', on ? 'auto' : 'manual'); } catch { /* ignore */ }
  }

  private stepCamera(dt: number) {
    if (!this.focus) return;
    const t = this.controls.target, k = 1 - Math.exp(-3 * dt);
    const dx = (this.focus.x - t.x) * k, dz = (this.focus.z - t.z) * k;
    t.x += dx; t.z += dz;
    this.camera.position.x += dx; this.camera.position.z += dz;
    if (Math.hypot(this.focus.x - t.x, this.focus.z - t.z) < 0.05) this.focus = null;
  }

  /** Высокое: свечение (bloom), сглаживание, тени 2048. Обычное: прямой рендер, тени 1024. */
  setQuality(q: 'high' | 'low', save = true) {
    this.quality = q;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as THREE.DirectionalLightShadow).map = null;
    this.composer?.dispose();
    this.composer = null;
    if (q === 'high') {
      const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
      const rt = new THREE.WebGLRenderTarget(w * this.dpr, h * this.dpr, { type: THREE.HalfFloatType, samples: 4 });
      const c = new EffectComposer(this.renderer, rt);
      c.setPixelRatio(this.dpr);
      c.setSize(w, h);
      c.addPass(new RenderPass(this.scene, this.camera));
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 1.0));
      c.addPass(new OutputPass());
      this.composer = c;
    }
    if (save) { try { localStorage.setItem('alien-pressure:gfx', q); } catch { /* ignore */ } }
  }

  /** Адаптивное разрешение: если кадры медленные — снижаем, если быстрые — возвращаем. */
  private adaptDpr(rawDt: number) {
    this.ft = this.ft * 0.95 + Math.min(rawDt, 0.2) * 0.05;
    if (++this.frames < 90) return;
    this.frames = 0;
    const max = Math.min(devicePixelRatio, 2);
    let d = this.dpr;
    if (this.ft > 0.034 && d > 0.75) d = Math.max(0.75, d - 0.25);
    else if (this.ft < 0.018 && d < max) d = Math.min(max, d + 0.25);
    if (d === this.dpr) return;
    this.dpr = d;
    this.renderer.setPixelRatio(d);
    this.composer?.setPixelRatio(d);
    this.resize();
  }

  /** Туман войны: неисследованное тёмное, исследованное притемнено, видимое чистое. */
  private updateFog() {
    const { size: n, vis, seen } = this.state;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = ((n - 1 - y) * n + x) * 4;
      this.fogData[i + 3] = vis[y][x] ? 0 : seen[y][x] ? 40 : 115;
    }
    this.fogTex.needsUpdate = true;
  }

  private ring(x: number, y: number, color: number, r0 = 0.3, r1 = 0.42) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x + 0.5, this.hy(x, y) + 0.04, y + 0.5);
    this.highlight.add(ring);
  }

  /** Полоски на краях клетки со стороны укрытия: зелёная — полное (−40%), жёлтая — половинное (−20%); оранжевая рамка — окоп. */
  private coverBars(x: number, y: number) {
    const s = this.state;
    const y0 = this.hy(x, y) + 0.06;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const c = s.cover[ny]?.[nx];
      if (!c || c === 'none') continue;
      const bar = new THREE.Mesh(this.barGeo, c === 'full' ? this.barFull : this.barHalf);
      bar.position.set(x + 0.5 + dx * 0.44, y0, y + 0.5 + dy * 0.44);
      bar.rotation.y = dx ? Math.PI / 2 : 0;
      bar.scale.z = c === 'full' ? 1.6 : 1;
      this.highlight.add(bar);
    }
    if (s.trenches.some(t => t.x === x && t.y === y)) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.4, 4, 1, Math.PI / 4), this.barTrench);
      r.rotation.x = -Math.PI / 2; r.position.set(x + 0.5, y0, y + 0.5); this.highlight.add(r);
    }
  }
  private barGeo = new THREE.BoxGeometry(0.86, 0.05, 0.12);
  private barFull = new THREE.MeshBasicMaterial({ color: 0x3cff7a });
  private barHalf = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  private barTrench = new THREE.MeshBasicMaterial({ color: 0xff9f43, side: THREE.DoubleSide });

  private drawHighlight() {
    this.highlight.clear();
    this.blast.visible = false;
    const s = this.state;
    for (const o of s.units) if (o.hp > 0 && o.overwatch && (o.team === 'human' || isVisible(s, o))) this.ring(o.x, o.y, o.team === 'human' ? 0x35e0e0 : 0xff6a3a, 0.46, 0.52);
    for (const o of s.units) if (o.hp > 0 && o.down) this.ring(o.x, o.y, 0xffffff, 0.3, 0.36);
    for (const o of s.units) if (o.hp > 0 && o.team === 'human' && o.dest) this.ring(o.dest.x, o.dest.y, 0x4fd7ff, 0.18, 0.28);
    for (const o of s.units) if (o.hp > 0 && o.team === 'human' && o.atk !== undefined) { const t = s.units.find(v => v.id === o.atk && v.hp > 0); if (t && isVisible(s, t)) this.ring(t.x, t.y, 0xff4a2a, 0.56, 0.62); }
    for (const o of s.units) if (o.hp > 0 && o.team === 'alien' && isVisible(s, o) && !o.overwatch && o.alert) this.ring(o.x, o.y, 0xb03030, 0.5, 0.53);
    // конусы огня пришельцев на overwatch
    const cone = new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.16, depthWrite: false }), cg = new THREE.PlaneGeometry(0.92, 0.92);
    for (const o of s.units) {
      if (o.hp <= 0 || o.team !== 'alien' || !o.overwatch || !isVisible(s, o)) continue;
      const R = Math.min(o.range, 11);
      for (let y = Math.max(0, o.y - R); y <= Math.min(s.size - 1, o.y + R); y++) for (let x = Math.max(0, o.x - R); x <= Math.min(s.size - 1, o.x + R); x++) {
        if (Math.hypot(x - o.x, y - o.y) > R || s.cover[y][x] !== 'none' || !los(s, o, { x, y })) continue;
        const p = new THREE.Mesh(cg, cone); p.rotation.x = -Math.PI / 2; p.position.set(x + 0.5, this.hy(x, y) + 0.028, y + 0.5); this.highlight.add(p);
      }
    }
    for (const o of s.units) if (o.hp > 0 && o.bleeding) this.ring(o.x, o.y, 0xb01818, 0.54, 0.6);
    for (const o of s.units) if (o.hp > 0 && o.panic) this.ring(o.x, o.y, 0xff9f43, 0.62, 0.68);
    for (const o of s.units) if (o.hp > 0 && o.team === 'alien' && !o.alert && isVisible(s, o)) this.ring(o.x, o.y, 0xe8e8a0, 0.5, 0.54);
    if (s.targetBarrel) this.ring(s.targetBarrel.x, s.targetBarrel.y, 0xff3b3b, 0.42, 0.52);
    for (const o of s.units) if (o.hp > 0 && isVisible(s, o)) this.coverBars(o.x, o.y);
    const mk = s.units.find(v => v.id === s.markId && v.hp > 0);
    if (mk) this.ring(mk.x, mk.y, 0xff2222, 0.72, 0.82);
    const t = s.units.find(v => v.id === s.targetId && v.hp > 0);
    if (t) this.ring(t.x, t.y, 0xff3b3b);
    const u = s.units.find(v => v.id === s.selectedId && v.hp > 0);
    if (!u) return;
    this.ring(u.x, u.y, 0xffd34d);
    if (!s.busy && s.aiming !== 'grenade') { // обзор выбранного бойца
      const vm = new THREE.MeshBasicMaterial({ color: s.lookMode ? 0x7ee0ff : 0xffffff, transparent: true, opacity: s.lookMode ? 0.2 : 0.045, depthWrite: false }), vg = new THREE.PlaneGeometry(1, 1), R = s.lookMode ? Math.min(u.range, 14) : 9;
      for (let y = Math.max(0, u.y - R); y <= Math.min(s.size - 1, u.y + R); y++) for (let x = Math.max(0, u.x - R); x <= Math.min(s.size - 1, u.x + R); x++) {
        if (Math.hypot(x - u.x, y - u.y) > R || s.cover[y][x] !== 'none' || !los(s, u, { x, y })) continue;
        const p = new THREE.Mesh(vg, vm); p.rotation.x = -Math.PI / 2; p.position.set(x + 0.5, this.hy(x, y) + 0.022, y + 0.5); this.highlight.add(p);
      }
    }
    if (s.aiming === 'grenade' && !s.busy) {
      const am = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.22 });
      const ag = new THREE.PlaneGeometry(0.92, 0.92);
      for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
        if (!this.canAim(u, x, y)) continue;
        const p = new THREE.Mesh(ag, am);
        p.rotation.x = -Math.PI / 2; p.position.set(x + 0.5, this.hy(x, y) + 0.03, y + 0.5);
        this.highlight.add(p);
      }
      return;
    }
    if (u.ap <= 0 || s.busy || s.rt) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.35 });
    const matCover = new THREE.MeshBasicMaterial({ color: 0x4fe08a, transparent: true, opacity: 0.4 });
    const geo = new THREE.PlaneGeometry(0.92, 0.92);
    for (const k of reachable(s, u.x, u.y, moveRange(u)).keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x === u.x && y === u.y) continue;
      const covered = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (s.cover[y + dy]?.[x + dx] ?? 'none') !== 'none') || s.trenches.some(t => t.x === x && t.y === y);
      if (covered) this.coverBars(x, y);
      const p = new THREE.Mesh(geo, covered ? matCover : mat);
      p.rotation.x = -Math.PI / 2; p.position.set(x + 0.5, this.hy(x, y) + 0.03, y + 0.5);
      this.highlight.add(p);
    }
  }

  private tween(ms: number, fn: (k: number) => void): Promise<void> {
    return new Promise(res => this.tweens.push({ t: 0, dur: ms / 1000, fn, done: res }));
  }

  /** Облако искр: разлёт с гравитацией и затуханием. */
  private burst(pos: THREE.Vector3, color: number, count = 12, speed = 2.2, ms = 320) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      v.push(new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.07, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    let last = 0;
    void this.tween(ms, k => {
      const d = ((k - last) * ms) / 1000;
      last = k;
      for (let i = 0; i < count; i++) {
        v[i].y -= 7 * d;
        p[i * 3] += v[i].x * d; p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i].y * d); p[i * 3 + 2] += v[i].z * d;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k;
    }).then(() => { this.scene.remove(pts); geo.dispose(); mat.dispose(); });
  }

  private muzzleFlash(pos: THREE.Vector3) {
    const light = new THREE.PointLight(0xffc060, 10, 6);
    light.position.copy(pos);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
    core.position.copy(pos);
    this.scene.add(light, core);
    void this.tween(140, k => { core.scale.setScalar(1 + k * 0.6); light.intensity = 10 * (1 - k); }).then(() => {
      this.scene.remove(light, core);
      core.geometry.dispose();
    });
  }

  /** Один патрон: вспышка, летящая пуля и попадание/рикошет. */
  private async fireRound(from: THREE.Vector3, to: THREE.Vector3, delayMs: number, hit: boolean, last: boolean, human: boolean, variant?: string) {
    if (delayMs) await sleep(delayMs);
    if (variant) sfx('shot', { variant }); else sfx(human ? 'shot' : 'alienShot');
    this.muzzleFlash(from);
    if (human) this.casing(from.clone().add(new THREE.Vector3(0, -0.05, 0)), Math.atan2(to.x - from.x, to.z - from.z));
    const bullet = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    bullet.position.copy(from);
    bullet.lookAt(to);
    this.scene.add(bullet);
    await this.tween(Math.max(260, (from.distanceTo(to) / BULLET_SPEED) * 1000), k => bullet.position.lerpVectors(from, to, k));
    this.scene.remove(bullet);
    bullet.geometry.dispose();
    this.burst(to, hit ? 0xff5533 : 0xffd27a, hit ? 14 : 8, hit ? 2.6 : 1.8);
    if (hit) this.decal(to.x + (Math.random() - 0.5) * 0.3, to.z + (Math.random() - 0.5) * 0.3, 0x5a0e0e, 0.14 + Math.random() * 0.1, 0.55);
    else this.decal(to.x + (Math.random() - 0.5) * 0.5, to.z + (Math.random() - 0.5) * 0.5, 0x1a1a14, 0.07 + Math.random() * 0.05, 0.7);
    if (last && !hit) sfx('miss');
  }

  /** Выстрел: очередь (боец и тяжёлый — 3 патрона, пехотинец — 2, снайпер — 1), последний патрон решает исход. */
  async shotFx(r: ShotResult) {
    const a = this.state.units.find(u => u.id === r.attackerId)!;
    const t = this.state.units.find(u => u.id === r.targetId)!;
    if (isVisible(this.state, a) || isVisible(this.state, t)) this.focusOn((a.x + t.x) / 2, (a.y + t.y) / 2);
    const home = { x: a.x, y: a.y, face: a.facing };
    if (r.peek) { // стрейф: шаг из-за укрытия, выстрел, возврат
      this.goals.set(a.id, new THREE.Vector3(r.peek.x + 0.5, this.hy(r.peek.x, r.peek.y), r.peek.y + 0.5));
      a.x = r.peek.x; a.y = r.peek.y; a.facing = Math.atan2(t.x - a.x, t.y - a.y);
      this.play(a.id, 'Run');
      await sleep(Math.round(700 / speedOf(a)));
    }
    const am = this.unitMeshes.get(a.id);
    const chest = new THREE.Vector3(t.x + 0.5, this.eye(t) - 0.05 + this.hy(t.x, t.y), t.y + 0.5);
    const f = a.facing;
    const muzzle = new THREE.Vector3(a.x + 0.5 + Math.sin(f) * 0.5, this.eye(a) + this.hy(a.x, a.y), a.y + 0.5 + Math.cos(f) * 0.5);
    if (r.psi) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([muzzle, chest]), new THREE.LineBasicMaterial({ color: 0xc58bff }));
      const flash = new THREE.PointLight(0xb36bff, 6, 5);
      flash.position.copy(muzzle);
      this.scene.add(line, flash);
      sfx('psi');
      this.floatText(t.x + 0.5, t.y + 0.5, r.hit ? 'давление' : 'устоял', r.hit ? '#ff6b6b' : '#c9ced3');
      await sleep(800);
      this.scene.remove(line, flash);
      line.geometry.dispose();
      return;
    }
    if (!r.reaction) await sleep(a.team === 'alien' ? 450 : 150); // пауза на прицеливание: стрелок успевает повернуться
    // звук выстрела по оружию: автомат/ПП/дробовик/снайперка; у пришельцев — по типу
    const variant = a.team === 'human' ? a.weapon : a.kind === 'sniper' ? 'sniper' : a.kind === 'heavy' || a.kind === 'commander' ? 'shotgun' : undefined;
    this.play(a.id, 'Idle_Shoot', true);
    const rounds = a.burst;
    const shots: Promise<void>[] = [];
    for (let i = 0; i < rounds; i++) {
      const last = i === rounds - 1;
      const to = chest.clone();
      if (!(last && r.hit)) {
        to.x += (Math.random() - 0.5) * (last ? 1.6 : 1.1);
        to.z += (Math.random() - 0.5) * (last ? 1.6 : 1.1);
        to.y = 0.15 + Math.random() * 0.9;
      }
      shots.push(this.fireRound(muzzle, to, i * BURST_GAP, last && r.hit, last, a.team === 'human', variant));
    }
    if (am) { am.position.x -= Math.sin(f) * 0.07; am.position.z -= Math.cos(f) * 0.07; } // отдача
    await Promise.all(shots);
    if (r.hit) {
      sfx('hit');
      this.floatText(t.x + 0.5, t.y + 0.5, `−${r.dmg}`, '#ff6b6b');
      if (r.hit) { this.spray(new THREE.Vector3(t.x + 0.5, this.eye(t) + this.hy(t.x, t.y) - 0.2, t.y + 0.5), new THREE.Vector3(a.x + 0.5, 0, a.y + 0.5)); this.knockback(t, a, r.killed ? 0.3 : 0.16); }
      if (!r.killed) this.play(t.id, 'HitReact', true);
    } else this.floatText(t.x + 0.5, t.y + 0.5, r.suppress ? 'подавлен' : 'мимо', r.suppress ? '#ffd34d' : '#c9ced3');
    if (r.alerted?.length) this.alertFx(r.alerted);
    if (r.broken) this.floatText(t.x + 0.5, t.y + 0.5, 'укрытие', '#ffd34d', 0.5);
    if (r.wound) sfx('wound');
    if (r.wound) this.floatText(t.x + 0.5, t.y + 0.5, r.wound === 'bleed' ? 'кровь' : 'перелом', '#ff9f43', 0.5);
    if (r.killed) { setTimeout(() => sfx('death'), 120); this.decal(t.x + 0.5, t.y + 0.5, 0x4a0808, 0.42, 0.65); }
    await sleep(r.reaction ? 300 : 550);
    if (r.peek) { // назад за укрытие
      a.x = home.x; a.y = home.y; a.facing = home.face;
      this.goals.set(a.id, new THREE.Vector3(a.x + 0.5, this.hy(a.x, a.y), a.y + 0.5));
      this.play(a.id, 'Run');
      await sleep(Math.round(700 / speedOf(a)));
    }
  }

  /** Бросок гранаты: дуга, взрыв, урон по площади. */
  async throwAt(u: Unit, x: number, y: number) {
    const s = this.state;
    s.busy = true;
    const res = throwGrenade(s, u, x, y);
    this.focusOn(x, y);
    this.blast.visible = false;
    this.play(u.id, 'Punch', true);
    sfx('pin');
    setTimeout(() => sfx('throw'), 220);
    const from = new THREE.Vector3(u.x + 0.5, 1.0 + this.hy(u.x, u.y), u.y + 0.5);
    const to = new THREE.Vector3(x + 0.5, 0.1 + this.hy(x, y), y + 0.5);
    const dist = from.distanceTo(to);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshStandardMaterial({ color: 0x3c4a2a }));
    this.scene.add(g);
    await this.tween(350 + dist * 60, k => {
      g.position.lerpVectors(from, to, k);
      g.position.y += Math.sin(k * Math.PI) * (1.2 + dist * 0.15);
    });
    this.scene.remove(g);
    g.geometry.dispose();
    await this.explode(res);
    s.busy = false;
    this.syncUnits();
    this.onChange();
  }

  /** Взрыв: вспышка, огненный шар, искры, урон над целями. */
  private async explode(res: GrenadeResult) {
    const s = this.state;
    const to = new THREE.Vector3(res.x + 0.5, 0.1 + this.hy(res.x, res.y), res.y + 0.5);
    sfx('grenade');
    const light = new THREE.PointLight(0xffa040, 40, 14);
    light.position.set(to.x, to.y + 0.7, to.z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85 }));
    ball.position.set(to.x, to.y + 0.4, to.z);
    this.scene.add(light, ball);
    this.burst(new THREE.Vector3(to.x, to.y + 0.2, to.z), 0xffb050, 30, 5, 650);
    this.burst(new THREE.Vector3(to.x, to.y + 0.2, to.z), 0x555555, 18, 3, 800);
    for (const b of res.broken) { const bp = new THREE.Vector3(b.x + 0.5, 0.3 + this.hy(b.x, b.y), b.y + 0.5); this.burst(bp, 0x8a7a62, 10, 2.5, 600); this.debris(bp, 0x8a7a62, 8, 3); }
    this.debris(new THREE.Vector3(to.x, to.y + 0.3, to.z), 0x5a4a38, 14, 5);
    this.decal(to.x, to.z, 0x121210, 1.1, 0.55); this.decal(to.x, to.z, 0x2a2420, 1.5, 0.3);
    if (res.ignited.length) setTimeout(() => sfx('fire'), 250);
    if (res.alerted.length) this.alertFx(res.alerted);
    for (const h of res.hits) {
      const tu = s.units.find(v => v.id === h.id)!;
      this.floatText(tu.x + 0.5, tu.y + 0.5, `−${h.dmg}`, '#ff6b6b');
      if (!h.killed) this.play(h.id, 'HitReact', true);
      else setTimeout(() => sfx('death'), 150);
    }
    await this.tween(300, k => {
      ball.scale.setScalar(0.2 + k * ((res.r ?? BLAST) - 0.2));
      (ball.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      light.intensity = 40 * (1 - k);
    });
    this.scene.remove(light, ball);
    ball.geometry.dispose();
    for (const c of res.chain) { await sleep(160); await this.explode(c); }
  }

  /** Выстрел гранатой из подствольника, гранатомёта, миномёта или АГС. */
  async launchAt(u: Unit, x: number, y: number) {
    const s = this.state, kind = s.launch!;
    s.busy = true;
    const results = launch(s, u, x, y, kind);
    this.focusOn(x, y);
    this.blast.visible = false;
    this.play(u.id, 'Idle_Shoot', true);
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const from = new THREE.Vector3(u.x + 0.5 + Math.sin(u.facing) * 0.5, this.eye(u) + this.hy(u.x, u.y), u.y + 0.5 + Math.cos(u.facing) * 0.5);
      const to = new THREE.Vector3(res.x + 0.5, 0.2 + this.hy(res.x, res.y), res.y + 0.5);
      sfx(kind === 'mortar' ? 'mortar' : 'launcher');
      this.muzzleFlash(from);
      this.burst(from, 0xcccccc, 10, 1.4, 500);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(kind === 'mortar' ? 0.12 : 0.09, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3a4030 }));
      this.scene.add(shell);
      const dist = from.distanceTo(to), peak = kind === 'mortar' ? 9 + dist * 0.3 : kind === 'ugl' ? 1.2 + dist * 0.12 : 0.6 + dist * 0.04;
      await this.tween(kind === 'mortar' ? 900 + dist * 25 : 380 + dist * 45, k => {
        shell.position.lerpVectors(from, to, k);
        shell.position.y += Math.sin(k * Math.PI) * peak;
      });
      this.scene.remove(shell); shell.geometry.dispose();
      await this.explode(res);
      if (i < results.length - 1) await sleep(180);
    }
    s.busy = false;
    this.syncUnits();
    this.onChange();
  }

  /** Бросок дымовой гранаты. */
  async smokeAt(u: Unit, x: number, y: number) {
    const s = this.state;
    s.busy = true;
    throwSmoke(s, u, x, y);
    this.focusOn(x, y);
    this.blast.visible = false;
    this.play(u.id, 'Punch', true);
    sfx('pin'); setTimeout(() => sfx('throw'), 220);
    const from = new THREE.Vector3(u.x + 0.5, 1.0 + this.hy(u.x, u.y), u.y + 0.5), to = new THREE.Vector3(x + 0.5, 0.1 + this.hy(x, y), y + 0.5);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshStandardMaterial({ color: 0x9aa0a4 }));
    this.scene.add(g);
    const dist = from.distanceTo(to);
    await this.tween(350 + dist * 60, k => { g.position.lerpVectors(from, to, k); g.position.y += Math.sin(k * Math.PI) * (1.2 + dist * 0.15); });
    this.scene.remove(g); g.geometry.dispose();
    this.burst(to.clone().setY(to.y + 0.3), 0xcfd3d6, 24, 1.6, 900);
    sfx('splash');
    this.syncUnits();
    s.busy = false;
    this.onChange();
  }

  /** Удар в ближнем бою: рывок к цели, брызги. */
  async meleeFx(r: ShotResult) {
    const a = this.state.units.find(u => u.id === r.attackerId)!, t = this.state.units.find(u => u.id === r.targetId)!;
    this.focusOn((a.x + t.x) / 2, (a.y + t.y) / 2);
    const m = this.unitMeshes.get(a.id);
    this.play(a.id, 'Punch', true);
    if (m) { const k0 = m.position.clone(); m.position.x += (t.x - a.x) * 0.35; m.position.z += (t.y - a.y) * 0.35; setTimeout(() => m.position.copy(k0), 160); }
    await sleep(260);
    const chest = new THREE.Vector3(t.x + 0.5, this.eye(t) + this.hy(t.x, t.y) - 0.2, t.y + 0.5);
    if (r.hit) {
      sfx('hit');
      this.burst(chest, 0xff5533, 10, 2, 300);
      this.spray(chest, new THREE.Vector3(a.x + 0.5, 0, a.y + 0.5));
      this.knockback(t, a, r.killed ? 0.3 : 0.14);
      this.floatText(t.x + 0.5, t.y + 0.5, `−${r.dmg}`, '#ff6b6b');
      if (!r.killed) this.play(t.id, 'HitReact', true);
      else { setTimeout(() => sfx('death'), 100); this.decal(t.x + 0.5, t.y + 0.5, 0x4a0808, 0.42, 0.65); }
    } else { sfx('miss'); this.floatText(t.x + 0.5, t.y + 0.5, 'мимо', '#cfd8dc'); }
    await sleep(300);
    this.syncUnits();
  }

  /** Выстрел по бочке: пуля и взрыв. */
  async barrelShotFx(a: Unit, res: GrenadeResult) {
    this.focusOn(res.x, res.y);
    const f = a.facing;
    const muzzle = new THREE.Vector3(a.x + 0.5 + Math.sin(f) * 0.5, this.eye(a) + this.hy(a.x, a.y), a.y + 0.5 + Math.cos(f) * 0.5);
    this.play(a.id, 'Idle_Shoot', true);
    await this.fireRound(muzzle, new THREE.Vector3(res.x + 0.5, 0.4 + this.hy(res.x, res.y), res.y + 0.5), 0, true, true, a.team === 'human');
    await this.explode(res);
    this.syncUnits();
  }

  /** Взрыв, начатый ИИ (мина). */
  async blastFx(res: GrenadeResult) {
    this.focusOn(res.x, res.y);
    await this.explode(res);
    this.syncUnits();
  }

  private tileAt(e: PointerEvent): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.ground)[0];
    return hit ? { x: Math.floor(hit.point.x), y: Math.floor(hit.point.z) } : null;
  }

  private canAim(u: Unit, x: number, y: number) {
    const s = this.state;
    return s.launch ? canLaunch(s, u, x, y, s.launch) : canThrow(s, u, x, y);
  }

  /** Наведение: радиус гранаты; иначе путь до клетки и шанс попадания по пришельцу. */
  private onHover(e: PointerEvent) {
    const s = this.state;
    const u = s.units.find(v => v.id === s.selectedId && v.hp > 0);
    this.clearPath();
    if (e.pointerType === 'touch' || !u || (s.busy && !s.rt) || s.turn !== 'human' || s.status !== 'playing' || s.turning) { this.blast.visible = false; this.setHover(null); return; }
    const t = this.tileAt(e);
    if (s.aiming === 'grenade') {
      this.setHover(null);
      if (!t || !this.canAim(u, t.x, t.y)) { this.blast.visible = false; return; }
      this.blast.position.set(t.x + 0.5, this.hy(t.x, t.y) + 0.05, t.y + 0.5);
      this.blast.scale.setScalar(s.launch ? LAUNCH[s.launch].r / BLAST : 1);
      this.blast.visible = !s.smokeMode;
      return;
    }
    this.blast.visible = false;
    if (!t) { this.setHover(null); return; }
    const sx = e.clientX, sy = e.clientY;
    const at = s.units.find(v => v.hp > 0 && v.x === t.x && v.y === t.y && isVisible(s, v));
    if (at?.team === 'alien') {
      const ch = hitChance(s, u, at);
      const pk = ch === null ? peekTile(s, u, at) : null;
      if (pk) { this.setHover({ sx, sy, text: `${at.name} · стрейф ${pk.chance}%` }); return; }
      const cs = ch !== null ? coverSource(s, u, at) : null;
      this.setHover({ sx, sy, text: ch === null ? `${at.name} · нет линии огня` : `${at.name} · шанс ${ch}%${cs ? ` · укрытие −${cs.bonus}%` : ch !== null && isFlanked(s, u, at) ? ' · фланг +10%' : ''}` });
      return;
    }
    if (!at && (s.rt || u.ap > 0) && reachable(s, u.x, u.y, s.rt ? 80 : moveRange(u)).has(`${t.x},${t.y}`)) {
      const path = findPath(s, u.x, u.y, t.x, t.y, s.rt ? 80 : moveRange(u));
      if (path.length) {
        const pts = [new THREE.Vector3(u.x + 0.5, this.hy(u.x, u.y) + 0.12, u.y + 0.5), ...path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.hy(x, y) + 0.12, y + 0.5))];
        this.pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd34d }));
        this.scene.add(this.pathLine);
        const cov = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (s.cover[t.y + dy]?.[t.x + dx] ?? 'none') !== 'none');
        this.setHover({ sx, sy, text: s.rt ? `${path.length} кл. · ~${(path.length * CD_PER_AP / Math.max(1, moveRange(u))).toFixed(1)} с${cov ? ' · есть укрытие' : ''}` : `${path.length} кл. · −1 AP${cov ? ' · есть укрытие' : ''}` });
        return;
      }
    }
    this.setHover(null);
  }

  /** ПКМ: повернуть выбранного бойца к клетке (бесплатно); в режиме гранаты — отмена. */
  private rightClick(e: PointerEvent) {
    const s = this.state;
    if (s.turn !== 'human' || s.busy || s.status !== 'playing') return;
    if (s.aiming || s.turning) { s.aiming = null; s.turning = false; this.syncUnits(); this.onChange(); return; }
    const u = s.units.find(v => v.id === s.selectedId && v.hp > 0);
    const t = this.tileAt(e);
    if (u && t) faceToward(u, t.x, t.y);
  }

  private floatText(x: number, z: number, text: string, color: string, dy = 0) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d')!;
    g.font = 'bold 40px system-ui'; g.textAlign = 'center'; g.fillStyle = color;
    g.strokeStyle = '#000'; g.lineWidth = 5;
    g.strokeText(text, 64, 44); g.fillText(text, 64, 44);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sprite.scale.set(1.6, 0.8, 1);
    sprite.position.set(x, 1.6 + dy + this.hy(Math.floor(x), Math.floor(z)), z);
    this.scene.add(sprite);
    this.floats.push({ sprite, t: 0 });
  }

  private async click(e: PointerEvent) {
    const s = this.state;
    if (s.turn !== 'human' || (s.busy && !s.rt) || s.status !== 'playing') return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.ground)[0];
    if (!hit) return;
    const x = Math.floor(hit.point.x), y = Math.floor(hit.point.z);
    if (s.turning) {
      const tu = s.units.find(v => v.id === s.selectedId && v.hp > 0);
      if (tu) faceToward(tu, x, y);
      s.turning = false;
      this.onChange();
      return;
    }
    if (s.aiming === 'grenade') {
      const th = s.units.find(v => v.id === s.selectedId && v.hp > 0);
      if (th && this.canAim(th, x, y)) { if (s.launch) await this.launchAt(th, x, y); else if (s.smokeMode) await this.smokeAt(th, x, y); else await this.throwAt(th, x, y); }
      return;
    }
    const at = s.units.find(v => v.hp > 0 && v.x === x && v.y === y && isVisible(s, v));
    const sel = s.units.find(v => v.id === s.selectedId && v.hp > 0);
    if (at?.team === 'human') { s.selectedId = at.id; s.targetId = null; s.targetBarrel = null; s.aiming = null; this.focusOn(at.x, at.y); sfx('select'); }
    else if (at?.team === 'alien') { if (sel) { s.targetId = at.id; s.targetBarrel = null; if (s.rt && !sel.down) { orderAttack(sel, at); sfx('click'); } } }
    else if (barrelAt(s, x, y)) { if (sel) { s.targetBarrel = { x, y }; s.targetId = null; } }
    else if (s.rt) { // реальное время: приказ идти
      if (sel && !sel.down && reachable(s, sel.x, sel.y, 80).has(`${x},${y}`)) { orderMove(sel, x, y); s.targetId = null; sfx('click'); }
    }
    else if (sel && sel.ap > 0 && reachable(s, sel.x, sel.y, moveRange(sel)).has(`${x},${y}`)) {
      const before = { id: sel.id, x: sel.x, y: sel.y, ap: sel.ap, stance: sel.stance, overwatch: sel.overwatch, facing: sel.facing };
      const visBefore = s.units.filter(v => v.team === 'alien' && v.hp > 0 && isVisible(s, v)).length;
      s.busy = true; s.targetId = null; sel.ap -= 1; sel.overwatch = false; sel.stance = 'stand';
      let shotAt = false;
      for (const [px, py] of findPath(s, sel.x, sel.y, x, y, moveRange(sel))) {
        sel.x = px; sel.y = py; this.stepFx(sel); await this.moved();
        const rs = alienReactions(s, sel); // overwatch пришельцев
        for (const r of rs) { shotAt = true; await this.shotFx(r); this.syncUnits(); }
        if (sel.hp <= 0 || sel.down || s.status !== 'playing') break;
      }
      s.busy = false;
      updateVision(s);
      const visAfter = s.units.filter(v => v.team === 'alien' && v.hp > 0 && isVisible(s, v)).length;
      // отмена доступна, пока боец не сделал ничего другого и ход не открыл новых пришельцев
      s.undo = visAfter > visBefore || shotAt ? undefined : { ...before, fp: `${sel.x},${sel.y},${sel.ap},${sel.ammo},${sel.stance},${sel.overwatch},${s.log.length}`, vis: visAfter };
      checkEnd(s);
    }
    this.syncUnits();
    this.onChange();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    setAmbient(null);
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
