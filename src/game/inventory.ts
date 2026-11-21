// Инвентарь бойца: оружие на ремне, рюкзак на BAG слотов (магазины и гранаты), лут, ящики.
import { living, log } from './combat';
import { ARMORS, WEAPONS } from './weapons';
import { CATALOG, type Cat } from './catalog';
import { SMOKE, SMOKE_IDS, smokeCount, type SmokeId } from './smoke';
import type { GameState, Loot, LootKind, Stash, Unit, WeaponId } from './types';

export const BAG = 12;
export const bagUsed = (u: Unit) => u.mags + u.grenades + smokeCount(u);
export const bagFree = (u: Unit) => Math.max(0, BAG - bagUsed(u));
export const WEAPON_ICON: Record<LootKind, string> = { mag: '▮', gren: '✹', mat: '▤', kit: '✚', wpn: '🔫', smoke: '☁' };
export const LOOT_NAME: Record<LootKind, string> = { mag: 'магазин', gren: 'граната', mat: 'матеріали', kit: 'аптечка', wpn: 'зброя', smoke: 'димова' };
const rnd = (s: { rng: number }) => { s.rng = (Math.imul(s.rng ^ (s.rng >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s.rng >>> 8) / 16777216; };

/** Вес снаряжения, кг: оружие, броня, магазины, гранаты, рюкзак. */
export const loadOf = (u: Unit) => WEAPONS[u.weapon].kg + (u.sec ? WEAPONS[u.sec].kg : 0) + ARMORS[u.armor].kg + u.mags * 0.7 + u.grenades * 0.5 + Object.entries(u.smoke ?? {}).reduce((a, [k, n]) => a + n * (SMOKE[k as SmokeId]?.kg ?? 0.5), 0) + 1.5;
/** Сколько можно нести без перегруза. */
export const capOf = (u: Unit) => 16 + (u.cls === 'engineer' ? 2 : 0) + ((u.traits as string[]).includes('tough') ? 2 : 0);
/** Перегруз 0..1: 0 — налегке, 1 — тяжело (скорость и выносливость падают, меткость хуже). */
export const encumbrance = (u: Unit) => u.team === 'human' ? Math.min(1, Math.max(0, (loadOf(u) - capOf(u) * 0.8) / (capOf(u) * 0.6))) : 0;

/** Переключить основное оружие на указанное (поправки к характеристикам, магазин сохраняется у оружия). */
function setPrimary(u: Unit, id: WeaponId, ammo: number) {
  const o = WEAPONS[u.weapon], n = WEAPONS[id];
  u.aim += n.aim - o.aim; u.range += n.range - o.range; u.move += n.move - o.move;
  u.dmg = n.dmg; u.burst = n.burst; u.falloffFrom = n.falloffFrom; u.falloff = n.falloff;
  u.maxAmmo = u.extMag ? Math.ceil(n.ammo * 1.5) : n.ammo; u.ammo = Math.min(ammo, u.maxAmmo);
  u.ugl = id === 'rifle' || id === 'smg' ? Math.max(u.ugl ?? 0, 3) : 0;
  u.weapon = id;
}

/** Сменить оружие: основное ↔ запасное. 1 AP. */
export function canSwap(u: Unit) { return !!u.sec && u.ap > 0 && !u.down; }
export function swapWeapons(s: GameState, u: Unit): boolean {
  if (!canSwap(u)) return false;
  const oldW = u.weapon, oldAmmo = u.ammo, newW = u.sec!, newAmmo = u.secAmmo ?? WEAPONS[newW].ammo;
  setPrimary(u, newW, newAmmo); u.sec = oldW; u.secAmmo = oldAmmo;
  u.ap -= 1; u.overwatch = false;
  log(s, `${u.name} меняет оружие: ${WEAPONS[newW].name}.`);
  return true;
}

const lootAt = (s: GameState, x: number, y: number) => (s.loot ?? []).filter(l => l.x === x && l.y === y);

/** Автоподбор расходников на клетке: магазины/гранаты — пока есть место, материалы и аптечки — всегда. */
export function autoPickup(s: GameState, u: Unit) {
  const here = lootAt(s, u.x, u.y);
  for (const l of here) {
    if (l.kind === 'wpn') continue;
    if (l.kind === 'mat') { s.mats = (s.mats ?? 0) + 2 * l.n; log(s, `${u.name} находит материалы (+${2 * l.n}).`); remove(s, l); continue; }
    if (l.kind === 'kit') { s.medkits += l.n; log(s, `${u.name} находит аптечку.`); remove(s, l); continue; }
    if (l.kind === 'smoke') { const t = Math.min(l.n, bagFree(u)); if (t <= 0) { if (!l.warn) { l.warn = true; log(s, `${u.name}: рюкзак полон.`); } continue; } (u.smoke ??= {})[l.sm ?? 'white'] = ((u.smoke ??= {})[l.sm ?? 'white'] ?? 0) + t; log(s, `${u.name} бере: ${SMOKE[(l.sm ?? 'white') as SmokeId]?.name ?? 'димова'}.`); l.n -= t; if (l.n <= 0) remove(s, l); continue; }
    const take = Math.min(l.n, bagFree(u), Math.floor(Math.max(0, capOf(u) * 1.4 - loadOf(u)) / (l.kind === 'mag' ? 0.7 : 0.5)));
    if (take <= 0) { if (!l.warn) { l.warn = true; log(s, `${u.name}: не унести — ${bagFree(u) <= 0 ? `рюкзак полон (${BAG}/${BAG})` : 'слишком тяжело'}.`); } continue; }
    if (l.kind === 'mag') u.mags += take; else u.grenades += take;
    log(s, `${u.name} берёт: ${LOOT_NAME[l.kind]}${take > 1 ? ` ×${take}` : ''}.`);
    l.n -= take; if (l.n <= 0) remove(s, l);
  }
}
const remove = (s: GameState, l: Loot) => { s.loot = (s.loot ?? []).filter(v => v !== l); };

/** Оружие под ногами (поднимается кнопкой). */
export const weaponHere = (s: GameState, u: Unit) => lootAt(s, u.x, u.y).find(l => l.kind === 'wpn');
/** Взять оружие: в запасной слот; если он занят — меняем, старое остаётся на земле. */
export function takeWeapon(s: GameState, u: Unit): boolean {
  const l = weaponHere(s, u);
  if (!l || !l.w || u.ap <= 0) return false;
  if (u.sec) s.loot!.push({ x: u.x, y: u.y, kind: 'wpn', n: 1, w: u.sec, ammo: u.secAmmo });
  u.sec = l.w; u.secAmmo = l.ammo ?? WEAPONS[l.w].ammo;
  (s.found ??= []).includes(l.w) || s.found.push(l.w);
  remove(s, l); u.ap -= 1; u.overwatch = false;
  log(s, `${u.name} берёт оружие: ${WEAPONS[l.w].name}.`);
  return true;
}

/** Выбросить предмет из рюкзака под ноги. */
export function dropItem(s: GameState, u: Unit, kind: 'mag' | 'gren'): boolean {
  if (kind === 'mag' ? u.mags <= 0 : u.grenades <= 0) return false;
  if (kind === 'mag') u.mags--; else u.grenades--;
  (s.loot ??= []).push({ x: u.x, y: u.y, kind, n: 1, warn: true });
  log(s, `${u.name} выкладывает: ${LOOT_NAME[kind]}.`);
  return true;
}
/** Передать предмет соседнему бойцу (или выложить, если рядом никого). */
export function giveItem(s: GameState, u: Unit, kind: 'mag' | 'gren'): boolean {
  const ally = living(s, 'human').find(h => h.id !== u.id && !h.down && Math.max(Math.abs(h.x - u.x), Math.abs(h.y - u.y)) <= 1 && bagFree(h) > 0);
  if (!ally) return dropItem(s, u, kind);
  if (kind === 'mag' ? u.mags <= 0 : u.grenades <= 0) return false;
  if (kind === 'mag') { u.mags--; ally.mags++; } else { u.grenades--; ally.grenades++; }
  log(s, `${u.name} передаёт ${LOOT_NAME[kind]} → ${ally.name}.`);
  return true;
}

/** Ближайший неоткрытый ящик (в соседних клетках). */
export function stashNear(s: GameState, u: Unit): Stash | undefined {
  return s.stash?.find(t => !t.opened && Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) <= 1);
}
/** Обыскать ящик: предметы идут в рюкзак, лишнее выкладывается на землю рядом. */
export function searchStash(s: GameState, u: Unit): boolean {
  const t = stashNear(s, u);
  if (!t || u.ap <= 0 || u.down) return false;
  t.opened = true; u.ap -= 1; u.overwatch = false;
  if (!t.items.length) { log(s, `${u.name} обыскивает ящик: пусто.`); return true; }
  for (const it of t.items) {
    (s.loot ??= []).push({ x: u.x, y: u.y, kind: it.kind, n: it.n, w: it.w, ammo: it.ammo, sm: it.sm });
  }
  log(s, `${u.name} открывает ${t.big ? 'контейнер' : 'ящик'}: ${t.items.map(i => i.kind === 'wpn' ? WEAPONS[i.w!].name : `${LOOT_NAME[i.kind]}${i.n > 1 ? ' ×' + i.n : ''}`).join(', ')}.`);
  autoPickup(s, u);
  return true;
}

/** Содержимое ящика: контейнеры богаче; оружие — редкая находка. */
export function stashItems(s: { rng: number }, big: boolean): Stash['items'] {
  const items: Stash['items'] = [];
  const n = big ? 2 + Math.floor(rnd(s) * 2) : Math.floor(rnd(s) * 3);
  for (let i = 0; i < n; i++) {
    const r = rnd(s);
    if (r < 0.3) items.push({ kind: 'mag', n: 1 + Math.floor(rnd(s) * 2) });
    else if (r < 0.52) items.push({ kind: 'gren', n: 1 });
    else if (r < 0.62) items.push({ kind: 'kit', n: 1 });
    else if (r < 0.78) items.push({ kind: 'smoke', n: 1, sm: SMOKE_IDS[Math.floor(rnd(s) * SMOKE_IDS.length)] });
    else if (r < 0.9) items.push({ kind: 'mat', n: 1 });
    else items.push(randomWeapon(s, big));
  }
  if (big && !items.some(i => i.kind === 'wpn') && rnd(s) < 0.3) items.push(randomWeapon(s, true));
  return items;
}
export function randomWeapon(s: { rng: number }, rich = false, cat?: Cat): { kind: 'wpn'; n: number; w: WeaponId; ammo: number } {
  const pool = CATALOG.filter(g => (!cat || g.cat === cat) && (rich || g.stats.cost <= 6));
  const base: WeaponId[] = ['smg', 'shotgun', 'rifle', 'sniper'];
  const useBase = !cat && rnd(s) < 0.2;
  const w: WeaponId = useBase ? base[Math.floor(rnd(s) * base.length)] : pool[Math.floor(rnd(s) * pool.length)].id;
  return { kind: 'wpn', n: 1, w, ammo: Math.max(1, Math.ceil(WEAPONS[w].ammo * (0.5 + rnd(s) * 0.5))) };
}
