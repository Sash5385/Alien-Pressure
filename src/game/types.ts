import type { TraitId } from './traits';

export type UnitKind = 'soldier' | 'trooper' | 'sniper' | 'psi' | 'heavy' | 'commander';
export type ClassId = 'assault' | 'sniper' | 'medic' | 'engineer';
export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'launcher' | 'mortar' | 'ags';
export type LaunchKind = 'ugl' | 'launcher' | 'mortar' | 'ags';
export type ArmorId = 'none' | 'vest' | 'plate' | 'exo';
export const STEP = 0.55; // высота одного уровня рельефа, в клетках
export type Look = '' | 'tree' | 'bush' | 'rock' | 'house' | 'crate' | 'container';
export interface House { x: number; y: number; w: number; h: number; id: number; hp: number }
export type Stance = 'stand' | 'kneel' | 'prone';
export type Biome = 'ruins' | 'forest' | 'lake';
export type Terrain = 'ground' | 'water';
export type Objective = 'clear' | 'extract' | 'hold' | 'assassinate' | 'sabotage' | 'defend';
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
  stance: Stance; // стоя / на колене / лёжа
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
  grp?: number; // тактическая группа пришельцев
  retreatUntil?: number; // до какого хода держит оборону после отхода
  ugl?: number; // выстрелов подствольника
  cd?: number; // реальное время: секунд до следующего действия
  dest?: { x: number; y: number }; // приказ «идти» (реальное время)
  atk?: number; // приказ «атаковать» (id цели)
  busyRt?: boolean; // выполняет действие (анимация)
  down?: boolean; // тяжело ранен: лежит, можно поднять
  bleedOut?: number; // ходов до смерти
  revived?: boolean; // уже падал в этой миссии
}

export interface GameState {
  size: number;
  cover: Cover[][]; // cover[y][x]
  height: number[][]; // уровень рельефа 0–3: подъём на 1 проходим, обрыв (2+) — нет
  look: Look[][]; // вид укрытия (дерево, камень, дом…)
  houses: House[];
  trenches: { x: number; y: number }[]; // окопы
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
  boss?: boolean; // миссия с боссом (ликвидация)
  rt?: { speed: 0.5 | 1; paused: boolean; clock: number; pulseAt: number; planAt: number; auto: boolean }; // режим реального времени
  smokes?: { x: number; y: number; ttl: number }[]; // дым: закрывает обзор
  smokeMode?: boolean; // прицел дымовой гранаты
  launch?: LaunchKind; // прицел гранатомёта/миномёта/подствольника (вместе с aiming 'grenade')
  weather?: string; // принудительная погода миссии
  sides?: 'all' | 'ns'; // откуда идут волны обороны
  waveBoost?: number; // добавка к размеру волн
  defendName?: string; // название варианта обороны
  undo?: { id: number; x: number; y: number; ap: number; stance: Stance; overwatch: boolean; facing: number; fp: string; vis: number }; // отмена последнего хода
}
