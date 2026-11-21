// Дымовые гранаты: 10 видов — завесы разной величины и стойкости, фосфорная, сигнальные цветные, световая, многоспектральная.
import { callSupply, faceToward, living, log, raiseAlert } from './combat';
import type { GameState, Unit } from './types';

export type SmokeId = 'white' | 'dense' | 'wide' | 'curtain' | 'wp' | 'thermal' | 'red' | 'green' | 'yellow' | 'violet';
export interface SmokeDef { name: string; icon: string; r: number; ttl: number; color: number; kg: number; desc: string }
export const SMOKE: Record<SmokeId, SmokeDef> = {
  white: { name: 'Димова біла', icon: '☁', r: 1, ttl: 2, color: 0xbfc4c8, kg: 0.5, desc: 'Звичайна завіса 3×3 на 2 ходи.' },
  dense: { name: 'Щільна димова', icon: '🌫', r: 1, ttl: 4, color: 0x9aa0a6, kg: 0.6, desc: 'Завіса 3×3, тримається 4 ходи.' },
  wide: { name: 'Широка димова', icon: '☁', r: 2, ttl: 2, color: 0xd0d4d8, kg: 0.7, desc: 'Завіса 5×5 на 2 ходи — ховає цілий загін.' },
  curtain: { name: 'Димова завіса', icon: '🌫', r: 2, ttl: 4, color: 0x8a9096, kg: 0.9, desc: 'Велика завіса 5×5 на 4 ходи для відходу чи штурму.' },
  wp: { name: 'Фосфорна (WP)', icon: '🔥', r: 1, ttl: 3, color: 0xf4efe0, kg: 0.7, desc: 'Густий дим, що палить: 1 шкоди щоходу всім у диму; підпалює центр.' },
  thermal: { name: 'Багатоспектральна', icon: '🛡', r: 1, ttl: 3, color: 0x6a7080, kg: 0.6, desc: 'Дим 3×3 на 3 ходи, який не бачить навіть розвідувальний дрон.' },
  red: { name: 'Сигнальна червона', icon: '🔴', r: 0, ttl: 4, color: 0xe03a3a, kg: 0.4, desc: 'Позначає всіх прибульців у 8 клітинках — їх видно, поки не зникнуть із поля.' },
  green: { name: 'Сигнальна зелена', icon: '🟢', r: 0, ttl: 4, color: 0x3ae070, kg: 0.4, desc: 'Збір: свої в 2 клітинках приходять до тями (паніка, придушення), +1 HP, +15 моралі.' },
  yellow: { name: 'Сигнальна жовта', icon: '🟡', r: 0, ttl: 4, color: 0xf0d030, kg: 0.4, desc: 'Виклик постачання без очікування рації: скид з боєприпасами поруч із загоном.' },
  violet: { name: 'Світлошумова', icon: '🟣', r: 0, ttl: 2, color: 0xa050e0, kg: 0.4, desc: 'Спалах і гуркіт: прибульці в 4 клітинках оглушені (втрачають хід), поряд піднімається тривога.' },
};
export const SMOKE_IDS = Object.keys(SMOKE) as SmokeId[];
export const smokeCount = (u: Unit) => Object.values(u.smoke ?? {}).reduce((a, b) => a + b, 0);

/** Метнуть дымовую гранату выбранного вида (если вида нет в рюкзаке — старая гранота-дымовая за счёт обычной гранаты). */
export function throwSmokeKind(s: GameState, u: Unit, x: number, y: number, kind: SmokeId): boolean {
  const d = SMOKE[kind];
  if ((u.smoke?.[kind] ?? 0) > 0) u.smoke![kind]! -= 1;
  else if (kind === 'white' && u.grenades > 0) u.grenades -= 1;
  else return false;
  faceToward(u, x, y); u.ap -= 1; u.overwatch = false; s.aiming = null; s.smokeMode = false;
  s.smokes ??= [];
  for (let dy = -d.r; dy <= d.r; dy++) for (let dx = -d.r; dx <= d.r; dx++) {
    if (d.r >= 2 && Math.hypot(dx, dy) > d.r + 0.45) continue;
    const cx = x + dx, cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= s.size || cy >= s.size || s.terrain[cy][cx] === 'water') continue;
    s.smokes = s.smokes.filter(m => !(m.x === cx && m.y === cy));
    s.smokes.push({ x: cx, y: cy, ttl: d.ttl, kind });
  }
  log(s, `${u.name} кидає: ${d.name}.`);
  if (kind === 'wp') s.fires.push({ x, y, ttl: 2 });
  if (kind === 'red') { for (const a of living(s, 'alien')) if (Math.hypot(a.x - x, a.y - y) <= 8 && !s.revealed.includes(a.id)) s.revealed.push(a.id); log(s, 'Цілі позначено.'); }
  if (kind === 'green') for (const h of living(s, 'human')) if (Math.hypot(h.x - x, h.y - y) <= 2.2) { h.panic = false; h.suppressed = false; h.morale = Math.min(100, h.morale + 15); h.hp = Math.min(h.maxHp, h.hp + 1); }
  if (kind === 'yellow') { s.radioAt = 0; if (callSupply(s)) log(s, 'Сигнал прийнято: скид уже летить.'); }
  if (kind === 'violet') { for (const a of living(s, 'alien')) if (Math.hypot(a.x - x, a.y - y) <= 4) { a.suppressed = true; a.cd = Math.max(a.cd ?? 0, 4); a.ap = 0; } raiseAlert(s, x, y, 10); (s.noise ??= []).push({ x, y, r: 16 }); }
  return true;
}

/** Раз в «ход»: фосфорный дым жжёт всех внутри. */
export function smokeTick(s: GameState) {
  if (!s.smokes?.some(m => m.kind === 'wp')) return;
  for (const m of s.smokes) if (m.kind === 'wp') for (const u of living(s)) if (u.x === m.x && u.y === m.y && (u.fl ?? 0) === 0) { u.hp = Math.max(0, u.hp - 1); u.morale = Math.max(0, u.morale - 4); }
}
/** Клетка закрыта многоспектральным дымом (не видна даже дрону). */
export const thermalAt = (s: GameState, x: number, y: number) => !!s.smokes?.some(m => m.kind === 'thermal' && m.x === x && m.y === y);
