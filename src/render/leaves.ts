import * as THREE from 'three';

const N = 360;
const COLS = [0x5f9a34, 0x7bb33f, 0xb3a335, 0xc07a2a, 0x3f7a22, 0x8aa83a];

/** Падающая листва: редко сама по себе, много и с силой при взрывах. */
export class Leaves {
  private mesh: THREE.InstancedMesh;
  private p = Array.from({ length: N }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sp: 0, ph: 0, life: 0, rest: 0 }));
  private next = 0; private acc = 0; private t = 0;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();

  constructor(scene: THREE.Scene, private ground: (x: number, z: number) => number) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.09), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), N);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) { this.mesh.setColorAt(i, c.set(COLS[i % COLS.length])); this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); }
    scene.add(this.mesh);
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const l = this.p[this.next]; this.next = (this.next + 1) % N;
    Object.assign(l, { on: true, x, y, z, vx, vy, vz, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, sp: 2 + Math.random() * 5, ph: Math.random() * 6, life: 0, rest: 0 });
  }

  /** Взрыв: листья срываются с деревьев вокруг и разлетаются от центра. */
  burst(cx: number, cz: number, trees: { x: number; z: number; y: number }[], power: number) {
    for (const t of trees) {
      const dx = t.x - cx, dz = t.z - cz, d = Math.hypot(dx, dz);
      if (d > 9) continue;
      const k = Math.round((1 - d / 9) * 9 * power) + 1;
      for (let i = 0; i < k; i++) {
        const out = (3 + Math.random() * 4) * power * (1 - d / 12) / Math.max(d, 0.6);
        this.spawn(t.x + (Math.random() - 0.5) * 0.7, t.y + 1.2 + Math.random() * 0.9, t.z + (Math.random() - 0.5) * 0.7, dx * out + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5 * power, dz * out + (Math.random() - 0.5) * 2);
      }
    }
  }

  /** Лёгкий листопад: по листу время от времени с ближних деревьев. */
  ambient(dt: number, cx: number, cz: number, trees: { x: number; z: number; y: number }[]) {
    this.acc += dt;
    if (this.acc < 0.45 || !trees.length) return;
    this.acc = 0;
    for (let i = 0; i < 6; i++) {
      const t = trees[(Math.random() * trees.length) | 0];
      if (Math.hypot(t.x - cx, t.z - cz) > 14) continue;
      this.spawn(t.x + (Math.random() - 0.5) * 0.6, t.y + 1.3 + Math.random() * 0.7, t.z + (Math.random() - 0.5) * 0.6, 0.2, 0, 0.1);
      break;
    }
  }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < N; i++) {
      const l = this.p[i];
      if (!l.on) continue;
      l.life += dt;
      const g = this.ground(l.x, l.z) + 0.03;
      if (l.y > g) {
        l.vy += (-0.8 - l.vy) * Math.min(1, 2.2 * dt);            // падает медленно, как лист
        l.vx += (0.25 + Math.sin(this.t * 2.2 + l.ph) * 0.6 - l.vx) * Math.min(1, 1.4 * dt); // парит и сносится ветром
        l.vz += (0.1 + Math.cos(this.t * 1.9 + l.ph) * 0.5 - l.vz) * Math.min(1, 1.4 * dt);
        l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
        l.rx += l.sp * dt; l.ry += l.sp * 0.7 * dt; l.rz += l.sp * 0.4 * dt;
      } else { l.y = g; l.rest += dt; }
      const fade = l.rest > 2.5 ? Math.max(0, 1 - (l.rest - 2.5) / 1.5) : 1;
      if (fade <= 0 || l.life > 14) { l.on = false; this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); continue; }
      const flat = l.rest > 0;
      this.q.setFromEuler(this.e.set(flat ? Math.PI / 2 : l.rx, l.ry, flat ? l.rz : l.rz));
      this.mesh.setMatrixAt(i, this.m4.compose(this.v.set(l.x, l.y, l.z), this.q, this.sc.setScalar(fade)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
