import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { findArm, reachArm, type ArmRig } from './ik';

export type ModelName = 'Soldier' | 'Enemy' | 'Hazmat';
const NAMES: ModelName[] = ['Soldier', 'Enemy', 'Hazmat'];

interface Loaded { scene: THREE.Object3D; clips: THREE.AnimationClip[]; height: number }
const cache = new Map<ModelName, Loaded>();

/** Грузит glTF из public/models/. Не найденные файлы просто пропускаются — сцена использует примитивы. */
export async function loadModels(covers = true): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all([covers ? loadCovers() : Promise.resolve(), ...NAMES.map(async n => {
    if (cache.has(n)) return;
    try {
      const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/Character_${n}.gltf`);
      const box = new THREE.Box3().setFromObject(g.scene);
      cache.set(n, { scene: g.scene, clips: g.animations, height: Math.max(0.1, box.max.y - box.min.y) });
    } catch { /* нет модели — запасной примитив */ }
  })]);
}

const COVER_FILES = { half: ['Crate'], full: ['Container_Small'] } as const;
const TREES = ['Tree_1', 'Tree_2', 'Tree_3'];
const coverCache = new Map<string, THREE.Object3D>();

async function loadCovers() {
  const loader = new FBXLoader();
  const names = [...COVER_FILES.half, ...COVER_FILES.full, ...TREES];
  await Promise.all(names.map(async n => {
    try { coverCache.set(n, await loader.loadAsync(`${import.meta.env.BASE_URL}models/cover/${n}.fbx`)); } catch { /* примитив */ }
  }));
}

/** Модель укрытия по виду (дерево/ящик/контейнер), вписанная в клетку; null — нет файла (рисуется примитив). */
export function spawnCover(kind: 'tree' | 'crate' | 'container', variant: number): THREE.Object3D | null {
  const names = kind === 'tree' ? TREES : kind === 'crate' ? COVER_FILES.half : COVER_FILES.full;
  const list = names.filter(n => coverCache.has(n));
  if (!list.length) return null;
  const src = coverCache.get(list[variant % list.length])!;
  const inner = clone(src);
  inner.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  if (kind === 'tree') {
    // у FBX глянцевые Phong-материалы без текстур: заменяем на матовые зелёный/коричневый
    const crown = [0x3f7a2e, 0x4a8a30, 0x356c2a][variant % 3];
    inner.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (x: THREE.Material) => new THREE.MeshStandardMaterial({ color: x.name.includes('Wood') ? 0x5a3f25 : crown, roughness: 1, flatShading: true });
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const k = (kind === 'tree' ? 1.2 : 0.95) / Math.max(size.x, size.z, 0.001);
  const targetH = kind === 'tree' ? 2.1 : kind === 'crate' ? 0.7 : 1.5;
  const ky = Math.min(1.8, Math.max(0.6, targetH / Math.max(size.y * k, 0.001))) * k;
  inner.scale.set(k, ky, k);
  const b2 = new THREE.Box3().setFromObject(inner);
  const c = b2.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b2.min.y, -c.z);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}

export interface Spawned { obj: THREE.Group; inner: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; arms: THREE.Object3D[]; mod: THREE.Object3D[]; modBase?: THREE.Quaternion[]; neck?: THREE.Object3D; torso?: THREE.Object3D; look: number; body: number; rigL?: ArmRig; rigR?: ArmRig; grip?: { node: THREE.Object3D; local: THREE.Vector3 }; ags?: { hl: THREE.Object3D; hr: THREE.Object3D }; baseScale: number; armed: boolean }

const LEGS = /^(Hips|Body|UpperLeg|LowerLeg|Foot|Root|PoleTarget)/;
const DUCK_T = 0.4; // кадр клипа Duck с согнутыми ногами
const nodeOf = (t: THREE.KeyframeTrack) => t.name.slice(0, t.name.lastIndexOf('.'));
/** Один кадр клипа (в момент time) как статичные треки. */
function frozen(clip: THREE.AnimationClip, time: number, keep: (node: string) => boolean): THREE.KeyframeTrack[] {
  return clip.tracks.filter(t => keep(nodeOf(t))).map(t => {
    const v = Array.from((t as unknown as { createInterpolant(): { evaluate(t: number): ArrayLike<number> } }).createInterpolant().evaluate(time));
    return new (t.constructor as new (n: string, ti: ArrayLike<number>, v: ArrayLike<number>) => THREE.KeyframeTrack)(t.name, [0], v);
  });
}
/** Позы «оружие вперёд»: стоя (Idle), на колене (Kneel, KneelShoot с ногами из Duck). */
function aimClips(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const shoot = clips.find(c => c.name === 'Idle_Shoot'), duck = clips.find(c => c.name === 'Duck');
  if (!shoot) return [];
  const out = [new THREE.AnimationClip('IdleAim', 1, frozen(shoot, 0, () => true))];
  if (duck) {
    const legs = frozen(duck, DUCK_T, n => LEGS.test(n));
    out.push(new THREE.AnimationClip('Kneel', 1, [...frozen(shoot, 0, n => !LEGS.test(n)), ...legs]));
    out.push(new THREE.AnimationClip('KneelShoot', shoot.duration, [...shoot.tracks.filter(t => !LEGS.test(nodeOf(t))), ...legs]));
  }
  return out;
}

/** Клонирует модель, подгоняет высоту (в клетках) и красит (tint — смешивается с исходным цветом). */
// Все оружия лежат в модели узлами в руке; показываем только выбранное (пустая строка — без оружия)
const WEAPON_NODES = ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small', 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'];

/** Пятнистый камуфляж: пятна по координатам вершины в позе привязки, поэтому не «плывут» при анимации. */
function camo(mat: THREE.MeshStandardMaterial) {
  mat.customProgramCacheKey = () => 'camo';
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCP;
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float ca=vn(vCP*3.2), cb=vn(vCP*3.2+vec3(7.3,1.1,4.2));
vec3 cc=vec3(.10,.14,.04); if(ca>.55) cc=vec3(.26,.27,.10); if(cb>.62) cc=vec3(.12,.08,.03); if(ca<.3) cc=vec3(.04,.065,.03);
diffuseColor.rgb=cc;`);
  };
}

/** Снаряжение: разгрузка с магазинами и гранатами на груди, сапёрная лопатка на бедре. Крепится к костям. */
function addGear(inner: THREE.Object3D, mixer: THREE.AnimationMixer, aim?: THREE.AnimationAction, armor = 'none') {
  if (aim) { aim.play(); mixer.update(0); }
  const bone = (n: string) => inner.getObjectByName(n);
  const torso = bone('Torso'), hips = bone('Hips');
  if (!torso || !hips) return;
  const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, host: THREE.Object3D) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; inner.add(o); return { o, host };
  };
  const items: { o: THREE.Object3D; host: THREE.Object3D }[] = [];
  const vest = mat(0x3a4430), pouch = mat(0x262b1f), tip = mat(0xb0a27a), grn = mat(0x2f4a23), met = mat(0x8c8f93, 0.5), wood = mat(0x6b4a2a);
  items.push(box(0.62, 0.4, 0.42, vest, 0, 0.97, 0.0, torso));
  for (const x of [-0.2, 0, 0.2]) { // подсумки с магазинами
    items.push(box(0.15, 0.22, 0.1, pouch, x, 0.88, 0.25, torso));
    items.push(box(0.1, 0.05, 0.08, tip, x, 1.0, 0.25, torso));
  }
  for (const x of [-0.24, 0.24]) { // гранаты
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), grn); g.scale.set(1, 1.25, 1); g.position.set(x, 1.1, 0.23); g.castShadow = true; inner.add(g); items.push({ o: g, host: torso });
    items.push(box(0.03, 0.05, 0.03, met, x, 1.25, 0.24, torso));
  }
  // броня: бронежилет — накладка на грудь, пластины — ещё наплечники и поясница, экзоскелет — каркас на ногах
  const plate = mat(armor === 'exo' ? 0x5b6470 : 0x2c3036, 0.6), steel = mat(0x7d8794, 0.4);
  if (armor !== 'none') {
    items.push(box(0.5, 0.38, 0.07, plate, 0, 1.02, 0.27, torso));
    items.push(box(0.5, 0.3, 0.07, plate, 0, 1.0, -0.27, torso));
  }
  if (armor === 'plate' || armor === 'exo') {
    for (const x of [-0.36, 0.36]) items.push(box(0.2, 0.12, 0.3, plate, x, 1.28, 0, torso));
    items.push(box(0.56, 0.14, 0.4, plate, 0, 0.72, 0, hips));
  }
  if (armor === 'exo') {
    for (const x of [-0.19, 0.19]) { items.push(box(0.1, 0.5, 0.1, steel, x, 0.45, 0.14, hips)); items.push(box(0.18, 0.12, 0.14, plate, x, 0.2, 0.12, hips)); }
  }
  // лопатка на левом бедре: черенок и штык
  items.push(box(0.05, 0.5, 0.05, wood, 0.37, 0.7, -0.02, hips));
  items.push(box(0.17, 0.2, 0.025, met, 0.37, 0.4, -0.02, hips));
  inner.updateMatrixWorld(true);
  for (const it of items) it.host.attach(it.o);
  if (aim) aim.stop();
}

