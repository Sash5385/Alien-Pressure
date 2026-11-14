import { rand } from './combat';
import { pickTraits, ROSTER, shuffle, XP_STEPS } from './traits';
import { CLASS_IDS } from './classes';
import { ARMORS, WEAPONS } from './weapons';
import { DEFEND_KINDS } from './mission';
import type { ArmorId, Biome, ClassId, Difficulty, GameState, Objective, PerkId, Soldier, Tech, WeaponId } from './types';

/** Вариант следующей миссии на карте операций. */
export interface MissionOption { objective: Objective; biome: Biome; boss: boolean; risky: boolean; variant?: number }

export interface Campaign {
  v: 1;
  rng: number;
  difficulty: Difficulty;
  missionNo: number;
  objective: Objective;
  biome: Biome;
  mapSize: 44 | 64 | 640 | 1024; // размер карты миссий (640 и 1024 — огромный лес с засадами)
  roster: Soldier[];
  fallen: { name: string; mission: number }[];
  scrap: number;
  tech: Tech;
  nextId: number;
  over: boolean;
  weapons: WeaponId[]; // разблокированное оружие
  armors: ArmorId[]; // разблокированная броня
  boss: boolean; // следующая миссия — с боссом
  risky: boolean; // рискованная: +2 пехотинца, +3 трофея
  variant: number; // вариант обороны (DEFEND_KINDS)
  rt: boolean; // бой в реальном времени (с паузой)
  options: MissionOption[]; // карта операций: выбор следующей миссии
  sandbox?: boolean; // песочница: всё открыто и бесплатно, любая миссия, отряд не кончается
}

export const OBJECTIVE_NAME: Record<Objective, string> = {
  clear: 'Зачистка',
  extract: 'Эвакуация',
  hold: 'Удержание',
  defend: 'Оборона',
  assassinate: 'Ликвидация',
  sabotage: 'Диверсия',
};

export const MAX_ROSTER = 6;
export const DEPLOY = 4;
export const COST = { heal: 1, recruit: 3, armor: 6, optics: 6, kits: 4, grenades: 4 } as const;
export const TECH_INFO: Record<keyof Tech, string> = {
  armor: 'Бронепластины: +2 HP всем',
  optics: 'Оптика: +5 к меткости всем',
  kits: 'Запас бинтов: +1 аптечка на миссию',
  grenades: 'Гранаты: +1 каждому бойцу',
};

const KEY = 'alien-pressure:v1';
const KEY_SB = 'alien-pressure:sandbox'; // песочница сохраняется отдельно от кампании

function mkSoldier(c: Campaign, name: string, bio: string, cls?: ClassId): Soldier {
  const count = (k: ClassId) => c.roster.filter(r => r.cls === k).length;
  cls ??= [...CLASS_IDS].sort((a, b) => count(a) - count(b) || rand(c) - 0.5)[0]; // самый редкий класс
  return { id: c.nextId++, name, bio, traits: pickTraits(c), hpLoss: 0, fracture: false, kills: 0, missions: 0, xp: 0, rank: 0, perks: [], perkPoints: 0, weapon: 'rifle', armor: 'none', cls };
}

export function newCampaign(difficulty: Difficulty, seed = Date.now() >>> 0, sandbox = false): Campaign {
  const c: Campaign = {
    v: 1, rng: seed, difficulty, missionNo: 1, objective: 'clear', biome: 'ruins', mapSize: 44, roster: [], fallen: [], scrap: 3,
    tech: { armor: false, optics: false, kits: false, grenades: false }, nextId: 1, over: false, weapons: ['rifle', 'smg'], armors: ['none'], boss: false, risky: false, variant: 0, rt: false, options: [],
  };
  for (const r of shuffle(ROSTER, c).slice(0, DEPLOY)) c.roster.push(mkSoldier(c, r.name, r.bio));
  c.biome = pickBiome(c);
  c.options = [{ objective: 'clear', biome: c.biome, boss: false, risky: false }, ...pickOptions(c).filter(o => o.objective === 'defend').slice(0, 2)];
  if (sandbox) fillSandbox(c);
  return c;
}

