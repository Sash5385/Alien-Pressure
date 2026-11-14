import * as THREE from 'three';

/** Рука из трёх костей: плечо, локоть, кисть. */
export interface ArmRig { upper: THREE.Object3D; lower: THREE.Object3D; wrist: THREE.Object3D; side: 1 | -1 }

export function findArm(inner: THREE.Object3D, s: 'L' | 'R'): ArmRig | null {
  const upper = inner.getObjectByName(`UpperArm${s}`) ?? inner.getObjectByName(`UpperArm.${s}`);
  const lower = inner.getObjectByName(`LowerArm${s}`) ?? inner.getObjectByName(`LowerArm.${s}`);
  if (!upper || !lower) return null;
  const wrist = lower.children.find(c => /^Middle1/.test(c.name)) ?? lower.children.find(c => (c as THREE.Bone).isBone) ?? lower;
  return { upper, lower, wrist, side: s === 'L' ? 1 : -1 };
}

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

/** Повернуть кость так, чтобы направление от неё к дочерней точке смотрело на цель. */
function aimBone(b: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) {
  b.getWorldPosition(_v1); child.getWorldPosition(_v2);
  const cur = _v2.sub(_v1).normalize(), want = _v3.copy(target).sub(_v1).normalize();
  _q.setFromUnitVectors(cur, want);
  b.parent!.getWorldQuaternion(_pq);
  b.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pq.clone().invert());
  b.updateMatrixWorld(true);
}

/** Двухкостная ИК: кисть руки достаёт точку target, локоть смотрит вниз и в сторону тела. */
export function reachArm(inner: THREE.Object3D, arm: ArmRig, target: THREE.Vector3) {
  inner.updateMatrixWorld(true);
  const S = arm.upper.getWorldPosition(new THREE.Vector3()), E = arm.lower.getWorldPosition(new THREE.Vector3()), W = arm.wrist.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E), l2 = E.distanceTo(W);
  const dir = target.clone().sub(S), d = Math.max(1e-4, dir.length());
  dir.divideScalar(d);
  const dc = Math.min(d, (l1 + l2) * 0.995);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const iq = inner.getWorldQuaternion(new THREE.Quaternion());
  const pole = new THREE.Vector3(0, -1, 0).add(new THREE.Vector3(arm.side * 0.7, 0, 0).applyQuaternion(iq));
  pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = S.clone().addScaledVector(dir, a).addScaledVector(pole, h);
  aimBone(arm.upper, arm.lower, elbow);
  aimBone(arm.lower, arm.wrist, target);
}
