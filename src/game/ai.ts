import { alienSees, canPsi, digIn, hitChance, trenchAt, triggerMine, living, psiAttack, raiseAlert, rand, reactions, reload, shoot, type ShotResult } from './combat';
import { findPath, reachable } from './pathfinding';
import type { GameState, Unit } from './types';
import type { GrenadeResult } from './combat';

export interface AiHooks {
  moved(u: Unit): Promise<void>; // позиции обновились — перерисовать
  shot(r: ShotResult): Promise<void>;
  alerted?(ids: number[]): void; // пришельцы заметили бойцов
  blast?(r: GrenadeResult): Promise<void>; // взрыв мины
}

/** Непредупреждённый пришелец бродит у своей точки; заметив бойца, поднимает тревогу в радиусе 8. */
async function patrol(s: GameState, u: Unit, h: AiHooks) {
  const cands: [number, number][] = [];
  for (const k of reachable(s, u.x, u.y, u.move).keys()) {
    const [x, y] = k.split(',').map(Number);
    if ((x !== u.x || y !== u.y) && Math.hypot(x - u.homeX, y - u.homeY) <= 6) cands.push([x, y]);
  }
  u.ap -= 1;
  if (!cands.length) return;
  const [tx, ty] = cands[Math.floor(rand(s) * cands.length)];
  for (const [x, y] of findPath(s, u.x, u.y, tx, ty, u.move)) {
    u.x = x; u.y = y;
    await h.moved(u);
    const mr = triggerMine(s, u);
    if (mr) await h.blast?.(mr);
    for (const r of reactions(s, u)) await h.shot(r);
    if (u.hp <= 0 || s.status !== 'playing') return;
    if (alienSees(s, u)) { h.alerted?.(raiseAlert(s, u.x, u.y, 8)); return; }
  }
}

/** Привлекательность цели: для обычной атаки — шанс попадания, для псионика — слабая мораль. */
function score(s: GameState, u: Unit, t: Unit): number | null {
  if (u.kind === 'psi') return canPsi(u, t) ? 100 - t.morale : null;
  return hitChance(s, u, t);
}

/** Желаемая дистанция до ближайшего бойца: снайпер и псионик держатся на расстоянии. */
const ideal = (u: Unit, near: number) =>
  u.kind === 'sniper' ? Math.abs(near - 10) : u.kind === 'psi' ? Math.abs(near - 7) : near;

/** ИИ: атакует лучшую цель, иначе идёт к клетке с обзором/укрытием на подходящей дистанции. */
export async function runAlienTurn(s: GameState, h: AiHooks) {
  s.revealed = [];
  for (const u of living(s, 'alien')) {
    u.ap = Math.max(1, u.maxAp - (u.suppressed ? 1 : 0));
    for (let i = 0; i < 3 && u.hp > 0 && u.ap > 0 && s.status === 'playing'; i++) {
      if (!u.alert && alienSees(s, u)) h.alerted?.(raiseAlert(s, u.x, u.y, 8));
      if (!u.alert) { await patrol(s, u, h); if (!u.alert) break; continue; }
      const humans = living(s, 'human');
      if (u.maxAmmo > 0 && u.ammo <= 0) { reload(s, u); continue; }
      const options = humans
        .map(t => ({ t, c: score(s, u, t) }))
        .filter((e): e is { t: Unit; c: number } => e.c !== null)
        .sort((a, b) => b.c - a.c);
      if (options.length) {
        const t = options[0].t;
        await h.shot(u.kind === 'psi' ? psiAttack(s, u, t) : shoot(s, u, t));
        // стрелки дальнего боя окапываются, если рядом нет укрытия
        const covered = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.cover[u.y + dy]?.[u.x + dx] && s.cover[u.y + dy][u.x + dx] !== 'none');
        if (u.hp > 0 && u.ap > 0 && ['sniper', 'heavy', 'commander'].includes(u.kind) && !covered && !trenchAt(s, u.x, u.y) && digIn(s, u)) await h.moved(u);
        continue;
      }

      let best: [number, number] | null = null;
      let bestScore = Infinity;
      for (const k of reachable(s, u.x, u.y, u.move).keys()) {
        const [x, y] = k.split(',').map(Number);
        if (x === u.x && y === u.y) continue;
        const ghost = { ...u, x, y };
        const near = Math.min(...humans.map(t => Math.hypot(t.x - x, t.y - y)));
        const seen = humans.some(t => score(s, ghost, t) !== null);
        const cov = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dx, dy]) => s.cover[y + dy]?.[x + dx] && s.cover[y + dy][x + dx] !== 'none');
        const sc = ideal(u, near) - (seen ? 3 : 0) - (cov ? 1.5 : 0) - s.height[y][x] * (u.kind === 'sniper' ? 1.5 : 0.7); // снайперы тянутся на высоту
        if (sc < bestScore) { bestScore = sc; best = [x, y]; }
      }
      if (!best) break;
      u.ap -= 1;
      for (const [x, y] of findPath(s, u.x, u.y, best[0], best[1], u.move)) {
        u.x = x; u.y = y;
        await h.moved(u);
        const mr = triggerMine(s, u);
        if (mr) await h.blast?.(mr);
        for (const r of reactions(s, u)) await h.shot(r);
        if (u.hp <= 0 || s.status !== 'playing') break;
      }
    }
  }
}
