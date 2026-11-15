import { rand } from './combat';
import type { PerkId, Unit } from './types';

export type TraitId = 'coward' | 'veteran' | 'medic' | 'marksman' | 'tough' | 'stoic' | 'runner';

export const TRAITS: Record<TraitId, { name: string; desc: string; excludes?: TraitId[] }> = {
  coward: { name: 'Боягуз', desc: 'Мораль падає в 1,5 раза сильніше, старт −15.', excludes: ['veteran', 'stoic'] },
  veteran: { name: 'Ветеран', desc: 'Влучність +10, мораль падає на 30% слабше.', excludes: ['coward'] },
  medic: { name: 'Медик', desc: 'Бинт лікує +4 HP і не витрачає аптечку.' },
  marksman: { name: 'Стрілець', desc: 'Влучність +15, хід −1.' },
  tough: { name: 'Міцний', desc: '+3 HP.' },
  stoic: { name: 'Холоднокровний', desc: 'Паніка лише за моралі нижче 15.', excludes: ['coward'] },
  runner: { name: 'Бігун', desc: 'Хід +1.' },
};

export const ROSTER = [
  { name: 'Ковальчук', bio: 'Колишній сапер. Пережив два обстріли й досі не любить тишу.' },
  { name: 'Мельник', bio: 'Фельдшер швидкої. Руки не тремтять, доки не спитаєш про родину.' },
  { name: 'Бойко', bio: 'Мисливець із Полісся. Стріляє рідко, але завжди в ціль.' },
  { name: 'Шевчук', bio: 'Водій-далекобійник. Бачив дороги, якими ніхто не повертався.' },
  { name: 'Тимошенко', bio: 'Студент-медик, мобілізований першого дня. Усе ще чекає, що це сон.' },
  { name: 'Лисенко', bio: 'Колишній спецназ, звільнений «за станом здоров’я». Бреше про причину.' },
  { name: 'Гнатюк', bio: 'Шахтар. Звик до темряви й тісних ходів, не звик до криків.' },
  { name: 'Савчук', bio: 'Колишня вчителька. Лічить набої вголос.' },
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

export const PERKS: Record<PerkId, string> = {
  aim: 'Влучність +5',
  hp: 'Витривалість +2 HP',
  nerve: 'Сталеві нерви (мораль падає на 25% слабше)',
};
export const RANKS = ['Рядовий', 'Єфрейтор', 'Сержант', 'Лейтенант'];
export const XP_STEPS = [3, 8, 15];
