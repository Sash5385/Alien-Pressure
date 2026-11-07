import type { Difficulty } from './types';

export const DIFF: Record<Difficulty, { label: string; hp: number; aim: number; kits: number }> = {
  easy: { label: 'Лёгкая', hp: 0.8, aim: -10, kits: 3 },
  normal: { label: 'Обычная', hp: 1, aim: 0, kits: 2 },
  hard: { label: 'Тяжёлая', hp: 1.25, aim: 8, kits: 1 },
};