/** Песочница: открыто всё оружие, броня и технологии, трофеев сколько угодно, отряд полный и здоровый. */
export function fillSandbox(c: Campaign) {
  c.sandbox = true;
  c.weapons = Object.keys(WEAPONS) as WeaponId[];
  c.armors = Object.keys(ARMORS) as ArmorId[];
  c.tech = { armor: true, optics: true, kits: true, grenades: true };
  c.scrap = 9999; c.over = false;
  for (let i = 0; i < 12 && c.roster.length < MAX_ROSTER; i++) if (recruit(c)) break;
  c.scrap = 9999;
  for (const x of c.roster) { x.hpLoss = 0; x.fracture = false; }
}

/** Песочница: выбрать любую миссию (задание, оборона, биом, босс, риск). */
export function sandboxMission(c: Campaign, o: MissionOption): string | null {
  c.options = [o];
  return chooseOption(c, 0);
}

const pickBiome = (c: Campaign): Biome => (['ruins', 'forest', 'lake'] as const)[Math.floor(rand(c) * 3)];

export const maxHpOf = (s: Soldier, t: Tech) =>
  8 + (s.traits.includes('tough') ? 3 : 0) + (t.armor ? 2 : 0) + ARMORS[s.armor].hp + s.perks.filter(p => p === 'hp').length * 2;

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
const OBJS = ['clear', 'extract', 'hold', 'assassinate', 'sabotage', 'defend'] as const;

/** Карта операций: 3 разных задания; каждая 5-я миссия — босс (единственный вариант). */
export function pickOptions(c: Campaign): MissionOption[] {
  if (c.missionNo % 5 === 0) return [{ objective: 'assassinate', biome: pickBiome(c), boss: true, risky: false }];
  const others = shuffle(OBJS.filter(o => o !== 'defend'), c);
  const vs = shuffle(Array.from({ length: DEFEND_KINDS.length }, (_, i) => i), c);
  // чаще всего предлагаем оборону в центре карты: два варианта из трёх
  const list: MissionOption[] = [
    { objective: others[0], biome: pickBiome(c), boss: false, risky: false },
    { objective: 'defend', biome: pickBiome(c), boss: false, risky: false, variant: vs[0] },
    { objective: 'defend', biome: pickBiome(c), boss: false, risky: true, variant: vs[1] },
  ];
  return shuffle(list, c);
}
export function chooseOption(c: Campaign, i: number): string | null {
  const o = c.options[i];
  if (!o) return 'Нет такого задания';
  c.objective = o.objective; c.biome = o.biome; c.boss = o.boss; c.risky = o.risky; c.variant = o.variant ?? 0;
  return null;
}

export function finishMission(c: Campaign, s: GameState, deployed: number[]) {
  const keep: MissionOption = { objective: c.objective, biome: c.biome, boss: c.boss, risky: c.risky, variant: c.variant };
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
    c.scrap += 3 + c.missionNo + (c.objective === 'clear' ? 0 : c.objective === 'assassinate' || c.objective === 'sabotage' ? 3 : 2) + (c.boss ? 4 : 0) + (c.risky ? 3 : 0);
    c.missionNo += 1;
    c.options = pickOptions(c);
    chooseOption(c, 0);
  } else c.over = true;
  if (c.roster.length === 0) c.over = true;
  if (c.sandbox) { fillSandbox(c); sandboxMission(c, keep); } // песочница: миссия и отряд сохраняются
}

