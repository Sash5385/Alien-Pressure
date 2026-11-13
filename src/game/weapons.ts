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
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: { name: 'Автомат', desc: 'Универсальный: дальность 14, 5 патронов', aim: 70, dmg: [2, 4], ammo: 5, range: 14, burst: 3, falloffFrom: 6, falloff: 3, move: 0, cost: 0 },
  smg: { name: 'Пистолет-пулемёт', desc: '8 патронов, ход +1, дальность 10', aim: 78, dmg: [2, 4], ammo: 8, range: 10, burst: 4, falloffFrom: 5, falloff: 3, move: 1, cost: 0 },
  shotgun: { name: 'Дробовик', desc: 'Урон 4–6, но меткость быстро падает дальше 3 клеток', aim: 80, dmg: [4, 6], ammo: 3, range: 8, burst: 1, falloffFrom: 3, falloff: 6, move: 0, cost: 5 },
  sniper: { name: 'Снайперская винтовка', desc: 'Дальность 20, урон 3–5, 3 патрона, ход −1', aim: 70, dmg: [3, 5], ammo: 3, range: 20, burst: 1, falloffFrom: 10, falloff: 1, move: -1, cost: 7 },
  launcher: { name: 'Гранатомёт', desc: 'Граната по видимой точке: дальность 3–13, взрыв радиусом 1,5, 2 заряда, ход −1', aim: 60, dmg: [0, 0], ammo: 2, range: 13, burst: 1, falloffFrom: 99, falloff: 0, move: -1, cost: 8, launch: 'launcher' },
  mortar: { name: 'Миномёт', desc: 'Навесом по любой исследованной клетке без линии огня: дальность 7–24, радиус 2, 2 AP, 3 мины, ход −2', aim: 60, dmg: [0, 0], ammo: 3, range: 24, burst: 1, falloffFrom: 99, falloff: 0, move: -2, cost: 10, launch: 'mortar' },
  ags: { name: 'АГС', desc: 'Станковый автоматический гранатомёт: 2 AP, залп из трёх гранат с разбросом, радиус 1, 6 гранат, ход −2', aim: 60, dmg: [0, 0], ammo: 6, range: 14, burst: 3, falloffFrom: 99, falloff: 0, move: -2, cost: 12, launch: 'ags' },
};

export interface ArmorDef { name: string; desc: string; hp: number; cut: number; move: number; aim: number; cost: number }

export const ARMORS: Record<ArmorId, ArmorDef> = {
  none: { name: 'Без брони', desc: '', hp: 0, cut: 0, move: 0, aim: 0, cost: 0 },
  vest: { name: 'Бронежилет', desc: '+2 HP', hp: 2, cut: 0, move: 0, aim: 0, cost: 3 },
  plate: { name: 'Бронепластины', desc: '−1 урона от каждого попадания', hp: 0, cut: 1, move: 0, aim: 0, cost: 6 },
  exo: { name: 'Экзоскелет', desc: '−1 урона, +3 HP, ход −1, меткость −5', hp: 3, cut: 1, move: -1, aim: -5, cost: 9 },
};
