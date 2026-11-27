// Двери: закрытые блокируют обзор; в них можно войти (открываются), открыть тихо или выбить.
import { log } from './combat';
import type { GameState, Unit } from './types';
import type { BuildingSpec } from '../render/buildings';

/** Клетка двери здания (в стене-фасаде). */
export const doorTile = (sp: BuildingSpec) => ({ x: sp.x! + (sp.w >> 1), y: sp.y! + sp.d - 1 });

/** Открыть дверь в клетке (если она закрыта). broken — выбить. Возвращает true, если дверь была закрыта. */
export function openDoorAt(s: GameState, x: number, y: number, broken = false): boolean {
  if (s.look[y]?.[x] !== 'door') return false;
  const sp = s.bldgs?.find(b => doorTile(b).x === x && doorTile(b).y === y);
  s.cover[y][x] = 'none'; s.look[y][x] = '';
  if (sp) { sp.door = broken ? 'broken' : 'open'; sp.rev = (sp.rev ?? 0) + 1; }
  return true;
}

/** Закрытая дверь рядом с бойцом (клетка двери в соседней клетке по стороне). */
export function nearDoor(s: GameState, u: Unit): { x: number; y: number } | undefined {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = u.x + dx, y = u.y + dy; if (s.look[y]?.[x] === 'door') return { x, y }; }
  return undefined;
}
export function openQuiet(s: GameState, u: Unit): boolean {
  const d = nearDoor(s, u); if (!d || u.ap <= 0 || u.down) return false;
  u.ap -= 1; u.overwatch = false; openDoorAt(s, d.x, d.y); log(s, `${u.name} тихо відчиняє двері.`); return true;
}
/** Выбить дверь: шумно (слышно в 12 клетках), с шансом 70%; неудача тоже шумит. */
export function kickDoor(s: GameState, u: Unit): boolean {
  const d = nearDoor(s, u); if (!d || u.ap <= 0 || u.down) return false;
  u.ap -= 1; u.overwatch = false;
  const ok = ((s.rng = (Math.imul(s.rng ^ (s.rng >>> 15), 2246822507) + 0x9e3779b9) >>> 0) >>> 8) / 16777216 < 0.7;
  (s.noise ??= []).push({ x: d.x, y: d.y, r: ok ? 12 : 8 });
  if (ok) { openDoorAt(s, d.x, d.y, true); log(s, `${u.name} вибиває двері!`); } else log(s, `${u.name} б'є у двері — не піддаються.`);
  return true;
}
