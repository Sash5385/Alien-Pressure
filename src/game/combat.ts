import type { GameState, Unit } from './types';

export interface ShotResult {
  attackerId: number;
  targetId: number;
  hit: boolean;
  dmg: number;
  chance: number;
  killed: boolean;
  reaction: boolean;
  wound?: 'bleed' | 'fracture';
  psi?: boolean;
  broken?: { x: number; y: number };
}

/** Детерминированный генератор (mulberry32) — состояние хранится в GameState.rng. */
export function rand(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const living = (s: GameState, team?: Unit['team']) =>
  s.units.filter(u => u.hp > 0 && (!team || u.team === team));

export function log(s: GameState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 30) s.log.shift();
}

/** Линия видимости (Bresenham): полное укрытие блокирует, половинное — нет. */
export function los(s: GameState, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - x), dy = Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if ((x !== b.x || y !== b.y) && s.cover[y][x] === 'full') return false;
  }
  return true;
}

/** Укрытие, защищающее цель от стрелка (рядом с целью, со стороны стрелка). */
export function coverSource(s: GameState, shooter: Unit, target: Unit): { bonus: number; x: number; y: number } | null {
  let best: { bonus: number; x: number; y: number } | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = target.x + dx, cy = target.y + dy;
    if (cx < 0 || cy < 0 || cx >= s.size || cy >= s.size) continue;
    const c = s.cover[cy][cx];
    if (c === 'none') continue;
    if ((shooter.x - target.x) * dx + (shooter.y - target.y) * dy <= 0) continue;
    const bonus = c === 'full' ? 40 : 20;
    if (!best || bonus > best.bonus) best = { bonus, x: cx, y: cy };
  }
  return best;
}

export const coverBonus = (s: GameState, shooter: Unit, target: Unit) => coverSource(s, shooter, target)?.bonus ?? 0;

/** Шанс попадания, % — или null, если выстрел невозможен. */
export function hitChance(s: GameState, a: Unit, t: Unit, reaction = false): number | null {
  if (a.ammo <= 0 || a.hp <= 0 || t.hp <= 0 || a.team === t.team) return null;
  const dist = Math.hypot(a.x - t.x, a.y - t.y);
  if (dist > a.range || !los(s, a, t)) return null;
  const c = a.aim - coverBonus(s, a, t) - Math.max(0, dist - a.falloffFrom) * a.falloff - (reaction ? 10 : 0)
    - (a.fracture ? 20 : 0) - (a.morale < 50 ? 10 : 0);
  return Math.round(Math.min(95, Math.max(5, c)));
}

const has = (u: Unit, t: string) => (u.traits as string[]).includes(t) || (u.perks as string[]).includes(t);
export const panicAt = (u: Unit) => (has(u, 'stoic') ? 15 : 30);
const moraleFactor = (u: Unit) => (has(u, 'coward') ? 1.5 : 1) * (has(u, 'veteran') ? 0.7 : 1) * (has(u, 'nerve') ? 0.75 : 1);

function shift(u: Unit, d: number) {
  u.morale = Math.min(100, Math.max(0, Math.round(u.morale + (d < 0 ? d * moraleFactor(u) : d))));
}

export const moveRange = (u: Unit) => Math.max(1, u.move - (u.fracture ? 2 : 0));

export function faceToward(u: Unit, x: number, y: number) {
  if (x !== u.x || y !== u.y) u.facing = Math.atan2(x - u.x, y - u.y);
}

export function shoot(s: GameState, a: Unit, t: Unit, reaction = false): ShotResult {
  faceToward(a, t.x, t.y);
  const chance = hitChance(s, a, t, reaction) ?? 0;
  a.ammo -= 1;
  if (!reaction) a.ap -= 1;
  if (a.team === 'alien' && !s.revealed.includes(a.id)) s.revealed.push(a.id);
  const hit = rand(s) * 100 < chance;
  let dmg = hit ? a.dmg[0] + Math.floor(rand(s) * (a.dmg[1] - a.dmg[0] + 1)) : 0;
  if (hit && t.cut > 0) dmg = Math.max(1, dmg - t.cut);
  t.hp = Math.max(0, t.hp - dmg);
  const killed = hit && t.hp <= 0;
  let wound: ShotResult['wound'];
  if (t.team === 'human') {
    if (hit && !killed) {
      shift(t, -10);
      const roll = rand(s);
      if (roll < 0.25 && !t.bleeding) { t.bleeding = true; wound = 'bleed'; }
      else if (roll >= 0.25 && roll < 0.45 && !t.fracture) { t.fracture = true; wound = 'fracture'; }
    } else if (!hit) shift(t, -4); // давление: пули свистят рядом
    if (killed) living(s, 'human').forEach(h => shift(h, -15));
  } else if (killed) {
    shift(a, 8);
    a.kills += 1;
    living(s, 'human').forEach(h => shift(h, 4));
  }
  let broken: ShotResult['broken'];
  if (a.kind === 'heavy') {
    const cs = coverSource(s, a, t);
    if (cs) { s.cover[cs.y][cs.x] = 'none'; broken = { x: cs.x, y: cs.y }; }
  }
  const wtxt = wound === 'bleed' ? ', кровотечение' : wound === 'fracture' ? ', перелом' : '';
  const btxt = broken ? ' Укрытие разрушено.' : '';
  log(s, `${reaction ? '[Overwatch] ' : ''}${a.name} → ${t.name}: ${hit ? `−${dmg} HP${killed ? ', убит' : ''}${wtxt}` : 'мимо'} (${chance}%)${btxt}`);
  checkEnd(s);
  return { attackerId: a.id, targetId: t.id, hit, dmg, chance, killed, reaction, wound, broken };
}

