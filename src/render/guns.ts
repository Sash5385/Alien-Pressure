// Модели оружия: пакет Quaternius (CC0), сжатый meshopt. Сборка по описанию: корпус, покрытие, длина, прицел, глушитель, сошки, рукоятка, фонарь, магазин.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SPEC, type Finish, type GunSpec } from '../game/catalog';

export type Att = { optic?: boolean; supp?: boolean; mag?: boolean };
export interface GunBuild { body: string; finish: Finish; len: number; scope?: number; supp?: string; bipod?: boolean; grip?: boolean; light?: boolean; mag?: 'drum' | 'box' }

const cache = new Map<string, THREE.Object3D>();
/** Старые идентификаторы оружия → корпуса из пакета. */
const LEGACY: Record<string, GunBuild> = {
  rifle: { body: 'AssaultRifle_2', finish: 'black', len: 1 }, smg: { body: 'SubmachineGun_2', finish: 'black', len: 1 },
  shotgun: { body: 'Shotgun_1', finish: 'black', len: 1 }, sniper: { body: 'SniperRifle_3', finish: 'black', len: 1, scope: 2 },
};
export const gunsReady = () => cache.size > 0;

export async function loadGunFile(): Promise<void> {
  if (cache.size) return;
  try {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    const g = await l.loadAsync(`${import.meta.env.BASE_URL}models/weapons.glb`);
    const root = g.scene.children.length === 1 && !g.scene.children[0].name ? g.scene.children[0] : g.scene;
    [...root.children].forEach(ch => {
      ch.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
      ch.removeFromParent(); ch.updateMatrixWorld(true);
      ch.userData.size = new THREE.Box3().setFromObject(ch).getSize(new THREE.Vector3()).toArray();
      cache.set(ch.name, ch);
    });
  } catch { /* без моделей оружия — запасные детали */ }
}

/** Копия сырой модели из пакета (материалы клонируются, геометрия общая). */
export function rawGun(name: string): THREE.Object3D | null {
  const g = cache.get(name); if (!g) return null;
  const c = g.clone(true); c.userData = { ...g.userData };
  c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone(); });
  return c;
}

const FIN: Record<Finish, { metal?: number; wood?: number; metalness?: number; rough?: number; all?: boolean }> = {
  black: {}, tan: { metal: 0x8a7448 }, olive: { metal: 0x4c5634 }, sand: { metal: 0xb39b6a }, navy: { metal: 0x2b3a5c },
  steel: { metal: 0xa4aab2, metalness: 0.9, rough: 0.28 }, wood: { wood: 0xb06c36 }, gold: { metal: 0xd9ac3c, wood: 0xd9ac3c, metalness: 0.55, rough: 0.32, all: true },
};
function paint(g: THREE.Object3D, f: Finish) {
  const fin = FIN[f];
  g.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mm of mats as THREE.MeshStandardMaterial[]) {
      const wood = /Wood/.test(mm.name), glass = /Glass/.test(mm.name);
      if (glass) continue;
      mm.metalness = fin.metalness ?? 0.3; mm.roughness = fin.rough ?? 0.5;
      if (wood) { if (fin.wood) mm.color.set(fin.wood); else mm.color.multiplyScalar(0.9); }
      else if (fin.metal) { const k = /Light/.test(mm.name) ? 1.25 : /Dark|Black/.test(mm.name) ? 0.7 : 1; mm.color.set(fin.metal).multiplyScalar(k); }
      else mm.color.multiplyScalar(0.8);
    }
  });
}

