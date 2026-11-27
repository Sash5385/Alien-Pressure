// Каталог из 100 единиц стрелкового оружия: 25 пистолетов, 25 автоматов, 25 винтовок, 25 пулемётов.
// Каждое — своя модель из пакета, покрытие, обвес и характеристики (детерминированно из номера).
export type Cat = 'pistol' | 'auto' | 'rifle' | 'mg';
export type Finish = 'black' | 'tan' | 'olive' | 'steel' | 'wood' | 'navy' | 'sand' | 'gold';
export interface GunSpec {
  id: string; cat: Cat; name: string; caliber: string; body: string; finish: Finish; len: number; // len — множитель длины
  trait?: string; scope?: 1 | 2 | 3; supp?: 'Silencer_1' | 'Silencer_2' | 'Silencer_3' | 'Silencer_Short' | 'Silencer_long'; bipod?: boolean; grip?: boolean; light?: boolean; mag?: 'drum' | 'box';
  stats: { aim: number; dmg: [number, number]; ammo: number; range: number; burst: number; falloffFrom: number; falloff: number; move: number; kg: number; cost: number; pen: number; recoil: number; noise: number };
}
export const CAT_NAME: Record<Cat, string> = { pistol: 'Пістолети', auto: 'Автомати', rifle: 'Гвинтівки', mg: 'Кулемети' };

const NAMES: Record<Cat, string[]> = {
  pistol: ['Страж-9', 'Оса-М', 'Шершень', 'Кобра-2', 'Гюрза', 'Тінь', 'Рись-9', 'Фаворит', 'Варта', 'Сокіл-П', 'Дельта-45', 'Мангуст', 'Скорпіон-П', 'Бастіон', 'Вогник', 'Ворон-9', 'Пантера', 'Тур-М', 'Зубр-П', 'Беркут-П', 'Ягуар', 'Гарпун', 'Булат-П', 'Стилет', 'Грім-П'],
  auto: ['Вихор', 'Булава', 'Шквал', 'Ураган-2', 'Лавина', 'Кремінь', 'Сармат', 'Гроза', 'Штурм-М', 'Перун', 'Стріла-А', 'Ватага', 'Таран', 'Орлан', 'Зеніт', 'Ярило', 'Сокира', 'Яр-К', 'Мара', 'Полоз', 'Вулкан', 'Тайфун', 'Карпат', 'Дніпро-А', 'Чорнобрив'],
  rifle: ['Кречет', 'Дальнобій', 'Яструб', 'Лунь', 'Грот-Р', 'Беркут-В', 'Стрілець', 'Орел-7', 'Мисливець', 'Лелека', 'Гепард', 'Сокіл-Д', 'Дальнобій-2', 'Гірський', 'Тінь-В', 'Пломінь', 'Хижак', 'Вартовий-Р', 'Гайдамака', 'Бурштин', 'Ловчий', 'Нарвал', 'Тетерук', 'Рубін-Р', 'Охоронець'],
  mg: ['Пекло', 'Молот', 'Лютий', 'Дзвін', 'Кувалда', 'Бізон', 'Грім-К', 'Ураган-К', 'Титан', 'Вепр', 'Бастіон-К', 'Залізняк', 'Шторм', 'Маховик', 'Мамонт', 'Тур-К', 'Цербер', 'Лев-К', 'Гарматник', 'Скеля', 'Хорт', 'Бурлака', 'Гвалт', 'Колос', 'Дніпровець'],
};
const CAL: Record<Cat, string[]> = { pistol: ['9×18', '9×19', '.38', '.45', '10 мм', '5.7×28', '.357'], auto: ['5.45×39', '5.56×45', '7.62×39', '9×19', '5.8×42', '.300 BLK'], rifle: ['7.62×51', '7.62×54', '.308', '.338', '6.5×55', '.30-06', '8.6×70'], mg: ['5.45×39', '7.62×54', '7.62×51', '5.56×45', '12.7×99', '7.92×57'] };

