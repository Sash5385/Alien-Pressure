import type { GameState } from './types';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function bfs(s: GameState, sx: number, sy: number, range: number) {
  const dist = new Map<string, number>([[`${sx},${sy}`, 0]]);
  const prev = new Map<string, string>();
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const d = dist.get(`${x},${y}`)!;
    if (d >= range) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
      if (Math.abs(s.height[ny][nx] - s.height[y][x]) > 1) continue; // обрыв
      if (s.cover[ny][nx] !== 'none' || s.terrain[ny][nx] === 'water' || s.fires.some(f => f.x === nx && f.y === ny)) continue;
      if (s.units.some(u => u.hp > 0 && u.x === nx && u.y === ny)) continue;
      const k = `${nx},${ny}`;
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      prev.set(k, `${x},${y}`);
      q.push([nx, ny]);
    }
  }
  return { dist, prev };
}

/** Клетки, достижимые за `range` шагов (4-связность), с расстояниями. */
export const reachable = (s: GameState, sx: number, sy: number, range: number) => bfs(s, sx, sy, range).dist;

/** Путь (без стартовой клетки) до достижимой клетки. */
export function findPath(s: GameState, sx: number, sy: number, tx: number, ty: number, range: number): [number, number][] {
  const { prev } = bfs(s, sx, sy, range);
  const out: [number, number][] = [];
  let k = `${tx},${ty}`;
  const start = `${sx},${sy}`;
  while (k !== start) {
    const [x, y] = k.split(',').map(Number);
    out.push([x, y]);
    const p = prev.get(k);
    if (!p) return [];
    k = p;
  }
  return out.reverse();
}
