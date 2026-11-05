export type Team = 'human' | 'alien';
export type Cover = 'none' | 'half' | 'full';

export interface Unit {
  id: number;
  team: Team;
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
  busy: boolean; // идёт анимация/ход ИИ — ввод заблокирован
  log: string[];
  rng: number; // состояние генератора (сид миссии)
}
