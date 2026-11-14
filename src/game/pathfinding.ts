import type { GameState } from './types';

const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

/** Поиск в ширину в окне вокруг старта (массивы вместо строковых ключей: быстро и на огромных картах). */
function bfs(s: GameState, sx: number, sy: number, range: number) {
  const n = s.size, R = Math.min(range, n), W = 2 * R + 1, ox = sx - R, oy = sy - R;
  const dist = new Int16Array(W * W).fill(-1), prev = new Int32Array(W * W).fill(-1), q = new Int32Array(W * W);
  const occ = new Set<number>();
  for (const u of s.units) if (u.hp > 0) occ.add(u.y * n + u.x);
  const fire = new Set<number>();
  for (const f of s.fires) fire.add(f.y * n + f.x);
  let head = 0, tail = 0;
  const si = (sy - oy) * W + (sx - ox);
  dist[si] = 0; q[tail++] = si;
  while (head < tail) {
    const i = q[head++], d = dist[i];
    if (d >= range) continue;
    const x = (i % W) + ox, y = ((i / W) | 0) + oy, h0 = s.height[y][x];
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const li = (ny - oy) * W + (nx - ox);
      if (li < 0 || li >= W * W || nx < ox || nx >= ox + W || dist[li] >= 0) continue;
      if (Math.abs(s.height[ny][nx] - h0) > 1) continue; // обрыв
      if (s.cover[ny][nx] !== 'none' || s.terrain[ny][nx] === 'water') continue;
      const key = ny * n + nx;
      if (fire.has(key) || occ.has(key)) continue;
      dist[li] = d + 1; prev[li] = i; q[tail++] = li;
    }
  }
  return { dist, prev, W, ox, oy, count: tail, q };
}

/** Клетки, достижимые за `range` шагов (4-связность), с расстояниями. */
export const reachable = (s: GameState, sx: number, sy: number, range: number) => {
  const { dist, q, count, W, ox, oy } = bfs(s, sx, sy, range);
  const out = new Map<string, number>();
  for (let j = 0; j < count; j++) { const i = q[j]; out.set(`${(i % W) + ox},${((i / W) | 0) + oy}`, dist[i]); }
  return out;
};

/** Путь (без стартовой клетки) до достижимой клетки. */
export function findPath(s: GameState, sx: number, sy: number, tx: number, ty: number, range: number): [number, number][] {
  const { dist, prev, W, ox, oy } = bfs(s, sx, sy, range);
  if (tx < ox || ty < oy || tx >= ox + W || ty >= oy + W) return [];
  let i = (ty - oy) * W + (tx - ox);
  if (dist[i] < 0) return [];
  const out: [number, number][] = [];
  const start = (sy - oy) * W + (sx - ox);
  while (i !== start) {
    out.push([(i % W) + ox, ((i / W) | 0) + oy]);
    i = prev[i];
    if (i < 0) return [];
  }
  return out.reverse();
}
