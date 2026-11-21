import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { STEP, type GameState, type Unit } from '../game/types';
import { launchDrone, buildBags, canBuildBags, alienReactions, barrelAt, BLAST, canLaunch, launch, LAUNCH, type GrenadeResult, canThrow, checkEnd, coverSource, faceToward, hitChance, isFlanked, peekTile, isVisible, los, moveRange, throwGrenade, updateVision, type ShotResult } from '../game/combat';
import { sfx, setAmbient, setLife, setReverb, type Sfx } from '../audio';
import { applyTwoHands, gunForWeapon, spawnCover, spawnModel, type Spawned } from './models';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sway, tickWind, WIND, windBlast, windVec } from './wind';
import { Leaves } from './leaves';
import { bushGeo as mkBush, containerGeo, crateGeo, deadGeo, flowerGeo, grassClumpGeo, oakGeo, pineGeo, rockGeo as mkRock } from './props';
import { buildBuilding, lampParts, roadMaterial, setWeatherVisuals, showFloors, STOREY, type BuildingObj } from './buildings';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { reachable, findPath } from '../game/pathfinding';
import { CD_PER_AP, orderAttack, orderMove } from '../game/rt';
import { bldgAt, coverAt, flOf } from '../game/floors';
import { encumbrance } from '../game/inventory';
import { SMOKE, throwSmokeKind, type SmokeId } from '../game/smoke';
import { nodeOf } from '../game/catalog';

let TS = 1; // масштаб времени (реальный режим: ×0.5 / ×1)
export const setTimeScale = (x: number) => { TS = x; };
const PRONE_AXIS = 1, PRONE_ANG = -1.45; // руки лёжа: ось (в системе модели) и угол

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms / TS));
const SPEED = 3.6; // клеток в секунду (было 6,5 — медленнее по просьбе)
const BULLET_SPEED = 18; // клеток/с: пулю видно в полёте (было 60)
const BURST_GAP = 190; // мс между патронами очереди (было 75)
const ALIEN_SPEED = 2.2; // пришельцы идут медленнее, чтобы их ход было видно
const nhash = (a: number, b: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (nhash(xi, yi) * (1 - sx) + nhash(xi + 1, yi) * sx) * (1 - sy) + (nhash(xi, yi + 1) * (1 - sx) + nhash(xi + 1, yi + 1) * sx) * sy;
};
const CRAWL = 1.1; // ползком лёжа
const ROLLING = new Set<number>(); // бойцы в перекате: движутся быстро
const speedOf = (u?: Unit) => (u && ROLLING.has(u.id) ? 7.5 : u?.team === 'alien' ? ALIEN_SPEED : u?.stance === 'prone' ? CRAWL : u?.stance === 'kneel' ? 1.9 : SPEED * (1 - 0.3 * (u ? encumbrance(u) : 0)));

interface Float { sprite: THREE.Sprite; t: number }
export type Weather = 'clear' | 'rain' | 'fog' | 'dusk' | 'dawn' | 'night';
export const WEATHER_NAME: Record<Weather, string> = { clear: 'ясно', rain: '☔ дощ', fog: '🌫 туман', dusk: '🌆 сутінки', dawn: '🌅 світанок', night: '🌙 ніч' };
/** Погода миссии: чисто визуальная, зависит от номера миссии и локации. */
export const weatherOf = (missionNo: number, biome: string): Weather => (['clear', 'clear', 'rain', 'fog', 'dawn', 'dusk', 'night', 'clear'] as const)[(missionNo * 7 + (biome === 'forest' ? 3 : biome === 'lake' ? 6 : 0)) % 8];

const SKY: Record<string, { top: number; mid: number; hor: number; sun: number; cc: number; cloud: number; stars: number; dir: [number, number, number] }> = {
  clear: { top: 0x2f6fc4, mid: 0x6fa8e0, hor: 0xbcd8ee, sun: 0xfff0c0, cc: 0xffffff, cloud: 0.55, stars: 0, dir: [0.5, 0.55, 0.3] },
  dawn: { top: 0x3c5a98, mid: 0xd89a9a, hor: 0xffc08a, sun: 0xffa060, cc: 0xffd0b0, cloud: 0.5, stars: 0, dir: [0.9, 0.12, 0.1] },
  dusk: { top: 0x24244e, mid: 0xa85c70, hor: 0xf08c50, sun: 0xff7040, cc: 0xe0a090, cloud: 0.5, stars: 0, dir: [-0.9, 0.1, 0.2] },
  night: { top: 0x040818, mid: 0x0a1430, hor: 0x16223a, sun: 0x8aa6ff, cc: 0x1a2540, cloud: 0.25, stars: 1, dir: [-0.4, 0.55, -0.3] },
  rain: { top: 0x545d69, mid: 0x76808a, hor: 0x939ca5, sun: 0x000000, cc: 0x6a727c, cloud: 1, stars: 0, dir: [0.5, 0.55, 0.3] },
  fog: { top: 0xa0aaa7, mid: 0xa5afac, hor: 0xaab4b1, sun: 0x000000, cc: 0xb4bcb9, cloud: 0.1, stars: 0, dir: [0.5, 0.55, 0.3] },
};

