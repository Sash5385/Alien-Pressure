import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type ModelName = 'Soldier' | 'Enemy' | 'Hazmat';
const NAMES: ModelName[] = ['Soldier', 'Enemy', 'Hazmat'];

interface Loaded { scene: THREE.Object3D; clips: THREE.AnimationClip[]; height: number }
const cache = new Map<ModelName, Loaded>();

/** Грузит glTF из public/models/. Не найденные файлы просто пропускаются — сцена использует примитивы. */
export async function loadModels(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(NAMES.map(async n => {
    if (cache.has(n)) return;
    try {
      const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/Character_${n}.gltf`);
      const box = new THREE.Box3().setFromObject(g.scene);
      cache.set(n, { scene: g.scene, clips: g.animations, height: Math.max(0.1, box.max.y - box.min.y) });
    } catch { /* нет модели — запасной примитив */ }
  }));
}

export interface Spawned { obj: THREE.Group; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction> }

/** Клонирует модель, подгоняет высоту (в клетках) и красит (tint — смешивается с исходным цветом). */
export function spawnModel(name: ModelName, height: number, tint?: number): Spawned | null {
  const m = cache.get(name);
  if (!m) return null;
  const obj = new THREE.Group();
  const inner = clone(m.scene);
  inner.scale.setScalar(height / m.height);
  inner.traverse(o => {
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
  return { obj, mixer, actions };
}