const AXES = ['x', 'y', 'z'] as const;
/** Разбор оружия: длинная ось, куда смотрит дуло (от руки к дальнему концу), где верх. Длины в локальных единицах узла. */
function weaponFrame(node: THREE.Object3D, hand: THREE.Vector3) {
  const mesh = node as THREE.Mesh;
  if (!mesh.geometry) return null;
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!, size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  const order = [0, 1, 2].sort((i, j) => size[AXES[j]] - size[AXES[i]]);
  const la = AXES[order[0]], ha = AXES[order[1]];
  const hl = node.worldToLocal(hand.clone());
  const mz = (hl[la] - ctr[la]) > 0 ? -1 : 1; // дуло — на дальнем от руки конце
  // верх — там, где центр масс вершин выше центра габарита (магазин свисает вниз)
  const pos = mesh.geometry.attributes.position; let sum = 0;
  for (let i = 0; i < pos.count; i += 3) sum += pos.getComponent(i, order[1]);
  const up = (sum / Math.ceil(pos.count / 3) - ctr[ha]) >= 0 ? 1 : -1;
  return { bb, size, ctr, la, ha, mz, up, len: size[la], hl };
}

/** Детали оружия, которых нет в модели: прицелы, глушитель, цевьё. */
function addWeaponParts(node: THREE.Object3D, kind: string, f: NonNullable<ReturnType<typeof weaponFrame>>) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.4, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x4aa8ff, roughness: 0.1, metalness: 0.6, emissive: 0x0b3a6b });
  const at = (t: number, up: number) => { // t: 0 — приклад, 1 — дуло; up — над верхней гранью
    const v = f.ctr.clone();
    v[f.la] = f.ctr[f.la] + f.mz * (t - 0.5) * f.len;
    v[f.ha] = f.ctr[f.ha] + f.up * (f.size[f.ha] * 0.5 + up);
    return v;
  };
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3, alongLong = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.castShadow = true;
    if (alongLong) { if (f.la === 'x') m.rotation.z = Math.PI / 2; else if (f.la === 'z') m.rotation.x = Math.PI / 2; }
    node.add(m); return m;
  };
  const L = f.len, up = f.size[f.ha];
  if (kind === 'sniper') {
    place(new THREE.CylinderGeometry(L * 0.035, L * 0.035, L * 0.3, 10), dark, at(0.46, L * 0.04));
    place(new THREE.CylinderGeometry(L * 0.04, L * 0.04, L * 0.012, 10), glass, at(0.62, L * 0.04));
    place(new THREE.BoxGeometry(...(f.la === 'x' ? [L * 0.03, L * 0.04, L * 0.025] : f.la === 'z' ? [L * 0.025, L * 0.04, L * 0.03] : [L * 0.025, L * 0.03, L * 0.025]) as [number, number, number]), dark, at(0.4, L * 0.0), false);
  } else if (kind === 'AK') {
    place(new THREE.BoxGeometry(...(f.la === 'x' ? [L * 0.08, L * 0.045, L * 0.035] : f.la === 'z' ? [L * 0.035, L * 0.045, L * 0.08] : [L * 0.035, L * 0.08, L * 0.035]) as [number, number, number]), dark, at(0.42, L * 0.03), false);
    place(new THREE.CylinderGeometry(L * 0.018, L * 0.018, L * 0.1, 8), glass, at(0.45, L * 0.065));
  } else if (kind === 'SMG') {
    place(new THREE.CylinderGeometry(L * 0.04, L * 0.04, L * 0.24, 10), dark, at(1.1, -up * 0.45)); // глушитель на дуле
  } else if (kind === 'RocketLauncher') {
    place(new THREE.ConeGeometry(L * 0.07, L * 0.16, 12), dark, at(-0.06, -up * 0.5)).rotation.set(0, 0, 0); // раструб сзади
    place(new THREE.ConeGeometry(L * 0.075, L * 0.18, 12), new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.7 }), at(1.08, -up * 0.5)); // боевая часть спереди
    place(new THREE.BoxGeometry(...(f.la === 'x' ? [L * 0.1, L * 0.05, L * 0.04] : f.la === 'z' ? [L * 0.04, L * 0.05, L * 0.1] : [L * 0.04, L * 0.1, L * 0.04]) as [number, number, number]), dark, at(0.4, L * 0.03), false); // прицел
  } else if (kind === 'Shotgun') {
    place(new THREE.CylinderGeometry(L * 0.04, L * 0.04, L * 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 }), at(0.6, -up * 0.6)); // цевьё
  }
}

