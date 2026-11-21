// Процедурные модели природы и ящиков для огромных карт (инстансинг): деревья трёх видов, кусты, камни, ящики, контейнеры, трава, цветы.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const hash = (a: number, b: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/** Цвет вершин: фиксированный или градиент по высоте (низ → верх). */
const paint = (g: THREE.BufferGeometry, lo: number, hi = lo, y0 = 0, y1 = 1) => {
  const a = new THREE.Color(lo), b = new THREE.Color(hi), p = g.attributes.position, out: number[] = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0 || 1))); c.copy(a).lerp(b, t); out.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(out, 3));
  return g;
};
/** Затемнить цвет 0xRRGGBB по каналам. */
const dark = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);
const ensureUv = (g: THREE.BufferGeometry) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
const fin = (parts: THREE.BufferGeometry[]) => { const ps = parts.map(g => { const n = g.index ? g.toNonIndexed() : g; ensureUv(n); if (n.attributes.normal === undefined) n.computeVertexNormals(); return n; }); return mergeGeometries(ps)!; };
const jitter = (g: THREE.BufferGeometry, amt: number, seed: number) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (hash(Math.round(p.getX(i) * 100) + seed, Math.round(p.getZ(i) * 100) + Math.round(p.getY(i) * 77)) - 0.5) * amt; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; };

