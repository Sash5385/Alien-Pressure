import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameState, Unit } from '../game/types';
import { reachable } from '../game/pathfinding';

const TILE = 1;

export class GameView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ray = new THREE.Raycaster();
  private ground: THREE.Mesh;
  private unitMeshes = new Map<number, THREE.Object3D>();
  private highlight = new THREE.Group();
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
      new THREE.PlaneGeometry(n * TILE, n * TILE),
      new THREE.MeshStandardMaterial({ color: 0x3a3f33, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(n / 2, 0, n / 2);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, new THREE.GridHelper(n, n, 0x555d4c, 0x2c3027).translateX(n / 2).translateZ(n / 2));

    this.buildCover();
    this.scene.add(this.highlight);
    this.syncUnits();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => (this.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5) this.click(e);
    });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop();
  }

  private buildCover() {
    const { cover, size } = this.state;
    const mat = { half: new THREE.MeshStandardMaterial({ color: 0x6b6254 }), full: new THREE.MeshStandardMaterial({ color: 0x4a4f57 }) };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = cover[y][x];
      if (t === 'none') continue;
      const h = t === 'half' ? 0.6 : 1.4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), mat[t]);
      m.position.set(x + 0.5, h / 2, y + 0.5);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  /** Примитивная модель; позже подменяется glTF из public/models/. */
  private makeUnit(u: Unit): THREE.Object3D {
    const g = new THREE.Group();
    const color = u.team === 'human' ? 0x4f7fb5 : 0x7fd24a;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color }));
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    if (u.team === 'alien') {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x9be86a, emissive: 0x1d3a0c }));
      head.position.y = 1.15; head.castShadow = true; g.add(head);
    }
    g.userData.id = u.id;
    return g;
  }

  syncUnits() {
    const alive = new Set<number>();
    for (const u of this.state.units) {
      if (u.hp <= 0) continue;
      alive.add(u.id);
      let m = this.unitMeshes.get(u.id);
      if (!m) { m = this.makeUnit(u); this.unitMeshes.set(u.id, m); this.scene.add(m); }
      m.position.set(u.x + 0.5, 0, u.y + 0.5);
    }
    for (const [id, m] of this.unitMeshes) if (!alive.has(id)) { this.scene.remove(m); this.unitMeshes.delete(id); }
    this.drawHighlight();
  }

  private drawHighlight() {
    this.highlight.clear();
    const s = this.state;
    const u = s.units.find(v => v.id === s.selectedId);
    if (!u) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(u.x + 0.5, 0.02, u.y + 0.5);
    this.highlight.add(ring);
    if (u.ap <= 0) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.35 });
    const geo = new THREE.PlaneGeometry(0.92, 0.92);
    for (const k of reachable(s, u.x, u.y, u.move).keys()) {
      const [x, y] = k.split(',').map(Number);
      if (x === u.x && y === u.y) continue;
      const p = new THREE.Mesh(geo, mat);
      p.rotation.x = -Math.PI / 2; p.position.set(x + 0.5, 0.01, y + 0.5);
      this.highlight.add(p);
    }
  }

  private click(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.ground)[0];
    if (!hit) return;
    const x = Math.floor(hit.point.x), y = Math.floor(hit.point.z);
    const s = this.state;
    if (s.turn !== 'human') return;
    const at = s.units.find(v => v.hp > 0 && v.x === x && v.y === y);
    if (at?.team === 'human') s.selectedId = at.id;
    else {
      const sel = s.units.find(v => v.id === s.selectedId);
      if (sel && sel.ap > 0 && reachable(s, sel.x, sel.y, sel.move).has(`${x},${y}`)) {
        sel.x = x; sel.y = y; sel.ap -= 1;
      }
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
