import { rand } from './combat';
import type { Unit } from './types';

export type TraitId = 'coward' | 'veteran' | 'medic' | 'marksman' | 'tough' | 'stoic' | 'runner';

export const TRAITS: Record<TraitId, { name: string; desc: string; excludes?: TraitId[] }> = {
  coward: { name: 'Трус', desc: 'Мораль падает в 1,5 раза сильнее, старт −15.', excludes: ['veteran', 'stoic'] },
  veteran: { name: 'Ветеран', desc: 'Меткость +10, мораль падает на 30% слабее.', excludes: ['coward'] },
  medic: { name: 'Медик', desc: 'Бинт лечит +4 HP и не расходует аптечку.' },
  marksman: { name: 'Стрелок', desc: 'Меткость +15, ход −1.' },
  tough: { name: 'Крепкий', desc: '+3 HP.' },
  stoic: { name: 'Хладнокровный', desc: 'Паника только при морали ниже 15.', excludes: ['coward'] },
  runner: { name: 'Бегун', desc: 'Ход +1.' },
};

export const ROSTER = [
  { name: 'Ковальчук', bio: 'Бывший сапёр. Пережил два обстрела и до сих пор не любит тишину.' },
  { name: 'Мельник', bio: 'Фельдшер скорой. Руки не дрожат, пока не спросишь о семье.' },
  { name: 'Бойко', bio: 'Охотник из Полесья. Стреляет редко, но всегда в цель.' },
  { name: 'Шевчук', bio: 'Водитель-дальнобойщик. Видел дороги, по которым никто не возвращался.' },
  { name: 'Тимошенко', bio: 'Студент-медик, мобилизованный в первый день. Всё ещё ждёт, что это сон.' },
  { name: 'Лисенко', bio: 'Бывший спецназ, уволен «по состоянию здоровья». Врёт про причину.' },
  { name: 'Гнатюк', bio: 'Шахтёр. Привык к темноте и тесным ходам, не привык к крикам.' },
  { name: 'Савчук', bio: 'Бывшая учительница. Считает патроны вслух.' },
];

export function shuffle<T>(arr: T[], rng: { rng: number }): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Две несовместимые друг с другом черты не выпадают. */
export function pickTraits(rng: { rng: number }): TraitId[] {
  const out: TraitId[] = [];
  for (const id of shuffle(Object.keys(TRAITS) as TraitId[], rng)) {
    if (out.length === 2) break;
    if (out.some(o => TRAITS[o].excludes?.includes(id) || TRAITS[id].excludes?.includes(o))) continue;
    out.push(id);
  }
  return out;
}

export function applyTraits(u: Unit) {
  for (const t of u.traits) {
    if (t === 'coward') u.morale -= 15;
    if (t === 'veteran') { u.aim += 10; u.morale += 5; }
    if (t === 'marksman') { u.aim += 15; u.move -= 1; }
    if (t === 'tough') { u.maxHp += 3; u.hp += 3; }
    if (t === 'runner') u.move += 1;
  }
}