/** Реакция overwatch бойцов на движущегося пришельца. */
export function reactions(s: GameState, mover: Unit): ShotResult[] {
  const out: ShotResult[] = [];
  for (const h of living(s, 'human')) {
    if (mover.hp <= 0) break;
    if (!h.overwatch || !isVisible(s, mover) || hitChance(s, h, mover, true) === null) continue;
    h.overwatch = false;
    out.push(shoot(s, h, mover, true));
  }
  return out;
}

export function checkEnd(s: GameState) {
  const humans = living(s, 'human');
  if (humans.length === 0) { s.status = 'lost'; return; }
  const z = s.zone;
  if (s.objective === 'hold') { if (s.turnNo > s.holdTurns) s.status = 'won'; return; }
  if (s.objective === 'assassinate') { if (!living(s, 'alien').some(a => a.kind === 'commander')) s.status = 'won'; return; }
  if (s.objective === 'sabotage') { if (s.beacons.length > 0 && s.beacons.every(b => b.done)) s.status = 'won'; return; }
  if (living(s, 'alien').length === 0) s.status = 'won';
  else if (s.objective === 'extract' && z && humans.every(h => h.x >= z.x && h.x < z.x + z.w && h.y >= z.y && h.y < z.y + z.h)) s.status = 'won';
}

/** Начало хода людей: кровотечение, паника, восстановление AP. */
export function startHumanTurn(s: GameState) {
  for (const u of living(s, 'human')) {
    u.ap = u.maxAp;
    u.overwatch = false;
    if (u.bleeding) {
      u.hp -= 1;
      log(s, `${u.name} истекает кровью (−1 HP).`);
      if (u.hp <= 0) {
        log(s, `${u.name} умер от кровопотери.`);
        living(s, 'human').forEach(h => { h.morale = Math.max(0, h.morale - 15); });
      }
    }
  }
  checkEnd(s);
  for (const u of living(s, 'human')) {
    u.panic = u.morale < panicAt(u);
    if (u.panic) { u.ap = 0; u.morale = 40; log(s, `${u.name} в панике и теряет ход.`); }
  }
}

/** Перевязка: тратит 1 AP и бинт; стопорит кровотечение и даёт +2 HP. */
export function bandage(s: GameState, medic: Unit): Unit | null {
  if (medic.ap <= 0 || (s.medkits <= 0 && !has(medic, 'medic'))) return null;
  const t = living(s, 'human')
    .filter(h => h.bleeding && Math.abs(h.x - medic.x) + Math.abs(h.y - medic.y) <= 1)
    .sort((a, b) => a.hp - b.hp)[0];
  if (!t) return null;
  const pro = has(medic, 'medic');
  if (!pro) s.medkits -= 1;
  medic.ap -= 1;
  t.bleeding = false;
  t.hp = Math.min(t.maxHp, t.hp + (pro ? 4 : 2));
  log(s, `${medic.name} перевязывает ${t.name}.`);
  return t;
}

export function canPsi(a: Unit, t: Unit): boolean {
  return a.kind === 'psi' && a.hp > 0 && t.hp > 0 && t.team === 'human' && Math.hypot(a.x - t.x, a.y - t.y) <= a.range;
}

/** Псионика не нужна линия огня: шанс зависит от черт цели. */
export function psiAttack(s: GameState, a: Unit, t: Unit): ShotResult {
  faceToward(a, t.x, t.y);
  const chance = Math.min(95, Math.max(15, 65 - (has(t, 'stoic') ? 25 : 0) - (has(t, 'veteran') ? 10 : 0) + (has(t, 'coward') ? 15 : 0)));
  a.ap -= 1;
  const hit = rand(s) * 100 < chance;
  if (!s.revealed.includes(a.id)) s.revealed.push(a.id);
  if (hit) shift(t, -20);
  log(s, `${a.name} давит на ${t.name}: ${hit ? 'мораль −20' : 'устоял'} (${chance}%)`);
  return { attackerId: a.id, targetId: t.id, hit, dmg: 0, chance, killed: false, reaction: false, psi: true };
}

export const SIGHT = 12;