/** Ель: ствол и четыре яруса хвои, тёмная к низу и светлая к вершине. */
export function pineGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6).translate(0, 0.45, 0), 0x4a3320)];
  [[0.64, 0.8, 0.75], [0.52, 0.72, 1.2], [0.4, 0.62, 1.62], [0.26, 0.5, 2.0]].forEach(([r, h, y], i) => parts.push(paint(jitter(new THREE.ConeGeometry(r, h, 8).translate(0, y, 0), 0.12, i), 0x24502a + i * 0x010800, 0x4f8a3a, y - h / 2, y + h / 2)));
  return fin(parts);
}
/** Лиственное: ствол и пышная крона из нескольких «шаров». */
export function oakGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.07, 0.12, 1.1, 6).translate(0, 0.55, 0), 0x5a4128)];
  const blobs: [number, number, number, number, number][] = [[0, 1.45, 0, 0.58, 0x4f8a32], [0.32, 1.25, 0.12, 0.44, 0x5c9a3a], [-0.3, 1.3, -0.1, 0.46, 0x437a2c], [0.05, 1.9, 0.02, 0.42, 0x66a443], [-0.1, 1.2, 0.35, 0.36, 0x4a8630]];
  blobs.forEach(([x, y, z, r, c], i) => parts.push(paint(jitter(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.85, 1).translate(x, y, z), 0.14, 10 + i), dark(c, 0.78), c, y - r, y + r)));
  return fin(parts);
}
/** Сухое дерево: голый ствол и ветви. */
export function deadGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.04, 0.1, 1.7, 5).translate(0, 0.85, 0), 0x5e5446, 0x7a6e5e, 0, 1.7)];
  ([[0.9, 0.5, 0.0], [1.2, -0.55, 0.9], [1.45, 0.35, 2.2], [0.7, -0.6, 3.6]] as [number, number, number][]).forEach(([y, tilt, yaw]) => {
    const b = new THREE.CylinderGeometry(0.012, 0.035, 0.7, 4).translate(0, 0.35, 0).rotateZ(tilt * 1.6).rotateY(yaw).translate(0, y, 0);
    parts.push(paint(b, 0x6a5e4e, 0x7a6e5e, y, y + 0.6));
  });
  return fin(parts);
}
export function bushGeo() {
  // куст: купол из множества мелких «листовых» пучков, светлее сверху и снаружи, тёмная сердцевина, тонкие веточки
  const parts: THREE.BufferGeometry[] = [];
  const base = [0x2f5a24, 0x3a6a2a, 0x447a30, 0x4f8836, 0x5a9440];
  for (let i = 0; i < 12; i++) {
    const a = hash(i, 3) * 6.283, r = 0.1 + hash(i, 5) * 0.3, y = 0.12 + hash(i, 7) * 0.34 * (1 - r / 0.55);
    const rad = 0.12 + hash(i, 9) * 0.07, c = base[Math.floor(hash(i, 11) * 5)];
    parts.push(paint(jitter(new THREE.IcosahedronGeometry(rad, 0).scale(1.15, 0.85, 1.15).translate(Math.cos(a) * r, y, Math.sin(a) * r), 0.3, 70 + i), dark(c, 0.62), c, y - rad, y + rad));
  }
  parts.push(paint(jitter(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.42, 0), 0.25, 99), 0x4a8a38, 0x6aa84a, 0.22, 0.62));
  for (let i = 0; i < 3; i++) { const t = new THREE.CylinderGeometry(0.008, 0.016, 0.3, 3).translate(0, 0.15, 0).rotateZ(0.7 + hash(i, 1) * 0.5).rotateY(i * 2.1 + 0.4).translate(0, 0, 0); parts.push(paint(t, 0x4a3a28)); }
  return fin(parts);
}
export function rockGeo() {
  const g = jitter(new THREE.IcosahedronGeometry(0.5, 1).scale(1.1, 0.8, 0.95).translate(0, 0.28, 0), 0.32, 50);
  const g2 = jitter(new THREE.IcosahedronGeometry(0.26, 1).scale(1, 0.8, 1).translate(0.42, 0.14, 0.2), 0.3, 60);
  return fin([paint(g, 0x5c5a54, 0x8a877e, 0, 0.7), paint(g2, 0x5c5a54, 0x827f76, 0, 0.4)]);
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
/** Деревянный ящик: каркас из досок, угловые стойки, перекладины. */
export function crateGeo() {
  const parts = [box(0.82, 0.72, 0.82, 0, 0.4, 0, 0xb98a52)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.1, 0.8, 0.1, sx * 0.4, 0.4, sz * 0.4, 0x7a5430));
  parts.push(box(0.9, 0.07, 0.9, 0, 0.78, 0, 0x8a6238), box(0.9, 0.07, 0.9, 0, 0.04, 0, 0x8a6238));
  for (const s of [-1, 1]) { parts.push(box(0.84, 0.08, 0.03, 0, 0.4, s * 0.42, 0x946a3e), box(0.03, 0.08, 0.84, s * 0.42, 0.4, 0, 0x946a3e)); }
  return fin(parts);
}
/** Контейнер: рифлёные стенки, угловые стойки, дверные штанги. Цвет — через instanceColor. */
export function containerGeo() {
  const W = 0.94, H = 1.4, parts = [box(W - 0.06, H - 0.08, W - 0.06, 0, H / 2, 0, 0xe0e0e0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.08, H, 0.08, sx * (W / 2 - 0.02), H / 2, sz * (W / 2 - 0.02), 0xa0a0a0));
  parts.push(box(W, 0.06, W, 0, H - 0.01, 0, 0xb8b8b8), box(W, 0.06, W, 0, 0.03, 0, 0x909090));
  for (let i = 0; i < 7; i++) { const t = -0.38 + i * 0.127; for (const s of [-1, 1]) { parts.push(box(0.045, H - 0.16, 0.025, t, H / 2, s * (W / 2 - 0.015), 0xc8c8c8)); parts.push(box(0.025, H - 0.16, 0.045, s * (W / 2 - 0.015), H / 2, t, 0xc8c8c8)); } }
  for (const x of [-0.1, 0.1]) parts.push(box(0.03, H - 0.25, 0.03, x, H / 2, W / 2 + 0.01, 0x6a6a6a));
  return fin(parts);
}
/** Пучок травы: четыре тонких стебля разной высоты, тёмный низ и светлые кончики. */
export function grassClumpGeo() {
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const ang = b * 1.9 + hash(b, 2) * 0.8, h = 0.24 + hash(b, 4) * 0.26, w = 0.017 + hash(b, 6) * 0.007, pos: number[] = [], idx: number[] = [];
    const bend = (0.05 + hash(b, 8) * 0.1);
    pos.push(-w, 0, 0, w, 0, 0, -w * 0.7, h * 0.5, bend * 0.25, w * 0.7, h * 0.5, bend * 0.25, 0, h, bend);
    idx.push(0, 1, 2, 1, 3, 2, 2, 3, 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.rotateY(ang).translate(Math.cos(ang) * 0.05, 0, Math.sin(ang) * 0.05);
    blades.push(paint(g, 0x243c14, 0x9ac05a, 0, h));
  }
  return fin(blades);
}
export function flowerGeo() { return fin([paint(new THREE.IcosahedronGeometry(0.04, 0).translate(0, 0.24, 0), 0xffffff), paint(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 3).translate(0, 0.11, 0), 0x4a7a2c)]); }
