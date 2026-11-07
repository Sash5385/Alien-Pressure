import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameState, Unit } from '../game/types';
import { checkEnd, isVisible, moveRange, updateVision, type ShotResult } from '../game/combat';
import { sfx } from '../audio';
import { spawnCover, spawnModel, type Spawned } from './models';
import { reachable, findPath } from '../game/pathfinding';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface Float { sprite: THREE.Sprite; t: number }

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
  private clock = new THREE.Clock();
  private goals = new Map<number, THREE.Vector3>();
  private highlight = new THREE.Group();
  private floats: Float[] = [];
  private raf = 0;
  private down = { x: 0, y: 0 };

  constructor(private host: HTMLElement, private state: GameState, private onChange: () => void) {
    const n = state.size;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0b0e0c);
    this.scene.fog = new THREE.Fog(0x0b0e0c, 18, 42);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(n / 2, 16, n + 6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(n / 2, 0, n / 2);
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 38;

    this.scene.add(new THREE.HemisphereLight(0x8899aa, 0x222018, 0.7));
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.4);
    sun.position.set(n, 20, n * 0.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -n; c.right = n; c.top = n; c.bottom = -n; c.far = 60;
    sun.target.position.set(n / 2, 0, n / 2);
    this.scene.add(sun, sun.target);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(n, n),
      new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(n / 2, 0, n / 2);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, new THREE.GridHelper(n, n, 0x555d4c, 0x2c3027).translateX(n / 2).translateZ(n / 2));

    this.fogData = new Uint8Array(n * n * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, n, n, THREE.RGBAFormat);
    this.fogTex.minFilter = this.fogTex.magFilter = THREE.LinearFilter;
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(n, n),
      new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false }),
    );
    fog.rotation.x = -Math.PI / 2;
    fog.position.set(n / 2, 1.5, n / 2);
    fog.renderOrder = 5;
    this.scene.add(fog);

    this.buildCover();
    this.buildZone();
    this.scene.add(this.highlight);
    this.syncUnits(true);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => (this.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5) this.click(e);
    });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      for (const [id, m] of this.unitMeshes) {
        const g = this.goals.get(id);
        if (g && !this.dying.has(id)) {
          const d = g.clone().sub(m.position);
          d.y = 0;
          if (d.length() > 0.08 && this.rigs.has(id)) { m.rotation.y = Math.atan2(d.x, d.z); this.play(id, 'Run'); }
          else if (this.anim.get(id) === 'Run') this.play(id, 'Idle');
          m.position.lerp(g, 0.25);
        }
        this.rigs.get(id)?.mixer.update(dt);
      }
      for (const f of this.floats) {
        f.t += 0.016; f.sprite.position.y += 0.012;
        (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t / 1.1);
      }
      this.floats = this.floats.filter(f => (f.t < 1.1 ? true : (this.scene.remove(f.sprite), false)));
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private buildCover() {
    const { cover, size } = this.state;
    const mat = { half: new THREE.MeshStandardMaterial({ color: 0x6b6254 }), full: new THREE.MeshStandardMaterial({ color: 0x4a4f57 }) };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = cover[y][x];
      if (t === 'none') continue;
      const h = t === 'half' ? 0.6 : 1.4;
      const hash = (x * 7 + y * 13 + x * y) | 0;
      const model = spawnCover(t, Math.abs(hash));
      let m: THREE.Object3D;
      if (model) {
        m = model;
        m.position.set(x + 0.5, 0, y + 0.5);
        m.rotation.y = (Math.abs(hash) % 4) * (Math.PI / 2);
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), mat[t]);
        box.position.set(x + 0.5, h / 2, y + 0.5);
        box.castShadow = box.receiveShadow = true;
        m = box;
      }
      this.scene.add(m);
      this.coverMeshes.set(`${x},${y}`, m);
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
    if (prev && prev !== next) prev.crossFadeTo(next, 0.15, false);
    this.anim.set(id, name);
    if (once && name !== 'Death') setTimeout(() => { if (this.anim.get(id) === name) this.play(id, 'Idle'); }, next.getClip().duration * 1000);
  }

  /** glTF-модель из public/models/, а если её нет — примитив. */
  private makeUnit(u: Unit): THREE.Object3D {
    const height = { soldier: 1.05, trooper: 1.05, sniper: 1.15, psi: 1.05, heavy: 1.45 }[u.kind];
    const tint = { soldier: undefined, trooper: 0x7fd24a, sniper: 0x3f8f6a, psi: 0xb36bff, heavy: 0x6f8a2c }[u.kind];
    const sp = spawnModel(u.team === 'human' ? 'Soldier' : u.kind === 'psi' ? 'Hazmat' : 'Enemy', height, tint);
    if (!sp) return this.makePrimitive(u);
    this.rigs.set(u.id, sp);
    this.play(u.id, 'Idle');
    if (u.team === 'human') sp.obj.rotation.y = Math.PI; // модели смотрят на +Z; бойцы — на север
    return sp.obj;
  }

  private makePrimitive(u: Unit): THREE.Object3D {
    const g = new THREE.Group();
    const look: Record<Unit['kind'], { color: number; scale: number; glow?: number }> = {
      soldier: { color: 0x4f7fb5, scale: 1 },
      trooper: { color: 0x7fd24a, scale: 1 },
      sniper: { color: 0x3f8f6a, scale: 1.1 },
      psi: { color: 0xb36bff, scale: 1, glow: 0x401a70 },
      heavy: { color: 0x6f8a2c, scale: 1.4 },
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
    const alive = new Set<number>();
    for (const u of this.state.units) {
      if (u.hp <= 0) continue;
      alive.add(u.id);
      let m = this.unitMeshes.get(u.id);
      const goal = new THREE.Vector3(u.x + 0.5, 0, u.y + 0.5);
      if (!m) { m = this.makeUnit(u); m.position.copy(goal); this.unitMeshes.set(u.id, m); this.scene.add(m); }
      this.goals.set(u.id, goal);
      m.visible = isVisible(this.state, u);
      if (instant) m.position.copy(goal);
    }
    for (const [id, m] of this.unitMeshes) {
      if (alive.has(id) || this.dying.has(id)) continue;
      if (this.rigs.get(id)?.actions.has('Death')) {
        this.dying.add(id);
        this.play(id, 'Death', true);
        setTimeout(() => { this.scene.remove(m); this.unitMeshes.delete(id); this.goals.delete(id); this.rigs.delete(id); this.dying.delete(id); }, 1300);
      } else { this.scene.remove(m); this.unitMeshes.delete(id); this.goals.delete(id); }
    }
    for (const [k, m] of this.coverMeshes) {
      const [cx, cy] = k.split(',').map(Number);
      if (this.state.cover[cy][cx] === 'none') { this.scene.remove(m); this.coverMeshes.delete(k); }
    }
    this.updateFog();
    this.drawHighlight();
  }

  /** Перемещение с короткой паузой на анимацию. */
  async moved() { this.syncUnits(); await sleep(170); }

  /** Туман войны: неисследованное тёмное, исследованное притемнено, видимое чистое. */
  private updateFog() {
    const { size: n, vis, seen } = this.state;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = ((n - 1 - y) * n + x) * 4;
      this.fogData[i + 3] = vis[y][x] ? 0 : seen[y][x] ? 95 : 215;
    }
    this.fogTex.needsUpdate = true;
  }

  private ring(x: number, y: number, color: number, r0 = 0.3, r1 = 0.42) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x + 0.5, 0.02, y + 0.5);
    this.highlight.add(ring);
  }

  private drawHighlight() {
    this.highlight.clear();
    const s = this.state;
    for (const o of s.units) if (o.hp > 0 && o.overwatch) this.ring(o.x, o.y, 0x35e0e0, 0.46, 0.52);
    for (const o of s.units) if (o.hp > 0 && o.bleeding) this.ring(o.x, o.y, 0xb01818, 0.54, 0.6);
    for (const o of s.units) if (o.hp > 0 && o.panic) this.ring(o.x, o.y, 0xff9f43, 0.62, 0.68);
    const t = s.units.find(v => v.id === s.targetId && v.hp > 0);
    if (t) this.ring(t.x, t.y, 0xff3b3b);
    const u = s.units.find(v => v.id === s.selectedId && v.hp > 0);
    if (!u) return;
    this.ring(u.x, u.y, 0xffd34d);
    if (u.ap <= 0 || s.busy) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.35 });
    const geo = new THREE.PlaneGeometry(0.92, 0.92);
    for (const k of reachable(s, u.x, u.y, moveRange(u)).keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x === u.x && y === u.y) continue;
      const p = new THREE.Mesh(geo, mat);
      p.rotation.x = -Math.PI / 2; p.position.set(x + 0.5, 0.01, y + 0.5);
      this.highlight.add(p);
    }
  }

  /** Трассер, вспышка выстрела и всплывающий текст. */
  async shotFx(r: ShotResult) {
    const a = this.state.units.find(u => u.id === r.attackerId)!;
    const t = this.state.units.find(u => u.id === r.targetId)!;
    const from = new THREE.Vector3(a.x + 0.5, 0.8, a.y + 0.5);
    const to = new THREE.Vector3(t.x + 0.5, 0.8, t.y + 0.5);
    if (!r.hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: r.psi ? 0xc58bff : r.hit ? 0xffe066 : 0x9aa0a6 }),
    );
    const flash = new THREE.PointLight(r.psi ? 0xb36bff : 0xffc060, 6, 5);
    flash.position.copy(from);
    this.scene.add(line, flash);
    this.floatText(t.x + 0.5, t.y + 0.5, r.psi ? (r.hit ? 'давление' : 'устоял') : r.hit ? `−${r.dmg}` : 'мимо', r.hit ? '#ff6b6b' : '#c9ced3');
    if (r.broken) this.floatText(t.x + 0.5, t.y + 0.5, 'укрытие', '#ffd34d', 0.5);
    if (r.wound) this.floatText(t.x + 0.5, t.y + 0.5, r.wound === 'bleed' ? 'кровь' : 'перелом', '#ff9f43', 0.5);
    sfx(r.psi ? 'psi' : a.team === 'human' ? 'shot' : 'alienShot');
    if (!r.psi) setTimeout(() => sfx(r.hit ? 'hit' : 'miss'), 110);
    if (r.killed) setTimeout(() => sfx('death'), 260);
    const am = this.unitMeshes.get(a.id);
    if (am) am.rotation.y = Math.atan2(t.x - a.x, t.y - a.y);
    this.play(a.id, 'Idle_Shoot', true);
    if (r.hit && !r.killed) this.play(t.id, 'HitReact', true);
    await sleep(160);
    this.scene.remove(line, flash);
    line.geometry.dispose();
    await sleep(r.reaction ? 200 : 260);
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
    sprite.position.set(x, 1.6 + dy, z);
    this.scene.add(sprite);
    this.floats.push({ sprite, t: 0 });
  }

  private async click(e: PointerEvent) {
    const s = this.state;
    if (s.turn !== 'human' || s.busy || s.status !== 'playing') return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.ground)[0];
    if (!hit) return;
    const x = Math.floor(hit.point.x), y = Math.floor(hit.point.z);
    const at = s.units.find(v => v.hp > 0 && v.x === x && v.y === y && isVisible(s, v));
    const sel = s.units.find(v => v.id === s.selectedId && v.hp > 0);
    if (at?.team === 'human') { s.selectedId = at.id; s.targetId = null; }
    else if (at?.team === 'alien') { if (sel) s.targetId = at.id; }
    else if (sel && sel.ap > 0 && reachable(s, sel.x, sel.y, moveRange(sel)).has(`${x},${y}`)) {
      s.busy = true; s.targetId = null; sel.ap -= 1; sel.overwatch = false;
      for (const [px, py] of findPath(s, sel.x, sel.y, x, y, moveRange(sel))) { sel.x = px; sel.y = py; await this.moved(); }
      s.busy = false;
      checkEnd(s);
    }
    this.syncUnits();
    this.onChange();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