const built = new Map<string, GunBuild>(), inst = new Map<string, THREE.Object3D>();
/** Собранное оружие по описанию. userData.size — габарит корпуса (длина по X), ствол вдоль +X, центр корпуса в начале. */
export function buildGun(b: GunBuild): THREE.Object3D | null {
  const key = JSON.stringify(b);
  const have = inst.get(key); if (have) { const c = have.clone(true); c.userData = { ...have.userData }; return c; }
  const body = rawGun(b.body); if (!body) return null;
  const root = new THREE.Group(); const sz = body.userData.size as number[];
  body.scale.x = b.len; paint(body, b.finish); root.add(body);
  const L = sz[0] * b.len, H = sz[1], pistol = /Pistol|Revolver/.test(b.body);
  // точки на корпусе: высота ствола у дула, верх над ресивером
  const gb = new THREE.Box3().setFromObject(body); body.updateMatrixWorld(true);
  let by = 0, nB = 0, topY = -1e9;
  body.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.x > gb.max.x - L * 0.07) { by += v.y; nB++; } if (Math.abs(v.x) < L * 0.1) topY = Math.max(topY, v.y); } });
  by = nB ? by / nB : 0;
  const add = (name: string, fit: (o: THREE.Object3D, s: number[]) => void, k = 1) => { const a = rawGun('acc_' + name); if (!a) return; const s = a.userData.size as number[]; if (k !== 1) a.scale.setScalar(k); fit(a, s.map(v => v * k)); paint(a, b.finish === 'gold' ? 'gold' : 'black'); root.add(a); };
  const ak = pistol ? 0.55 : 1;
  if (b.supp) add(b.supp, (a, s) => a.position.set(gb.max.x + s[0] / 2 - L * 0.02, by, 0), ak);
  if (b.scope) add('Scope_' + b.scope, (a, s) => a.position.set(L * (pistol ? 0.02 : 0.0), topY + s[1] * 0.45, 0), pistol ? 0.5 : L * 0.17 / 2.1);
  if (b.bipod) add('Bipod', (a, s) => { a.rotation.y = Math.PI / 2; a.position.set(gb.max.x - L * 0.2, by - s[1] * 0.5 + 0.05, 0); }, L * 0.12 / 1.33);
  if (b.grip) add('Grip', (a, s) => a.position.set(gb.max.x - L * 0.27, by - s[1] * 0.5 - 0.02, 0), 0.9);
  if (b.light) add('Flashlight', (a, s) => a.position.set(gb.max.x - L * (pistol ? 0.12 : 0.18), by - s[1] * 0.9, 0), pistol ? 0.75 : 1);
  if (b.mag) { // пулемётный магазин: барабан или короб под ресивером
    const dm = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.55, metalness: 0.4 });
    const m = b.mag === 'drum' ? new THREE.Mesh(new THREE.CylinderGeometry(L * 0.075, L * 0.075, 0.16, 20).rotateX(Math.PI / 2), dm) : new THREE.Mesh(new THREE.BoxGeometry(L * 0.15, L * 0.11, 0.22), dm);
    m.position.set(L * 0.04, gb.min.y - (b.mag === 'drum' ? L * 0.02 : L * 0.04), 0); m.castShadow = true; root.add(m);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(L * 0.1, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a6b2a, metalness: 0.7, roughness: 0.4 })); belt.position.set(L * 0.04, gb.min.y + L * 0.02, -0.02); root.add(belt);
  }
  root.userData.size = [L, H, sz[2]];
  built.set(key, b); inst.set(key, root);
  const c = root.clone(true); c.userData = { ...root.userData }; return c;
}

/** Оружие по идентификатору (каталог или старый вид) с накладкой обвеса бойца. */
export function gunForWeapon(wid: string, att?: Att): THREE.Object3D | null {
  const sp: GunSpec | undefined = SPEC[wid];
  const b: GunBuild | undefined = sp ? { body: sp.body, finish: sp.finish, len: sp.len, scope: sp.scope, supp: sp.supp, bipod: sp.bipod, grip: sp.grip, light: sp.light, mag: sp.mag } : LEGACY[wid];
  if (!b) return null;
  const x = { ...b };
  if (att?.supp && !x.supp) x.supp = 'Silencer_2';
  if (att?.optic && !x.scope && !/Sniper/.test(x.body)) x.scope = 2;
  return buildGun(x);
}

// ——— иконки для интерфейса (ленивый рендер в маленький холст) ———
const icons = new Map<string, string>();
let ir: THREE.WebGLRenderer | null = null, isc: THREE.Scene | null = null, icam: THREE.PerspectiveCamera | null = null;
export function weaponIcon(wid: string): string | null {
  const c = icons.get(wid); if (c) return c;
  if (!gunsReady()) return null;
  try {
    if (!ir) {
      const cv = document.createElement('canvas'); cv.width = 192; cv.height = 96;
      ir = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true }); ir.setSize(192, 96, false); ir.setClearColor(0, 0);
      isc = new THREE.Scene(); isc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.8)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 4, 5); isc.add(dl);
      icam = new THREE.PerspectiveCamera(22, 2, 0.1, 50); icam.position.set(0, 0.1, 9); icam.lookAt(0, 0, 0);
    }
    const g = gunForWeapon(wid); if (!g) return null;
    const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const k = 3.1 / Math.max(sz.x, sz.y * 2.2); g.scale.setScalar(k); g.position.set(-ctr.x * k, -ctr.y * k, 0); g.rotation.y = -0.3;
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => { const s = mm as THREE.MeshStandardMaterial; if (s.color) s.color.multiplyScalar(1.6); }); });
    isc!.add(g); ir.render(isc!, icam!); const url = ir.domElement.toDataURL('image/png'); isc!.remove(g);
    icons.set(wid, url); return url;
  } catch { return null; }
}