/** Станковый АГС: сошки-треножник, короб с барабаном-лентой, ствол с пламегасителем, рукоятки. Размеры для роста 1,8. */
function makeAgs(): { g: THREE.Group; hl: THREE.Object3D; hr: THREE.Object3D } {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.55, metalness: 0.5, flatShading: true });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5a33, roughness: 0.8, flatShading: true });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.7 });
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const leg = (tx: number, tz: number) => { // ножка треножника от шарнира к земле
    const a = new THREE.Vector3(0, 0.62, 0.55), b = new THREE.Vector3(tx, 0, tz), d = b.clone().sub(a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, len, 6), steel);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; g.add(m);
  };
  leg(-0.42, 0.95); leg(0.42, 0.95); leg(0, 0.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), steel), 0, 0.62, 0.55); // шарнир
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.62), steel), 0, 0.78, 0.48); // короб
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.3), steel), 0, 0.89, 0.46); // верхняя крышка
  const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.62, 10), steel), 0, 0.8, 1.12); bar.rotation.x = Math.PI / 2; // ствол
  const fh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), steel), 0, 0.8, 1.5); fh.rotation.x = Math.PI / 2; // пламегаситель
  for (let i = 0; i < 4; i++) { const r = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), steel), Math.cos(i * 1.57) * 0.045, 0.8 + Math.sin(i * 1.57) * 0.045, 1.2); r.rotation.z = 0; } // рёбра охлаждения
  const drum = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 20), olive), 0.2, 0.74, 0.38); drum.rotation.z = Math.PI / 2; // барабан на 29 гранат
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const r = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), brass), 0.2, 0.74 + Math.cos(a) * 0.125, 0.38 + Math.sin(a) * 0.125); r.rotation.z = Math.PI / 2; } // выглядывающие гильзы
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), steel), -0.1, 0.78, 0.2); // левая рукоять
  const hl = new THREE.Object3D(); hl.position.set(-0.1, 0.86, 0.19); g.add(hl);
  const hr = new THREE.Object3D(); hr.position.set(0.1, 0.86, 0.19); g.add(hr);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), steel), 0.1, 0.78, 0.2); // правая рукоять
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), steel), 0, 0.88, 0.17); // спусковая планка между ручками
  add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), steel), -0.06, 0.93, 0.5); // прицел
  return { g, hl, hr };
}

