import type { Difficulty } from './types';

export const DIFF: Record<Difficulty, { label: string; hp: number; aim: number; kits: number }> = {
  easy: { label: 'Легка', hp: 0.8, aim: -10, kits: 3 },
  normal: { label: 'Звичайна', hp: 1, aim: 0, kits: 2 },
  hard: { label: 'Важка', hp: 1.25, aim: 8, kits: 1 },
};

import type { Biome } from './types';

export const BIOME_NAME: Record<Biome, string> = { ruins: 'Руїни біля корабля', forest: 'Ліс', lake: 'Берег річки' };
