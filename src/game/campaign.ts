import { rand } from './combat';
import { pickTraits, ROSTER, shuffle, XP_STEPS } from './traits';
import type { Difficulty, GameState, Objective, PerkId, Soldier, Tech } from './types';

export interface Campaign {
  v: 1;
  rng: number;
  difficulty: Difficulty;
  missionNo: number;
  objective: Objective;
  roster: Soldier[];
  fallen: { name: string; mission: number }[];
  scrap: number;
  tech: Tech;
  nextId: number;
  over: boolean;
}

export const OBJECTIVE_NAME: Record<Objective, string> = {
  clear: 'Зачистка',
  extract: 'Эвакуация',
  hold: 'Удержание',
};

export const MAX_ROSTER = 6;
export const DEPLOY = 4;
export const COST = { heal: 1, recruit: 3, armor: 6, optics: 6, kits: 4 } as const;
export const TECH_INFO: Record<keyof Tech, string> = {
  armor: 'Бронепластины: +2 HP всем',
  optics: 'Оптика: +5 к меткости всем',
  kits: 'Запас бинтов: +1 аптечка на миссию',
};

const KEY = 'alien-pressure:v1';

function mkSoldier(c: Campaign, name: string, bio: string): Soldier {
  return { id: c.nextId++, name, bio, traits: pickTraits(c), hpLoss: 0, fracture: false, kills: 0, missions: 0, xp: 0, rank: 0, perks: [], perkPoints: 0 };
}

export function newCampaign(difficulty: Difficulty, seed = Date.now() >>> 0): Campaign {
  const c: Campaign = {
    v: 1, rng: seed, difficulty, missionNo: 1, objective: 'clear', roster: [], fallen: [], scrap: 3,
    tech: { armor: false, optics: false, kits: false }, nextId: 1, over: false,
  };
  for (const r of shuffle(ROSTER, c).slice(0, DEPLOY)) c.roster.push(mkSoldier(c, r.name, r.bio));
  return c;
}

export const maxHpOf = (s: Soldier, t: Tech) =>
  8 + (s.traits.includes('tough') ? 3 : 0) + (t.armor ? 2 : 0) + s.perks.filter(p => p === 'hp').length * 2;

/** Все действия лагеря возвращают текст ошибки или null. */
export function recruit(c: Campaign): string | null {
  if (c.roster.length >= MAX_ROSTER) return 'Лагерь полон.';
  if (c.scrap < COST.recruit) return 'Не хватает трофеев.';
  const used = new Set([...c.roster.map(s => s.name), ...c.fallen.map(f => f.name)]);
  const r = ROSTER.find(x => !used.has(x.name));
  c.scrap -= COST.recruit;
  c.roster.push(r ? mkSoldier(c, r.name, r.bio) : mkSoldier(c, `Рекрут ${c.nextId}`, 'Доброволец без опыта.'));
  return null;
}

export function heal(c: Campaign, id: number): string | null {
  const s = c.roster.find(x => x.id === id);
  if (!s || (s.hpLoss === 0 && !s.fracture)) return 'Лечение не нужно.';
  if (c.scrap < COST.heal) return 'Не хватает трофеев.';
  c.scrap -= COST.heal;
  s.hpLoss = 0;
  s.fracture = false;
  return null;
}

export function buy(c: Campaign, key: keyof Tech): string | null {
  if (c.tech[key]) return 'Уже изучено.';
  if (c.scrap < COST[key]) return 'Не хватает трофеев.';
  c.scrap -= COST[key];
  c.tech[key] = true;
  return null;
}

/** Итоги миссии: раны остаются, павшие уходят в мемориал, победа даёт трофеи. */
export function finishMission(c: Campaign, s: GameState, deployed: number[]) {
  for (const sol of [...c.roster]) {
    if (!deployed.includes(sol.id)) continue;
    const u = s.units.find(x => x.id === sol.id);
    if (!u || u.hp <= 0) {
      c.roster = c.roster.filter(x => x.id !== sol.id);
      c.fallen.push({ name: sol.name, mission: c.missionNo });
      continue;
    }
    sol.hpLoss = Math.max(0, u.maxHp - u.hp);
    sol.fracture = u.fracture;
    sol.kills += u.kills;
    sol.missions += 1;
    sol.xp += u.kills * 2 + 1 + (s.status === 'won' ? 1 : 0);
    while (sol.rank < XP_STEPS.length && sol.xp >= XP_STEPS[sol.rank]) { sol.rank += 1; sol.perkPoints += 1; }
  }
  c.roster.forEach(x => { x.hpLoss = Math.max(0, x.hpLoss - 3); }); // отдых между миссиями
  c.rng = (s.rng + Math.floor(rand(c) * 1e6)) >>> 0;
  if (s.status === 'won') {
    c.scrap += 3 + c.missionNo + (c.objective === 'clear' ? 0 : 2);
    c.missionNo += 1;
    c.objective = (['clear', 'extract', 'hold'] as const)[Math.floor(rand(c) * 3)];
  } else c.over = true;
  if (c.roster.length === 0) c.over = true;
}

export function save(c: Campaign) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* нет доступа к хранилищу */ }
}
export function load(): Campaign | null {
  try {
    const raw = localStorage.getItem(KEY);
    const c = raw ? (JSON.parse(raw) as Campaign) : null;
    if (!c || c.v !== 1) return null;
    c.objective ??= 'clear';
    for (const s of c.roster) { s.xp ??= 0; s.rank ??= 0; s.perks ??= []; s.perkPoints ??= 0; }
    return c;
  } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function choosePerk(c: Campaign, id: number, perk: PerkId): string | null {
  const s = c.roster.find(x => x.id === id);
  if (!s || s.perkPoints <= 0) return 'Нет очков повышения.';
  s.perks.push(perk);
  s.perkPoints -= 1;
  return null;
}
