import * as THREE from 'three';

/** М'яка кругла пляма для частинок (радіальний градієнт). */
function softTex(): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export interface PSpawn {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number;
  size: number; grow?: number; life: number; c0: number; c1?: number; a?: number;
  drag?: number; buoy?: number; grav?: number; wind?: number;
}

/**
 * Пул частинок одним викликом відмальовки: колір і прозорість змінюються з віком,
 * розмір росте (дим) або зменшується (іскри), швидкість гаситься опором, вітер зносить.
 */
export class Particles {
  readonly points: THREE.Points;
  private n: number; private head = 0;
  private pos: Float32Array; private col: Float32Array; private sz: Float32Array; private al: Float32Array;
  private vel: Float32Array; private age: Float32Array; private life: Float32Array; private grow: Float32Array; private s0: Float32Array;
  private c0: Float32Array; private c1: Float32Array; private a0: Float32Array; private phys: Float32Array; // drag, buoy, grav, wind
  private geo = new THREE.BufferGeometry(); private mat: THREE.ShaderMaterial;
  constructor(max: number, additive: boolean) {
    this.n = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.age = new Float32Array(max).fill(1); this.life = new Float32Array(max).fill(1); this.grow = new Float32Array(max); this.s0 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.a0 = new Float32Array(max); this.phys = new Float32Array(max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softTex() }, uScale: { value: 400 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main() { vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(220.0, aSize * uScale / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * t.rgb, a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 4 : 3;
  }
  spawn(p: PSpawn) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([p.vx ?? 0, p.vy ?? 0, p.vz ?? 0], i * 3);
    const a = new THREE.Color(p.c0), b = new THREE.Color(p.c1 ?? p.c0);
    this.c0.set([a.r, a.g, a.b], i * 3); this.c1.set([b.r, b.g, b.b], i * 3);
    this.age[i] = 0; this.life[i] = p.life; this.s0[i] = p.size; this.grow[i] = p.grow ?? 0; this.a0[i] = p.a ?? 1;
    this.phys.set([p.drag ?? 1, p.buoy ?? 0, p.grav ?? 0, p.wind ?? 0], i * 4);
  }
  update(dt: number, wind: { x: number; z: number }, scale: number) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { if (this.al[i] !== 0) { this.al[i] = 0; } continue; }
      this.age[i] += dt; const k = Math.min(1, this.age[i] / this.life[i]);
      const dr = Math.exp(-this.phys[i * 4] * dt), w = this.phys[i * 4 + 3];
      this.vel[i * 3] = this.vel[i * 3] * dr + wind.x * w * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr + (this.phys[i * 4 + 1] - this.phys[i * 4 + 2]) * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * dr + wind.z * w * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt); this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * k;
      this.sz[i] = Math.max(0, this.s0[i] * (1 + this.grow[i] * k));
      this.al[i] = this.a0[i] * Math.min(1, k * 8) * (1 - k) * (1 - k * 0.3); // швидка поява, плавне згасання
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) (this.geo.attributes[n] as THREE.BufferAttribute).needsUpdate = true;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Вибух: спалах, вогняна куля, іскри, клуби диму, що піднімаються й розходяться. */
export function explosionFx(add: Particles, norm: Particles, x: number, y: number, z: number, r: number) {
  for (let i = 0; i < 6; i++) add.spawn({ x, y: y + 0.3, z, size: 1.2 * r, grow: 0.6, life: 0.14, c0: 0xfff0c0, c1: 0xff9030, a: 0.8 }); // спалах
  for (let i = 0; i < 46; i++) { // вогняна куля: швидко розлітається й гасне, змінюючи колір від жовтого до червоного
    const a = Math.random() * Math.PI * 2, e = rnd(-0.2, 1.2), sp = rnd(1.5, 4.5) * r;
    add.spawn({ x, y: y + 0.2, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1, vz: Math.sin(a) * Math.cos(e) * sp, size: rnd(0.35, 0.65) * r, grow: 0.9, life: rnd(0.35, 0.7), c0: 0xffb24a, c1: 0x8a1a04, drag: 4.5, buoy: 2.5, a: 0.7 });
  }
  for (let i = 0; i < 40; i++) { // іскри з гравітацією
    const a = Math.random() * Math.PI * 2, sp = rnd(4, 9);
    add.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rnd(2, 8), vz: Math.sin(a) * sp, size: 0.07, grow: -0.6, life: rnd(0.5, 1.1), c0: 0xfff0a0, c1: 0xff6a10, drag: 1.2, grav: 12 });
  }
  for (let i = 0; i < 34; i++) { // дим: темні клуби повільно піднімаються, ростуть, зносяться вітром
    const a = Math.random() * Math.PI * 2, d = rnd(0, 0.7) * r;
    norm.spawn({ x: x + Math.cos(a) * d, y: y + rnd(0.2, 0.8), z: z + Math.sin(a) * d, vx: Math.cos(a) * rnd(0.3, 1.2), vy: rnd(0.6, 1.8), vz: Math.sin(a) * rnd(0.3, 1.2), size: rnd(0.5, 0.85) * r, grow: 1.9, life: rnd(2.2, 3.6), c0: 0x2a2622, c1: 0x8a8682, drag: 1.3, buoy: 0.25, wind: 0.8, a: 0.5 });
  }
  for (let i = 0; i < 26; i++) { // пил по землі — кільце, що розходиться
    const a = (i / 26) * Math.PI * 2;
    norm.spawn({ x, y: y + 0.1, z, vx: Math.cos(a) * 5 * r, vy: 0.2, vz: Math.sin(a) * 5 * r, size: 0.45 * r, grow: 1.5, life: 0.9, c0: 0x8a7a5a, c1: 0xb8aa8a, drag: 4, a: 0.4 });
  }
}

/** Безперервне горіння клітинки: язики полум'я, жар і дим (викликати щокадру з часткою dt). */
export function fireEmit(add: Particles, norm: Particles, x: number, y: number, z: number, dt: number) {
  const n = Math.random() < dt * 34 ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
  for (let i = 0; i < n; i++) add.spawn({ x: x + rnd(-0.32, 0.32), y: y + 0.05, z: z + rnd(-0.32, 0.32), vx: rnd(-0.1, 0.1), vy: rnd(1.2, 2.2), vz: rnd(-0.1, 0.1), size: rnd(0.2, 0.34), grow: -0.7, life: rnd(0.45, 0.8), c0: 0xffa030, c1: 0x8a1400, drag: 1.5, buoy: 0.6, wind: 1.2, a: 0.55 });
  if (Math.random() < dt * 5) add.spawn({ x: x + rnd(-0.3, 0.3), y: y + 0.3, z: z + rnd(-0.3, 0.3), vx: rnd(-0.4, 0.4), vy: rnd(2, 3.5), vz: rnd(-0.4, 0.4), size: 0.06, grow: -0.5, life: rnd(0.8, 1.4), c0: 0xffe080, c1: 0xff5010, drag: 0.8, wind: 1.5 }); // жарини
  if (Math.random() < dt * 4) norm.spawn({ x: x + rnd(-0.2, 0.2), y: y + 0.9, z: z + rnd(-0.2, 0.2), vx: 0, vy: rnd(0.6, 1.1), vz: 0, size: 0.4, grow: 2.2, life: rnd(2.2, 3.2), c0: 0x2e2a26, c1: 0x7a7672, drag: 0.6, wind: 1.2, a: 0.35 });
}