/** Станковый миномёт: опорная плита, труба под углом, сошки, прицел; руки на верхней части трубы. */
function makeMortar(): { g: THREE.Group; hl: THREE.Object3D; hr: THREE.Object3D } {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.55, metalness: 0.5, flatShading: true });
  const green = new THREE.MeshStandardMaterial({ color: 0x4a5a33, roughness: 0.8, flatShading: true });
  const add = (m: THREE.Mesh, v: THREE.Vector3) => { m.position.copy(v); m.castShadow = true; g.add(m); return m; };
  const dir = new THREE.Vector3(0, Math.sin(1.26), Math.cos(1.26)); // труба ~72° к земле
  const base = new THREE.Vector3(0, 0.05, 0.3);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 20), steel), new THREE.Vector3(0, 0.025, 0.3)); // плита
  const tube = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.95, 14), green), base.clone().addScaledVector(dir, 0.475));
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 16), steel), base.clone().addScaledVector(dir, 0.95)); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), steel), base.clone().addScaledVector(dir, 0.02)); cap.scale.y = 0.6;
  const leg = (sx: number) => { // сошка
    const a = base.clone().addScaledVector(dir, 0.6), b = new THREE.Vector3(sx * 0.34, 0, 0.62), d = b.clone().sub(a);
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, d.length(), 6), steel), a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  leg(-1); leg(1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.09), steel), base.clone().addScaledVector(dir, 0.5).add(new THREE.Vector3(0.08, 0, 0))); // прицел
  const top = base.clone().addScaledVector(dir, 0.84);
  const hl = new THREE.Object3D(); hl.position.copy(top).add(new THREE.Vector3(-0.07, 0, 0)); g.add(hl);
  const hr = new THREE.Object3D(); hr.position.copy(top).add(new THREE.Vector3(0.07, 0, 0.0)); g.add(hr);
  return { g, hl, hr };
}

