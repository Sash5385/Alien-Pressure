// Достижения и статистика кампании.
import type { GameState } from './types';

export interface Stats { kills: number; wins: number; upKills: number; rescues: number; sabotages: number; hits: number; breaches: number; flawless: number; locs: number; losses: number }
export const emptyStats = (): Stats => ({ kills: 0, wins: 0, upKills: 0, rescues: 0, sabotages: 0, hits: 0, breaches: 0, flawless: 0, locs: 0, losses: 0 });

export const ACH: { id: string; icon: string; name: string; desc: string; ok: (s: Stats) => boolean; prog: (s: Stats) => [number, number] }[] = [
  { id: 'first', icon: '🎖', name: 'Перша перемога', desc: 'Виграти місію', ok: s => s.wins >= 1, prog: s => [s.wins, 1] },
  { id: 'k10', icon: '🎯', name: 'Мисливець', desc: '10 убивств', ok: s => s.kills >= 10, prog: s => [s.kills, 10] },
  { id: 'k100', icon: '💀', name: 'Ветеран', desc: '100 убивств', ok: s => s.kills >= 100, prog: s => [s.kills, 100] },
  { id: 'k500', icon: '☠', name: 'Легенда', desc: '500 убивств', ok: s => s.kills >= 500, prog: s => [s.kills, 500] },
  { id: 'up10', icon: '🏢', name: 'Із висоти', desc: '10 убивств із верхніх поверхів', ok: s => s.upKills >= 10, prog: s => [s.upKills, 10] },
  { id: 'breach', icon: '💥', name: 'Підривник', desc: 'Пробити 20 стін вибухами', ok: s => s.breaches >= 20, prog: s => [s.breaches, 20] },
  { id: 'resc', icon: '🆘', name: 'Рятівник', desc: 'Виграти місію «Порятунок»', ok: s => s.rescues >= 1, prog: s => [s.rescues, 1] },
  { id: 'sab', icon: '💣', name: 'Диверсант', desc: 'Виграти місію «Диверсія»', ok: s => s.sabotages >= 1, prog: s => [s.sabotages, 1] },
  { id: 'hit', icon: '🎯', name: 'Ліквідатор', desc: 'Виграти місію «Ліквідація»', ok: s => s.hits >= 1, prog: s => [s.hits, 1] },
  { id: 'flaw', icon: '🛡', name: 'Без втрат', desc: '3 перемоги без жодної втрати', ok: s => s.flawless >= 3, prog: s => [s.flawless, 3] },
  { id: 'l5', icon: '🗺', name: 'Мандрівник', desc: 'Зачистити 5 локацій', ok: s => s.locs >= 5, prog: s => [s.locs, 5] },
  { id: 'l25', icon: '🌍', name: 'Підкорювач', desc: 'Зачистити 25 локацій', ok: s => s.locs >= 25, prog: s => [s.locs, 25] },
  { id: 'l50', icon: '👑', name: 'Володар світу', desc: 'Зачистити всі 50 локацій', ok: s => s.locs >= 50, prog: s => [s.locs, 50] },
];

/** Оновити статистику по підсумках місії; повертає нові досягнення. */
export function recordMission(stats: Stats, have: string[], s: GameState, deployedAlive: number, deployed: number, locsCleared: number): string[] {
  const kills = s.units.filter(u => u.team === 'human').reduce((a, u) => a + u.kills, 0);
  stats.kills += kills; stats.upKills += s.upKills ?? 0; stats.breaches += s.breaches ?? 0;
  if (s.status === 'won') {
    stats.wins++;
    if (s.objective === 'rescue') stats.rescues++;
    if (s.objective === 'sabotage') stats.sabotages++;
    if (s.objective === 'assassinate') stats.hits++;
    if (deployedAlive === deployed) stats.flawless++;
  } else stats.losses++;
  stats.locs = locsCleared;
  const fresh = ACH.filter(a => !have.includes(a.id) && a.ok(stats)).map(a => a.id);
  have.push(...fresh);
  return fresh;
}
