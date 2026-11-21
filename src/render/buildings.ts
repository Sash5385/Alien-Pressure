// Модульные здания с этажами: стены с оконными проёмами, перекрытия, лестницы, крыши, повреждения.
import * as THREE from 'three';

export type BuildingSpec = {
  w: number; d: number; floors: number;
  style?: 'brick' | 'plaster' | 'concrete';
  roof?: 'flat' | 'gable';
  damage?: number; // 0..1 — доля выбитых стен/окон наверху
  seed?: number;
};
export type BuildingObj = THREE.Group & { userData: { floors: THREE.Group[]; roof: THREE.Group | null; storey: number } };

export const STOREY = 1.5; // высота этажа в клетках
const T = 0.14; // толщина стены
const SLAB = 0.1;

type MK = 'wall' | 'trim' | 'floor' | 'roof' | 'tar' | 'frame' | 'glass';
class Mesher {
  pos: number[] = []; nor: number[] = []; uv: number[] = [];
  constructor(public sc: number) {}
  quad(a: number[], b: number[], c: number[], d: number[], n: number[]) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [b, d] = [d, b];
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvOf = (p: number[]) => {
      if (ay >= ax && ay >= az) return [p[0] / this.sc, p[2] / this.sc];
      if (ax >= az) return [p[2] / this.sc, p[1] / this.sc];
      return [p[0] / this.sc, p[1] / this.sc];
    };
    for (const i of [a, b, c, a, c, d]) { this.pos.push(i[0], i[1], i[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(...uvOf(i)); }
  }
  tri(a: number[], b: number[], c: number[], n: number[]) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [b, c] = [c, b];
    for (const i of [a, b, c]) { this.pos.push(i[0], i[1], i[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(i[0] / this.sc + i[2] / this.sc, i[1] / this.sc); }
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

let mats: Record<string, THREE.Material> | null = null;
function materials() {
  if (mats) return mats;
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  const L = new THREE.TextureLoader();
  const tex = (n: string) => {
    const t = L.load(`${base}tex/${n}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (!n.endsWith('_n')) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const pbr = (n: string, tint = 0xffffff) => new THREE.MeshStandardMaterial({ map: tex(n), normalMap: tex(n + '_n'), roughness: 0.92, metalness: 0, color: tint });
  mats = {
    brick: pbr('brick'), plaster: pbr('plaster', 0xe6dcc8), concrete: pbr('concrete', 0xd0d0cc),
    wood: pbr('wood', 0xc9a37a), roof: pbr('roof', 0xd88060), steel: pbr('steel'),
    tar: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 1 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x20324a, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  };
  return mats;
}

const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => (s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0, (s >>> 8) / 16777216); };

/** Строит здание в локальных координатах: x∈[0,w], z∈[0,d], y=0 — земля. Вход — в стене z=d (лицевая). */
export function buildBuilding(spec: BuildingSpec): BuildingObj {
  const m = materials();
  const { w, d, floors } = spec;
  const style = spec.style ?? 'brick', dmg = spec.damage ?? 0, rnd = rng(spec.seed ?? 7);
  const wallKey = style;
  const root = new THREE.Group() as BuildingObj;
  const floorGroups: THREE.Group[] = [];
  const H = STOREY;

  const flush = (parts: Record<string, Mesher>, into: THREE.Group, shadow = true) => {
    for (const [k, ms] of Object.entries(parts)) {
      if (!ms.pos.length) continue;
      const mat = k === 'wall' ? m[wallKey] : k === 'trim' ? m.concrete : k === 'floor' ? m.wood : k === 'roof' ? m.roof : k === 'tar' ? m.tar : k === 'frame' ? m.frame : m.glass;
      const mesh = new THREE.Mesh(ms.geo(), mat);
      mesh.castShadow = shadow && k !== 'glass'; mesh.receiveShadow = k !== 'glass';
      into.add(mesh);
    }
  };
  const mk = () => ({ wall: new Mesher(1.6), trim: new Mesher(1.6), floor: new Mesher(1.2), roof: new Mesher(1.5), tar: new Mesher(2), frame: new Mesher(1), glass: new Mesher(1) } as Record<MK, Mesher>);

  // одна стена: ось 'x' (вдоль x, на z=zc) или 'z'; out — нормаль наружу
  const wallRun = (P: Record<MK, Mesher>, f: number, axis: 'x' | 'z', fixed: number, a0: number, a1: number, inward: number, door: boolean) => {
    const n = Math.round(a1 - a0), y0 = f * H, y1 = (f + 1) * H;
    const t0 = inward > 0 ? fixed : fixed - T, t1 = inward > 0 ? fixed + T : fixed;
    const B = (m_: Mesher, p0: number, q0: number, p1: number, q1: number) => axis === 'x' ? m_.box(p0, q0, t0, p1, q1, t1) : m_.box(t0, q0, p0, t1, q1, p1);
    const top = f === floors - 1;
    for (let i = 0; i < n; i++) {
      const c0 = a0 + i, c1 = c0 + 1;
      if (top && dmg > 0 && rnd() < dmg * 0.55) { // выбитый участок наверху — только нижний обломок
        B(P.wall, c0, y0, c1, y0 + H * (0.15 + rnd() * 0.25)); continue;
      }
      const corner = n >= 3 && (i === 0 || i === n - 1);
      const isDoor = door && f === 0 && i === Math.floor(n / 2);
      if (corner && !isDoor) { B(P.wall, c0, y0, c1, y1); continue; }
      const ow = isDoor ? 0.5 : 0.56, ox0 = c0 + (1 - ow) / 2, ox1 = ox0 + ow;
      const oy0 = isDoor ? y0 : f * H + 0.55, oy1 = isDoor ? y0 + H * 0.78 : f * H + 1.12;
      B(P.wall, c0, y0, ox0, y1); B(P.wall, ox1, y0, c1, y1);
      if (oy0 > y0) B(P.wall, ox0, y0, ox1, oy0);
      B(P.wall, ox0, oy1, ox1, y1);
      // рама и стекло
      const fr = 0.04, mid = (t0 + t1) / 2;
      if (isDoor) { // проём открыт, лишь притолока-рамка
        B(P.frame, ox0, oy1 - fr, ox1, oy1);
      } else {
        B(P.frame, ox0, oy0, ox1, oy0 + fr); B(P.frame, ox0, oy1 - fr, ox1, oy1);
        B(P.frame, ox0, oy0, ox0 + fr, oy1); B(P.frame, ox1 - fr, oy0, ox1, oy1);
        const broken = top && dmg > 0 && rnd() < dmg;
        if (!broken) {
          const cx = (ox0 + ox1) / 2, cy = (oy0 + oy1) / 2;
          B(P.frame, cx - fr / 2, oy0, cx + fr / 2, oy1); B(P.frame, ox0, cy - fr / 2, ox1, cy + fr / 2);
          const q = (p: number, y: number) => axis === 'x' ? [p, y, mid] : [mid, y, p];
          P.glass.quad(q(ox0, oy0), q(ox1, oy0), q(ox1, oy1), q(ox0, oy1), axis === 'x' ? [0, 0, 1] : [1, 0, 0]);
        }
      }
    }
  };

  for (let f = 0; f < floors; f++) {
    const P = mk(), g = new THREE.Group(), y = f * H;
    // перекрытие (с проёмом для лестницы на верхних этажах)
    if (f === 0) P.floor.box(T, y, T, w - T, y + SLAB, d - T);
    else {
      const hx0 = w - T - 1.0, hz0 = T + 0.05, hz1 = hz0 + 1.7;
      P.floor.box(T, y, T, hx0, y + SLAB, d - T);
      P.floor.box(hx0, y, hz1, w - T, y + SLAB, d - T);
      P.floor.box(hx0, y, T, w - T, y + SLAB, hz0);
    }
    // стены
    wallRun(P, f, 'x', d, 0, w, -1, true);
    wallRun(P, f, 'x', 0, 0, w, 1, false);
    // боковые — между передней/задней
    const sz0 = T, sz1 = d - T;
    wallRun(P, f, 'z', 0, sz0, sz1, 1, false);
    wallRun(P, f, 'z', w, sz0, sz1, -1, false);
    // внутренняя перегородка с дверным проёмом
    if (w >= 3 && d >= 3) {
      const px = Math.floor(w / 2), pz1 = d - T, pz0 = T, dz0 = d / 2 - 0.3, dz1 = d / 2 + 0.3, h1 = y + H;
      P.wall.box(px - 0.04, y + SLAB, pz0, px + 0.04, h1, dz0); P.wall.box(px - 0.04, y + SLAB, dz1, px + 0.04, h1, pz1);
      P.wall.box(px - 0.04, y + H * 0.8, dz0, px + 0.04, h1, dz1);
    }
    // лестница на следующий этаж
    if (f < floors - 1) {
      const sx0 = w - T - 1.0, sz = T + 0.05, steps = 8;
      for (let i = 0; i < steps; i++) P.floor.box(sx0 + 0.05, y + SLAB + (i / steps) * (H - SLAB * 0.2), sz + (i / steps) * 1.6, w - T - 0.05, y + SLAB + ((i + 1) / steps) * (H - SLAB * 0.2) , sz + ((i + 1) / steps) * 1.6);
    }
    if (f === 0) { // цоколь и карниз
      P.trim.box(-0.02, 0, d - T - 0.03, w + 0.02, 0.18, d + 0.02 - T + T);
    }
    flush(P, g);
    floorGroups.push(g); root.add(g);
  }

  // крыша
  const R = mk(), rg = new THREE.Group(), ry = floors * H;
  if (spec.roof === 'gable') {
    const ov = 0.18, rh = Math.min(w, d) * 0.45, alongX = w >= d;
    const L = alongX ? w : d, Wd = alongX ? d : w;
    const mid = Wd / 2;
    const pt = (l: number, c: number, h: number) => alongX ? [l, ry + h, c] : [c, ry + h, l];
    R.roof.quad(pt(-ov, -ov, 0), pt(L + ov, -ov, 0), pt(L + ov, mid, rh), pt(-ov, mid, rh), (() => { const a = Math.atan2(rh, mid + ov); return alongX ? [0, Math.cos(a), -Math.sin(a)] : [-Math.sin(a), Math.cos(a), 0]; })());
    R.roof.quad(pt(-ov, Wd + ov, 0), pt(L + ov, Wd + ov, 0), pt(L + ov, mid, rh), pt(-ov, mid, rh), (() => { const a = Math.atan2(rh, mid + ov); return alongX ? [0, Math.cos(a), Math.sin(a)] : [Math.sin(a), Math.cos(a), 0]; })());
    for (const l of [0, L]) R.wall.tri(pt(l, 0, 0), pt(l, Wd, 0), pt(l, mid, rh), alongX ? [l === 0 ? -1 : 1, 0, 0] : [0, 0, l === 0 ? -1 : 1]);
    R.trim.box(-0.05, ry - 0.02, -0.05, w + 0.05, ry + 0.05, d + 0.05);
  } else {
    R.tar.box(0, ry, 0, w, ry + 0.06, d);
    const pr = 0.16; // парапет
    R.trim.box(-0.05, ry, -0.05, w + 0.05, ry + pr, 0.1); R.trim.box(-0.05, ry, d - 0.1, w + 0.05, ry + pr, d + 0.05);
    R.trim.box(-0.05, ry, 0.1, 0.1, ry + pr, d - 0.1); R.trim.box(w - 0.1, ry, 0.1, w + 0.05, ry + pr, d - 0.1);
    R.trim.box(w - 1.1, ry, 0.15, w - 0.15, ry + 0.4, 1.9); // выход на крышу
  }
  flush(R, rg);
  root.add(rg);
  root.userData = { floors: floorGroups, roof: rg, storey: H };
  return root;
}

/** Показывать этажи до lvl включительно (крыша — только если показаны все). */
export function showFloors(b: BuildingObj, lvl: number, roof = true) {
  b.userData.floors.forEach((g, i) => { g.visible = i <= lvl; });
  if (b.userData.roof) b.userData.roof.visible = roof && lvl >= b.userData.floors.length - 1;
}
