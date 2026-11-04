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
}

export interface GameState {
  size: number;
  cover: Cover[][]; // cover[y][x]
  units: Unit[];
  selectedId: number | null;
  turn: Team;
  turnNo: number;
}
