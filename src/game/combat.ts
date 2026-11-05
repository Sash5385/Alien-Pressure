import type { GameState, Unit } from './types';

export interface ShotResult {
  attackerId: number;
  targetId: number;
  hit: boolean;
  dmg: number;
  chance: number;
  killed: boolean;
  reaction: boolean;
}

/** Детерминированный генератор (mulberry32) — состояние хранится в GameState.rng. */
export function rand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const living = (s: GameState, team?: Unit['team']) =>
  s.units.filter(u => u.hp > 0 && (!team || u.team === team));

export function log(s: GameState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 30) s.log.shift();
}

/** Линия видимости (Bresenham): полное укрытие блокирует, половинное — нет. */
export function los(s: GameState, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - x), dy = Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if ((x !== b.x || y !== b.y) && s.cover[y][x] === 'full') return false;
  }
  return true;
}

/** Защита цели от стрелка: укрытие рядом с целью со стороны стрелка. */
export function coverBonus(s: GameState, shooter: Unit, target: Unit): number {
  let best = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = target.x + dx, cy = target.y + dy;
    if (cx < 0 || cy < 0 || cx >= s.size || cy >= s.size) continue;
    const c = s.cover[cy][cx];
    if (c === 'none') continue;
    if ((shooter.x - target.x) * dx + (shooter.y - target.y) * dy <= 0) continue;
    best = Math.max(best, c === 'full' ? 40 : 20);
  }
  return best;
}

/** Шанс попадания, % — или null, если выстрел невозможен. */
export function hitChance(s: GameState, a: Unit, t: Unit, reaction = false): number | null {
  if (a.ammo <= 0 || a.hp <= 0 || t.hp <= 0 || a.team === t.team) return null;
  const dist = Math.hypot(a.x - t.x, a.y - t.y);
  if (dist > a.range || !los(s, a, t)) return null;
  const c = a.aim - coverBonus(s, a, t) - Math.max(0, dist - 6) * 3 - (reaction ? 10 : 0);
  return Math.round(Math.min(95, Math.max(5, c)));
}

export function shoot(s: GameState, a: Unit, t: Unit, reaction = false): ShotResult {
  const chance = hitChance(s, a, t, reaction) ?? 0;
  a.ammo -= 1;
  if (!reaction) a.ap -= 1;
  const hit = rand(s) * 100 < chance;
  const dmg = hit ? a.dmg[0] + Math.floor(rand(s) * (a.dmg[1] - a.dmg[0] + 1)) : 0;
  t.hp = Math.max(0, t.hp - dmg);
  const killed = hit && t.hp <= 0;
  log(s, `${reaction ? '[Overwatch] ' : ''}${a.name} → ${t.name}: ${hit ? `−${dmg} HP${killed ? ', убит' : ''}` : 'мимо'} (${chance}%)`);
  checkEnd(s);
  return { attackerId: a.id, targetId: t.id, hit, dmg, chance, killed, reaction };
}

/** Реакция overwatch бойцов на движущегося пришельца. */
export function reactions(s: GameState, mover: Unit): ShotResult[] {
  const out: ShotResult[] = [];
  for (const h of living(s, 'human')) {
    if (mover.hp <= 0) break;
    if (!h.overwatch || hitChance(s, h, mover, true) === null) continue;
    h.overwatch = false;
    out.push(shoot(s, h, mover, true));
  }
  return out;
}

export function checkEnd(s: GameState) {
  if (living(s, 'alien').length === 0) s.status = 'won';
  else if (living(s, 'human').length === 0) s.status = 'lost';
}
