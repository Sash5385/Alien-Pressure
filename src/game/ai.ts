import { canPsi, hitChance, living, psiAttack, reactions, shoot, type ShotResult } from './combat';
import { findPath, reachable } from './pathfinding';
import type { GameState, Unit } from './types';

export interface AiHooks {
  moved(): Promise<void>; // позиции обновились — перерисовать
  shot(r: ShotResult): Promise<void>;
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
    u.ap = u.maxAp;
    for (let i = 0; i < 3 && u.hp > 0 && u.ap > 0 && s.status === 'playing'; i++) {
      const humans = living(s, 'human');
      const options = humans
        .map(t => ({ t, c: score(s, u, t) }))
        .filter((e): e is { t: Unit; c: number } => e.c !== null)
        .sort((a, b) => b.c - a.c);
      if (options.length) {
        const t = options[0].t;
        await h.shot(u.kind === 'psi' ? psiAttack(s, u, t) : shoot(s, u, t));
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
        const sc = ideal(u, near) - (seen ? 3 : 0) - (cov ? 1.5 : 0);
        if (sc < bestScore) { bestScore = sc; best = [x, y]; }
      }
      if (!best) break;
      u.ap -= 1;
      for (const [x, y] of findPath(s, u.x, u.y, best[0], best[1], u.move)) {
        u.x = x; u.y = y;
        await h.moved();
        for (const r of reactions(s, u)) await h.shot(r);
        if (u.hp <= 0 || s.status !== 'playing') break;
      }
    }
  }
}
