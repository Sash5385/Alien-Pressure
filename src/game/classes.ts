import type { ClassId } from './types';

export const CLASSES: Record<ClassId, { name: string; passive: string; ability: string; desc: string }> = {
  assault: { name: 'Штурмовик', passive: 'хід +1', ability: 'Придушити', desc: 'Придушення: 1 AP і 2 набої, ціль втрачає 25% влучності та 1 AP на своєму ході.' },
  sniper: { name: 'Снайпер', passive: 'влучність +5', ability: 'Прицільний', desc: 'Прицільний постріл: 2 AP, влучність +30.' },
  medic: { name: 'Медик', passive: 'бинт лікує +4 і безкоштовний', ability: 'Лікування', desc: 'Лікування: 1 AP, 2 рази за місію, +3 HP і зупинка крові всім у радіусі 2.' },
  engineer: { name: 'Сапер', passive: '+1 граната', ability: 'Міна', desc: 'Міна: 1 AP, 2 рази за місію; ставиться перед бійцем, вибухає під прибульцем (як граната).' },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
