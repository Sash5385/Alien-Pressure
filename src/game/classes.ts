import type { ClassId } from './types';

export const CLASSES: Record<ClassId, { name: string; passive: string; ability: string; desc: string }> = {
  assault: { name: 'Штурмовик', passive: 'ход +1', ability: 'Подавить', desc: 'Подавление: 1 AP и 2 патрона, цель теряет 25% меткости и 1 AP в свой ход.' },
  sniper: { name: 'Снайпер', passive: 'меткость +5', ability: 'Прицельный', desc: 'Прицельный выстрел: 2 AP, меткость +30.' },
  medic: { name: 'Медик', passive: 'бинт лечит +4 и бесплатный', ability: 'Лечение', desc: 'Лечение: 1 AP, 2 раза за миссию, +3 HP и остановка крови всем в радиусе 2.' },
  engineer: { name: 'Сапёр', passive: '+1 граната', ability: 'Мина', desc: 'Мина: 1 AP, 2 раза за миссию; ставится перед бойцом, взрывается под пришельцем (как граната).' },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
