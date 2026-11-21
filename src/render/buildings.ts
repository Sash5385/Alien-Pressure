// Модульные здания с этажами: стены с оконными проёмами, перекрытия, лестницы, крыши, повреждения.
import * as THREE from 'three';

export type BuildingSpec = {
  w: number; d: number; floors: number;
  style?: 'brick' | 'plaster' | 'concrete';
  roof?: 'flat' | 'gable';
  damage?: number; // 0..1 — доля выбитых стен/окон наверху
  seed?: number;
  id?: number; x?: number; y?: number; // положение на карте (клетки)
};
export type BuildingObj = THREE.Group & { userData: { floors: THREE.Group[]; roof: THREE.Group | null; storey: number } };

export const STOREY = 1.5; // высота этажа в клетках
const T = 0.4; // толщина наружной стены (половина клетки)
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


const hh = (a: number, b: number, c: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1597334677)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
export type Side = 'F' | 'B' | 'L' | 'R'; // F: фасад (y=d-1, вход), B: тыл, L/R: боковые
export type CellKind = 'solid' | 'window' | 'door' | 'breach';

/** Что в клетке стены. Одна и та же функция строит модель и укрытия на карте. */
export function cellKind(sp: BuildingSpec, side: Side, idx: number, f: number): CellKind {
  const { w } = sp, n = side === 'F' || side === 'B' ? w : sp.d - 2;
  const dmg = sp.damage ?? 0, seed = sp.seed ?? 7;
  const corner = (side === 'F' || side === 'B') && (idx === 0 || idx === w - 1);
  if (corner) return 'solid';
  const r = hh(seed, f * 31 + idx, side.charCodeAt(0));
  if (dmg > 0 && f === sp.floors - 1 && r < dmg * 0.55) return 'breach';
  if (dmg > 0 && f < sp.floors - 1 && r < dmg * 0.22) return 'breach';
  if (side === 'F' && f === 0 && idx === Math.floor(w / 2)) return 'door';
  void n;
  return r > 0.93 && f === 0 && side !== 'F' ? 'solid' : 'window';
}

const kindCover = (k: CellKind) => (k === 'solid' ? 'full' : k === 'window' ? 'half' : 'none') as 'none' | 'half' | 'full';
/** Укрытие клетки (dx,dy от угла здания) на этаже f. */
export function tileCover(sp: BuildingSpec, dx: number, dy: number, f: number): 'none' | 'half' | 'full' {
  const { w, d } = sp;
  if (dy === d - 1) return kindCover(cellKind(sp, 'F', dx, f));
  if (dy === 0) return kindCover(cellKind(sp, 'B', dx, f));
  if (dx === 0) return kindCover(cellKind(sp, 'L', dy, f));
  if (dx === w - 1) return kindCover(cellKind(sp, 'R', dy, f));
  const px = partX(sp);
  return px >= 0 && dx === px && dy !== Math.floor(d / 2) ? 'full' : 'none';
}
/** Лестница: нижняя и верхняя клетки (в клетках от угла здания). Столбец w-2. */
export function stairTiles(sp: BuildingSpec) {
  const slen = Math.min(1.7, sp.d - 2 - 0.1);
  return { dx: sp.w - 2, bottom: 1, top: Math.max(1, Math.ceil(1 + slen) - 1) };
}

/** Клетки основания (этаж 0): укрытия и вид. dx,dy — от угла здания. */
export function footprint(sp: BuildingSpec): { dx: number; dy: number; cover: 'none' | 'half' | 'full'; look: 'wall' | 'window' | '' }[] {
  const out: { dx: number; dy: number; cover: 'none' | 'half' | 'full'; look: 'wall' | 'window' | '' }[] = [];
  for (let dy = 0; dy < sp.d; dy++) for (let dx = 0; dx < sp.w; dx++) {
    const c = tileCover(sp, dx, dy, 0);
    out.push({ dx, dy, cover: c, look: c === 'full' ? 'wall' : c === 'half' ? 'window' : '' });
  }
  return out;
}
const partX = (sp: BuildingSpec) => (sp.w >= 6 && sp.d >= 4 ? Math.floor((sp.w - 2) / 2) : -1);