/** Освещение по времени суток: ключевые кадры (параметры солнца, неба, дымки, ночи). */
const LIGHT: Record<string, { exp: number; sun: number; sunI: number; hemi: number; fogTo: number | null; fogAmt: number; near: number | null; far: number | null; off: [number, number, number]; night: number }> = {
  clear: { exp: 3.5, sun: 0xfff0d0, sunI: 2.0, hemi: 1.3, fogTo: null, fogAmt: 0, near: null, far: null, off: [14, 30, 8], night: 0 },
  dawn: { exp: 3.0, sun: 0xffb070, sunI: 1.8, hemi: 1.0, fogTo: 0xd9a07a, fogAmt: 0.45, near: null, far: null, off: [34, 11, 6], night: 0.25 },
  dusk: { exp: 2.7, sun: 0xff9a60, sunI: 1.5, hemi: 0.9, fogTo: 0x4a3a50, fogAmt: 0.5, near: null, far: null, off: [-30, 10, 9], night: 0.3 },
  night: { exp: 2.2, sun: 0x8aa6ff, sunI: 0.7, hemi: 0.55, fogTo: 0x0c1424, fogAmt: 0.8, near: 10, far: 60, off: [-12, 26, -10], night: 1 },
};
const TOD_KEYS: [number, string][] = [[0, 'night'], [0.2, 'night'], [0.27, 'dawn'], [0.37, 'clear'], [0.63, 'clear'], [0.73, 'dusk'], [0.81, 'night'], [1, 'night']];

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
  private leaves: Leaves | null = null;
  private mistTex: THREE.CanvasTexture | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private sunOff = new THREE.Vector3(14, 30, 8); // смещение солнца от центра камеры: длина и направление теней
  private skyU: { top: { value: THREE.Color }; mid: { value: THREE.Color }; hor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunCol: { value: THREE.Color }; cloudCol: { value: THREE.Color }; cloud: { value: number }; stars: { value: number }; uTime: { value: number } } | null = null;
  private fogInit = false;
  private middle = false;
  /** Колесо зажато / отпущено: в реальном времени пока зажато — время стоит. */
  onMiddle?: (down: boolean) => void;
  private recoil = new Map<number, number>();
  private rolls = new Map<number, { t0: number; dur: number }>();
  private emerges = new Map<number, number>(); // пришелец вылезает из ямы: время начала
  private prints: { m: THREE.Mesh; t0: number }[] = [];
  private printSide = 0;
  private printGeo = new THREE.CircleGeometry(0.07, 8);
  private pathMat = new THREE.LineBasicMaterial({ color: 0x4fd7ff, transparent: true, opacity: 0.7 });
  /** Цели, по которым уже посчитан урон, но снаряд ещё в полёте: гибель и падение показываем только при попадании. */
  private held = new Map<number, number>();
  private hold(ids: number[]) { for (const i of ids) this.held.set(i, (this.held.get(i) ?? 0) + 1); }
  private release(ids: number[]) { for (const i of ids) { const n = (this.held.get(i) ?? 1) - 1; if (n <= 0) this.held.delete(i); else this.held.set(i, n); } }
  private hitIds(r: GrenadeResult): number[] { return [...r.hits.map(h => h.id), ...r.chain.flatMap(c => this.hitIds(c))]; }
  private gaze = new Map<number, { tid: number; until: number }>();
  private treeSpots: { x: number; z: number; y: number; k: string }[] = [];
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
  private trenchSig = '';
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
    if (state.scn) { const hs = state.units.filter(u => u.team === 'human'), cx = hs.reduce((a, u) => a + u.x, 0) / (hs.length || 1) + 0.5, cz = hs.reduce((a, u) => a + u.y, 0) / (hs.length || 1) + 0.5; this.controls.target.set(cx, 0, cz); this.camera.position.set(cx, 15, cz + 12); } // квартал: смотрим на отряд
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 64;
    // мышь: ЛКМ с зажимом — сдвиг карты, ПКМ с зажимом — вращение, колесо — масштаб; обычные клики остаются действиями
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: null as unknown as THREE.MOUSE, RIGHT: THREE.MOUSE.ROTATE };
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
    this.leaves = new Leaves(this.scene, (x, z) => this.hs(x, z));
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
      if (e.button === 1) { e.preventDefault(); this.middle = true; this.onMiddle?.(true); }
      this.down = { x: e.clientX, y: e.clientY };
      longFired = false;
      cancelLp();
      if (e.pointerType === 'touch' && e.isPrimary) lp = window.setTimeout(() => { longFired = true; lp = undefined; this.rightClick(e); }, 550);
    });
    el.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) >= 8) cancelLp(); });
    el.addEventListener('pointercancel', cancelLp);
    const midUp = () => { if (this.middle) { this.middle = false; this.onMiddle?.(false); } };
    addEventListener('blur', midUp);
    el.addEventListener('pointerup', e => {
      if (e.button === 1) midUp();
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
      this.perfGovernor(rawDt);
      this.stepRain(dt);
      if (this.skyU) this.skyU.uTime.value = this.clock.elapsedTime;
      this.todT += rawDt; if (this.todT > 0.4) { this.todT = 0; if (this.state.todOn) this.applyTod(this.state.tod ?? 0.5); if (this.lampLights.length) this.updateLampLights(); this.updateSoundScape(); }
      tickWind(this.clock.elapsedTime);
      if (this.state.huge) { if (this.skyMesh) this.skyMesh.position.set(this.controls.target.x, 0, this.controls.target.z); this.hugeT += rawDt; if (this.hugeT > 0.15) { this.hugeT = 0; this.updateHuge(); } }
      if (this.prints.length) { const now = this.clock.elapsedTime; this.prints = this.prints.filter(p => { const k = (now - p.t0) / 40; if (k >= 1) { this.scene.remove(p.m); (p.m.material as THREE.Material).dispose(); return false; } (p.m.material as THREE.MeshLambertMaterial).opacity = 0.38 * (1 - k); return true; }); }
      if (this.leaves) { const tr = this.treeSpots.filter(t => this.coverMeshes.has(t.k)); this.leaves.ambient(dt, this.controls.target.x, this.controls.target.z, tr); this.leaves.update(dt); }
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
          const runA = this.rigs.get(id)?.actions.get(this.anim.get(id) === 'Run_Gun' ? 'Run_Gun' : 'Run');
          if (runA) runA.timeScale = 0.6 + nv * 0.18;
          const rn = this.rigs.get(id)?.actions.has('Run_Gun') && this.rigs.get(id)?.armed ? 'Run_Gun' : 'Run';
          if (dist > 0.12 && this.rigs.has(id)) this.play(id, rn);
          else if (this.anim.get(id) === 'Run' || this.anim.get(id) === 'Run_Gun') this.play(id, 'Idle');
        }
        { // вылезание из ямы: поднимается снизу
          const et = this.emerges.get(id);
          if (et !== undefined) {
            const k = (this.clock.elapsedTime - et) / 0.8;
            if (k >= 1) this.emerges.delete(id); else m.position.y -= (1 - k) * (1 - k) * 0.9;
          }
        }
        { // перекат: кувырок вперёд с небольшим прыжком
          const rl = this.rolls.get(id);
          if (rl) {
            const k = (this.clock.elapsedTime - rl.t0) / rl.dur;
            if (k >= 1) { this.rolls.delete(id); ROLLING.delete(id); m.rotation.x = 0; }
            else { m.rotation.x = Math.PI * 2 * k; m.position.y += Math.sin(Math.PI * k) * 0.35 * dt * 30; }
          }
        }
        const sp = this.rigs.get(id);
        if (sp && u && !this.dying.has(id)) {
          // стойка: колено — клип Duck, лёжа — модель ложится на живот (плавно)
          const wantIdle = u.stance === 'kneel' && sp.actions.has('Kneel') ? 'Kneel' : u.stance === 'kneel' ? 'Duck' : 'Idle';
          const cur = this.anim.get(id);
          if ((cur === 'Idle' || cur === 'Duck' || cur === 'Kneel') && cur !== wantIdle && sp.actions.has(wantIdle)) this.play(id, wantIdle, wantIdle === 'Duck');
          const mv = this.vel.get(id) ?? 0;
          const tp = u.stance === 'prone' ? 1.45 : Math.min(0.1, mv * 0.022); // бегущий боец слегка наклоняется вперёд
          sp.inner.rotation.x += (tp - sp.inner.rotation.x) * (1 - Math.exp(-9 * dt));
          const k = Math.max(0, sp.inner.rotation.x - 0.1) / 1.35;
          const tt0 = this.clock.elapsedTime, idle = mv < 0.05;
          const br = idle ? Math.sin(tt0 * 1.9 + id * 1.7) : 0; // дыхание и перенос веса в покое
          sp.inner.scale.setScalar(sp.baseScale * (1 + br * 0.006));
          sp.inner.rotation.z += ((idle ? Math.sin(tt0 * 0.9 + id) * 0.02 : 0) - sp.inner.rotation.z) * (1 - Math.exp(-4 * dt));
          sp.inner.position.z = -0.5 * k;
          sp.inner.position.y = 0.16 * k;
          const rc = this.recoil.get(id) ?? 0; // отдача при выстреле
          if (rc > 0) { sp.inner.position.z -= rc * 0.05; sp.inner.position.y += rc * 0.012; this.recoil.set(id, Math.max(0, rc - dt * 9)); }
        }
        if (u) { // плавный поворот по кратчайшей дуге
          const d = Math.atan2(Math.sin(u.facing - m.rotation.y), Math.cos(u.facing - m.rotation.y));
          m.rotation.y += d * (1 - Math.exp(-10 * dt));
        }
        if (sp?.modBase) { sp.mod.forEach((b, i) => b.quaternion.copy(sp.modBase![i])); sp.modBase = undefined; } // микшер пишет кости только при смене позы
        if (m.visible) this.rigs.get(id)?.mixer.update(dt * TS);
        if (sp && u && !this.dying.has(id)) { sp.modBase = sp.mod.map(b => b.quaternion.clone()); const pk = Math.max(0, sp.inner.rotation.x - 0.1) / 1.35; this.proneArms(sp, pk); this.lookAtTarget(sp, m, u, id, dt, pk); applyTwoHands(sp); }
      }
      const tt = this.clock.elapsedTime;
      for (const g of this.fireMeshes.values()) g.children.forEach((c, i) => { c.scale.y = 0.7 + 0.55 * Math.abs(Math.sin(tt * 9 + (g.userData.phase as number) + i)); });
      { // ветер: пламя наклоняется по ветру, дым сносит и «дышит»
        const w = windVec(tt);
        for (const g of this.fireMeshes.values()) g.children.forEach(c => { c.rotation.z = -w.x * 0.45; c.rotation.x = w.z * 0.45; });
        for (const [k, o] of this.smokeMeshes) {
          const ph = k.length * 1.7, b = o.userData as { bx: number; bz: number };
          o.position.x = b.bx + w.x * 0.22 + Math.sin(tt * 0.7 + ph) * 0.1; o.position.z = b.bz + w.z * 0.22 + Math.cos(tt * 0.6 + ph) * 0.1;
          o.scale.set(1 + Math.sin(tt * 0.9 + ph) * 0.06, 1.1 + Math.sin(tt * 1.1 + ph) * 0.05, 1 + Math.cos(tt * 0.8 + ph) * 0.06);
        }
      }
      for (const tw of this.tweens) { tw.t += rawDt * TS; const k = Math.min(1, tw.t / tw.dur); tw.fn(k); if (k >= 1) tw.done(); }
      this.tweens = this.tweens.filter(tw => tw.t < tw.dur);
      for (const f of this.floats) {
        f.t += 0.016; f.sprite.position.y += 0.012;
        (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t / 1.1);
      }
      this.floats = this.floats.filter(f => (f.t < 1.1 ? true : (this.scene.remove(f.sprite), false)));
      if (this.waveMarks) this.waveMarks.children.forEach((c, i) => { const t = this.clock.elapsedTime * 3 + i; if (i % 2) c.position.y += Math.sin(t) * 0.004; else c.scale.setScalar(1 + 0.18 * Math.sin(t)); });
      for (const g of this.lootMeshes.values()) g.rotation.y += 0.01;
      if (this.mistTex) { this.mistTex.offset.x += rawDt * 0.004; this.mistTex.offset.y += rawDt * 0.0015; }
      if (this.waterTex) { this.waterTex.offset.x += rawDt * 0.03; this.waterTex.offset.y += rawDt * 0.015; }
      this.stepCamera(dt);
      this.controls.update();
      { // камера и тень не выходят за карту; тень следует за камерой
        const t = this.controls.target, cx = Math.max(0, Math.min(n, t.x)), cz = Math.max(0, Math.min(n, t.z));
        if (cx !== t.x || cz !== t.z) { this.camera.position.x += cx - t.x; this.camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
        // тень: размер охвата следует за высотой камеры, центр привязан к сетке текселей (без мерцания при движении)
        const dist = this.camera.position.distanceTo(t), half = Math.max(22, Math.min(56, dist * 0.85)), sc = this.sun.shadow.camera;
        if (Math.abs(sc.right - half) > half * 0.12) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
        const q = (2 * sc.right) / this.sun.shadow.mapSize.x, sx = Math.round(t.x / q) * q, sz = Math.round(t.z / q) * q;
        this.sun.position.set(sx + this.sunOff.x, this.sunOff.y, sz + this.sunOff.z);
        this.sun.target.position.set(sx, 0, sz);
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
    const n = this.state.size, sg = this.sg;
    const cx = Math.max(0, Math.min(n - 1, Math.floor(x))), cy = Math.max(0, Math.min(n - 1, Math.floor(y)));
    if (sg) return sg[(cy + GameView.RIM) * this.sgN + cx + GameView.RIM];
    return (this.state.height[cy]?.[cx] ?? 0) * STEP;
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
    const ruined = this.state.biome === 'ruins' || !!this.state.huge;
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

  /** Окопы: траншея. Соседние клетки сливаются в одну линию; вдоль закрытых сторон лежат мешки с песком в два ряда
   * и земляной бруствер, внутри тёмное дно с настилом. Боец стоит в траншее ниже бруствера. */
  private syncTrenches() {
    const keys = this.state.trenches.map(t => `${t.x},${t.y}`).sort();
    const sig = keys.join(';');
    if (sig === this.trenchSig) return;
    this.trenchSig = sig;
    const fresh = keys.some(k => !this.trenchMeshes.has(k));
    for (const g of this.trenchMeshes.values()) this.scene.remove(g);
    this.trenchMeshes.clear();
    const has = new Set(keys);
    const bag = [0x9a8a62, 0x8c7d57, 0xa5956b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
    const earth = new THREE.MeshStandardMaterial({ color: 0x5d4a30, roughness: 1, flatShading: true });
    const wall = new THREE.MeshStandardMaterial({ color: 0x3e2f1e, roughness: 1 });
    const floor = new THREE.MeshBasicMaterial({ color: 0x1f160d });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
    const bagG = new THREE.BoxGeometry(0.33, 0.13, 0.19);
    for (const t of this.state.trenches) {
      const k = `${t.x},${t.y}`;
      const g = new THREE.Group();
      g.position.set(t.x + 0.5, this.hy(t.x, t.y), t.y + 0.5);
      const h = (t.x * 7 + t.y * 13) | 0;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floor);
      f.rotation.x = -Math.PI / 2; f.position.y = 0.03;
      g.add(f);
      const ew = has.has(`${t.x + 1},${t.y}`) || has.has(`${t.x - 1},${t.y}`);
      const dk = new THREE.Mesh(new THREE.BoxGeometry(ew ? 1 : 0.55, 0.02, ew ? 0.55 : 1), wood); // настил
      dk.position.y = 0.045; dk.receiveShadow = true;
      g.add(dk);
      // стороны: [dx, dy, поворот] — если за краем нет окопа, строим стенку
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        if (has.has(`${t.x + dx},${t.y + dy}`)) continue;
        const along = dx === 0; // стенка идёт вдоль x, если сторона северная/южная
        const rot = along ? 0 : Math.PI / 2;
        const put = (m: THREE.Mesh, off: number, y: number, d: number) => {
          m.position.set(along ? off : dx * d, y, along ? dy * d : off);
          m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; g.add(m);
        };
        put(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 0.06), wall), 0, 0.07, 0.4); // внутренняя стенка ямы
        put(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.3), earth), 0, 0.06, 0.58); // земляной вал
        for (let i = 0; i < 3; i++) put(new THREE.Mesh(bagG, bag[(h + i + dx + dy * 2 + 9) % 3]), -0.33 + i * 0.33 + ((h >> i) % 3 - 1) * 0.015, 0.19, 0.5); // нижний ряд
        for (let i = 0; i < 2; i++) put(new THREE.Mesh(bagG, bag[(h + i + 1) % 3]), -0.17 + i * 0.34, 0.32, 0.5); // верхний ряд со смещением
      }
      this.scene.add(g);
      this.trenchMeshes.set(k, g);
    }
    if (fresh && this.sndReady) sfx('dig');
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

  private unitWpn = new Map<number, string>();
  private lootMeshes = new Map<string, THREE.Object3D>(); // ключ — сам объект трофея
  private waveMarks: THREE.Group | null = null;
  private waveSig = '';
  private droneRing: THREE.Mesh | null = null;

  /** Мешки с песком, трофеи и метки следующей волны. */
  private capMeshes = new Map<string, THREE.Object3D>();
  /** Полонённые: оранжевая фигурка с кольцом; исчезает, когда освобождён. */
  private syncCaptives() {
    const cs = this.state.captives; if (!cs) return;
    for (const c of cs) {
      const k = `${c.x},${c.y}`, m = this.capMeshes.get(k);
      if (c.saved) { if (m) { this.scene.remove(m); this.capMeshes.delete(k); } continue; }
      if (m) continue;
      const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xffa23a, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), mat); body.position.y = 0.5;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9b48f })); head.position.y = 1.05;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      g.add(body, head, ring); g.position.set(c.x + 0.5, this.hy(c.x, c.y) + (c.fl ? c.fl * STOREY + 0.1 : 0), c.y + 0.5); this.scene.add(g); this.capMeshes.set(k, g);
    }
  }

  private syncTactics() {
    const s = this.state;
    // мешки, выложенные бойцами
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      if (s.look[y][x] !== 'bags' || s.cover[y][x] === 'none' || this.coverMeshes.has(`${x},${y}`)) continue;
      const g = new THREE.Group();
      g.position.set(x + 0.5, this.hy(x, y), y + 0.5);
      g.rotation.y = ((x * 7 + y * 13) % 5) * 0.12 - 0.2;
      const bagG = new THREE.BoxGeometry(0.34, 0.15, 0.2);
      const mats = [0x9a8a62, 0x8c7d57, 0xa5956b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(bagG, mats[(x + i) % 3]); b.position.set(-0.34 + i * 0.34, 0.09, -0.12); b.castShadow = true; g.add(b); const c = new THREE.Mesh(bagG, mats[(y + i) % 3]); c.position.set(-0.34 + i * 0.34, 0.09, 0.12); c.castShadow = true; g.add(c); }
      for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(bagG, mats[(x + y + i) % 3]); b.position.set(-0.17 + i * 0.34, 0.25, 0); b.castShadow = true; g.add(b); }
      this.scene.add(g); this.coverMeshes.set(`${x},${y}`, g); sfx('dig');
    }
    // трофеи: ящичек с цветной крышкой; аптечка — белая с крестом; оружие — тёмный силуэт; покачиваются
    const liveL = new Set<object>(s.loot ?? []);
    s.loot ??= [];
    s.loot.forEach((l, i) => {
      if (this.lootMeshes.has(l as unknown as string)) return;
      const g = new THREE.Group(), off = (i % 3) * 0.12 - 0.1;
      g.position.set(l.x + 0.5 + off, this.hy(l.x, l.y) + 0.12, l.y + 0.5 - off);
      const lg = l.kind === 'wpn' && l.w ? gunForWeapon(l.w) : null;
      if (lg) { // реальная модель оружия на земле
        const sz = lg.userData.size as number[]; lg.scale.setScalar(0.78 / sz[0]); lg.position.y = 0.02; lg.rotation.y = ((l.x * 7 + l.y * 3) % 6); lg.rotation.z = 0;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 20), new THREE.MeshBasicMaterial({ color: 0xff9f43, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.1;
        g.add(lg, ring);
      } else if (l.kind === 'wpn') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.1), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5, metalness: 0.5 }));
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.08), new THREE.MeshStandardMaterial({ color: 0x5a3f25, roughness: 0.8 })); stock.position.x = -0.38;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: 0x1a1c1f })); mag.position.set(0.02, -0.09, 0);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 20), new THREE.MeshBasicMaterial({ color: 0xff9f43, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.1;
        body.castShadow = true; g.add(body, stock, mag, ring); g.rotation.y = (l.x * 7 + l.y * 3) % 6;
      } else if (l.kind === 'kit') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.7 }));
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: 0xe03a3a })), c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.2), new THREE.MeshBasicMaterial({ color: 0xe03a3a }));
        c1.position.y = c2.position.y = 0.11; box.castShadow = true; g.add(box, c1, c2);
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 0.8 }));
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: l.kind === 'smoke' ? (SMOKE[(l.sm ?? 'white') as SmokeId]?.color ?? 0xcccccc) : { mag: 0xffd34d, gren: 0x6fe39a, mat: 0xc98a4a }[l.kind as 'mag' | 'gren' | 'mat'] }));
        top.position.y = 0.12; box.castShadow = true; g.add(box, top);
      }
      this.scene.add(g); this.lootMeshes.set(l as unknown as string, g);
    });
    for (const [k, g] of this.lootMeshes) if (!liveL.has(k as unknown as object)) { this.scene.remove(g); this.lootMeshes.delete(k); }
    // разведдрон: кольцо зоны обзора
    const dr = s.drone && (s.rt?.clock ?? 0) < s.drone.until ? s.drone : null;
    if (dr && !this.droneRing) {
      this.droneRing = new THREE.Mesh(new THREE.RingGeometry(23.6, 24, 64), new THREE.MeshBasicMaterial({ color: 0x7ee0ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      this.droneRing.rotation.x = -Math.PI / 2; this.droneRing.position.set(dr.x + 0.5, this.hs(dr.x, dr.y) + 0.5, dr.y + 0.5);
      this.scene.add(this.droneRing);
    } else if (!dr && this.droneRing) { this.scene.remove(this.droneRing); this.droneRing = null; }
    // метки следующей волны: красные кольца с шевронами на клетках появления
    const plan = (s.objective === 'defend' || s.objective === 'hold') ? s.wavePlan ?? [] : [];
    const sig = plan.map(p => `${p.x},${p.y},${p.kind}`).join(';');
    if (sig !== this.waveSig) {
      this.waveSig = sig;
      if (this.waveMarks) { this.scene.remove(this.waveMarks); this.waveMarks = null; }
      if (plan.length) {
        const g = new THREE.Group();
        for (const p of plan) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.set(p.x + 0.5, this.hy(p.x, p.y) + 0.08, p.y + 0.5);
          const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8 }));
          arrow.rotation.x = Math.PI; arrow.position.set(p.x + 0.5, this.hy(p.x, p.y) + 1.5, p.y + 0.5);
          g.add(ring, arrow);
        }
        this.scene.add(g); this.waveMarks = g;
      }
    }
  }

  /** Мягкий рельеф как в природе: высоты клеток (и русла рек) дважды размываются, между центрами клеток плавная интерполяция,
   * вокруг карты кольцо из 7 клеток спадает неровным берегом. Высота в центре клетки одна на всё (бойцы, укрытия, трава). */
  private sg: Float32Array | null = null;
  private sgN = 0;
  private static readonly RIM = 7;

  private buildGround() {
    this.computeSg();
    if (this.state.huge) { this.setupHuge(); return; }
    const B = GameView.RIM, N = this.state.size + 2 * B, n = this.state.size;
    const geo = this.groundGeo(-B, -B, n + B, n + B, n > 50 ? 2 : 3);
    this.ground.geometry.dispose();
    this.ground.geometry = geo;
    this.tileGeos.clear();
    void N;
  }

  /** Геометрия земли для прямоугольника мира [x0,x1]×[z0,z1]: вершины с мягкой высотой, цветом и маской грунта/песка. */
  private groundGeo(x0: number, z0: number, x1: number, z1: number, sub: number) {
    const n = this.state.size, B = GameView.RIM;
    const VX = Math.round((x1 - x0) * sub) + 1, VZ = Math.round((z1 - z0) * sub) + 1;
    const pos: number[] = [], uvs: number[] = [], cols: number[] = [], idx: number[] = [], sand: number[] = [], nrm: number[] = [];
    const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let vj = 0; vj < VZ; vj++) for (let vi = 0; vi < VX; vi++) {
      const wx = x0 + vi / sub, wz = z0 + vj / sub;
      const h = this.hs(wx, wz);
      pos.push(wx, h, wz); uvs.push(wx / 4, wz / 4);
      const e = 0.35, dhx = (this.hs(wx + e, wz) - this.hs(wx - e, wz)) / (2 * e), dhz = (this.hs(wx, wz + e) - this.hs(wx, wz - e)) / (2 * e), gx = dhx / STEP, gz = dhz / STEP;
      const nl = Math.hypot(dhx, 1, dhz); nrm.push(-dhx / nl, 1 / nl, -dhz / nl);
      const slope = Math.hypot(gx, gz);
      const dx = Math.max(0.5 - wx, 0, wx - (n - 0.5)), dz = Math.max(0.5 - wz, 0, wz - (n - 0.5)), d = Math.hypot(dx, dz);
      const tone = (0.88 + (vnoise(wx * 0.6, wz * 0.6) - 0.5) * 0.18 + Math.max(-0.1, Math.min(0.14, h / STEP * 0.05))) * (1 - Math.min(0.55, d / B * 0.55));
      const f = Math.min(1, slope * 0.9);
      cols.push(tone * (1 + 0.22 * f), tone * (1 - 0.08 * f), tone * (1 - 0.28 * f));
      const dry = sstep(0.58, 0.84, vnoise(wx * 0.16 + 9, wz * 0.16 + 4)) * 0.4 + sstep(0.5, 1.4, slope) * 0.3;
      const shore = sstep(-0.62, -0.4, h) * (1 - sstep(-0.22, -0.05, h));
      sand.push(Math.min(0.92, Math.max(dry, shore * 0.95)));
    }
    for (let vj = 0; vj < VZ - 1; vj++) for (let vi = 0; vi < VX - 1; vi++) {
      const a = vj * VX + vi, b = a + 1, c = a + VX, d = c + 1;
      if ((vi + vj) % 2 === 0) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setAttribute('sand', new THREE.Float32BufferAttribute(sand, 1));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    return geo;
  }

  // ---------- огромная карта: земля, лес и трава кусками вокруг камеры ----------
  private static readonly CH = 32;
  private groundGroup = new THREE.Group();
  private chunks = new Map<string, { terrain: THREE.Mesh; objs: THREE.Object3D[]; grass: THREE.Object3D | null; sig: number; roads: THREE.Mesh[]; blds: { b: BuildingObj; x: number; y: number; w: number; d: number; sp: NonNullable<GameState['bldgs']>[number]; rev: number }[] }>();
  private bldgByChunk = new Map<string, NonNullable<GameState['bldgs']>>();
  private roadByChunk = new Map<string, { x: number; y: number; w: number; h: number }[]>();
  private carGeo!: THREE.BufferGeometry;
  private hugeT = 0; private hugeSigT = 0;
  private treeGeo!: THREE.BufferGeometry; private treeMat!: THREE.Material;
  private bushGeo!: THREE.BufferGeometry; private rockGeo!: THREE.BufferGeometry;
  private oakGeo!: THREE.BufferGeometry; private deadGeo!: THREE.BufferGeometry; private crateGeo!: THREE.BufferGeometry; private containerGeo!: THREE.BufferGeometry; private crateMat!: THREE.Material; private contMat!: THREE.Material; private flowerGeo!: THREE.BufferGeometry;
  private bushMat!: THREE.Material; private rockMat!: THREE.Material; private boxMat!: THREE.Material; private grassMat!: THREE.Material; private grassGeo!: THREE.BufferGeometry;

  private setupHuge() {
    this.ground.visible = false;
    this.scene.add(this.groundGroup);
    this.treeGeo = pineGeo(); this.oakGeo = oakGeo(); this.deadGeo = deadGeo();
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    sway(this.treeMat, { amp: 0.05, h: 2.1, base: 0, oh: 2.1 });
    this.bushGeo = mkBush();
    this.bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }); sway(this.bushMat, { amp: 0.025, h: 0.7, base: 0, oh: 0.7 });
    this.rockGeo = mkRock();
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    this.boxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const tbs = (import.meta as any).env?.BASE_URL ?? '/', tlo = new THREE.TextureLoader();
    const wtex = tlo.load(`${tbs}tex/crate.jpg`); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.colorSpace = THREE.SRGBColorSpace;
    const stex = tlo.load(`${tbs}tex/steel.jpg`); stex.wrapS = stex.wrapT = THREE.RepeatWrapping; stex.colorSpace = THREE.SRGBColorSpace;
    this.crateGeo = crateGeo(); this.containerGeo = containerGeo(); this.flowerGeo = flowerGeo();
    this.crateMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: wtex, roughness: 0.85 });
    this.contMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }); void stex;
    this.grassGeo = grassClumpGeo();
    this.grassMat = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, side: THREE.DoubleSide }); sway(this.grassMat, { amp: 0.09, h: 0.4, base: 0.02, oh: 0.4 });
    const fog = this.scene.fog as THREE.Fog; fog.near = 45; fog.far = 135;
    // ямы: тёмный круг и земляной вал
    const pits = this.state.pits ?? [];
    if (pits.length) {
      const disc = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14100a }), pits.length);
      const ring = new THREE.InstancedMesh(new THREE.RingGeometry(0.5, 0.8, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5d4a30, roughness: 1 }), pits.length);
      const m4 = new THREE.Matrix4();
      pits.forEach((p, i) => { m4.setPosition(p.x + 0.5, this.hy(p.x, p.y) + 0.04, p.y + 0.5); disc.setMatrixAt(i, m4); m4.setPosition(p.x + 0.5, this.hy(p.x, p.y) + 0.06, p.y + 0.5); ring.setMatrixAt(i, m4); });
      disc.frustumCulled = ring.frustumCulled = false;
      this.scene.add(disc, ring);
    }
    for (const b of this.state.bldgs ?? []) { const k = this.chunkKey(Math.floor(b.x! / GameView.CH), Math.floor(b.y! / GameView.CH)); (this.bldgByChunk.get(k) ?? this.bldgByChunk.set(k, []).get(k)!).push(b); }
    const CH = GameView.CH;
    for (const r of this.state.roads ?? []) for (let cz = Math.floor(r.y / CH); cz <= Math.floor((r.y + r.h - 1) / CH); cz++) for (let cx = Math.floor(r.x / CH); cx <= Math.floor((r.x + r.w - 1) / CH); cx++) {
      const x0 = Math.max(r.x, cx * CH), x1 = Math.min(r.x + r.w, (cx + 1) * CH), y0 = Math.max(r.y, cz * CH), y1 = Math.min(r.y + r.h, (cz + 1) * CH);
      const k = this.chunkKey(cx, cz); (this.roadByChunk.get(k) ?? this.roadByChunk.set(k, []).get(k)!).push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    const body = new THREE.BoxGeometry(1.0, 0.3, 0.52).translate(0, 0.24, 0), cab = new THREE.BoxGeometry(0.5, 0.26, 0.46).translate(-0.05, 0.52, 0);
    this.carGeo = mergeGeometries([body, cab])!;
    if ((this.state.roads?.length ?? 0) > 0) { // пул ламповых источников: свет вблизи камеры
      for (let i = 0; i < (this.quality === 'high' ? 4 : 2); i++) {
        const L = new THREE.PointLight(0xffd39a, 0, 11, 1.5); L.castShadow = this.quality === 'high' && i === 0;
        if (L.castShadow) { L.shadow.mapSize.set(384, 384); L.shadow.bias = -0.003; L.shadow.normalBias = 0.04; L.shadow.radius = 3; L.shadow.camera.near = 0.15; L.shadow.camera.far = 12; }
        this.scene.add(L); this.lampLights.push(L);
      }
    }
    this.updateHuge(true);
  }

  private chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

  /** Кусок земли и объекты (деревья, кусты, камни, ящики) в клетках [x0,x1)×[z0,z1). */
  private buildChunkObjects(cx: number, cz: number) {
    const s = this.state, n = s.size, CH = GameView.CH;
    const x0 = Math.max(0, cx * CH), x1 = Math.min(n, (cx + 1) * CH), z0 = Math.max(0, cz * CH), z1 = Math.min(n, (cz + 1) * CH);
    const lists: Record<string, { x: number; y: number }[]> = { tree: [], bush: [], rock: [], crate: [], container: [], car: [], oak: [], dead: [] };
    let sig = 0;
    for (let y = z0; y < z1; y++) for (let x = x0; x < x1; x++) {
      if (s.cover[y][x] === 'none') continue;
      const l = s.look[y][x];
      if (lists[l]) { const sp = l === 'tree' ? (nhash(x * 3 + 1, y * 5 + 2) < 0.5 ? 'tree' : nhash(x * 3 + 1, y * 5 + 2) < 0.9 ? 'oak' : 'dead') : l; lists[sp].push({ x, y }); sig++; }
    }
    const objs: THREE.Object3D[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number }[], f: (t: { x: number; y: number }, i: number) => { sx: number; sy: number; color?: number; yaw?: number }, shadow = false) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        const r = f(t, i), yaw = r.yaw ?? nhash(t.x * 7 + 1, t.y * 13 + 5) * 6.28;
        q.setFromEuler(e.set(0, yaw, 0)); v.set(t.x + 0.5, this.hy(t.x, t.y), t.y + 0.5); sc.set(r.sx, r.sy, r.sx);
        im.setMatrixAt(i, m4.compose(v, q, sc));
        if (r.color !== undefined) im.setColorAt(i, c.set(r.color));
      });
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im); objs.push(im);
    };
    const greens = [0xe0f0d8, 0xffffff, 0xeaf4dc, 0xd0e4c0];
    const treeF = (t: { x: number; y: number }) => { const k = 0.85 + nhash(t.x, t.y * 3) * 0.5; return { sx: k, sy: k * (0.9 + nhash(t.y, t.x) * 0.3), color: greens[(t.x + t.y) % 4] }; };
    make(this.treeGeo, this.treeMat, lists.tree, treeF, true);
    make(this.oakGeo, this.treeMat, lists.oak, t => { const r = treeF(t); return { ...r, sx: r.sx * 0.95, sy: r.sy * 0.9 }; }, true);
    make(this.deadGeo, this.treeMat, lists.dead, t => ({ sx: 0.9 + nhash(t.x, t.y) * 0.4, sy: 0.9 + nhash(t.y, t.x) * 0.4 }), true);
    make(this.bushGeo, this.bushMat, lists.bush, t => ({ sx: 1.25 + nhash(t.x, t.y) * 0.5, sy: 1.1 + nhash(t.y, t.x) * 0.3 }));
    make(this.rockGeo, this.rockMat, lists.rock, (t) => { const full = s.cover[t.y][t.x] === 'full'; return { sx: full ? 1.1 : 0.85, sy: full ? 1.9 : 1 }; }, true);
    make(this.crateGeo, this.crateMat, lists.crate, t => { const k = 0.9 + nhash(t.x, t.y) * 0.15; return { sx: k, sy: k }; }, true);
    const contCols = [0x4a5a78, 0x8a3a30, 0x3a6a4a, 0x8a7a3a, 0x5a5a62];
    make(this.containerGeo, this.contMat, lists.container, t => ({ sx: 1, sy: 1, color: contCols[(t.x * 5 + t.y * 3) % 5] }), true);
    const carCols = [0xa83232, 0x2f5f9a, 0x6a6e72, 0xd8d4c8, 0x3a6a3a, 0x8a6a2a];
    make(this.carGeo, this.boxMat, lists.car, t => ({ sx: 1, sy: 1, color: carCols[(t.x * 7 + t.y * 3) % 6], yaw: (nhash(t.x, t.y) - 0.5) * 0.5 + ((t.x + t.y) % 2) * Math.PI }), true);
    return { objs, sig };
  }

  private buildGrass(cx: number, cz: number) {
    const s = this.state, n = s.size, CH = GameView.CH;
    const x0 = Math.max(0, cx * CH), x1 = Math.min(n, (cx + 1) * CH), z0 = Math.max(0, cz * CH), z1 = Math.min(n, (cz + 1) * CH);
    const spots: [number, number][] = [];
    for (let y = z0; y < z1; y++) for (let x = x0; x < x1; x++) {
      if (s.cover[y][x] !== 'none' || s.terrain[y][x] === 'water') continue;
      for (let i = 0; i < 3; i++) if (nhash(x * 3 + i, y * 5 + 11) < 0.7) spots.push([x + nhash(x + i * 31, y), y + nhash(y + i * 17, x)]);
    }
    if (!spots.length) return null;
    const im = new THREE.InstancedMesh(this.grassGeo, this.grassMat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const cols = [0xffffff, 0xe6f0d4, 0xf0f4c8, 0xd4e4b8];
    spots.forEach(([px, pz], i) => {
      const k = 0.7 + nhash(i, x0 + z0) * 0.9;
      q.setFromEuler(e.set((nhash(i, 3) - 0.5) * 0.3, nhash(i, 9) * 6, (nhash(i, 5) - 0.5) * 0.3)); v.set(px, this.hs(px, pz), pz); sc.set(k, 0.9 * k, k);
      im.setMatrixAt(i, m4.compose(v, q, sc)); im.setColorAt(i, c.set(cols[i % 4]));
    });
    im.receiveShadow = true;
    im.computeBoundingSphere();
    const grp = new THREE.Group(); grp.add(im);
    const fl = spots.filter((_, i) => nhash(i * 7 + 3, x0 + z0 * 3) < 0.05); // полевые цветы
    if (fl.length) {
      const fm = new THREE.InstancedMesh(this.flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true }), fl.length), fc = [0xf6f6ee, 0xf2d44a, 0xc686e6, 0xe86a6a, 0x8ab6f0];
      fl.forEach(([px, pz], i) => { fm.setMatrixAt(i, m4.compose(v.set(px, this.hs(px, pz), pz), q.identity(), sc.set(1, 0.8 + nhash(i, 5) * 0.6, 1))); fm.setColorAt(i, c.set(fc[i % 5])); });
      fm.computeBoundingSphere(); grp.add(fm);
    }
    this.scene.add(grp);
    return grp;
  }

  private disposeChunk(k: string) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    this.groundGroup.remove(ch.terrain); ch.terrain.geometry.dispose();
    for (const o of ch.objs) { this.scene.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
    if (ch.grass) { this.scene.remove(ch.grass); ch.grass.traverse(o => (o as THREE.InstancedMesh).dispose?.()); }
    this.lampPos.delete(k);
    for (const m of ch.roads) { this.scene.remove(m); if (!(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose(); }
    for (const { b } of ch.blds) { this.scene.remove(b); b.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    this.chunks.delete(k);
  }

  /** Крыша и верхние этажи скрываются, когда внутри есть бойцы или видимые пришельцы. */
  private updateBuildingVis() {
    const s = this.state, who = s.units.filter(u => u.hp > 0 && (u.team === 'human' || isVisible(s, u)));
    const sel = s.units.find(u => u.id === s.selectedId && u.hp > 0);
    for (const ch of this.chunks.values()) for (const e of ch.blds) {
      if ((e.sp.rev ?? 0) !== e.rev) { // стену пробили: перестраиваем модель
        this.scene.remove(e.b); e.b.traverse(o => (o as THREE.Mesh).geometry?.dispose());
        const nb = buildBuilding(e.sp); nb.position.copy(e.b.position); this.scene.add(nb); e.b = nb; e.rev = e.sp.rev ?? 0;
      }
      const inb = (u: Unit) => u.x >= e.x && u.x < e.x + e.w && u.y >= e.y && u.y < e.y + e.d;
      const occ = who.filter(inb);
      if (!occ.length) { showFloors(e.b, 99, true); continue; }
      const lvl = sel && inb(sel) ? flOf(sel) : Math.max(...occ.map(flOf));
      showFloors(e.b, lvl, lvl >= e.b.userData.floors.length);
    }
  }

  /** Подгрузка и выгрузка кусков вокруг камеры; перестройка кусков, где разрушили укрытия. */
  private updateHuge(first = false) {
    const CH = GameView.CH, n = this.state.size, B = GameView.RIM, t = this.controls.target;
    const ccx = Math.floor(t.x / CH), ccz = Math.floor(t.z / CH), R = this.hugeR, RG = 2;
    const need: [number, number, number][] = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if ((cx + 1) * CH <= -B || cx * CH >= n + B || (cz + 1) * CH <= -B || cz * CH >= n + B) continue;
      need.push([cx, cz, dx * dx + dz * dz]);
    }
    need.sort((a, b) => a[2] - b[2]);
    let budget = first ? 40 : 3;
    const keep = new Set<string>();
    for (const [cx, cz, d2] of need) {
      const k = this.chunkKey(cx, cz); keep.add(k);
      let ch = this.chunks.get(k);
      if (!ch) {
        if (budget <= 0) continue;
        budget--;
        const x0 = Math.max(-B, cx * CH), x1 = Math.min(n + B, (cx + 1) * CH), z0 = Math.max(-B, cz * CH), z1 = Math.min(n + B, (cz + 1) * CH);
        const mesh = new THREE.Mesh(this.groundGeo(x0, z0, x1, z1, 2), this.ground.material);
        mesh.receiveShadow = true; this.groundGroup.add(mesh);
        const ob = this.buildChunkObjects(cx, cz);
        const blds = (this.bldgByChunk.get(k) ?? []).map(sp => {
          const b = buildBuilding(sp); b.position.set(sp.x!, this.hy(sp.x! + (sp.w >> 1), sp.y! + (sp.d >> 1)), sp.y!); this.scene.add(b);
          return { b, x: sp.x!, y: sp.y!, w: sp.w, d: sp.d, sp, rev: sp.rev ?? 0 };
        });
        const roads: THREE.Mesh[] = (this.roadByChunk.get(k) ?? []).map(r => {
          const g = new THREE.PlaneGeometry(r.w, r.h).rotateX(-Math.PI / 2), uv = g.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r.w / 2.5, uv.getY(i) * r.h / 2.5);
          const m = new THREE.Mesh(g, roadMaterial()); m.position.set(r.x + r.w / 2, this.hs(r.x + r.w / 2, r.y + r.h / 2) + 0.035, r.y + r.h / 2); m.receiveShadow = true; this.scene.add(m);
          return m;
        });
        const pieces = this.roadByChunk.get(k) ?? [], lamps: [number, number][] = [];
        for (const r of pieces) for (let lx = r.x + 1 + ((r.x * 7 + r.y) % 4); lx < r.x + r.w - 1; lx += 8) lamps.push([lx + 0.5, r.y + (lx % 16 < 8 ? 0.12 : r.h - 0.12)]);
        if (lamps.length) {
          const lp = lampParts(), mp = new THREE.InstancedMesh(lp.pole, lp.poleMat, lamps.length), mh = new THREE.InstancedMesh(lp.head, lp.headMat, lamps.length), m4 = new THREE.Matrix4();
          lamps.forEach(([lx, lz], i) => { m4.makeTranslation(lx, this.hs(lx, lz), lz); mp.setMatrixAt(i, m4); mh.setMatrixAt(i, m4); });
          mp.castShadow = true; mp.frustumCulled = mh.frustumCulled = false; this.scene.add(mp, mh); roads.push(mp, mh);
          this.lampPos.set(k, lamps.map(([lx, lz]) => [lx, this.hs(lx, lz), lz]));
        }
        ch = { terrain: mesh, objs: ob?.objs ?? [], grass: null, sig: ob?.sig ?? 0, roads, blds };
        this.chunks.set(k, ch);
      }
      if (d2 <= RG * RG * 2 && !ch.grass && cx >= 0 && cz >= 0 && budget >= 0) { ch.grass = this.buildGrass(cx, cz); budget--; }
      else if (d2 > RG * RG * 2 + 4 && ch.grass) { this.scene.remove(ch.grass); ch.grass.traverse(o => (o as THREE.InstancedMesh).dispose?.()); ch.grass = null; }
    }
    for (const k of [...this.chunks.keys()]) if (!keep.has(k)) this.disposeChunk(k);
    // разрушенное укрытие: перестраиваем объекты куска
    if (this.clock.elapsedTime - this.hugeSigT > 1) {
      this.hugeSigT = this.clock.elapsedTime;
      for (const [k, ch] of this.chunks) {
        const [cx, cz] = k.split(',').map(Number);
        if (cx < 0 || cz < 0) continue;
        let sig = 0;
        const x0 = cx * CH, x1 = Math.min(n, x0 + CH), z0 = cz * CH, z1 = Math.min(n, z0 + CH);
        for (let y = z0; y < z1; y++) for (let x = x0; x < x1; x++) if (this.state.cover[y][x] !== 'none' && ['tree', 'bush', 'rock', 'crate', 'container', 'car'].includes(this.state.look[y][x])) sig++;
        if (sig !== ch.sig) { for (const o of ch.objs) { this.scene.remove(o); (o as THREE.InstancedMesh).dispose?.(); } const ob = this.buildChunkObjects(cx, cz); ch.objs = ob?.objs ?? []; ch.sig = ob?.sig ?? 0; }
      }
    }
  }

  /** Размытая сетка высот (центры клеток + кольцо вокруг карты). */
  private computeSg() {
    const { size: n, height, terrain } = this.state;
    const B = GameView.RIM, N = n + 2 * B;
    let H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const gi = i - B, gj = j - B, ci = Math.max(0, Math.min(n - 1, gi)), cj = Math.max(0, Math.min(n - 1, gj));
      const d = Math.hypot(gi - ci, gj - cj);
      let h = height[cj][ci] * STEP;
      if (d > 0) {
        const r = d / B;
        h -= 1.7 * Math.pow(r, 1.4) + 0.9 * r * (vnoise(gi * 0.32, gj * 0.32) - 0.35) + 0.35 * (vnoise(gi * 0.9, gj * 0.9) - 0.5) * r + 0.1 * d;
      } else {
        h += (vnoise(gi * 0.5, gj * 0.5) - 0.5) * 0.12 + (vnoise(gi * 1.3, gj * 1.3) - 0.5) * 0.03;
        if (terrain[cj][ci] === 'water') h -= 1.4 + (vnoise(gi * 0.7, gj * 0.7) - 0.5) * 0.3;
      }
      H[j * N + i] = h;
    }
    for (let pass = 0; pass < 2; pass++) {
      const T = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const l = H[j * N + Math.max(0, i - 1)], c = H[j * N + i], r = H[j * N + Math.min(N - 1, i + 1)]; T[j * N + i] = (l + 2 * c + r) / 4; }
      const U = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = T[Math.max(0, j - 1) * N + i], c = T[j * N + i], dn = T[Math.min(N - 1, j + 1) * N + i]; U[j * N + i] = (u + 2 * c + dn) / 4; }
      H = U;
    }
    this.sg = H; this.sgN = N;
  }

  /** Высота рельефа в точке мира: плавная (smoothstep) интерполяция между центрами клеток размытой сетки. */
  private hs(wx: number, wz: number) {
    const sg = this.sg, N = this.sgN, B = GameView.RIM;
    if (!sg) { const n = this.state.size; return (this.state.height[Math.max(0, Math.min(n - 1, Math.floor(wz)))]?.[Math.max(0, Math.min(n - 1, Math.floor(wx)))] ?? 0) * STEP; }
    const u = Math.max(0, Math.min(N - 1.001, wx + B - 0.5)), v = Math.max(0, Math.min(N - 1.001, wz + B - 0.5));
    const i0 = Math.floor(u), j0 = Math.floor(v), tx = u - i0, tz = v - j0, sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const a = sg[j0 * N + i0], b = sg[j0 * N + i0 + 1], c = sg[(j0 + 1) * N + i0], d = sg[(j0 + 1) * N + i0 + 1];
    return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
  }

  private tileGeos = new Map<string, THREE.BufferGeometry>();
  /** Плитка подсветки, повторяющая рельеф (чтобы не уходила в склон): мировые координаты, высота из мягкого рельефа. */
  private tileGeo(x: number, y: number, size = 0.92, lift = 0.035) {
    const key = `${x},${y},${size}`;
    let g = this.tileGeos.get(key);
    if (g) return g;
    const D = 4, pos: number[] = [], idx: number[] = [], o = (1 - size) / 2;
    for (let j = 0; j <= D; j++) for (let i = 0; i <= D; i++) { const wx = x + o + (i / D) * size, wz = y + o + (j / D) * size; pos.push(wx, this.hs(wx, wz) + lift, wz); }
    for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) { const a = j * (D + 1) + i; idx.push(a, a + D + 1, a + 1, a + 1, a + D + 1, a + D + 2); }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.tileGeos.set(key, g);
    return g;
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
    const tb = (import.meta as any).env?.BASE_URL ?? '/', tl = new THREE.TextureLoader();
    const dt = (nm: string, srgb: boolean) => { const t = tl.load(`${tb}tex/${nm}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const tGrass = dt('grass', true), tDirt = dt('dirt', true);
    const gn = dt('grass_n', false); gn.repeat.set(n / 2.5, n / 2.5); ground.normalMap = gn; ground.normalScale.set(0.55, 0.55); // мелкий рельеф травы
    const sandCol = { ruins: [0.5, 0.45, 0.38], forest: [0.42, 0.32, 0.18], lake: [0.72, 0.64, 0.42] }[biome];
    ground.customProgramCacheKey = () => 'ground-soft';
    ground.onBeforeCompile = sh => { // грунт и песок вместо зелени по маске вершин; у воды бегущая пена по уровню воды
      sh.uniforms.uTime = WIND.uTime; sh.uniforms.tGrass = { value: tGrass }; sh.uniforms.tDirt = { value: tDirt }; sh.uniforms.uSand = { value: new THREE.Vector3(...sandCol) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float sand; varying float vSand; varying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = sand; vW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSand; varying vec3 vW; uniform float uTime; uniform vec3 uSand; uniform sampler2D tGrass; uniform sampler2D tDirt;')
        .replace('#include <color_fragment>', `#include <color_fragment>
vec3 gdet = texture2D(tGrass, vW.xz * 0.4).rgb, ddet = texture2D(tDirt, vW.xz * 0.4).rgb;
diffuseColor.rgb *= mix(vec3(1.0), gdet * 1.9, 0.85);
float gl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(gl), diffuseColor.rgb, 0.8); // естественнее: меньше насыщенность
diffuseColor.rgb = mix(diffuseColor.rgb, uSand * (0.85 + 0.3 * diffuseColor.g) * (0.45 + ddet * 1.3), vSand);
float lvl = -0.3 + 0.045 * sin(uTime * 1.3 + vW.x * 2.1 + vW.z * 1.6) + 0.02 * sin(uTime * 2.1 + vW.x * 4.3 - vW.z * 3.1);
float foam = (1.0 - smoothstep(0.0, 0.05, abs(vW.y - lvl))) * smoothstep(-0.6, -0.3, vW.y);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 1.0), foam * 0.75);`);
    };
    ground.needsUpdate = true;
    this.buildGround();
    // дальний план и небо, туман в цвет горизонта
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(this.state.huge ? n + 600 : 260, this.state.huge ? n + 600 : 260), new THREE.MeshStandardMaterial({ color: pal.outer, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(n / 2, -0.75, n / 2);
    outer.receiveShadow = true;
    this.scene.add(outer);
    const skyU = {
      top: { value: new THREE.Color(pal.top) }, mid: { value: new THREE.Color(pal.top) }, hor: { value: new THREE.Color(pal.hor) },
      sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) }, sunCol: { value: new THREE.Color(0xfff0c0) }, cloudCol: { value: new THREE.Color(0xffffff) },
      cloud: { value: 0.5 }, stars: { value: 0 }, uTime: { value: 0 },
    };
    this.skyU = skyU;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms: skyU,
        vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 cloudCol; uniform float cloud; uniform float stars; uniform float uTime; varying vec3 vD;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1,0)), f.x), mix(hsh(i + vec2(0,1)), hsh(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, r = 0.0; for (int i = 0; i < 4; i++) { r += a * nz(p); p *= 2.03; a *= 0.5; } return r; }
void main(){
  vec3 d = normalize(vD); float h = d.y;
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h)); col = mix(col, top, smoothstep(0.18, 0.75, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunCol * (pow(sd, 220.0) * 1.4 + pow(sd, 18.0) * 0.28 + pow(sd, 4.0) * 0.12);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.3) * 1.7 + vec2(uTime * 0.012, uTime * 0.006);
    float c = smoothstep(0.42, 0.8, fbm(uv * 1.4)) * cloud * smoothstep(0.0, 0.2, h);
    vec3 cc = cloudCol * (0.78 + 0.35 * pow(sd, 3.0));
    col = mix(col, cc, c * 0.9);
    if (stars > 0.0) { vec2 su = d.xz / (h + 0.25) * 90.0; vec2 fu = fract(su) - 0.5; float st = step(0.985, hsh(floor(su))) * smoothstep(0.14, 0.0, length(fu)); col += vec3(st) * stars * (1.0 - c) * smoothstep(0.08, 0.35, h); }
  }
  gl_FragColor = vec4(col, 1.0);
}`,
      }),
    );
    sky.position.set(n / 2, 0, n / 2);
    sky.renderOrder = -10;
    this.skyMesh = sky;
    this.scene.add(sky);
    this.scene.background = new THREE.Color(pal.hor);
    (this.scene.fog as THREE.Fog).color.set(pal.hor);
    { // дымка в низинах: тонкий слой тумана на небольшой высоте, холмы торчат над ним
      const mc = document.createElement('canvas'); mc.width = mc.height = 256;
      const g2 = mc.getContext('2d')!;
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * 256, y = Math.random() * 256, r = 18 + Math.random() * 40;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          const gr = g2.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g2.fillStyle = gr; g2.fillRect(0, 0, 256, 256);
        }
      }
      this.mistTex = new THREE.CanvasTexture(mc);
      this.mistTex.wrapS = this.mistTex.wrapT = THREE.RepeatWrapping;
      this.mistTex.repeat.set((n + 14) / 22, (n + 14) / 22);
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(n + 14, n + 14), new THREE.MeshBasicMaterial({ map: this.mistTex, color: new THREE.Color(pal.hor).lerp(new THREE.Color(0xffffff), 0.55), transparent: true, opacity: 0.06, depthWrite: false, fog: false }));
      mist.rotation.x = -Math.PI / 2; mist.position.set(n / 2, 0.2, n / 2); mist.renderOrder = 1;
      this.scene.add(mist);
    }

    // трава: небольшие конусы на свободных клетках (в руинах — редкая и сухая)
    const dense = biome !== 'ruins';
    const spots: [number, number][] = [];
    if (this.state.huge) spots.length = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (this.state.huge || cover[y][x] !== 'none' || terrain[y][x] === 'water') continue;
      const k = dense ? 4 : 1;
      for (let i = 0; i < k; i++) if (Math.random() < (dense ? 0.8 : 0.35)) spots.push([x + Math.random(), y + Math.random()]);
    }
    if (spots.length) {
      const bladeMat = new THREE.MeshStandardMaterial({ roughness: 1 }); sway(bladeMat, { amp: 0.07, h: 1 });
      const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.3, 4), bladeMat, spots.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      spots.forEach(([px, pz], i) => {
        const s = 0.7 + Math.random() * 0.9;
        m4.compose(new THREE.Vector3(px, 0.13 * s + this.hs(px, pz), pz), new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3)), new THREE.Vector3(s, s, s));
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
    let x0 = n, x1 = 0, y0 = n, y1 = 0;
    for (const [x, y] of tiles) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
    x0 -= 2; y0 -= 2; x1 += 2; y1 += 2; // вода шире русла: берег там, где рельеф уходит под воду (кромка плавная и неровная)
    this.waterTex.repeat.set((x1 - x0) / 2, (y1 - y0) / 2);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), (this.waterMat = new THREE.MeshStandardMaterial({ map: this.waterTex, color: 0xaad4ff, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.25, emissive: 0x0a2236 })));
    water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, -0.3, (y0 + y1) / 2);
    water.receiveShadow = true;
    this.scene.add(water);
  }

  private buildCover() {
    if (this.state.huge) return; // огромная карта: объекты строятся кусками вместе с землёй
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
      if (l === 'tree' || l === 'bush') { // качается верх; деревья — источник листвы
        const gy = this.hy(x, y), tall = l === 'tree';
        m.traverse(o => { const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (mm) for (const q of Array.isArray(mm) ? mm : [mm]) sway(q, { amp: tall ? 0.05 : 0.025, h: tall ? 2.0 : 0.7, ground: gy }); });
        if (tall) this.treeSpots.push({ x: x + 0.5, z: y + 0.5, y: gy, k: `${x},${y}` });
      }
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
      g.position.set(b.x + 0.5, this.hy(b.x, b.y) + (b.fl ? b.fl * STOREY + 0.1 : 0), b.y + 0.5);
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
  private zoneBuilt = false;
  private buildZone() {
    const z = this.state.zone;
    if (!z || this.zoneBuilt) return;
    this.zoneBuilt = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.3 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(z.x + z.w / 2, 0.015, z.y + z.h / 2);
    this.scene.add(m);
  }

  /** Куда смотрит боец: цель выстрела, цель приказа, иначе ближайший заметный враг. */
  private gazePoint(u: Unit, m: THREE.Object3D): THREE.Vector3 | null {
    const s = this.state, now = this.clock.elapsedTime;
    const g = this.gaze.get(u.id);
    let t: Unit | undefined;
    if (g && g.until > now) t = s.units.find(v => v.id === g.tid && v.hp > 0);
    if (!t && u.team === 'human' && u.atk !== undefined) t = s.units.find(v => v.id === u.atk && v.hp > 0);
    if (!t) {
      let best = u.team === 'human' ? 100 : 81;
      for (const v of s.units) {
        if (v.hp <= 0 || v.team === u.team) continue;
        if (u.team === 'human' && !isVisible(s, v)) continue;
        const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
        if (d < best) { best = d; t = v; }
      }
    }
    const tm = t && this.unitMeshes.get(t.id);
    return tm ? tm.position : null;
  }

  /** Поворот головы и корпуса к цели: голова идёт первой, корпус за ней, ствол следом. */
  private lookAtTarget(sp: Spawned, m: THREE.Object3D, u: Unit, id: number, dt: number, pk: number) {
    if (!sp.neck || !sp.torso) return;
    const tp = pk < 0.05 && !u.down ? this.gazePoint(u, m) : null;
    let want = 0;
    if (tp) {
      const d = Math.atan2(tp.x - m.position.x, tp.z - m.position.z) - m.rotation.y;
      const dl = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(dl) < 2.4) want = dl;
    }
    const kq = 1 - Math.exp(-9 * dt);
    sp.look += (want - sp.look) * kq;
    sp.body += (want - sp.body) * (1 - Math.exp(-5 * dt));
    const iq = sp.inner.getWorldQuaternion(new THREE.Quaternion());
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(iq);
    const yaw = (b: THREE.Object3D, ang: number) => {
      const pq = b.parent!.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.premultiply(pq).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang)).premultiply(pq.clone().invert());
      b.updateMatrixWorld(true);
    };
    yaw(sp.torso, Math.max(-0.45, Math.min(0.45, sp.body * 0.4)));
    yaw(sp.neck, Math.max(-0.9, Math.min(0.9, sp.look * 0.8 - sp.body * 0.3)));
    void id;
  }

  /** Лёжа: руки вытянуты вперёд вдоль тела, ствол смотрит по направлению взгляда. */
  private proneArms(sp: Spawned, k: number) {
    if (k < 0.02 || !sp.arms.length) return;
    sp.inner.updateWorldMatrix(true, false);
    const iq = sp.inner.getWorldQuaternion(new THREE.Quaternion());
    for (const b of sp.arms) {
      const pq = b.parent!.getWorldQuaternion(new THREE.Quaternion());
      const axis = new THREE.Vector3(PRONE_AXIS, 0, 0).applyQuaternion(iq);
      const dq = new THREE.Quaternion().setFromAxisAngle(axis, PRONE_ANG * k);
      b.quaternion.premultiply(pq).premultiply(dq).premultiply(pq.clone().invert()); // локально: pq⁻¹·dq·pq·q
      b.updateMatrixWorld(true);
    }
  }

  private play(id: number, name: string, once = false) {
    const r = this.rigs.get(id);
    if (name === 'Idle_Shoot' && r?.actions.has('KneelShoot') && this.state.units.find(v => v.id === id)?.stance === 'kneel') name = 'KneelShoot';
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
      ? nodeOf(u.weapon)
      : { soldier: '', trooper: 'AK', sniper: 'Sniper_2', psi: '', heavy: 'ShortCannon', commander: 'Revolver' }[u.kind];
    const sp = spawnModel(u.team === 'human' ? 'Soldier' : u.kind === 'psi' ? 'Hazmat' : 'Enemy', height, tint, gun, u.armor, u.team === 'human' ? { optic: u.optic, supp: u.supp, mag: u.extMag } : undefined, { id: u.id, cls: u.cls, kind: u.kind, weapon: u.weapon, helmet: u.helmet, gear: u.gear });
    if (!sp) { const p = this.makePrimitive(u); this.addBlob(p); return p; }
    if (u.team === 'alien') { // инопланетная биолюминесценция: лёгкое свечение материалов
      const glow = { trooper: 0x39ff7a, sniper: 0x35e0c0, psi: 0xb36bff, heavy: 0xc8ff3a, commander: 0xff3a3a, soldier: 0x39ff7a }[u.kind] ?? 0x39ff7a;
      sp.obj.traverse(o => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm && 'emissive' in mm) { mm.emissive = new THREE.Color(glow); mm.emissiveIntensity = u.kind === 'commander' ? 0.14 : 0.07; } });
    }
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
      if (u.hp <= 0 && !this.held.has(u.id)) continue;
      alive.add(u.id);
      { const pw = this.unitWpn.get(u.id), old0 = this.unitMeshes.get(u.id); if (pw && pw !== u.weapon && old0) { this.scene.remove(old0); this.unitMeshes.delete(u.id); this.rigs.delete(u.id); } this.unitWpn.set(u.id, u.weapon); } // сменили оружие — пересоздаём модель
      let m = this.unitMeshes.get(u.id);
      if (!m && u.team === 'alien' && !isVisible(this.state, u)) continue;
      const fromPit = !m && u.team === 'alien' && !!this.state.pits?.some(p => p.x === u.x && p.y === u.y); // пришельцев без видимости не создаём (огромные карты: сотни спящих)
      const inTrench = this.state.trenches.some(t => t.x === u.x && t.y === u.y);
      const inWater = this.state.terrain[u.y]?.[u.x] === 'water';
      const goal = new THREE.Vector3(u.x + 0.5, this.uy(u) - (inTrench && u.hp > 0 ? 0.2 : 0) - (inWater ? 0.3 : 0), u.y + 0.5); // в траншее боец стоит ниже бруствера
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
      if (!m) { m = this.makeUnit(u); m.rotation.order = 'YXZ'; m.position.copy(goal); m.rotation.y = u.facing; this.unitMeshes.set(u.id, m); this.scene.add(m); if (fromPit) { this.emerges.set(u.id, this.clock.elapsedTime); sfx('emerge'); this.burst(new THREE.Vector3(u.x + 0.5, this.uy(u) + 0.1, u.y + 0.5), 0x7a6a4a, 18, 2.2, 700); } }
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
    this.syncCaptives();
    if (this.state.zone && !this.zoneBuilt) this.buildZone();
    for (const [k, m] of this.coverMeshes) {
      const [cx, cy] = k.split(',').map(Number);
      if (this.state.cover[cy][cx] === 'none') {
        this.scene.remove(m); this.coverMeshes.delete(k);
        if (this.sndReady && performance.now() - this.crumbleAt > 400) { this.crumbleAt = performance.now(); sfx('crumble'); }
      }
    }
    this.syncTactics();
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
    if (this.state.huge) this.updateBuildingVis();
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
    if (any) { sfx('alert'); setTimeout(() => sfx('radio'), 380); }
  }

  /** Шаги: два за клетку, тише вдали от камеры; пришельцы тяжелее (ниже тоном). */
  private stepFx(u: Unit) {
    const t = this.controls.target;
    const d = Math.hypot(u.x + 0.5 - t.x, u.y + 0.5 - t.z);
    const vol = Math.max(0.2, 1 - d / 28);
    const heavy = u.kind === 'heavy' || u.kind === 'commander';
    const pitch = u.team === 'alien' ? (heavy ? 0.7 : 0.85) : 1;
    const sv = this.state.bidx && this.state.bidx[u.y * this.state.size + u.x] > 0 ? 'floor' : this.state.roadm?.[u.y * this.state.size + u.x] ? 'road' : 'grass';
    sfx('step', { vol, pitch, variant: sv });
    setTimeout(() => sfx('step', { vol: vol * 0.8, pitch: pitch * 0.92, variant: sv }), 1000 / speedOf(u) / 2);
    this.footprint(u);
  }

  /** Бред по воде: маленькие круги и брызги из-под ног. */
  private wade(u: Unit) {
    const x = u.x + 0.5, z = u.y + 0.5;
    this.burst(new THREE.Vector3(x, 0.08, z), 0xd8ecff, 7, 1.6, 420);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xe6f4ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, -0.25, z);
    this.scene.add(m);
    void this.tween(900, k => { m.scale.setScalar(0.15 + k * 0.6); (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k); }).then(() => { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
    if (this.sndReady) sfx('splash', { vol: 0.35 });
  }

  /** Следы: чередуются левая и правая нога, тёмные пятна, на песке и руинах светлее; медленно исчезают. Ползком — борозда. */
  private footprint(u: Unit) {
    if (u.team === 'alien' && !isVisible(this.state, u)) return;
    if (this.state.terrain[u.y]?.[u.x] === 'water') { this.wade(u); return; }
    const crawl = u.stance === 'prone', f = u.facing;
    const sx = Math.cos(f), sz = -Math.sin(f); // вбок от направления взгляда
    this.printSide = -this.printSide || 1;
    const off = crawl ? 0 : 0.11 * this.printSide;
    const col = this.state.biome === 'ruins' ? 0x4a4234 : 0x1d2a14;
    const m = new THREE.Mesh(this.printGeo, new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.38, depthWrite: false })); // с освещением: ночью след не светится
    m.rotation.x = -Math.PI / 2; m.rotation.z = f;
    m.scale.set(crawl ? 2.4 : 0.9, crawl ? 1.2 : 1.6, 1);
    m.position.set(u.x + 0.5 + sx * off - Math.sin(f) * 0.12, this.uy(u) + 0.025, u.y + 0.5 + sz * off - Math.cos(f) * 0.12);
    this.scene.add(m);
    this.prints.push({ m, t0: this.clock.elapsedTime });
    if (this.prints.length > 260) { const o = this.prints.shift()!; this.scene.remove(o.m); (o.m.material as THREE.Material).dispose(); }
    if (!crawl && u.stance !== 'kneel') this.burst(new THREE.Vector3(u.x + 0.5, this.uy(u) + 0.05, u.y + 0.5), 0xb9a984, 3, 0.7, 380); // пыль из-под ног
  }

  /** Высота ствола/груди над землёй по стойке. */
  private eye(u: Unit) { return u.stance === 'prone' ? 0.3 : u.stance === 'kneel' ? 0.62 : 0.9; }

  async moved(u?: Unit) {
    this.syncUnits();
    if (u && u.team === 'alien' && !isVisible(this.state, u)) return; // в тумане не ждём: игрок этого не видит
    if (u) this.stepFx(u);
    if (u && isVisible(this.state, u)) this.focusOn(u.x, u.y);
    await sleep(Math.round((this.state.rt ? 800 : 1000) / speedOf(u))); // в реальном времени следующий шаг выдаётся до прихода в клетку
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
  getWeather(): Weather { if (this.state.todOn) return 'clear'; return (this.state.weather as Weather | undefined) ?? weatherOf(this.state.missionNo, this.state.biome); }
  private viewSq = (() => { try { return localStorage.getItem('alien-pressure:viewsq') === 'on'; } catch { return false; } })();
  isViewSq() { return this.viewSq; }
  setViewSq(on: boolean) {
    this.viewSq = on;
    try { localStorage.setItem('alien-pressure:viewsq', on ? 'on' : 'off'); } catch { /* ignore */ }
    this.drawHighlight();
  }
  isWeatherOn() { return this.weatherOn; }
  setWeatherOn(on: boolean) {
    this.weatherOn = on;
    try { localStorage.setItem('alien-pressure:weather', on ? 'on' : 'off'); } catch { /* ignore */ }
    this.applyWeather();
  }
  private baseFog: { color: number; near: number; far: number } | null = null;
  private nightAmt = 0; private todT = 0;
  private lampPos = new Map<string, number[][]>();
  private lampLights: THREE.PointLight[] = [];
  /** Плавная смена дня и ночи: интерполяция ключевых кадров освещения и неба. */
  private applyTod(tod: number) {
    if (!this.baseFog) return;
    let i = 0; while (i < TOD_KEYS.length - 2 && tod >= TOD_KEYS[i + 1][0]) i++;
    const [t0, k0] = TOD_KEYS[i], [t1, k1] = TOD_KEYS[i + 1], f0 = Math.min(1, Math.max(0, (tod - t0) / (t1 - t0 || 1))), f = f0 * f0 * (3 - 2 * f0);
    const A = LIGHT[k0], B = LIGHT[k1], fog = this.scene.fog as THREE.Fog, mix = (a: number, b: number) => a + (b - a) * f;
    this.renderer.toneMappingExposure = mix(A.exp, B.exp);
    this.sun.color.copy(new THREE.Color(A.sun).lerp(new THREE.Color(B.sun), f)); this.sun.intensity = mix(A.sunI, B.sunI); this.hemi.intensity = mix(A.hemi, B.hemi);
    this.sunOff.set(mix(A.off[0], B.off[0]), mix(A.off[1], B.off[1]), mix(A.off[2], B.off[2]));
    const base = new THREE.Color(this.baseFog.color), fc = (L: typeof A) => L.fogTo === null ? base.clone() : base.clone().lerp(new THREE.Color(L.fogTo), L.fogAmt);
    const sa = SKY[k0] ?? SKY.clear, sb = SKY[k1] ?? SKY.clear, hor = new THREE.Color(sa.hor).lerp(new THREE.Color(sb.hor), f);
    fog.color.copy(fc(A).lerp(fc(B), f)).lerp(hor, 0.55 * (1 - mix(A.night, B.night))); // дымка в цвет горизонта днём
    fog.near = mix(A.near ?? this.baseFog.near, B.near ?? this.baseFog.near); fog.far = mix(A.far ?? this.baseFog.far, B.far ?? this.baseFog.far);
    const u = this.skyU;
    if (u) {
      u.top.value.copy(new THREE.Color(sa.top).lerp(new THREE.Color(sb.top), f)); u.mid.value.copy(new THREE.Color(sa.mid).lerp(new THREE.Color(sb.mid), f)); u.hor.value.copy(hor);
      u.sunCol.value.copy(new THREE.Color(sa.sun).lerp(new THREE.Color(sb.sun), f)); u.cloudCol.value.copy(new THREE.Color(sa.cc).lerp(new THREE.Color(sb.cc), f));
      u.cloud.value = mix(sa.cloud, sb.cloud); u.stars.value = mix(sa.stars, sb.stars);
      u.sunDir.value.set(mix(sa.dir[0], sb.dir[0]), mix(sa.dir[1], sb.dir[1]), mix(sa.dir[2], sb.dir[2]));
    }
    this.nightAmt = mix(A.night, B.night);
    this.sun.shadow.intensity = 1 - 0.3 * this.nightAmt;
    setWeatherVisuals(this.nightAmt, false);
    if (this.torch) this.torch.intensity = 75 * Math.min(1, this.nightAmt * 1.3);
  }
  /** Звуковая сцена: гулкость от плотности застройки вокруг камеры и фон дня/ночи. */
  private updateSoundScape() {
    const s = this.state, t = this.controls.target;
    if (s.bidx) { let b = 0, n = 0; for (let y = Math.max(0, Math.floor(t.z) - 14); y < Math.min(s.size, Math.floor(t.z) + 14); y += 2) for (let x = Math.max(0, Math.floor(t.x) - 14); x < Math.min(s.size, Math.floor(t.x) + 14); x += 2) { n++; if (s.bidx[y * s.size + x] > 0) b++; } setReverb(n ? Math.min(1, (b / n) * 3.5) : 0); } else setReverb(0.1);
    setLife(this.nightAmt, this.weatherOn && this.getWeather() !== 'rain');
  }
  /** Реальный свет фонарей: несколько ближайших к камере зажигаются по ночам, у ближайшего — тень. */
  private updateLampLights() {
    const all: number[][] = []; for (const l of this.lampPos.values()) for (const p of l) all.push(p);
    const t = this.controls.target, n = this.lampLights.length;
    all.sort((a, b) => ((a[0] - t.x) ** 2 + (a[2] - t.z) ** 2) - ((b[0] - t.x) ** 2 + (b[2] - t.z) ** 2));
    for (let i = 0; i < n; i++) { const p = all[i], L = this.lampLights[i]; if (p) { L.position.set(p[0] + 0.36, p[1] + 1.78, p[2]); L.intensity = 20 * this.nightAmt; } else L.intensity = 0; }
  }

  private applyWeather() {
    const fog = this.scene.fog as THREE.Fog;
    if (!this.baseFog) this.baseFog = { color: fog.color.getHex(), near: fog.near, far: fog.far };
    const w = this.weatherOn ? this.getWeather() : 'clear';
    this.nightAmt = w === 'night' ? 1 : w === 'dusk' ? 0.3 : 0;
    setWeatherVisuals(this.nightAmt, w === 'rain');
    if (this.skyU) { // небо по погоде: цвета, облака, звёзды, солнце или луна
      const k = SKY[w] ?? SKY.clear, u = this.skyU;
      u.top.value.set(k.top); u.mid.value.set(k.mid); u.hor.value.set(k.hor); u.sunCol.value.set(k.sun); u.cloudCol.value.set(k.cc);
      u.cloud.value = k.cloud; u.stars.value = k.stars; u.sunDir.value.set(...k.dir);
    }
    fog.color.set(this.baseFog.color); fog.near = this.baseFog.near; fog.far = this.baseFog.far;
    this.renderer.toneMappingExposure = 3.5; this.sun.color.set(0xfff0d0); this.sun.intensity = 2.0; this.hemi.intensity = 1.3;
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
    if (this.torch) { this.scene.remove(this.torch, this.torch.target); this.torch = null; }
    this.sun.position.set(this.state.size, 20, this.state.size * 0.2);
    this.sunOff.set(14, 30, 8); this.sun.shadow.intensity = 1;
    setAmbient(this.weatherOn ? (w === 'rain' ? 'rain' : this.state.biome === 'forest' ? 'wind' : this.state.biome === 'lake' ? 'water' : 'drone') : null);
    if (this.state.todOn) { // смена суток: фонарик есть всегда, яркость задаёт applyTod
      this.torch = new THREE.SpotLight(0xffe2b0, 0, 22, 0.55, 0.6, 1.2);
      if (this.quality === 'high') { this.torch.castShadow = true; this.torch.shadow.mapSize.set(1024, 1024); this.torch.shadow.bias = -0.0006; this.torch.shadow.normalBias = 0.03; this.torch.shadow.radius = 4; }
      this.scene.add(this.torch, this.torch.target);
      this.applyTod(this.state.tod ?? 0.5);
    }
    if (w === 'dawn') { this.sunOff.set(34, 11, 6); this.renderer.toneMappingExposure = 3.0; this.sun.color.set(0xffb070); this.sun.intensity = 1.8; this.sun.position.set(this.state.size, 6, this.state.size * 0.1); this.hemi.intensity = 1.0; fog.color.lerp(new THREE.Color(0xd9a07a), 0.45); }
    if (w === 'night') {
      this.sunOff.set(-12, 26, -10); this.sun.shadow.intensity = 0.7;
      this.renderer.toneMappingExposure = 2.2; this.sun.color.set(0x8aa6ff); this.sun.intensity = 0.7; this.hemi.intensity = 0.55; fog.color.lerp(new THREE.Color(0x0c1424), 0.8); fog.near = 10; fog.far = 60;
      this.torch = new THREE.SpotLight(0xffe2b0, 75, 22, 0.55, 0.6, 1.2);
      if (this.quality === 'high') { this.torch.castShadow = true; this.torch.shadow.mapSize.set(1024, 1024); this.torch.shadow.bias = -0.0006; this.torch.shadow.normalBias = 0.03; this.torch.shadow.radius = 4; } // тени от фонарика
      this.scene.add(this.torch, this.torch.target);
    }
    if (w === 'fog') { this.sun.shadow.intensity = 0.4; fog.color.lerp(new THREE.Color(0x9aa6a2), 0.7); fog.near = 6; fog.far = 46; }
    if (w === 'dusk') { this.sunOff.set(-30, 10, 9); this.renderer.toneMappingExposure = 2.7; this.sun.color.set(0xff9a60); this.sun.intensity = 1.5; this.hemi.intensity = 0.9; fog.color.lerp(new THREE.Color(0x4a3a50), 0.5); }
    if (this.skyU && (w === 'dawn' || w === 'dusk' || w === 'clear')) fog.color.lerp(this.skyU.hor.value, 0.75); // дымка в цвет горизонта
    if (w === 'rain') {
      this.sun.shadow.intensity = 0.45;
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
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), new THREE.MeshBasicMaterial({ color: SMOKE[(m.kind ?? 'white') as SmokeId]?.color ?? 0xbfc4c8, transparent: true, opacity: 0.62, depthWrite: false }));
        o.position.set(m.x + 0.5, this.hy(m.x, m.y) + 0.8, m.y + 0.5);
        o.scale.set(1, 1.1, 1); o.userData = { bx: o.position.x, bz: o.position.z };
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
      const gy = this.hs(pos.x, pos.z) + 0.05;
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
    const gy = this.hs(pos.x, pos.z) + 0.03;
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
    m.position.set(x, this.hs(x, z) + 0.03, z);
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
  /** Автоподстройка под слабое устройство: если FPS < 24 — сначала низкое качество, затем меньший радиус подгрузки карты. */
  private hugeR = 4; private perfT = 0; private perfN = 0; private perfWarm = 0; private perfStage = 0;
  perfNote: string | null = null;
  private perfGovernor(dt: number) {
    if (dt <= 0 || dt > 0.5) return;
    this.perfWarm += dt;
    if (this.perfWarm < 6) return; // прогрев: загрузка кусков и шейдеров
    this.perfT += dt; this.perfN++;
    if (this.perfT < 4) return;
    const fps = this.perfN / this.perfT; this.perfT = 0; this.perfN = 0;
    if (fps >= 24 || this.perfStage >= 3) return;
    this.perfStage++;
    if (this.quality === 'high') { this.setQuality('low', false); this.perfNote = 'Низький FPS: увімкнено економну графіку'; }
    else if (this.state.huge && this.hugeR > 2) { this.hugeR--; this.perfNote = 'Низький FPS: зменшено дальність промальовки'; }
    this.perfWarm = 3;
  }

  setQuality(q: 'high' | 'low', save = true) {
    this.quality = q;
    this.lampLights.forEach((L, i) => { L.castShadow = q === 'high' && i === 0; }); if (this.torch) this.torch.castShadow = q === 'high'; // дорогие тени от света — только на высоком
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
      try { // мягкие тени в углах и под карнизами
        const ao = new GTAOPass(this.scene, this.camera, w, h);
        ao.blendIntensity = 0.85;
        ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 10, distanceFallOff: 1, screenSpaceRadius: false });
        c.addPass(ao);
      } catch { /* без AO */ }
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 1.0));
      c.addPass(new OutputPass());
      c.addPass(new ShaderPass({ // цветокоррекция: лёгкая S-кривая, насыщенность и виньетка
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - smoothstep(0.45, 0.95, d) * 0.3; float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, 1.12); c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.22); gl_FragColor = c; }',
      }));
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
    if (this.state.huge) { // огромная карта: пересчитываем туман только в окнах вокруг бойцов
      if (!this.fogInit) { this.fogInit = true; for (let i = 3; i < this.fogData.length; i += 4) this.fogData[i] = 115; }
      for (const u of this.state.units) {
        if (u.team !== 'human' || u.hp <= 0) continue;
        for (let y = Math.max(0, u.y - 18); y <= Math.min(n - 1, u.y + 18); y++) for (let x = Math.max(0, u.x - 18); x <= Math.min(n - 1, u.x + 18); x++) {
          this.fogData[((n - 1 - y) * n + x) * 4 + 3] = vis[y][x] ? 0 : seen[y][x] ? 40 : 115;
        }
      }
      this.fogTex.needsUpdate = true;
      return;
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = ((n - 1 - y) * n + x) * 4;
      this.fogData[i + 3] = vis[y][x] ? 0 : seen[y][x] ? 40 : 115;
    }
    this.fogTex.needsUpdate = true;
  }

  private uy(u: { x: number; y: number; fl?: number }) { return this.hy(u.x, u.y) + (u.fl ? u.fl * STOREY + 0.1 : 0); }
  private ring(x: number, y: number, color: number, r0 = 0.3, r1 = 0.42, fl = 0) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x + 0.5, this.hy(x, y) + 0.07 + fl * STOREY, y + 0.5);
    this.highlight.add(ring);
  }

  /** Полоски на краях клетки со стороны укрытия: зелёная — полное (−40%), жовта — половинное (−20%); оранжевая рамка — окоп. */
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
    for (const o of s.units) if (o.hp > 0 && o.team === 'human' && o.dest) {
      this.ring(o.dest.x, o.dest.y, 0x4fd7ff, 0.18, 0.28, o.dest.fl ?? 0);
      for (const q of o.queue ?? []) this.ring(q.x, q.y, 0x7ea8ff, 0.14, 0.22, q.fl ?? 0);
      if (s.rt) { // линия пути до цілі приказа
        const path = s.huge ? (o.route ?? []) : findPath(s, o.x, o.y, o.dest.x, o.dest.y, 80);
        if (path.length) {
          const pts = [new THREE.Vector3(o.x + 0.5, this.uy(o) + 0.1, o.y + 0.5), ...path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.hy(x, y) + 0.1, y + 0.5))];
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          this.highlight.add(new THREE.Line(geo, this.pathMat));
        }
      }
    }
    for (const o of s.units) if (o.hp > 0 && o.team === 'human' && o.atk !== undefined) { const t = s.units.find(v => v.id === o.atk && v.hp > 0); if (t && isVisible(s, t)) this.ring(t.x, t.y, 0xff4a2a, 0.56, 0.62); }
    for (const o of s.units) if (o.hp > 0 && o.team === 'alien' && isVisible(s, o) && !o.overwatch && o.alert) this.ring(o.x, o.y, 0xb03030, 0.5, 0.53);
    // конусы огня пришельцев на overwatch
    const cone = new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.16, depthWrite: false });
    for (const o of s.units) {
      if (o.hp <= 0 || o.team !== 'alien' || !o.overwatch || !isVisible(s, o)) continue;
      const R = Math.min(o.range, 11);
      for (let y = Math.max(0, o.y - R); y <= Math.min(s.size - 1, o.y + R); y++) for (let x = Math.max(0, o.x - R); x <= Math.min(s.size - 1, o.x + R); x++) {
        if (Math.hypot(x - o.x, y - o.y) > R || s.cover[y][x] !== 'none' || !los(s, o, { x, y })) continue;
        this.highlight.add(new THREE.Mesh(this.tileGeo(x, y, 0.92, 0.03), cone));
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
    if (!u.dest) this.ring(u.x, u.y, 0xffd34d, 0.24, 0.285, u.fl ?? 0); // в движении кружок скрыт
    if (!s.busy && s.aiming !== 'grenade' && (this.viewSq || s.lookMode)) { // обзор выбранного бойца
      const vm = new THREE.MeshBasicMaterial({ color: s.lookMode ? 0x7ee0ff : 0xffffff, transparent: true, opacity: s.lookMode ? 0.2 : 0.045, depthWrite: false }), R = s.lookMode ? Math.min(u.range, 14) : 9;
      for (let y = Math.max(0, u.y - R); y <= Math.min(s.size - 1, u.y + R); y++) for (let x = Math.max(0, u.x - R); x <= Math.min(s.size - 1, u.x + R); x++) {
        if (Math.hypot(x - u.x, y - u.y) > R || s.cover[y][x] !== 'none' || !los(s, u, { x, y })) continue;
        this.highlight.add(new THREE.Mesh(this.tileGeo(x, y, 1, 0.025), vm));
      }
    }
    if (s.aiming === 'bags' && !s.busy) {
      const bm = new THREE.MeshBasicMaterial({ color: 0x7ee0ff, transparent: true, opacity: 0.3 });
      for (let by = Math.max(1, u.y - 2); by <= Math.min(s.size - 2, u.y + 2); by++) for (let bx = Math.max(1, u.x - 2); bx <= Math.min(s.size - 2, u.x + 2); bx++) {
        if (canBuildBags(s, u, bx, by)) this.highlight.add(new THREE.Mesh(this.tileGeo(bx, by), bm));
      }
      return;
    }
    if (s.aiming === 'roll' && !s.busy) {
      const rm = new THREE.MeshBasicMaterial({ color: 0x7ee0ff, transparent: true, opacity: 0.28 });
      for (const k of reachable(s, u.x, u.y, 2).keys()) {
        const [rx, ry] = k.split(',').map(Number);
        if ((rx === u.x && ry === u.y) || s.units.some(v => v.hp > 0 && v.x === rx && v.y === ry)) continue;
        this.highlight.add(new THREE.Mesh(this.tileGeo(rx, ry), rm));
      }
      return;
    }
    if (s.aiming === 'grenade' && !s.busy) {
      const am = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.22 });
      for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
        if (!this.canAim(u, x, y)) continue;
        this.highlight.add(new THREE.Mesh(this.tileGeo(x, y), am));
      }
      return;
    }
    if (u.ap <= 0 || s.busy || s.rt) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.35 });
    const matCover = new THREE.MeshBasicMaterial({ color: 0x4fe08a, transparent: true, opacity: 0.4 });
    for (const k of reachable(s, u.x, u.y, moveRange(u)).keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x === u.x && y === u.y) continue;
      const covered = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (s.cover[y + dy]?.[x + dx] ?? 'none') !== 'none') || s.trenches.some(t => t.x === x && t.y === y);
      if (covered) this.coverBars(x, y);
      this.highlight.add(new THREE.Mesh(this.tileGeo(x, y), covered ? matCover : mat));
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
    const wv = windVec(this.clock.elapsedTime);
    let last = 0;
    void this.tween(ms, k => {
      const d = ((k - last) * ms) / 1000;
      last = k;
      for (let i = 0; i < count; i++) {
        v[i].y -= 7 * d;
        p[i * 3] += (v[i].x + wv.x) * d; p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i].y * d); p[i * 3 + 2] += (v[i].z + wv.z) * d;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k;
    }).then(() => { this.scene.remove(pts); geo.dispose(); mat.dispose(); });
  }

  /** Круги на воде и столб брызг. */
  private ripples(x: number, z: number, r: number) {
    this.burst(new THREE.Vector3(x, 0.15, z), 0xcfe8ff, 46, 4.2, 900);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xe6f4ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, -0.25, z);
      this.scene.add(m);
      void sleep(i * 220).then(() => this.tween(1300, k => { m.scale.setScalar(0.3 + k * r * 1.4); (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); })).then(() => { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
    }
    sfx('splash');
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

  /** Выстрел: очередь (боец и важкий — 3 патрона, пехотинец — 2, снайпер — 1), последний патрон решает исход. */
  async shotFx(r: ShotResult) {
    this.hold([r.targetId]);
    try { await this.shotFx2(r); } finally { this.release([r.targetId]); this.syncUnits(); }
  }

  private async shotFx2(r: ShotResult) {
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
    const chest = new THREE.Vector3(t.x + 0.5, this.eye(t) - 0.05 + this.uy(t), t.y + 0.5);
    const f = a.facing;
    const muzzle = new THREE.Vector3(a.x + 0.5 + Math.sin(f) * 0.5, this.eye(a) + this.uy(a), a.y + 0.5 + Math.cos(f) * 0.5);
    if (r.psi) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([muzzle, chest]), new THREE.LineBasicMaterial({ color: 0xc58bff }));
      const flash = new THREE.PointLight(0xb36bff, 6, 5);
      flash.position.copy(muzzle);
      this.scene.add(line, flash);
      sfx('psi');
      this.floatText(t.x + 0.5, t.y + 0.5, r.hit ? 'тиск' : 'встояв', r.hit ? '#ff6b6b' : '#c9ced3');
      await sleep(800);
      this.scene.remove(line, flash);
      line.geometry.dispose();
      return;
    }
    // стрелок сначала доворачивается к цели (до 0,9 с), потом идёт выстрел: пуля не вылетает раньше, чем ствол наведён
    for (let i = 0; i < 30 && am; i++) {
      const d = Math.abs(Math.atan2(Math.sin(f - am.rotation.y), Math.cos(f - am.rotation.y)));
      if (d < 0.1 && (am.position.distanceTo(this.goals.get(a.id) ?? am.position) < 0.15)) break;
      await sleep(30);
    }
    if (am) { const yaw = am.rotation.y; muzzle.set(am.position.x + Math.sin(yaw) * 0.5, this.eye(a) + this.uy(a), am.position.z + Math.cos(yaw) * 0.5); }
    if (!r.reaction) await sleep(a.team === 'alien' ? 250 : 100); // короткая пауза на прицеливание
    // звук выстрела по оружию: автомат/ПП/дробовик/снайперка; у пришельцев — по типу
    const variant = a.team === 'human' ? a.weapon + (a.supp ? '+s' : '') : a.kind === 'sniper' ? 'sniper' : a.kind === 'heavy' || a.kind === 'commander' ? 'shotgun' : undefined;
    this.gaze.set(a.id, { tid: t.id, until: this.clock.elapsedTime + 2 });
    this.play(a.id, 'Idle_Shoot', true);
    const rounds = a.burst;
    const shots: Promise<void>[] = [];
    for (let i = 0; i < rounds; i++) {
      const last = i === rounds - 1;
      this.recoil.set(a.id, 1);
      const to = chest.clone();
      if (!(last && r.hit)) {
        to.x += (Math.random() - 0.5) * (last ? 1.6 : 1.1);
        to.z += (Math.random() - 0.5) * (last ? 1.6 : 1.1);
        to.y = 0.15 + Math.random() * 0.9;
      }
      shots.push(this.fireRound(muzzle, to, 80 + i * BURST_GAP, last && r.hit, last, a.team === 'human', variant));
    }
    if (am) { am.position.x -= Math.sin(f) * 0.07; am.position.z -= Math.cos(f) * 0.07; } // отдача
    await Promise.all(shots);
    this.release([r.targetId]); this.syncUnits(); this.hold([r.targetId]); // пуля долетела: гибель и падение показываем сейчас
    if (r.hit) {
      sfx('hit');
      this.floatText(t.x + 0.5, t.y + 0.5, `−${r.dmg}`, '#ff6b6b');
      if (r.hit) { this.spray(new THREE.Vector3(t.x + 0.5, this.eye(t) + this.uy(t) - 0.2, t.y + 0.5), new THREE.Vector3(a.x + 0.5, 0, a.y + 0.5)); this.knockback(t, a, r.killed ? 0.3 : 0.16); }
      if (!r.killed) this.play(t.id, 'HitReact', true);
    } else this.floatText(t.x + 0.5, t.y + 0.5, r.suppress ? 'придушений' : 'повз', r.suppress ? '#ffd34d' : '#c9ced3');
    if (r.alerted?.length) this.alertFx(r.alerted);
    if (r.broken) this.floatText(t.x + 0.5, t.y + 0.5, 'укриття', '#ffd34d', 0.5);
    if (r.wound) sfx('wound');
    if (r.wound) this.floatText(t.x + 0.5, t.y + 0.5, r.wound === 'bleed' ? 'кров' : 'перелом', '#ff9f43', 0.5);
    if (r.killed) { setTimeout(() => sfx('death'), 120); this.decal(t.x + 0.5, t.y + 0.5, 0x4a0808, 0.42, 0.65); }
    await sleep(r.reaction ? 300 : 550);
    if (r.peek) { // назад за укрытие
      a.x = home.x; a.y = home.y; a.facing = home.face;
      this.goals.set(a.id, new THREE.Vector3(a.x + 0.5, this.uy(a), a.y + 0.5));
      this.play(a.id, 'Run');
      await sleep(Math.round(700 / speedOf(a)));
    }
  }

  /** Бросок гранаты: дуга, взрыв, урон по площади. */
  async throwAt(u: Unit, x: number, y: number) {
    const s = this.state;
    s.busy = true;
    const res = throwGrenade(s, u, x, y);
    const hids = this.hitIds(res); this.hold(hids);
    this.focusOn(x, y);
    this.blast.visible = false;
    this.play(u.id, 'Punch', true);
    sfx('pin');
    setTimeout(() => sfx('throw'), 220);
    const from = new THREE.Vector3(u.x + 0.5, 1.0 + this.uy(u), u.y + 0.5);
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
    { const pw = Math.min(2, 0.7 + (res.r ?? 1.5) * 0.4); windBlast(to.x, to.z, pw); this.leaves?.burst(to.x, to.z, this.treeSpots.filter(t => this.coverMeshes.has(t.k)), pw); }
    if (s.terrain[res.y]?.[res.x] === 'water') this.ripples(to.x, to.z, (res.r ?? BLAST) + 1); // взрыв в воде: брызги и круги
    const light = new THREE.PointLight(0xffa040, 40, 14);
    light.position.set(to.x, to.y + 0.7, to.z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85 }));
    ball.position.set(to.x, to.y + 0.4, to.z);
    this.scene.add(light, ball);
    this.burst(new THREE.Vector3(to.x, to.y + 0.2, to.z), 0xffb050, 30, 5, 650);
    this.burst(new THREE.Vector3(to.x, to.y + 0.2, to.z), 0x555555, 18, 3, 800);
    for (const b of res.broken) { const bp = new THREE.Vector3(b.x + 0.5, 0.3 + this.hy(b.x, b.y), b.y + 0.5); this.burst(bp, 0x8a7a62, 10, 2.5, 600); this.debris(bp, 0x8a7a62, 8, 3); this.burst(bp.clone().setY(bp.y + 0.4), 0xcfe8ff, 8, 3, 700); this.burst(bp, 0x666055, 14, 1.2, 1400); }
    this.debris(new THREE.Vector3(to.x, to.y + 0.3, to.z), 0x5a4a38, 14, 5);
    this.decal(to.x, to.z, 0x121210, 1.1, 0.55); this.decal(to.x, to.z, 0x2a2420, 1.5, 0.3);
    if (res.ignited.length) setTimeout(() => sfx('fire'), 250);
    if (res.alerted.length) this.alertFx(res.alerted);
    this.release(res.hits.map(h => h.id)); this.syncUnits(); // снаряд упал: теперь показываем гибель
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
    for (const r of results) this.hold(this.hitIds(r));
    this.focusOn(x, y);
    this.blast.visible = false;
    this.play(u.id, 'Idle_Shoot', true);
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const from = new THREE.Vector3(u.x + 0.5 + Math.sin(u.facing) * 0.5, this.eye(u) + this.uy(u), u.y + 0.5 + Math.cos(u.facing) * 0.5);
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
    const sk = (s.smokeKind ?? 'white') as SmokeId;
    if (!throwSmokeKind(s, u, x, y, sk)) { s.busy = false; return; }
    this.focusOn(x, y);
    this.blast.visible = false;
    this.play(u.id, 'Punch', true);
    sfx('pin'); setTimeout(() => sfx('throw'), 220);
    const from = new THREE.Vector3(u.x + 0.5, 1.0 + this.uy(u), u.y + 0.5), to = new THREE.Vector3(x + 0.5, 0.1 + this.hy(x, y), y + 0.5);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), new THREE.MeshStandardMaterial({ color: 0x9aa0a4 }));
    this.scene.add(g);
    const dist = from.distanceTo(to);
    await this.tween(350 + dist * 60, k => { g.position.lerpVectors(from, to, k); g.position.y += Math.sin(k * Math.PI) * (1.2 + dist * 0.15); });
    this.scene.remove(g); g.geometry.dispose();
    this.burst(to.clone().setY(to.y + 0.3), SMOKE[sk].color, 24, 1.6, 900);
    if (sk === 'violet') { this.burst(to.clone().setY(to.y + 0.4), 0xffffff, 40, 5, 300); sfx('grenade'); } else if (sk === 'wp') this.burst(to.clone().setY(to.y + 0.3), 0xffa040, 30, 3, 700);
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
    const chest = new THREE.Vector3(t.x + 0.5, this.eye(t) + this.uy(t) - 0.2, t.y + 0.5);
    if (r.hit) {
      sfx('hit');
      this.burst(chest, 0xff5533, 10, 2, 300);
      this.spray(chest, new THREE.Vector3(a.x + 0.5, 0, a.y + 0.5));
      this.knockback(t, a, r.killed ? 0.3 : 0.14);
      this.floatText(t.x + 0.5, t.y + 0.5, `−${r.dmg}`, '#ff6b6b');
      if (!r.killed) this.play(t.id, 'HitReact', true);
      else { setTimeout(() => sfx('death'), 100); this.decal(t.x + 0.5, t.y + 0.5, 0x4a0808, 0.42, 0.65); }
    } else { sfx('miss'); this.floatText(t.x + 0.5, t.y + 0.5, 'повз', '#cfd8dc'); }
    await sleep(300);
    this.syncUnits();
  }

  /** Выстрел по бочке: пуля и взрыв. */
  async barrelShotFx(a: Unit, res: GrenadeResult) {
    this.focusOn(res.x, res.y);
    const f = a.facing;
    const muzzle = new THREE.Vector3(a.x + 0.5 + Math.sin(f) * 0.5, this.eye(a) + this.uy(a), a.y + 0.5 + Math.cos(f) * 0.5);
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
    const hit = this.ray.intersectObject(this.state.huge ? this.groundGroup : this.ground, true)[0];
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
      this.setHover({ sx, sy, text: ch === null ? `${at.name} · немає лінії вогню` : `${at.name} · шанс ${ch}%${cs ? ` · укриття −${cs.bonus}%` : ch !== null && isFlanked(s, u, at) ? ' · фланг +10%' : ''}` });
      return;
    }
    if (s.huge && s.rt && !at) { this.setHover({ sx, sy, text: s.cover[t.y]?.[t.x] === 'none' ? `до цілі ${Math.round(Math.hypot(t.x - u.x, t.y - u.y))} кл.` : 'зайнято' }); return; }
    if (!at && (s.rt || u.ap > 0) && reachable(s, u.x, u.y, s.rt ? 80 : moveRange(u)).has(`${t.x},${t.y}`)) {
      const path = findPath(s, u.x, u.y, t.x, t.y, s.rt ? 80 : moveRange(u));
      if (path.length) {
        const pts = [new THREE.Vector3(u.x + 0.5, this.uy(u) + 0.12, u.y + 0.5), ...path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.hy(x, y) + 0.12, y + 0.5))];
        this.pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd34d }));
        this.scene.add(this.pathLine);
        const cov = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (s.cover[t.y + dy]?.[t.x + dx] ?? 'none') !== 'none');
        this.setHover({ sx, sy, text: s.rt ? `${path.length} кл. · ~${(path.length * CD_PER_AP / Math.max(1, moveRange(u))).toFixed(1)} с${cov ? ' · є укриття' : ''}` : `${path.length} кл. · −1 AP${cov ? ' · є укриття' : ''}` });
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

  /** Перекат: до 2 клеток за 1 AP (в реальном времени — за один цикл ожидания), кувырок, боец остаётся лёжа. */
  async rollTo(u: Unit, x: number, y: number) {
    const s = this.state;
    const free = !s.units.some(v => v.hp > 0 && v.x === x && v.y === y);
    if (!free || u.down || !reachable(s, u.x, u.y, 2).has(`${x},${y}`)) { s.aiming = null; this.onChange(); return; }
    const path = findPath(s, u.x, u.y, x, y, 2);
    if (!path.length) return;
    s.aiming = null; s.targetId = null;
    if (s.rt) { if ((u.cd ?? 0) > 0 || u.busyRt) return; u.cd = CD_PER_AP; u.ap = 0; u.atk = undefined; u.dest = undefined; }
    else { if (u.ap < 1) return; s.busy = true; u.ap -= 1; }
    u.overwatch = false; u.facing = Math.atan2(x - u.x, y - u.y);
    const dur = Math.max(0.45, path.length * 0.26);
    ROLLING.add(u.id); this.rolls.set(u.id, { t0: this.clock.elapsedTime, dur });
    sfx('roll');
    for (const [px, py] of path) { u.x = px; u.y = py; this.stepFx(u); this.syncUnits(); await sleep(260); }
    u.stance = 'prone';
    if (!s.rt) {
      for (const r of alienReactions(s, u)) { await this.shotFx(r); }
      s.busy = false;
    }
    updateVision(s); checkEnd(s);
    this.syncUnits(); this.onChange();
  }

  private async click(e: PointerEvent) {
    const s = this.state;
    if (s.turn !== 'human' || (s.busy && !s.rt) || s.status !== 'playing') return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.state.huge ? this.groundGroup : this.ground, true)[0];
    if (!hit) return;
    const x = Math.floor(hit.point.x), y = Math.floor(hit.point.z);
    if (s.turning) {
      const tu = s.units.find(v => v.id === s.selectedId && v.hp > 0);
      if (tu) faceToward(tu, x, y);
      s.turning = false;
      this.onChange();
      return;
    }
    if (s.aiming === 'drone') {
      if (launchDrone(s, x, y)) { sfx('select'); this.syncUnits(); }
      s.aiming = null; this.onChange();
      return;
    }
    if (s.aiming === 'bags') {
      const bu = s.units.find(v => v.id === s.selectedId && v.hp > 0);
      if (bu && canBuildBags(s, bu, x, y)) { buildBags(s, bu, x, y); sfx('dig'); this.syncUnits(); }
      s.aiming = null; this.onChange();
      return;
    }
    if (s.aiming === 'roll') {
      const ru = s.units.find(v => v.id === s.selectedId && v.hp > 0);
      if (ru) await this.rollTo(ru, x, y);
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
      const bi = bldgAt(s, x, y), tfl = bi >= 0 && bi === bldgAt(s, sel?.x ?? -1, sel?.y ?? -1) ? flOf(sel!) : 0; // внутри своего здания — на том же этаже
      if (sel && !sel.down && (s.huge ? (tfl > 0 ? coverAt(s, x, y, tfl) === 'none' : s.cover[y]?.[x] === 'none' && s.terrain[y]?.[x] === 'ground') : reachable(s, sel.x, sel.y, 80).has(`${x},${y}`))) { orderMove(sel, x, y, tfl, e.shiftKey); s.targetId = null; sfx('click'); }
    }
    else if (sel && sel.ap > 0 && reachable(s, sel.x, sel.y, moveRange(sel)).has(`${x},${y}`)) {
      const before = { id: sel.id, x: sel.x, y: sel.y, ap: sel.ap, stance: sel.stance, overwatch: sel.overwatch, facing: sel.facing };
      const visBefore = s.units.filter(v => v.team === 'alien' && v.hp > 0 && isVisible(s, v)).length;
      s.busy = true; s.targetId = null; sel.ap -= 1; sel.overwatch = false; if (sel.stance !== 'prone') sel.stance = 'stand'; // лёжа боец ползёт и не встаёт
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