/** Пересчёт зоны видимости бойцов (радиус + линия видимости) и карты исследованного. */
export function updateVision(s: GameState) {
  const n = s.size;
  const vis = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  for (const h of living(s, 'human')) {
    for (let y = Math.max(0, h.y - SIGHT); y <= Math.min(n - 1, h.y + SIGHT); y++) {
      for (let x = Math.max(0, h.x - SIGHT); x <= Math.min(n - 1, h.x + SIGHT); x++) {
        if (!vis[y][x] && Math.hypot(x - h.x, y - h.y) <= SIGHT && los(s, h, { x, y })) vis[y][x] = true;
      }
    }
  }
  s.vis = vis;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (vis[y][x]) s.seen[y][x] = true;
}

export const isVisible = (s: GameState, u: Unit) => u.team === 'human' || u.id === s.markId || s.vis[u.y][u.x] || s.revealed.includes(u.id);

/** Перезарядка: 1 AP; у людей тратит запасной магазин. */
export function reload(s: GameState, u: Unit): boolean {
  if (u.ap <= 0 || u.maxAmmo <= 0 || u.ammo >= u.maxAmmo || (u.team === 'human' && u.mags <= 0)) return false;
  u.ap -= 1;
  u.ammo = u.maxAmmo;
  if (u.team === 'human') u.mags -= 1;
  u.overwatch = false;
  log(s, `${u.name} перезаряжается.`);
  return true;
}

export const GRENADE_RANGE = 8;
export const BLAST = 1.9;

export interface GrenadeResult {
  thrower: number;
  x: number;
  y: number;
  hits: { id: number; dmg: number; killed: boolean }[];
  broken: { x: number; y: number }[];
}

/** Можно ли кинуть гранату в клетку: дальность и исследованная клетка. */
export function canThrow(s: GameState, u: Unit, x: number, y: number): boolean {
  return u.grenades > 0 && u.ap > 0 && x >= 0 && y >= 0 && x < s.size && y < s.size &&
    Math.hypot(u.x - x, u.y - y) <= GRENADE_RANGE && s.seen[y][x];
}

/** Граната: центр 5 урона, край 3; бьёт и по своим. Срывает половинные укрытия рядом со взрывом. */
export function throwGrenade(s: GameState, u: Unit, x: number, y: number): GrenadeResult {
  faceToward(u, x, y);
  u.grenades -= 1;
  u.ap -= 1;
  u.overwatch = false;
  s.aiming = null;
  const hits: GrenadeResult['hits'] = [];
  for (const t of living(s)) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d > BLAST) continue;
    const dmg = Math.max(1, (d <= 1.0 ? 5 : 3) - t.cut);
    t.hp = Math.max(0, t.hp - dmg);
    const killed = t.hp <= 0;
    hits.push({ id: t.id, dmg, killed });
    if (t.team === 'human') {
      shift(t, -10);
      if (!killed && !t.bleeding && rand(s) < 0.25) t.bleeding = true;
      if (killed) living(s, 'human').forEach(h => shift(h, -15));
    } else if (killed) {
      u.kills += 1;
      shift(u, 8);
      living(s, 'human').forEach(h => shift(h, 4));
    }
  }
  const broken: GrenadeResult['broken'] = [];
  for (let cy = Math.max(0, Math.floor(y - 1.5)); cy <= Math.min(s.size - 1, Math.ceil(y + 1.5)); cy++) {
    for (let cx = Math.max(0, Math.floor(x - 1.5)); cx <= Math.min(s.size - 1, Math.ceil(x + 1.5)); cx++) {
      if (s.cover[cy][cx] === 'half' && Math.hypot(cx - x, cy - y) <= 1.5) { s.cover[cy][cx] = 'none'; broken.push({ x: cx, y: cy }); }
    }
  }
  const names = hits.map(h => `${s.units.find(v => v.id === h.id)!.name} −${h.dmg}${h.killed ? ' (убит)' : ''}`).join(', ');
  log(s, `${u.name} бросает гранату: ${names || 'никого'}.`);
  checkEnd(s);
  return { thrower: u.id, x, y, hits, broken };
}

export const nearBeacon = (s: GameState, u: Unit) =>
  s.beacons.find(b => !b.done && Math.max(Math.abs(b.x - u.x), Math.abs(b.y - u.y)) <= 1);

/** Заряд на маяк: 1 AP и 1 граната; маяк разрушается. */
export function placeCharge(s: GameState, u: Unit): { x: number; y: number } | null {
  const b = nearBeacon(s, u);
  if (!b || u.ap <= 0 || u.grenades <= 0) return null;
  u.ap -= 1;
  u.grenades -= 1;
  u.overwatch = false;
  b.done = true;
  s.cover[b.y][b.x] = 'none';
  faceToward(u, b.x, b.y);
  log(s, `${u.name} взрывает маяк (${s.beacons.filter(x => x.done).length}/${s.beacons.length}).`);
  checkEnd(s);
  return { x: b.x, y: b.y };
}