/** Две руки на оружии: левая берётся за цевьё, у АГС обе за рукоятки. Вызывать после анимации кадра. */
export function applyTwoHands(sp: Spawned) {
  if (sp.ags && sp.rigL && sp.rigR) {
    sp.obj.updateMatrixWorld(true);
    reachArm(sp.inner, sp.rigL, sp.ags.hl.getWorldPosition(new THREE.Vector3()));
    reachArm(sp.inner, sp.rigR, sp.ags.hr.getWorldPosition(new THREE.Vector3()));
  } else if (sp.grip && sp.rigL && sp.grip.node.visible) {
    reachArm(sp.inner, sp.rigL, sp.grip.node.localToWorld(sp.grip.local.clone()));
  }
}

export function spawnModel(name: ModelName, height: number, tint?: number, weapon = 'AK', armor = 'none'): Spawned | null {
  const m = cache.get(name);
  if (!m) return null;
  const obj = new THREE.Group();
  const inner = clone(m.scene);
  inner.scale.setScalar(height / m.height);
  inner.traverse(o => {
    if (WEAPON_NODES.includes(o.name)) o.visible = o.name === weapon;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (tint !== undefined && mat.color) mat.color.lerp(new THREE.Color(tint), 0.5);
    if (name === 'Soldier' && (mat.name === 'Pants' || mat.name === 'Character_Main')) camo(mat);
    mesh.material = mat;
  });
  obj.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const c of m.clips) actions.set(c.name, mixer.clipAction(c));
  if (weapon) { // с оружием: стоя и на колене ствол направлен вперёд
    for (const c of aimClips(m.clips)) { const a = mixer.clipAction(c); a.timeScale = c.name === 'KneelShoot' ? 1 : 0; actions.set(c.name === 'IdleAim' ? 'Idle' : c.name, a); }
  }
  if (name === 'Soldier') inner.traverse(o => { if ((o as THREE.Bone).isBone && o.name === 'Head') o.scale.setScalar(0.8); }); // пропорции ближе к реальным: голова меньше
  if (name === 'Soldier') addGear(inner, mixer, actions.get('Idle'), armor);
  // оружие в руках: детали, хват второй рукой; АГС — отдельная станковая модель
  const rigL = findArm(inner, 'L') ?? undefined, rigR = findArm(inner, 'R') ?? undefined;
  let grip: Spawned['grip'], agsRig: Spawned['ags'];
  if (name === 'Soldier' && (weapon === 'AGS' || weapon === 'MORTAR')) {
    const a = weapon === 'AGS' ? makeAgs() : makeMortar(); a.g.scale.setScalar(height / 1.8); a.g.position.z = (weapon === 'AGS' ? 0.35 : 0.2) * height / 1.8; obj.add(a.g);
    agsRig = { hl: a.hl, hr: a.hr };
  } else if (name === 'Soldier' && weapon && rigR) {
    const node = inner.getObjectByName(weapon);
    if (node) {
      const act = actions.get('Idle'); if (act) { act.play(); mixer.update(0); }
      inner.updateMatrixWorld(true);
      const f = weaponFrame(node, rigR.wrist.getWorldPosition(new THREE.Vector3()));
      if (f) {
        addWeaponParts(node, weapon, f);
        const local = f.hl.clone(); local[f.la] = Math.max(f.bb.min[f.la], Math.min(f.bb.max[f.la], f.hl[f.la] + f.mz * f.len * 0.38)); // хват впереди, на цевье
        local[f.ha] = f.ctr[f.ha] - f.up * f.size[f.ha] * 0.1;
        grip = { node, local };
      }
      if (act) act.stop();
    }
  }
  const arms: THREE.Object3D[] = [];
  inner.traverse(o => { if (/^UpperArm[._]?[LR]$/.test(o.name)) arms.push(o); });
  const neck = inner.getObjectByName('Neck') ?? undefined, torso = inner.getObjectByName('Torso') ?? undefined;
  return { obj, inner, mixer, actions, arms, mod: [...arms, ...(rigL ? [rigL.lower] : []), ...(rigR && agsRig ? [rigR.lower] : []), ...(neck ? [neck] : []), ...(torso ? [torso] : [])], neck, torso, look: 0, body: 0, rigL, rigR, grip, ags: agsRig, baseScale: inner.scale.x, armed: !!weapon };
}
