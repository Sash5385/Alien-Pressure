import type { TraitId } from './traits';

export type UnitKind = 'soldier' | 'trooper' | 'sniper' | 'psi' | 'heavy' | 'commander';
export type ClassId = 'assault' | 'sniper' | 'medic' | 'engineer';
export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type ArmorId = 'none' | 'vest' | 'plate' | 'exo';
export type Biome = 'ruins' | 'forest' | 'lake';
export type Terrain = 'ground' | 'water';
export type Objective = 'clear' | 'extract' | 'hold' | 'assassinate' | 'sabotage';
export type PerkId = 'aim' | 'hp' | 'nerve';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Tech { armor: boolean; optics: boolean; kits: boolean; grenades: boolean }

/** Боец кампании: хранится между миссиями. */
export interface Soldier {
  id: number;
  name: string;
  bio: string;
  traits: TraitId[];
  hpLoss: number;
  fracture: boolean;
  kills: number;
  missions: number;
  xp: number;
  rank: number;
  perks: PerkId[];
  perkPoints: number;
  weapon: WeaponId;
  armor: ArmorId;
  cls: ClassId;
}

export type Team = 'human' | 'alien';
export type Cover = 'none' | 'half' | 'full';

export interface Unit {
  id: number;
  team: Team;
  kind: UnitKind;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  move: number; // клеток за 1 AP
  aim: number; // базовая меткость, %
  ammo: number;
  maxAmmo: number;
  weapon: WeaponId;
  armor: ArmorId;
  burst: number;
  falloffFrom: number;
  falloff: number;
  cut: number; // снижение урона от попадания (броня)
  cls: ClassId;
  abilityUsed: number; // применений умения за миссию
  suppressed: boolean; // подавлен: −25% меткости и −1 AP в свой ход
  alert: boolean; // пришелец знает о бойцах (иначе патрулирует)
  homeX: number;
  homeY: number;
  grenades: number;
  facing: number; // радианы: 0 — на юг (+Z), π — на север
  mags: number; // запасные магазины (у пришельцев не ограничены)
  dmg: [number, number];
  range: number;
  overwatch: boolean;
  bleeding: boolean; // −1 HP в начале хода, пока не перевязан
  fracture: boolean; // −20% меткости, −2 к ходу
  morale: number; // 0–100; <50 — штраф к меткости, <30 — паника
  panic: boolean;
  traits: TraitId[];
  perks: PerkId[];
  bio: string;
  kills: number;
}

export interface GameState {
  size: number;
  cover: Cover[][]; // cover[y][x]
  terrain: Terrain[][]; // вода непроходима, но не мешает видеть и стрелять
  biome: Biome;
  units: Unit[];
  selectedId: number | null;
  targetId: number | null;
  turn: Team;
  turnNo: number;
  status: 'playing' | 'won' | 'lost';
  medkits: number;
  vis: boolean[][]; // что видят бойцы сейчас
  seen: boolean[][]; // что исследовано
  revealed: number[]; // пришельцы, выдавшие себя выстрелом
  missionNo: number;
  difficulty: Difficulty;
  objective: Objective;
  markId: number | null; // помеченная цель (командир) видна всегда
  beacons: { x: number; y: number; done: boolean }[];
  holdTurns: number;
  zone: { x: number; y: number; w: number; h: number } | null;
  aiming: 'grenade' | null; // режим прицеливания гранаты
  mines: { x: number; y: number; owner: number }[];
  barrels: { x: number; y: number }[]; // взрывоопасные бочки (половинное укрытие)
  fires: { x: number; y: number; ttl: number }[]; // горящие клетки: непроходимы, жгут стоящих
  scorched: boolean[][]; // выжженное не загорается снова
  bridges: { x: number; y: number }[]; // мосты (визуально) на бродах
  targetBarrel: { x: number; y: number } | null;
  turning: boolean; // режим «повернуть бойца» (тач)
  busy: boolean; // идёт анимация/ход ИИ — ввод заблокирован
  log: string[];
  rng: number; // состояние генератора (сид миссии)
}