export function save(c: Campaign) {
  try { localStorage.setItem(c.sandbox ? KEY_SB : KEY, JSON.stringify(c)); } catch { /* нет доступа к хранилищу */ }
}
export function load(sandbox = false): Campaign | null {
  try {
    const raw = localStorage.getItem(sandbox ? KEY_SB : KEY);
    const c = raw ? (JSON.parse(raw) as Campaign) : null;
    if (!c || c.v !== 1) return null;
    c.objective ??= 'clear';
    c.tech.grenades ??= false;
    c.biome ??= 'ruins';
    c.mapSize ??= 44;
    c.weapons ??= ['rifle', 'smg'];
    c.armors ??= ['none'];
    c.boss ??= false; c.risky ??= false; c.variant ??= 0; c.rt ??= false;
    c.options ??= [{ objective: c.objective, biome: c.biome, boss: false, risky: false }];
    for (const s of c.roster) { s.xp ??= 0; s.rank ??= 0; s.perks ??= []; s.perkPoints ??= 0; s.weapon ??= 'rifle'; s.armor ??= 'none'; s.cls ??= 'assault'; }
    return c;
  } catch { return null; }
}
export function clearSave(sandbox = false) {
  try { localStorage.removeItem(sandbox ? KEY_SB : KEY); } catch { /* ignore */ }
}

export function choosePerk(c: Campaign, id: number, perk: PerkId): string | null {
  const s = c.roster.find(x => x.id === id);
  if (!s || s.perkPoints <= 0) return 'Нет очков повышения.';
  s.perks.push(perk);
  s.perkPoints -= 1;
  return null;
}

/** Разблокировка оружия/брони за трофеи. */
export function unlock(c: Campaign, kind: 'weapon' | 'armor', id: WeaponId | ArmorId): string | null {
  const list = kind === 'weapon' ? c.weapons : c.armors;
  const cost = kind === 'weapon' ? WEAPONS[id as WeaponId].cost : ARMORS[id as ArmorId].cost;
  if ((list as string[]).includes(id)) return 'Уже открыто.';
  if (c.scrap < cost) return 'Не хватает трофеев.';
  c.scrap -= cost;
  (list as string[]).push(id);
  return null;
}

export function equip(c: Campaign, soldierId: number, kind: 'weapon' | 'armor', id: WeaponId | ArmorId): string | null {
  const s = c.roster.find(x => x.id === soldierId);
  const list = (kind === 'weapon' ? c.weapons : c.armors) as string[];
  if (!s || !list.includes(id)) return 'Недоступно.';
  if (kind === 'weapon') s.weapon = id as WeaponId; else s.armor = id as ArmorId;
  return null;
}

// --- сохранение посреди миссии ---
const MKEY = 'alien-pressure:mission';
export interface MissionSave { state: GameState; deployed: number[]; before: Campaign }

export function saveMission(m: MissionSave) {
  try { localStorage.setItem(MKEY, JSON.stringify(m)); } catch { /* ignore */ }
}
export function loadMission(): MissionSave | null {
  try {
    const raw = localStorage.getItem(MKEY);
    const m = raw ? (JSON.parse(raw) as MissionSave) : null;
    if (!m || m.state.status !== 'playing' || !Array.isArray(m.state.barrels) || !Array.isArray(m.state.mines) || !Array.isArray(m.state.height) || (m.state.size !== 44 && m.state.size !== 64)) return null; // старые сохранения несовместимы
    m.state.busy = false; m.state.aiming = null; m.state.turning = false; m.state.turn = 'human';
    return m;
  } catch { return null; }
}
export function clearMission() {
  try { localStorage.removeItem(MKEY); } catch { /* ignore */ }
}

export function setClass(c: Campaign, soldierId: number, cls: ClassId): string | null {
  const s = c.roster.find(x => x.id === soldierId);
  if (!s) return 'Недоступно.';
  s.cls = cls;
  return null;
}

export function setRt(c: Campaign, on: boolean): string | null { c.rt = on; return null; }

export function setMapSize(c: Campaign, size: 44 | 64 | 640 | 1024): string | null {
  c.mapSize = size;
  if (size >= 640) c.rt = true; // на огромной карте пошаговый режим неудобен
  return null;
}
