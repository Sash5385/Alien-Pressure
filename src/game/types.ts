import type { TraitId } from './traits';

export type UnitKind = 'soldier' | 'trooper' | 'sniper' | 'psi' | 'heavy';
export type Objective = 'clear' | 'extract' | 'hold';
export type PerkId = 'aim' | 'hp' | 'nerve';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Tech { armor: boolean; optics: boolean; kits: boolean }

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
  holdTurns: number;
  zone: { x: number; y: number; w: number; h: number } | null;
  busy: boolean; // идёт анимация/ход ИИ — ввод заблокирован
  log: string[];
  rng: number; // состояние генератора (сид миссии)
}
