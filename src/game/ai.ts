import { hitChance, living, reactions, shoot, type ShotResult } from './combat';
import { findPath, reachable } from './pathfinding';
import type { GameState } from './types';

export interface AiHooks {
  moved(): Promise<void>; // позиции обновились — перерисовать
  shot(r: ShotResult): Promise<void>;
}

/** Простой ИИ пехоты: стреляет по лучшему шансу, иначе идёт к клетке с обзором/укрытием, ближе к бойцам. */
export async function runAlienTurn(s: GameState, h: AiHooks) {
  for (const u of living(s, 'alien')) {
    u.ap = u.maxAp;
    for (let i = 0; i < 3 && u.hp > 0 && u.ap > 0 && s.status === 'playing'; i++) {
      const humans = living(s, 'human');
      const shootable = humans
        .map(t => ({ t, c: hitChance(s, u, t) }))
        .filter((e): e is { t: typeof e.t; c: number } => e.c !== null)
        .sort((a, b) => b.c - a.c);
      if (shootable.length) { await h.shot(shoot(s, u, shootable[0].t)); continue; }

      let best: [number, number] | null = null;
      let bestScore = Infinity;
      for (const k of reachable(s, u.x, u.y, u.move).keys()) {
        const [x, y] = k.split(',').map(Number);
        if (x === u.x && y === u.y) continue;
        const ghost = { ...u, x, y };
        const near = Math.min(...humans.map(t => Math.hypot(t.x - x, t.y - y)));
        const seen = humans.some(t => hitChance(s, ghost, t) !== null);
        const cov = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dx, dy]) => s.cover[y + dy]?.[x + dx] && s.cover[y + dy][x + dx] !== 'none');
        const score = near - (seen ? 3 : 0) - (cov ? 1.5 : 0);
        if (score < bestScore) { bestScore = score; best = [x, y]; }
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
