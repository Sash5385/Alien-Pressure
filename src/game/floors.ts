// Этажи: укрытия, обзор и перемещение по лестнице внутри зданий.
import { stairTiles, tileCover } from '../render/buildings';
import type { Cover, GameState, Unit } from './types';

export const flOf = (u: { fl?: number }) => u.fl ?? 0;

/** Индекс здания, в чьём основании лежит клетка, или -1. */
export function bldgAt(s: GameState, x: number, y: number): number {
  if (!s.bidx || x < 0 || y < 0 || x >= s.size || y >= s.size) return -1;
  return s.bidx[y * s.size + x] - 1;
}

/** Укрытие клетки на этаже fl: внутри здания — по этажам, снаружи при fl>0 лес и ящики не мешают. */
export function coverAt(s: GameState, x: number, y: number, fl: number): Cover {
  if (fl <= 0) return s.cover[y][x];
  const bi = bldgAt(s, x, y);
  if (bi < 0) return 'none';
  const sp = s.bldgs![bi];
  if (fl >= sp.floors) return 'none';
  return tileCover(sp, x - sp.x!, y - sp.y!, fl);
}

export function stairPos(s: GameState, bi: number, which: 'bottom' | 'top') {
  const sp = s.bldgs![bi], t = stairTiles(sp);
  return { x: sp.x! + t.dx, y: sp.y! + (which === 'bottom' ? t.bottom : t.top) };
}

/** Можно ли подняться (dir=1) или спуститься (dir=-1) из текущей клетки. */
export function canClimb(s: GameState, u: Unit, dir: 1 | -1): boolean {
  const bi = bldgAt(s, u.x, u.y);
  if (bi < 0) return false;
  const sp = s.bldgs![bi], f = flOf(u);
  if (dir > 0 ? f >= sp.floors - 1 : f <= 0) return false;
  const p = stairPos(s, bi, dir > 0 ? 'bottom' : 'top');
  return u.x === p.x && u.y === p.y;
}

/** Перейти на этаж выше/ниже: боец оказывается на другом конце лестницы. */
export function climb(s: GameState, u: Unit, dir: 1 | -1): boolean {
  if (!canClimb(s, u, dir)) return false;
  const bi = bldgAt(s, u.x, u.y), p = stairPos(s, bi, dir > 0 ? 'top' : 'bottom');
  const other = s.units.some(v => v.hp > 0 && v.id !== u.id && v.x === p.x && v.y === p.y && flOf(v) === flOf(u) + dir);
  if (other) return false;
  u.fl = flOf(u) + dir; u.x = p.x; u.y = p.y;
  return true;
}