/** Строит здание в локальных координатах: x∈[0,w], z∈[0,d], y=0 — земля. Вход — в стене z=d (лицевая). */
export function buildBuilding(spec: BuildingSpec): BuildingObj {
  const m = materials();
  const { w, d, floors } = spec;
  const style = spec.style ?? 'brick', dmg = spec.damage ?? 0;
  const root = new THREE.Group() as BuildingObj;
  const floorGroups: THREE.Group[] = [];
  const H = STOREY;
  const flush = (parts: Record<string, Mesher>, into: THREE.Group) => {
    for (const [k, ms] of Object.entries(parts)) {
      if (!ms.pos.length) continue;
      const mat = k === 'wall' ? m[style] : k === 'trim' ? m.concrete : k === 'floor' ? m.wood : k === 'roof' ? m.roof : k === 'tar' ? m.tar : k === 'frame' ? m.frame : m.glass;
      const mesh = new THREE.Mesh(ms.geo(), mat);
      mesh.castShadow = k !== 'glass'; mesh.receiveShadow = k !== 'glass';
      into.add(mesh);
    }
  };
  const mk = () => ({ wall: new Mesher(1.6), trim: new Mesher(1.6), floor: new Mesher(1.2), roof: new Mesher(1.5), tar: new Mesher(2), frame: new Mesher(1), glass: new Mesher(1) } as Record<MK, Mesher>);

  // стена вдоль оси; cells: [номер клетки, от, до]; cc = центр клетки (для проёма)
  const wallRun = (P: Record<MK, Mesher>, f: number, side: Side, cells: [number, number, number][]) => {
    const axis = side === 'F' || side === 'B' ? 'x' : 'z';
    const t0 = side === 'F' ? d - T : side === 'R' ? w - T : 0, t1 = t0 + T;
    const y0 = f * H, y1 = (f + 1) * H;
    const B = (m_: Mesher, p0: number, q0: number, p1: number, q1: number) => axis === 'x' ? m_.box(p0, q0, t0, p1, q1, t1) : m_.box(t0, q0, p0, t1, q1, p1);
    for (const [idx, a0, a1] of cells) {
      const k = cellKind(spec, side, idx, f);
      if (k === 'solid') { B(P.wall, a0, y0, a1, y1); continue; }
      if (k === 'breach') { B(P.wall, a0, y0, a1, y0 + H * (0.12 + hh(spec.seed ?? 7, idx, f) * 0.3)); continue; }
      const isDoor = k === 'door', cc = idx + 0.5, ow = isDoor ? 0.56 : 0.6, ox0 = cc - ow / 2, ox1 = cc + ow / 2;
      const oy0 = isDoor ? y0 + SLAB : f * H + 0.55, oy1 = isDoor ? y0 + H * 0.8 : f * H + 1.12;
      B(P.wall, a0, y0, ox0, y1); B(P.wall, ox1, y0, a1, y1);
      if (oy0 > y0) B(P.wall, ox0, y0, ox1, oy0);
      B(P.wall, ox0, oy1, ox1, y1);
      const fr = 0.05, mid = (t0 + t1) / 2;
      if (isDoor) { B(P.frame, ox0 - fr, oy0, ox0, oy1); B(P.frame, ox1, oy0, ox1 + fr, oy1); B(P.frame, ox0 - fr, oy1, ox1 + fr, oy1 + fr); }
      else {
        B(P.frame, ox0, oy0, ox1, oy0 + fr); B(P.frame, ox0, oy1 - fr, ox1, oy1); B(P.frame, ox0, oy0, ox0 + fr, oy1); B(P.frame, ox1 - fr, oy0, ox1, oy1);
        const cx = cc, cy = (oy0 + oy1) / 2;
        B(P.frame, cx - fr / 2, oy0, cx + fr / 2, oy1); B(P.frame, ox0, cy - fr / 2, ox1, cy + fr / 2);
        const q = (p: number, y: number) => axis === 'x' ? [p, y, mid] : [mid, y, p];
        P.glass.quad(q(ox0, oy0), q(ox1, oy0), q(ox1, oy1), q(ox0, oy1), axis === 'x' ? [0, 0, 1] : [1, 0, 0]);
      }
    }
  };
  const xs: [number, number, number][] = []; for (let i = 0; i < w; i++) xs.push([i, i, i + 1]);
  const zs: [number, number, number][] = []; for (let j = 1; j < d - 1; j++) zs.push([j, j === 1 ? T : j, j === d - 2 ? d - T : j + 1]);
  const px = partX(spec), slen = Math.min(1.7, d - 2 - 0.1);

  for (let f = 0; f < floors; f++) {
    const P = mk(), g = new THREE.Group(), y = f * H;
    if (f === 0) P.floor.box(T, y, T, w - T, y + SLAB, d - T);
    else {
      const hx0 = w - 2, hx1 = w - 1, hz0 = 1, hz1 = 1 + slen;
      P.floor.box(T, y, T, hx0, y + SLAB, d - T);
      P.floor.box(hx0, y, hz1, w - T, y + SLAB, d - T);
      P.floor.box(hx1, y, T, w - T, y + SLAB, hz1);
      P.floor.box(hx0, y, T, hx1, y + SLAB, hz0);
    }
    wallRun(P, f, 'F', xs); wallRun(P, f, 'B', xs); wallRun(P, f, 'L', zs); wallRun(P, f, 'R', zs);
    if (px >= 0) { // перегородка с дверью посередине
      const x0 = px + 0.5 - 0.06, x1 = px + 0.5 + 0.06, dj = Math.floor(d / 2);
      P.wall.box(x0, y + SLAB, T, x1, y + H, dj); P.wall.box(x0, y + SLAB, dj + 1, x1, y + H, d - T); P.wall.box(x0, y + H * 0.8, dj, x1, y + H, dj + 1);
    }
    if (f < floors - 1) { // лестница
      const steps = 8, sx0 = w - 2 + 0.05, sx1 = w - 1 - 0.05;
      for (let i = 0; i < steps; i++) P.floor.box(sx0, y + SLAB + (i / steps) * H, 1 + (i / steps) * slen, sx1, y + SLAB + ((i + 1) / steps) * H, 1 + ((i + 1) / steps) * slen);
    }
    if (f === 0) P.trim.box(-0.03, 0, -0.03, w + 0.03, 0.18, d + 0.03);
    // обломки внутри разрушенного
    if (dmg > 0.3 && f === 0) for (let i = 0; i < 4; i++) P.trim.box(1 + hh(spec.seed ?? 7, i, 1) * (w - 3), y + SLAB, 1 + hh(spec.seed ?? 7, i, 2) * (d - 3), 1.3 + hh(spec.seed ?? 7, i, 1) * (w - 3), y + SLAB + 0.12, 1.3 + hh(spec.seed ?? 7, i, 2) * (d - 3));
    flush(P, g);
    floorGroups.push(g); root.add(g);
  }

  const R = mk(), rg = new THREE.Group(), ry = floors * H;
  const allBreach = dmg > 0.6; // сильно разрушенный — без крыши
  if (!allBreach) {
    if (spec.roof === 'gable') {
      const ov = 0.18, rh = Math.min(w, d) * 0.4, alongX = w >= d;
      const L = alongX ? w : d, Wd = alongX ? d : w, mid = Wd / 2;
      const pt = (l: number, c: number, h: number) => alongX ? [l, ry + h, c] : [c, ry + h, l];
      const a = Math.atan2(rh, mid + ov), ca = Math.cos(a), sa = Math.sin(a);
      R.roof.quad(pt(-ov, -ov, 0), pt(L + ov, -ov, 0), pt(L + ov, mid, rh), pt(-ov, mid, rh), alongX ? [0, ca, -sa] : [-sa, ca, 0]);
      R.roof.quad(pt(-ov, Wd + ov, 0), pt(L + ov, Wd + ov, 0), pt(L + ov, mid, rh), pt(-ov, mid, rh), alongX ? [0, ca, sa] : [sa, ca, 0]);
      for (const l of [0, L]) R.wall.tri(pt(l, 0, 0), pt(l, Wd, 0), pt(l, mid, rh), alongX ? [l === 0 ? -1 : 1, 0, 0] : [0, 0, l === 0 ? -1 : 1]);
      R.trim.box(0, ry - 0.02, 0, w, ry + 0.05, d);
    } else {
      R.tar.box(0, ry, 0, w, ry + 0.06, d);
      const pr = 0.16;
      R.trim.box(-0.04, ry, -0.04, w + 0.04, ry + pr, 0.12); R.trim.box(-0.04, ry, d - 0.12, w + 0.04, ry + pr, d + 0.04);
      R.trim.box(-0.04, ry, 0.12, 0.12, ry + pr, d - 0.12); R.trim.box(w - 0.12, ry, 0.12, w + 0.04, ry + pr, d - 0.12);
      R.trim.box(w - 1.1, ry, 0.5, w - 0.4, ry + 0.4, 1.8);
    }
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
