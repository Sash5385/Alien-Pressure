import type { GameState } from './types';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** BFS: клетки, достижимые за `range` шагов (4-связность), с расстояниями. */
export function reachable(s: GameState, sx: number, sy: number, range: number): Map<string, number> {
  const dist = new Map<string, number>([[`${sx},${sy}`, 0]]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const d = dist.get(`${x},${y}`)!;
    if (d >= range) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
      if (s.cover[ny][nx] !== 'none') continue;
      if (s.units.some(u => u.hp > 0 && u.x === nx && u.y === ny)) continue;
      const k = `${nx},${ny}`;
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      q.push([nx, ny]);
    }
  }
  return dist;
}
