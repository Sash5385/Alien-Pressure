import * as THREE from 'three';

/** Ветер: лёгкое покачивание растений и мощный толчок от взрывов (волна расходится от центра). */
export const WIND = {
  uTime: { value: 0 },
  uBlast: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
  i: 0,
};
export const tickWind = (t: number) => { WIND.uTime.value = t; };
export function windBlast(x: number, z: number, power: number) {
  WIND.uBlast.value[WIND.i++ % 4].set(x, z, WIND.uTime.value, power);
}

/** Качание материала. ground — высота земли у основания (для деревьев и кустов: качается верх, считая по миру);
 * без неё высота берётся по локальной y вершины от -0.15 до 0.15 (трава). */
export function sway(mat: THREE.Material, o: { amp: number; h: number; ground?: number }) {
  const worldMode = o.ground !== undefined;
  mat.customProgramCacheKey = () => (worldMode ? 'swayW' : 'swayO');
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = WIND.uTime; sh.uniforms.uBlast = WIND.uBlast;
    sh.uniforms.uAmp = { value: o.amp }; sh.uniforms.uH = { value: o.h }; sh.uniforms.uGround = { value: o.ground ?? 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uBlast[4]; uniform float uAmp, uH, uGround;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  mat4 sm = modelMatrix;
  #ifdef USE_INSTANCING
  sm = modelMatrix * instanceMatrix;
  #endif
  vec3 bw = sm[3].xyz;
  ${worldMode ? 'float hh = clamp(((sm * vec4(transformed, 1.0)).y - uGround) / uH, 0.0, 1.0);' : 'float hh = clamp((position.y + 0.15) / 0.3, 0.0, 1.0);'}
  hh *= hh;
  float ph = bw.x * 0.7 + bw.z * 0.5;
  float w = sin(uTime * 1.3 + ph) * 0.5 + sin(uTime * 2.3 + ph * 1.7) * 0.25 + 0.35 * sin(uTime * 0.45 + bw.x * 0.12 + bw.z * 0.1);
  vec2 d2 = vec2(w, w * 0.6 + 0.25 * sin(uTime * 1.7 + ph * 0.8)) * uAmp;
  for (int i = 0; i < 4; i++) {
    vec4 b = uBlast[i]; float age = uTime - b.z;
    if (age > 0.0 && age < 4.0) {
      vec2 dv = bw.xz - b.xy; float d = length(dv) + 0.001;
      float front = exp(-pow((d - age * 11.0) * 0.28, 2.0));
      float shake = exp(-age * 1.1) * sin(age * 15.0 + d * 0.8);
      d2 += dv / d * b.w * exp(-d * 0.12) * (front * 1.6 + shake * 0.5) * uAmp * 5.0;
    }
  }
  mat3 m3 = mat3(sm); float sc = max(length(m3[0]), 0.0001);
  transformed += (transpose(m3) * vec3(d2.x, 0.0, d2.y)) / (sc * sc) * hh;
}`);
  };
  mat.needsUpdate = true;
}
