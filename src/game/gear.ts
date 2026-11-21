// Каски и обвес (снаряжение): каталог и применение эффектов к бойцу.
import { ARMORS } from './weapons';
import type { Soldier, Unit } from './types';

export interface Fx { hp?: number; aim?: number; move?: number; hcut?: number; stealth?: number; sight?: number; bag?: number; nvg?: boolean; kneelAim?: number; heal?: number; sta?: number; radio?: boolean; gren?: number; smoke?: number; bleedRes?: number; morale?: number }
export interface GearDef { name: string; desc: string; kg: number; cost: number; icon: string; fx: Fx; look?: string; color?: number }

export const HELMETS: Record<string, GearDef> = {
  none: { name: 'Без каски', desc: '', kg: 0, cost: 0, icon: '🪖', fx: {}, look: 'none' },
  cap: { name: 'Польова кепка', desc: 'Легка: трохи менш помітний', kg: 0.2, cost: 0, icon: '🧢', fx: { stealth: 0.05 }, look: 'cap', color: 0x4a5a34 },
  steel: { name: 'Сталева каска', desc: '25% влучань слабшають на 1', kg: 1.2, cost: 2, icon: '🪖', fx: { hcut: 25 }, look: 'steel', color: 0x4c5638 },
  kevlar: { name: 'Кевларова каска', desc: '40% влучань слабшають на 1', kg: 1.0, cost: 4, icon: '🪖', fx: { hcut: 40 }, look: 'kevlar', color: 0x6a6a52 },
  ach: { name: 'Бойовий шолом', desc: '50% влучань слабшають на 1, +1 HP', kg: 1.3, cost: 6, icon: '🪖', fx: { hcut: 50, hp: 1 }, look: 'ach', color: 0x23262a },
  recon: { name: 'Панама розвідника', desc: 'на 10% важче помітити, зір +1, 35% погашення', kg: 0.9, cost: 7, icon: '👒', fx: { hcut: 35, stealth: 0.1, sight: 1 }, look: 'boonie', color: 0x5a6038 },
  nvg: { name: 'Шолом з ПНБ', desc: 'Нічний зір: уночі бачить на 12; 45% погашення', kg: 1.6, cost: 9, icon: '🥽', fx: { hcut: 45, nvg: true }, look: 'nvg', color: 0x2a2e26 },
  visor: { name: 'Шолом із забралом', desc: '55% погашення, +1 HP, влучність −2', kg: 1.8, cost: 8, icon: '🛡', fx: { hcut: 55, hp: 1, aim: -2 }, look: 'visor', color: 0x30343a },
  command: { name: 'Командирський шолом', desc: 'Рація в шоломі: скиди швидше; мораль +10; 40% погашення', kg: 1.4, cost: 8, icon: '📡', fx: { hcut: 40, radio: true, morale: 10 }, look: 'command', color: 0x4a4a32 },
  hood: { name: 'Снайперський каптур', desc: 'на 20% важче помітити, +2 влучності', kg: 0.5, cost: 6, icon: '🥷', fx: { stealth: 0.2, aim: 2 }, look: 'hood', color: 0x4a5430 },
  heavy: { name: 'Важкий шолом', desc: '70% погашення, +2 HP, влучність −3', kg: 2.6, cost: 11, icon: '⛑', fx: { hcut: 70, hp: 2, aim: -3 }, look: 'heavy', color: 0x2c3036 },
};