const BODIES: Record<Cat, string[]> = {
  pistol: ['Pistol_1', 'Pistol_2', 'Pistol_3', 'Pistol_4', 'Pistol_5', 'Pistol_6', 'Revolver_1', 'Revolver_2', 'Revolver_3', 'Revolver_4', 'Revolver_5'],
  auto: ['SubmachineGun_1', 'SubmachineGun_2', 'SubmachineGun_3', 'SubmachineGun_4', 'SubmachineGun_5', 'AssaultRifle_1', 'AssaultRifle_2', 'AssaultRifle_3', 'AssaultRifle_4', 'AssaultRifle_5', 'AssaultRifle2_1', 'AssaultRifle2_2', 'AssaultRifle2_3', 'AssaultRifle2_4', 'Bullpup_1', 'Bullpup_2', 'Bullpup_3'],
  rifle: ['SniperRifle_1', 'SniperRifle_2', 'SniperRifle_3', 'SniperRifle_4', 'SniperRifle_5', 'SniperRifle_6', 'AssaultRifle_2', 'AssaultRifle2_1', 'AssaultRifle_4', 'Bullpup_1'],
  mg: ['AssaultRifle_2', 'AssaultRifle_4', 'AssaultRifle_5', 'AssaultRifle2_1', 'AssaultRifle2_2', 'Bullpup_1', 'Bullpup_3'],
};
const FINISHES: Finish[] = ['black', 'tan', 'olive', 'steel', 'wood', 'navy', 'sand'];
const hash = (a: number, b: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/** Мощность патрона: чем выше, тем гулче выстрел, больше отдача и пробитие брони. */
const CAL_POWER: Record<string, number> = { '9×18': 1, '9×19': 1.1, '.38': 1.2, '.45': 1.4, '10 мм': 1.4, '5.7×28': 0.9, '.357': 1.8, '5.45×39': 1.5, '5.56×45': 1.6, '7.62×39': 1.9, '5.8×42': 1.5, '.300 BLK': 1.7, '7.62×51': 2.3, '7.62×54': 2.4, '.308': 2.3, '.338': 3.2, '6.5×55': 2.0, '.30-06': 2.6, '8.6×70': 3.0, '12.7×99': 3.8, '7.92×57': 2.7 };
export const caliberPower = (c: string) => CAL_POWER[c] ?? 1.5;
const pick = <T,>(arr: T[], i: number, k: number) => arr[Math.floor(hash(i, k) * arr.length)];
/** Особенность ствола: у каждого своя, меняет характеристики. */
export const TRAITS: { id: string; name: string; desc: string; fx: (st: GunSpec['stats']) => void }[] = [
  { id: 'reliable', name: 'Надійний', desc: '+2 набої в магазині', fx: st => { st.ammo += 2; } },
  { id: 'match', name: 'Точний ствол', desc: '+5 влучності', fx: st => { st.aim += 5; } },
  { id: 'rapid', name: 'Скорострільний', desc: 'черга +1, влучність −3', fx: st => { st.burst += 1; st.aim -= 3; } },
  { id: 'heavy', name: 'Потужний патрон', desc: 'шкода +1, віддача +2', fx: st => { st.dmg = [st.dmg[0], st.dmg[1] + 1]; st.recoil += 2; } },
  { id: 'light', name: 'Полегшений', desc: 'вага −25%, віддача +1', fx: st => { st.kg *= 0.75; st.recoil += 1; } },
  { id: 'extmag', name: 'Збільшений магазин', desc: 'набоїв ×1.5, вага +0.4 кг', fx: st => { st.ammo *= 1.5; st.kg += 0.4; } },
  { id: 'long', name: 'Довгий ствол', desc: 'дальність +3, прицільна +2', fx: st => { st.range += 3; st.falloffFrom += 2; } },
  { id: 'compact', name: 'Компактний', desc: 'хід +1, дальність −2', fx: st => { st.range = Math.max(5, st.range - 2); } },
  { id: 'ap', name: 'Бронебійні набої', desc: 'пробиття броні +1', fx: st => { st.pen += 1; } },
  { id: 'quiet', name: 'Тихий', desc: 'шум −40%', fx: st => { st.noise *= 0.6; } },
  { id: 'stable', name: 'Стабільний', desc: 'віддача −40%', fx: st => { st.recoil *= 0.6; } },
  { id: 'tuned', name: 'Тюнінгований спуск', desc: 'влучність +3, мін. шкода +1 (або ще +2 влучності)', fx: st => { st.aim += 3; if (st.dmg[1] - st.dmg[0] >= 2) st.dmg = [st.dmg[0] + 1, st.dmg[1]]; else st.aim += 2; } },
];
export const traitOf = (id: string) => TRAITS.find(t => t.id === SPEC[id]?.trait);
const CATN: Record<Cat, number> = { pistol: 1, auto: 2, rifle: 3, mg: 4 };
const PREFIX: Record<Cat, string> = { pistol: 'p', auto: 'a', rifle: 'r', mg: 'm' };

function build(cat: Cat, i: number): GunSpec {
  const id = PREFIX[cat] + String(i + 1).padStart(2, '0'), c = CATN[cat] * 100 + i, tier = Math.floor(i / 5); // tier 0..4
  const bodies = BODIES[cat], body = bodies[i % bodies.length], isRev = body.startsWith('Revolver'), isSmg = body.startsWith('Submachine'), isBull = body.startsWith('Bullpup');
  // покрытие: первые круги — чёрные, дальше разные; редкие золотые у топовых
  let finish: Finish = i < bodies.length ? 'black' : pick(FINISHES, c, 1);
  if (tier === 4 && hash(c, 2) < 0.35) finish = 'gold';
  const spec: GunSpec = { id, cat, name: NAMES[cat][i], caliber: pick(CAL[cat], c, 3), body, finish, len: +(0.94 + hash(c, 4) * 0.16).toFixed(2), stats: { aim: 0, dmg: [1, 3], ammo: 8, range: 8, burst: 1, falloffFrom: 4, falloff: 4, move: 0, kg: 1, cost: 0, pen: 0, recoil: 0, noise: 20 } };
  const st = spec.stats, t = tier;
  // тип ствола: от него — база точности, дальности, темпа; от калибра — шкода, отдача, вес, ёмкость
  const bolt = cat === 'rifle' && body.startsWith('Sniper');
  const type = cat === 'pistol' ? (isRev ? 'rev' : 'pistol') : cat === 'auto' ? (isSmg ? 'smg' : isBull ? 'bull' : 'ar') : cat === 'rifle' ? (bolt ? 'bolt' : 'dmr') : 'mg';
  if (type === 'smg') spec.caliber = pick(['9×19', '.45', '5.7×28', '10 мм', '9×18'], c, 3);
  if (type === 'ar' || type === 'bull') spec.caliber = pick(['5.45×39', '5.56×45', '7.62×39', '5.8×42', '.300 BLK'], c, 3);
  if (type === 'rev') spec.caliber = pick(['.38', '.357', '.45'], c, 3);
  const p = caliberPower(spec.caliber);
  if (cat === 'pistol') { if (i % 4 === 1) spec.supp = 'Silencer_Short'; if (i % 5 === 2) spec.light = true; if (i % 6 === 4 && !isRev) spec.scope = 1; }
  else if (cat === 'auto') { if (i % 3 === 0) spec.scope = (1 + (Math.floor(i / 3) % 3)) as 1 | 2 | 3; if (i % 4 === 2) spec.supp = pick(['Silencer_1', 'Silencer_2', 'Silencer_Short'] as const, c, 12); if (i % 5 === 3) spec.grip = true; if (i % 7 === 1) spec.light = true; }
  else if (cat === 'rifle') { spec.scope = ((i % 3) + 1) as 1 | 2 | 3; if (i % 5 === 1) spec.supp = pick(['Silencer_2', 'Silencer_3', 'Silencer_long'] as const, c, 12); if (i % 4 === 0) spec.bipod = true; }
  else { spec.bipod = true; spec.mag = hash(c, 13) < 0.5 ? 'drum' : 'box'; if (i % 3 === 0) spec.supp = 'Silencer_long'; if (i % 4 === 1) spec.scope = 1; if (i % 5 === 2) spec.grip = true; }
  const K: Record<string, [number, number, number, number, number, number]> = { // [шкода/калібр, точність, дальність: база + калібр, ефективна, спад]
    pistol: [1.7, 74, 6, 1.5, 4, 4], rev: [1.8, 71, 6, 1.6, 4, 4], smg: [1.6, 77, 8, 1, 4, 3], ar: [1.75, 70, 10, 2, 6, 3], bull: [1.75, 72, 9, 2, 6, 3], bolt: [1.75, 73, 14, 3.2, 11, 1], dmr: [1.7, 74, 12, 2.5, 8, 1], mg: [1.6, 55, 10, 1.6, 6, 3],
  };
  const [km, ka, kr0, kr1, kf, kfo] = K[type];
  const mid = km * p + t * 0.15;
  st.dmg = [Math.max(1, Math.round(mid * 0.75)), 0]; st.dmg[1] = Math.max(st.dmg[0] + 1, Math.round(mid * 1.25));
  st.aim = ka + t - Math.round(Math.max(0, p - (cat === 'pistol' ? 1.2 : cat === 'mg' ? 2 : 1.7)) * 4) + Math.round((spec.len - 1) * 20);
  st.range = Math.round(kr0 + kr1 * p); st.falloffFrom = kf; st.falloff = kfo;
  st.ammo = type === 'pistol' ? (spec.caliber === '5.7×28' ? 20 : p <= 1.2 ? 15 : 8) : type === 'rev' ? 6 : type === 'smg' ? (spec.caliber === '5.7×28' ? 18 : p <= 1.2 ? 15 : 12)
    : type === 'ar' || type === 'bull' ? (p <= 1.6 ? 10 : 8) : type === 'bolt' ? (p >= 3 ? 3 : 5) : type === 'dmr' ? (p >= 2.5 ? 6 : 8) : p >= 3.5 ? 10 : spec.mag === 'drum' ? 30 : 20;
  st.burst = type === 'smg' ? 5 : type === 'ar' ? (p <= 1.5 ? 4 : 3) : type === 'bull' ? 3 : type === 'mg' ? Math.max(3, Math.min(6, Math.round(7 - p))) : hash(c, 9) < 0.2 && type === 'pistol' ? 2 : 1;
  st.kg = ({ pistol: 0.7 + p * 0.25, rev: 1 + p * 0.25, smg: 2.4 + p * 0.3, ar: 2.9 + p * 0.4, bull: 3 + p * 0.4, bolt: 4 + p * 0.6, dmr: 3.6 + p * 0.5, mg: 6 + p * 1.6 + (spec.mag === 'drum' ? 1 : 0) } as Record<string, number>)[type] * spec.len;
  // обвес и длина ствола меняют характеристики: прицел — дальность и точность, глушитель — дальность и шум, сошки — устойчивость
  if (spec.scope) { st.range += spec.scope === 3 ? 3 : 2; st.aim += 3; st.falloffFrom += 2; st.kg += 0.3; }
  if (spec.supp) { st.range -= 1; st.kg += 0.2; }
  if (spec.bipod) { st.aim += 3; st.kg += 0.4; }
  if (spec.grip) st.aim += 2;
  st.range = Math.max(5, st.range + Math.round((spec.len - 1) * 10));
  st.pen = p >= 3 ? 2 : p >= 1.8 ? 1 : 0;
  st.recoil = Math.round((cat === 'pistol' ? 3 + p * 1.5 : cat === 'auto' ? (isSmg ? 3 : 4) + p * 1.3 : cat === 'rifle' ? 5 + p * 1.6 : 3 + p * 1.4) * (spec.bipod ? 0.8 : 1) * (spec.grip ? 0.85 : 1));
  const noiseBase = { pistol: 14, auto: 20, rifle: 26, mg: 30 }[cat] + p * 2;
  st.noise = Math.round(spec.supp ? Math.max(5, noiseBase * 0.28) : noiseBase);
  // своя особенность у каждого ствола
  const tr = TRAITS[(i * 5 + CATN[cat] * 3) % TRAITS.length]; spec.trait = tr.id; tr.fx(st);
  st.kg = +st.kg.toFixed(1); st.ammo = Math.round(st.ammo); st.recoil = Math.max(1, Math.round(st.recoil)); st.noise = Math.round(st.noise); st.aim = Math.round(st.aim);
  st.move = st.kg <= 2.5 ? 1 : st.kg <= 4.5 ? 0 : st.kg <= 8 ? -1 : -2; if (tr.id === 'compact') st.move += 1;
  const avg = (st.dmg[0] + st.dmg[1]) / 2, base = { pistol: 2, auto: 2.5, rifle: 4, mg: 3 }[cat];
  st.cost = Math.max(0, Math.min(14, Math.round(t * 2 + (avg - base) * 1.5 + st.pen + (cat === 'pistol' ? -1 : cat === 'mg' ? 3 : 1))));
  return spec;
}

export const CATALOG: GunSpec[] = (['pistol', 'auto', 'rifle', 'mg'] as Cat[]).flatMap(cat => Array.from({ length: 25 }, (_, i) => build(cat, i)));
export const SPEC: Record<string, GunSpec> = Object.fromEntries(CATALOG.map(g => [g.id, g]));
export const catOf = (id: string): Cat | null => SPEC[id]?.cat ?? null;
/** Описание для интерфейса. */
export const specDesc = (g: GunSpec) => { const tr = TRAITS.find(t => t.id === g.trait); return `${CAT_NAME[g.cat].slice(0, -1)}, ${g.caliber}: влучність ${g.stats.aim}, шкода ${g.stats.dmg[0]}–${g.stats.dmg[1]}, ${g.stats.ammo} набоїв, черга ${g.stats.burst}, прицільна дальність ${g.stats.falloffFrom}, макс. ${g.stats.range}, ${g.stats.kg} кг${tr ? `. ${tr.name}: ${tr.desc}` : ''}${g.stats.burst >= 4 ? '. Щільна черга: +1 шкоди впритул' : ''}.`; };

const BASE_NODE: Record<string, string> = { rifle: 'AK', smg: 'SMG', shotgun: 'Shotgun', sniper: 'Sniper', launcher: 'RocketLauncher', mortar: 'MORTAR', ags: 'AGS' };
/** Узел оружия в модели бойца, который заменяется (задаёт позу и хват). */
export function nodeOf(id: string): string {
  if (BASE_NODE[id]) return BASE_NODE[id];
  const g = SPEC[id]; if (!g) return 'AK';
  if (g.cat === 'pistol') return g.body.startsWith('Revolver') ? 'Revolver' : 'Pistol';
  if (g.cat === 'auto') return g.body.startsWith('Submachine') ? 'SMG' : 'AK';
  if (g.cat === 'rifle') return g.body.startsWith('Sniper') ? 'Sniper' : 'AK';
  return 'AK';
}

/** Параметры звука выстрела: из вида оружия и калибра (базовые виды — свои профили). */
export interface SndProfile { p: number; cat: Cat | 'shotgun' | 'launcher'; sup: boolean; burst: number }
export function sndProfile(idIn: string): SndProfile {
  const sup = idIn.endsWith('+s'), id = sup ? idIn.slice(0, -2) : idIn; // «+s» — глушитель, надетый бойцом
  const g = SPEC[id];
  if (g) return { p: caliberPower(g.caliber), cat: g.cat, sup: sup || !!g.supp, burst: g.stats.burst };
  const base: Record<string, SndProfile> = { rifle: { p: 1.6, cat: 'auto', sup: false, burst: 3 }, smg: { p: 1.1, cat: 'auto', sup: false, burst: 4 }, shotgun: { p: 2.2, cat: 'shotgun', sup: false, burst: 1 }, sniper: { p: 3.2, cat: 'rifle', sup: false, burst: 1 }, launcher: { p: 2, cat: 'launcher', sup: false, burst: 1 } };
  return { ...(base[id] ?? { p: 1.6, cat: 'auto', sup: false, burst: 3 }), sup };
}
