import type { ArmorId, LaunchKind, WeaponId } from './types';

export interface WeaponDef {
  name: string;
  desc: string;
  aim: number;
  dmg: [number, number];
  ammo: number;
  range: number;
  burst: number; // патронов в очереди (визуально)
  falloffFrom: number; // с какой дистанции падает меткость
  falloff: number; // % за клетку сверх этого
  move: number; // бонус/штраф к ходу
  cost: number; // трофеев за разблокировку
  launch?: LaunchKind; // оружие стреляет гранатами по клетке
  kg: number; // вес, кг
}

import { CATALOG, specDesc } from './catalog';
const BASE: Record<string, WeaponDef> = {
  rifle: { kg: 3.6, name: 'Автомат', desc: 'Універсальний: дальність 14, 5 набоїв', aim: 70, dmg: [2, 4], ammo: 5, range: 14, burst: 3, falloffFrom: 6, falloff: 3, move: 0, cost: 0 },
  smg: { kg: 2.9, name: 'Пістолет-кулемет', desc: '8 набоїв, хід +1, дальність 10', aim: 78, dmg: [2, 4], ammo: 8, range: 10, burst: 4, falloffFrom: 5, falloff: 3, move: 1, cost: 0 },
  shotgun: { kg: 3.8, name: 'Дробовик', desc: 'Шкода 4–6, але влучність швидко падає далі 3 клітинок', aim: 80, dmg: [4, 6], ammo: 3, range: 8, burst: 1, falloffFrom: 3, falloff: 6, move: 0, cost: 5 },
  sniper: { kg: 5.2, name: 'Снайперська гвинтівка', desc: 'Дальність 20, шкода 3–5, 3 набої, хід −1', aim: 70, dmg: [3, 5], ammo: 3, range: 20, burst: 1, falloffFrom: 10, falloff: 1, move: -1, cost: 7 },
  launcher: { kg: 7.5, name: 'Гранатомет', desc: 'Граната по видимій точці: дальність 3–13, вибух радіусом 1,5, 2 заряди, хід −1', aim: 60, dmg: [0, 0], ammo: 2, range: 13, burst: 1, falloffFrom: 99, falloff: 0, move: -1, cost: 8, launch: 'launcher' },
  mortar: { kg: 12, name: 'Міномет', desc: 'Навісом по будь-якій дослідженій клітинці без лінії вогню: дальність 7–24, радіус 2, 2 AP, 3 міни, хід −2', aim: 60, dmg: [0, 0], ammo: 3, range: 24, burst: 1, falloffFrom: 99, falloff: 0, move: -2, cost: 10, launch: 'mortar' },
  ags: { kg: 14, name: 'АГС', desc: 'Станковий автоматичний гранатомет: 2 AP, залп із трьох гранат із розкидом, радіус 1, 6 гранат, хід −2', aim: 60, dmg: [0, 0], ammo: 6, range: 14, burst: 3, falloffFrom: 99, falloff: 0, move: -2, cost: 12, launch: 'ags' },
};

/** Базовые 7 видов и каталог из 100 (пистолеты, автоматы, винтовки, пулемёты). */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ...BASE,
  ...Object.fromEntries(CATALOG.map(g => [g.id, { name: g.name, desc: specDesc(g), aim: g.stats.aim, dmg: g.stats.dmg, ammo: g.stats.ammo, range: g.stats.range, burst: g.stats.burst, falloffFrom: g.stats.falloffFrom, falloff: g.stats.falloff, move: g.stats.move, cost: g.stats.cost, kg: g.stats.kg } as WeaponDef])),
};

export interface ArmorDef { kg: number; name: string; desc: string; hp: number; cut: number; move: number; aim: number; cost: number }

export const ARMORS: Record<ArmorId, ArmorDef> = {
  none: { kg: 0, name: 'Без броні', desc: '', hp: 0, cut: 0, move: 0, aim: 0, cost: 0 },
  vest: { kg: 2.5, name: 'Бронежилет', desc: '+2 HP', hp: 2, cut: 0, move: 0, aim: 0, cost: 3 },
  plate: { kg: 5.5, name: 'Бронепластини', desc: '−1 шкоди від кожного влучання', hp: 0, cut: 1, move: 0, aim: 0, cost: 6 },
  exo: { kg: 9, name: 'Екзоскелет', desc: '−1 шкоди, +3 HP, хід −1, влучність −5', hp: 3, cut: 1, move: -1, aim: -5, cost: 9 },
};
