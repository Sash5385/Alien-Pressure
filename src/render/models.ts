import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type ModelName = 'Soldier' | 'Enemy' | 'Hazmat';
const NAMES: ModelName[] = ['Soldier', 'Enemy', 'Hazmat'];

interface Loaded { scene: THREE.Object3D; clips: THREE.AnimationClip[]; height: number }
const cache = new Map<ModelName, Loaded>();

/** Грузит glTF из public/models/. Не найденные файлы просто пропускаются — сцена использует примитивы. */
export async function loadModels(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all([loadCovers(), ...NAMES.map(async n => {
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

export interface Spawned { obj: THREE.Group; inner: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; arms: THREE.Object3D[]; armBase?: THREE.Quaternion[] }

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

export function spawnModel(name: ModelName, height: number, tint?: number, weapon = 'AK'): Spawned | null {
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
    mesh.material = mat;
  });
  obj.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const c of m.clips) actions.set(c.name, mixer.clipAction(c));
  if (weapon) { // с оружием: стоя и на колене ствол направлен вперёд
    for (const c of aimClips(m.clips)) { const a = mixer.clipAction(c); a.timeScale = c.name === 'KneelShoot' ? 1 : 0; actions.set(c.name === 'IdleAim' ? 'Idle' : c.name, a); }
  }
  const arms: THREE.Object3D[] = [];
  inner.traverse(o => { if (/^UpperArm[._]?[LR]$/.test(o.name)) arms.push(o); });
  return { obj, inner, mixer, actions, arms };
}
