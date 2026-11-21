// Командные приказы всему отряду (реальное время).
import { isVisible, living } from './combat';
import { bldgAt, flOf } from './floors';
import { orderAttack, orderMove } from './rt';
import type { GameState, Unit } from './types';
import { maxLevel, stairTiles, tileCover } from '../render/buildings';

const squad = (s: GameState) => living(s, 'human').filter(u => !u.down);
const free = (s: GameState, x: number, y: number, fl: number, taken: Set<string>) =>
  x > 0 && y > 0 && x < s.size - 1 && y < s.size - 1 && !taken.has(`${x},${y},${fl}`) && !s.units.some(v => v.hp > 0 && v.x === x && v.y === y && flOf(v) === fl);

/** Все к выбранному бойцу: занимают соседние клетки. */
export function regroup(s: GameState, leader: Unit): number {
  const taken = new Set<string>(); let n = 0;
  const L = flOf(leader);
  for (const u of squad(s)) {
    if (u.id === leader.id) continue;
    let best: [number, number] | null = null;
    for (let r = 1; r <= 4 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = leader.x + dx, y = leader.y + dy;
      if (!free(s, x, y, L, taken)) continue;
      if (L === 0 ? (s.cover[y][x] !== 'none' || s.terrain[y][x] !== 'ground') : (bldgAt(s, x, y) !== bldgAt(s, leader.x, leader.y))) continue;
      best = [x, y]; break;
    }
    if (best) { taken.add(`${best[0]},${best[1]},${L}`); orderMove(u, best[0], best[1], L); n++; }
  }
  return n;
}

/** Стоять: отменить все приказы движения и атаки. */
export function holdAll(s: GameState) { for (const u of squad(s)) { u.dest = undefined; u.queue = undefined; u.atk = undefined; u.route = undefined; } }

/** Все атакуют ближайшего видимого врага. */
export function focusFire(s: GameState, leader: Unit): boolean {
  const vis = living(s, 'alien').filter(a => isVisible(s, a)).sort((a, b) => Math.hypot(a.x - leader.x, a.y - leader.y) - Math.hypot(b.x - leader.x, b.y - leader.y));
  if (!vis.length) return false;
  for (const u of squad(s)) orderAttack(u, vis[0]);
  return true;
}

/** Зачистка ближайшего здания: бойцы расходятся по этажам и комнатам. */
export function clearBuilding(s: GameState, leader: Unit): string | null {
  if (!s.bldgs) return 'Тут немає будівель.';
  let bi = -1, bd = 40;
  s.bldgs.forEach((b, i) => { const d = Math.hypot(b.x! + b.w / 2 - leader.x, b.y! + b.d / 2 - leader.y); if (d < bd) { bd = d; bi = i; } });
  if (bi < 0) return 'Поблизу немає будівель.';
  const sp = s.bldgs[bi], top = maxLevel(sp), st = stairTiles(sp), taken = new Set<string>();
  const tiles = (f: number) => {
    const out: [number, number][] = [];
    for (let dy = 1; dy < sp.d - 1; dy++) for (let dx = 1; dx < sp.w - 1; dx++) if (tileCover(sp, dx, dy, f) === 'none' && !(dx === st.dx && dy >= st.bottom && dy <= st.top)) out.push([sp.x! + dx, sp.y! + dy]);
    return out;
  };
  const crew = squad(s).sort((a, b) => Math.hypot(a.x - sp.x!, a.y - sp.y!) - Math.hypot(b.x - sp.x!, b.y - sp.y!));
  crew.forEach((u, i) => {
    const f = Math.min(top, i % (top + 1)), t = tiles(f).filter(([x, y]) => free(s, x, y, f, taken)).sort((a, b) => Math.hypot(a[0] - u.x, a[1] - u.y) - Math.hypot(b[0] - u.x, b[1] - u.y))[0];
    if (!t) return;
    taken.add(`${t[0]},${t[1]},${f}`); orderMove(u, t[0], t[1], f);
  });
  return null;
}