export const GEARS: Record<string, GearDef> = {
  kneepads: { name: 'Наколінники', desc: '+4 влучності з колін і лежачи', kg: 0.4, cost: 3, icon: '🦵', fx: { kneelAim: 4 } },
  pouches: { name: 'Підсумки', desc: '+2 слоти рюкзака', kg: 0.6, cost: 2, icon: '👝', fx: { bag: 2 } },
  backpack: { name: 'Великий рюкзак', desc: '+4 слоти рюкзака, хід −1', kg: 2.2, cost: 4, icon: '🎒', fx: { bag: 4, move: -1 } },
  grenrig: { name: 'Гранатний пояс', desc: '+2 гранати та слоти під них', kg: 1.1, cost: 4, icon: '💣', fx: { gren: 2, bag: 2 } },
  smokerig: { name: 'Димовий підсумок', desc: '+2 білі димові гранати', kg: 0.9, cost: 3, icon: '☁', fx: { smoke: 2, bag: 2 } },
  ifak: { name: 'Аптечка IFAK', desc: 'Бинт лікує на 1 HP більше; опір кровотечі', kg: 0.5, cost: 4, icon: '🩹', fx: { heal: 1, bleedRes: 0.3 } },
  tourniquet: { name: 'Турнікет', desc: 'кровотеча починається на 50% рідше', kg: 0.2, cost: 3, icon: '🩸', fx: { bleedRes: 0.5 } },
  gloves: { name: 'Тактичні рукавички', desc: '+2 влучності', kg: 0.2, cost: 3, icon: '🧤', fx: { aim: 2 } },
  goggles: { name: 'Балістичні окуляри', desc: '+1 дальність зору, +1 мораль захисту', kg: 0.2, cost: 3, icon: '🥽', fx: { sight: 1, morale: 5 } },
  laser: { name: 'Лазерний цілевказівник', desc: '+3 влучності', kg: 0.3, cost: 5, icon: '🔴', fx: { aim: 3 } },
  headset: { name: 'Активна гарнітура', desc: 'Рація швидше; чує далі', kg: 0.4, cost: 5, icon: '🎧', fx: { radio: true, sight: 1 } },
  flask: { name: 'Фляга й пайок', desc: 'Витривалість відновлюється на 40% швидше', kg: 0.7, cost: 3, icon: '🧴', fx: { sta: 0.4 } },
  sling: { name: 'Тактичний ремінь', desc: 'Вага зброї відчувається на 2 кг менше', kg: 0.3, cost: 4, icon: '〰', fx: { move: 0 } },
};
export const GEAR_SLOTS = 2;

/** Применить каску и обвес к бойцу при создании миссии. */
export function applyEquip(u: Unit, s: Soldier) {
  const h = HELMETS[s.helmet ?? 'none'] ?? HELMETS.none, ar = ARMORS[s.armor], list = (s.gear ?? []).filter(g => GEARS[g]).slice(0, GEAR_SLOTS);
  u.helmet = s.helmet ?? 'none'; u.gear = list;
  const fx = [h.fx, ...list.map(g => GEARS[g].fx)];
  for (const f of fx) {
    u.maxHp += f.hp ?? 0; u.aim += f.aim ?? 0; u.move += f.move ?? 0; u.sightBonus = (u.sightBonus ?? 0) + (f.sight ?? 0);
    u.bagExtra = (u.bagExtra ?? 0) + (f.bag ?? 0); u.grenades += f.gren ?? 0; u.healBonus = (u.healBonus ?? 0) + (f.heal ?? 0); u.staRegen = (u.staRegen ?? 0) + (f.sta ?? 0);
    u.kneelAim = (u.kneelAim ?? 0) + (f.kneelAim ?? 0); u.bleedRes = Math.min(0.8, (u.bleedRes ?? 0) + (f.bleedRes ?? 0)); u.morale = Math.min(100, u.morale + (f.morale ?? 0));
    if (f.hcut) u.hcut = Math.max(u.hcut ?? 0, f.hcut); if (f.nvg) u.nvg = true; if (f.radio) u.radio = true;
    if (f.smoke) u.smoke = { ...(u.smoke ?? {}), white: ((u.smoke ?? {}).white ?? 0) + f.smoke };
  }
  u.stealth = Math.min(0.6, (h.fx.stealth ?? 0) + (ar.stealth ?? 0)); u.blastRes = ar.blast ?? 0;
  u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - 8 > 0 ? Math.max(0, fx.reduce((a, f) => a + (f.hp ?? 0), 0)) : 0));
}
export const gearKg = (u: { helmet?: string; gear?: string[] }) => (HELMETS[u.helmet ?? 'none']?.kg ?? 0) + (u.gear ?? []).reduce((a, g) => a + (GEARS[g]?.kg ?? 0), 0) - ((u.gear ?? []).includes('sling') ? 2 : 0);
