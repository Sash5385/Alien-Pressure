import { log, rand } from './combat';
import { BIOME_NAME, DIFF } from './difficulty';
import { applyTraits, shuffle } from './traits';
import { ARMORS, WEAPONS } from './weapons';
import type { Biome, Cover, Difficulty, GameState, House, Look, Objective, Soldier, Tech, Terrain, Unit } from './types';

export const MAP_SIZE = 44;
export const HOLD_TURNS = 6;
export const DEFEND_TURNS = 10;
export const HUMAN_AP = 3;
export const ALIEN_AP = 3;

const human = (s: Soldier, x: number, y: number, tech: Tech): Unit => {
  const w = WEAPONS[s.weapon], ar = ARMORS[s.armor];
  const u: Unit = {
    id: s.id, team: 'human', kind: 'soldier', name: s.name, x, y, hp: 8, maxHp: 8, ap: HUMAN_AP, maxAp: HUMAN_AP, move: 5 + w.move + ar.move,
    aim: w.aim + ar.aim, ammo: w.ammo, maxAmmo: w.ammo, weapon: s.weapon, armor: s.armor, burst: w.burst, falloffFrom: w.falloffFrom, falloff: w.falloff, cut: ar.cut, mags: 2, grenades: 2 + (tech.grenades ? 1 : 0), facing: Math.PI, stance: 'stand', cls: s.cls, abilityUsed: 0, suppressed: false, alert: true, homeX: x, homeY: y, dmg: w.dmg, range: w.range, overwatch: false,
    bleeding: false, fracture: s.fracture, morale: 70, panic: false, traits: s.traits, perks: s.perks, bio: s.bio, kills: 0,
  };
  applyTraits(u);
  for (const p of s.perks) { if (p === 'aim') u.aim += 5; if (p === 'hp') u.maxHp += 2; }
  u.maxHp += ar.hp;
  if (s.cls === 'assault') u.move += 1;
  if (s.cls === 'sniper') u.aim += 5;
  if (s.cls === 'engineer') u.grenades += 1;
  if (tech.armor) u.maxHp += 2;
  if (tech.optics) u.aim += 5;
  u.hp = Math.max(1, u.maxHp - s.hpLoss);
  return u;
};

const ALIEN: Record<'trooper' | 'sniper' | 'psi' | 'heavy' | 'commander', Partial<Unit>> = {
  commander: { hp: 14, aim: 60, ammo: 5, dmg: [3, 5], range: 14, move: 4 },
  trooper: { hp: 6, aim: 50, ammo: 6, dmg: [2, 3], range: 12, move: 5 },
  sniper: { hp: 4, aim: 65, ammo: 4, dmg: [3, 4], range: 20, move: 4 },
  psi: { hp: 5, aim: 0, ammo: 0, dmg: [0, 0], range: 10, move: 5 },
  heavy: { hp: 10, aim: 50, ammo: 4, dmg: [3, 5], range: 10, move: 4 },
};
type AlienKind = keyof typeof ALIEN;
const NAMES = { trooper: 'Пехотинец', sniper: 'Снайпер', psi: 'Псионик', heavy: 'Тяжёлый', commander: 'Командир' };

const alien = (id: number, kind: AlienKind, n: number, x: number, y: number, d: Difficulty): Unit => {
  const b = ALIEN[kind];
  const hp = Math.max(1, Math.round(b.hp! * DIFF[d].hp));
  return {
    id, team: 'alien', kind, name: kind === 'trooper' ? `${NAMES[kind]} ${n}` : NAMES[kind], x, y,
    hp, maxHp: hp, ap: ALIEN_AP, maxAp: ALIEN_AP, move: b.move!, aim: kind === 'psi' ? 0 : b.aim! + DIFF[d].aim,
    ammo: b.ammo!, maxAmmo: b.ammo!, weapon: 'rifle', armor: 'none', burst: kind === 'sniper' ? 1 : kind === 'trooper' ? 2 : 3,
    falloffFrom: 6, falloff: kind === 'sniper' ? 1 : 3, cut: 0, stance: 'stand', cls: 'assault', abilityUsed: 0, suppressed: false, alert: false, homeX: x, homeY: y, mags: 99, grenades: 0, facing: 0, dmg: b.dmg!, range: b.range!, overwatch: false,
    bleeding: false, fracture: false, morale: 100, panic: false, traits: [], perks: [], bio: '', kills: 0,
  };
};

export interface MissionOpts {
  rng: number;
  difficulty: Difficulty;
  missionNo: number;
  objective: Objective;
  biome: Biome;
  size?: 44 | 64;
  boss?: boolean;
  risky?: boolean;
  soldiers: Soldier[];
  tech: Tech;
}

type Zone = { x: number; y: number; w: number; h: number };

type Base = { cover: Cover[][]; terrain: Terrain[][]; height: number[][] };
type Grids = Base & { look: Look[][]; houses: House[]; bridges: { x: number; y: number }[] };

const grid = <T>(n: number, v: T) => Array.from({ length: n }, () => Array<T>(n).fill(v));

/** Клетки, достижимые от точки высадки (с учётом обрывов). */
function reachSet({ cover, terrain, height }: Base, n: number, sx = n >> 1, sy = n - 2): Set<string> {
  const seen = new Set<string>([`${sx},${sy}`]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || cover[ny][nx] !== 'none' || terrain[ny][nx] === 'water' || seen.has(k)) continue;
      if (Math.abs(height[ny][nx] - height[y][x]) > 1) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

/** Достижимо почти всё открытое поле (и зона эвакуации). */
function connected(g: Base, n: number, zone: Zone | null): boolean {
  const seen = reachSet(g, n);
  let open = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g.cover[y][x] === 'none' && g.terrain[y][x] === 'ground') open++;
  return seen.size >= open * 0.93 && (!zone || seen.has(`${zone.x + 1},${zone.y + 1}`));
}

/** Рельеф: холмы из «куполов»; у линии высадки всегда ровно. */
function genHeight(rng: { rng: number }, n: number, biome: Biome): number[][] {
  const h = grid(n, 0);
  const blobs = Array.from({ length: biome === 'ruins' ? 6 : biome === 'forest' ? 18 : 14 }, () => ({
    x: rand(rng) * n, y: 4 + rand(rng) * (n - 14), s: 3 + rand(rng) * 5, a: 0.9 + rand(rng) * 1.1,
  }));
  for (let y = 0; y < n - 8; y++) for (let x = 0; x < n; x++) {
    let f = 0;
    for (const b of blobs) f += b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.s * b.s));
    h[y][x] = Math.min(biome === 'ruins' ? 1 : 3, f < 0.5 ? 0 : f < 1.0 ? 1 : f < 1.6 ? 2 : 3);
  }
  return h;
}

/** Случайная карта по локации. Деревья/дома/камни — полное укрытие, кусты — половинное, вода непроходима. */
function genMap(rng: { rng: number }, biome: Biome, n: number, missionNo: number, zone: Zone | null): Grids {
  const f = (n * n) / 400; // во сколько раз карта больше базовой 20×20
  let g: Grids = { cover: [], terrain: [], height: [], look: [], houses: [], bridges: [] };
  for (let attempt = 0; attempt < 14; attempt++) {
    const cover: Cover[][] = grid(n, 'none' as Cover);
    const terrain: Terrain[][] = grid(n, 'ground' as Terrain);
    const look: Look[][] = grid(n, '' as Look);
    const height = attempt < 9 ? genHeight(rng, n, biome) : grid(n, 0); // не вышло — делаем ровно
    const houses: House[] = [];
    const bridges: { x: number; y: number }[] = [];
    const maxY = n - 8;
    const free = (x: number, y: number) => x >= 1 && x < n - 1 && y >= 3 && y <= maxY && cover[y][x] === 'none' && terrain[y][x] === 'ground' && look[y][x] === '';
    const put = (x: number, y: number, c: Cover, l: Look) => { if (free(x, y)) { cover[y][x] = c; look[y][x] = l; } };
    const house = (w: number, h: number) => {
      for (let t = 0; t < 30; t++) {
        const x0 = 2 + Math.floor(rand(rng) * (n - 4 - w)), y0 = 6 + Math.floor(rand(rng) * (maxY - 6 - h));
        let ok = true, lo = 9;
        for (let yy = y0 - 1; yy <= y0 + h && ok; yy++) for (let xx = x0 - 1; xx <= x0 + w && ok; xx++) {
          if (yy < 0 || xx < 0 || xx >= n || yy >= n) { ok = false; break; }
          const inside = xx >= x0 && xx < x0 + w && yy >= y0 && yy < y0 + h;
          if (inside ? !free(xx, yy) : cover[yy][xx] === 'full' && look[yy][xx] === 'house') ok = false;
          if (inside) lo = Math.min(lo, height[yy][xx]);
        }
        if (!ok) continue;
        for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) { cover[yy][xx] = 'full'; look[yy][xx] = 'house'; height[yy][xx] = lo; }
        houses.push({ x: x0, y: y0, w, h, id: houses.length, hp: 6 });
        return;
      }
    };
    const rocks = (count: number) => { for (let i = 0; i < count; i++) put(1 + Math.floor(rand(rng) * (n - 2)), 3 + Math.floor(rand(rng) * (maxY - 2)), rand(rng) < 0.4 ? 'full' : 'half', 'rock'); };
    const clumps = (count: number) => {
      for (let i = 0; i < count; i++) {
        const cx = 1 + Math.floor(rand(rng) * (n - 2)), cy = 3 + Math.floor(rand(rng) * (maxY - 2)), r = 1.4 + rand(rng) * 1.8;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (Math.hypot(dx, dy) <= r && rand(rng) < 0.5) { const tree = rand(rng) < 0.55; put(cx + dx, cy + dy, tree ? 'full' : 'half', tree ? 'tree' : 'bush'); }
        }
      }
    };

    if (biome === 'ruins') {
      const x0 = (n >> 1) - 4 + Math.floor(rand(rng) * 13) - 6;
      for (let i = 0; i < 8; i++) { cover[2][x0 + i] = 'full'; look[2][x0 + i] = 'container'; }
      cover[3][x0] = cover[3][x0 + 7] = 'full'; look[3][x0] = look[3][x0 + 7] = 'container';
      for (let i = 0, c = Math.round((14 + Math.min(missionNo, 4) * 2) * f); i < c; i++) {
        const x = 1 + Math.floor(rand(rng) * (n - 2)), y = 4 + Math.floor(rand(rng) * (maxY - 3));
        const half = rand(rng) < 0.6;
        put(x, y, half ? 'half' : 'full', half ? 'crate' : 'container');
        if (rand(rng) < 0.5) put(x + 1, y, half ? 'half' : 'full', half ? 'crate' : 'container');
      }
      for (let i = 0; i < 5; i++) house(3, rand(rng) < 0.5 ? 3 : 2);
      rocks(Math.round(6 * f));
    } else {
      if (biome === 'lake') {
        // река с извилистыми берегами и бродами
        const y0 = Math.floor(n * 0.4 + rand(rng) * n * 0.15), width = 3 + (rand(rng) < 0.5 ? 1 : 0), phase = rand(rng) * 6.28;
        for (let x = 0; x < n; x++) {
          const shift = Math.round(Math.sin(x * 0.3 + phase) * 2);
          for (let w = 0; w < width; w++) { const y = y0 + shift + w; if (y >= 3 && y <= maxY) { terrain[y][x] = 'water'; height[y][x] = 0; } }
        }
        const fords = Math.max(3, Math.round(n / 8));
        for (let k = 0; k < fords; k++) {
          const fx = Math.floor(((k + 0.15 + rand(rng) * 0.7) * n) / fords);
          for (let y = 0; y < n; y++) for (const xx of [fx, Math.min(n - 1, fx + 1)]) { if (terrain[y][xx] === 'water') bridges.push({ x: xx, y }); terrain[y][xx] = 'ground'; }
        }
      } else { // лес: пара прудов
        for (let k = 0; k < 2; k++) {
          const cx = 6 + rand(rng) * (n - 12), cy = 8 + rand(rng) * (maxY - 14), rx = 2 + rand(rng) * 3, ry = 2 + rand(rng) * 2;
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (y >= 3 && y <= maxY && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) { terrain[y][x] = 'water'; height[y][x] = 0; }
        }
      }
      clumps(Math.round((biome === 'forest' ? 6 : 4) * f));
      for (let i = 0, c = Math.round((biome === 'forest' ? 8 : 6) * f); i < c; i++) {
        const x = 1 + Math.floor(rand(rng) * (n - 2)), y = 3 + Math.floor(rand(rng) * (maxY - 2));
        const tree = rand(rng) < 0.5;
        put(x, y, tree ? 'full' : 'half', tree ? 'tree' : 'bush');
      }
      rocks(Math.round((biome === 'forest' ? 6 : 5) * f));
      for (let i = 0; i < (biome === 'forest' ? 3 : 2); i++) house(3, rand(rng) < 0.5 ? 3 : 2);
    }
    if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) { cover[y][x] = 'none'; look[y][x] = ''; terrain[y][x] = 'ground'; height[y][x] = 0; }
    g = { cover, terrain, height, look, houses, bridges };
    if (connected(g, n, zone)) break;
  }
  return g;
}

/** Оборона: расчищаем центр и строим либо холм с мешками, либо укрепление с воротами. Возвращает вид. */
function fortify(rng: { rng: number }, g: Grids, n: number): 'hill' | 'fort' | 'house' {
  const c = n >> 1, r3 = rand(rng), kind = r3 < 0.34 ? 'hill' : r3 < 0.67 ? 'fort' : 'house', R = 9;
  g.houses = g.houses.filter(h => Math.hypot(h.x + h.w / 2 - c, h.y + h.h / 2 - c) > R + 2).map((h, i) => ({ ...h, id: i }));
  for (let y = c - R; y <= c + R; y++) for (let x = c - R; x <= c + R; x++) {
    if (g.look[y][x] === 'house' && !g.houses.some(h => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h)) { g.cover[y][x] = 'none'; g.look[y][x] = ''; }
    const d = Math.hypot(x - c, y - c);
    if (d > R) continue;
    g.terrain[y][x] = 'ground'; g.bridges = g.bridges.filter(b => b.x !== x || b.y !== y);
    if (g.look[y][x] !== 'house') { g.cover[y][x] = 'none'; g.look[y][x] = ''; }
    g.height[y][x] = kind === 'hill' ? (d <= 2.6 ? 3 : d <= 4.2 ? 2 : d <= 5.8 ? 1 : 0) : kind === 'house' ? (d <= 4 ? 3 : d <= 5.6 ? 2 : d <= 7.2 ? 1 : 0) : 0;
  }
  const put = (x: number, y: number, cv: Cover, l: Look) => { g.cover[y][x] = cv; g.look[y][x] = l; };
  if (kind === 'house') { // дом на вершине холма: отряд держит оборону вокруг него
    for (let y = c - 1; y <= c + 1; y++) for (let x = c - 1; x <= c + 1; x++) put(x, y, 'full', 'house');
    g.houses.push({ x: c - 1, y: c - 1, w: 3, h: 3, id: g.houses.length, hp: 9 });
    for (let a = 0; a < 20; a++) {
      const t = (a / 20) * 6.283;
      if (a % 5 !== 0) put(Math.round(c + Math.cos(t) * 4.8), Math.round(c + Math.sin(t) * 4.8), 'half', 'crate');
      if (a % 4 === 2) put(Math.round(c + Math.cos(t + 0.15) * 6.8), Math.round(c + Math.sin(t + 0.15) * 6.8), 'full', 'rock');
    }
  } else if (kind === 'hill') { // мешки на гребне и камни ниже по склону
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * 6.283, gap = a % 4 === 0;
      if (!gap) put(Math.round(c + Math.cos(t) * 3.4), Math.round(c + Math.sin(t) * 3.4), 'half', 'crate');
      if (a % 3 === 1) put(Math.round(c + Math.cos(t + 0.2) * 5.4), Math.round(c + Math.sin(t + 0.2) * 5.4), 'full', 'rock');
    }
  } else { // стена из контейнеров, ворота по сторонам света, ящики внутри
    for (let i = -4; i <= 4; i++) {
      if (Math.abs(i) <= 1) continue;
      put(c + i, c - 4, 'full', 'container'); put(c + i, c + 4, 'full', 'container');
      put(c - 4, c + i, 'full', 'container'); put(c + 4, c + i, 'full', 'container');
    }
    put(c - 2, c - 1, 'half', 'crate'); put(c + 2, c + 1, 'half', 'crate'); put(c + 1, c - 2, 'half', 'crate'); put(c - 1, c + 2, 'half', 'crate');
    for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -6], [0, 6], [-6, 0], [6, 0]]) put(c + dx, c + dy, 'half', 'crate');
  }
  return kind;
}

export function createMission(o: MissionOpts): GameState {
  const rng = { rng: o.rng };
  const n = o.size ?? MAP_SIZE, cx = n >> 1;
  const zone: Zone | null = o.objective === 'extract'
    ? { x: rand(rng) < 0.5 ? 0 : n - 3, y: 0, w: 3, h: 3 } : null;
  const gm = genMap(rng, o.biome, n, o.missionNo, zone);
  const defend = o.objective === 'defend';
  const dKind = defend ? fortify(rng, gm, n) : null;
  const { cover, terrain, height, look, houses, bridges } = gm;

  // взрывоопасные бочки: половинное укрытие, которое можно взорвать
  const barrels: GameState['barrels'] = [];
  for (let tries = 0, want = Math.round((o.biome === 'ruins' ? 4 : 2) * (n * n) / 400); tries < 200 && barrels.length < want; tries++) {
    const x = 1 + Math.floor(rand(rng) * (n - 2)), y = 4 + Math.floor(rand(rng) * (n - 13));
    if (cover[y][x] !== 'none' || terrain[y][x] !== 'ground' || (zone && x >= zone.x - 1 && x <= zone.x + zone.w && y <= zone.y + zone.h + 1)) continue;
    cover[y][x] = 'half';
    if (!connected({ cover, terrain, height }, n, zone)) { cover[y][x] = 'none'; continue; }
    barrels.push({ x, y });
  }

  const humans = o.soldiers.map((s, i) => defend ? (dKind === 'house' ? human(s, cx + [-3, 3, 0, 0, -3, 3, -2, 2][i % 8], cx + [0, 0, -3, 3, 2, -2, 3, -3][i % 8], o.tech) : human(s, cx - 2 + (i % 3) * 2, cx - 1 + (i >> 1 & 1) * 2, o.tech)) : human(s, cx - 3 + i * 2, n - 2, o.tech));

  const base: AlienKind[] = ['trooper', 'trooper', 'sniper', 'trooper', 'heavy', 'trooper', 'trooper', 'sniper'];
  let kinds: AlienKind[] = base.slice(0, 7);
  if (o.missionNo >= 3) kinds.push('trooper');
  if (o.missionNo >= 5) kinds.push('trooper', 'heavy');
  if (o.missionNo >= 7) kinds.push('sniper', 'trooper');
  if (o.objective === 'extract') kinds = base.slice(0, 5);
  if (o.objective === 'hold') kinds = base.slice(0, 4);
  if (o.objective === 'sabotage') kinds = base.slice(0, 6);
  if (o.objective === 'assassinate') kinds = [...base.slice(0, 5), ...(o.boss ? ['heavy'] as AlienKind[] : []), 'commander'];
  if (o.risky) kinds.push('trooper', 'trooper');
  if (defend) kinds = [];

  if (n >= 64) { // большая карта: меньше пришельцев, но они дальше друг от друга
    const pure = kinds.filter(k => k !== 'commander');
    kinds = [...Array.from({ length: Math.round(pure.length * 0.75) }, (_, i) => pure[i % pure.length]), ...kinds.filter(k => k === 'commander')];
  }
  const reach = defend ? new Set<string>() : reachSet({ cover, terrain, height }, n);
  const hold = o.objective === 'hold';
  let spots: [number, number][] = [];
  for (let y = 3; y < n - 8; y++) for (let x = 1; x < n - 1; x++) {
    const inZone = zone && x >= zone.x - 1 && x <= zone.x + zone.w && y <= zone.y + zone.h + 1;
    const dist = Math.hypot(x - cx, y - (n - 2));
    if (cover[y][x] === 'none' && terrain[y][x] === 'ground' && !inZone && reach.has(`${x},${y}`) && dist >= (hold ? 12 : 18)) spots.push([x, y]);
  }
  // диверсия: два маяка далеко друг от друга на стороне пришельцев
  const beacons: GameState['beacons'] = [];
  if (o.objective === 'sabotage') {
    for (const p of shuffle(spots.filter(([, y]) => y <= (n >> 1) - 4), rng)) {
      if (beacons.length === 2) break;
      if (beacons.every(b => Math.hypot(b.x - p[0], b.y - p[1]) >= 14)) beacons.push({ x: p[0], y: p[1], done: false });
    }
    for (const b of beacons) { cover[b.y][b.x] = 'full'; look[b.y][b.x] = 'container'; }
    spots = spots.filter(([x, y]) => !beacons.some(b => Math.abs(b.x - x) + Math.abs(b.y - y) <= 1));
  }
  // пришельцы — группами по 2–3 (патрулируют вместе)
  const centers: [number, number][] = [];
  for (const p of shuffle(spots, rng)) {
    if (centers.length >= Math.ceil(kinds.length / 3)) break;
    if (centers.every(c => Math.hypot(c[0] - p[0], c[1] - p[1]) >= 9)) centers.push(p);
  }
  const chosen: [number, number][] = [];
  const shuffled = shuffle(spots, rng);
  kinds.forEach((_, i) => {
    const c = centers[i % Math.max(1, centers.length)] ?? shuffled[0];
    const near = shuffled.find(p => Math.hypot(p[0] - c[0], p[1] - c[1]) <= 4 && chosen.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 1.5))
      ?? shuffled.find(p => chosen.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 2));
    if (near) chosen.push(near);
  });
  if (o.objective === 'assassinate' && chosen.length === kinds.length) { // командир — в самой дальней точке
    let j = 0;
    chosen.forEach((p, i) => { if (p[1] < chosen[j][1]) j = i; });
    [chosen[j], chosen[chosen.length - 1]] = [chosen[chosen.length - 1], chosen[j]];
  }
  let tn = 0;
  const aliens = kinds.slice(0, chosen.length).map((k, i) => alien(1000 + i, k, k === 'trooper' ? ++tn : 0, chosen[i][0], chosen[i][1], o.difficulty));

  const bossU = o.boss ? aliens.find(a => a.kind === 'commander') : undefined;
  if (bossU) { bossU.maxHp = bossU.hp = Math.round((11 + o.missionNo) * DIFF[o.difficulty].hp); bossU.cut = 1; bossU.name = 'Тиран'; bossU.dmg = [3, 6]; bossU.ap = bossU.maxAp = 3; }
  if (hold) aliens.forEach(a => { a.alert = true; }); // волны атакуют сразу
  const seen = grid(n, false);
  if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) seen[y][x] = true;
  for (const b of beacons) seen[b.y][b.x] = true;

  const brief = {
    clear: 'Цель: уничтожить всех пришельцев.',
    extract: 'Цель: эвакуация — все выжившие бойцы должны дойти до зелёной зоны.',
    hold: `Цель: продержаться ${HOLD_TURNS} ходов. Пришельцы получают подкрепление.`,
    assassinate: o.boss ? 'БОСС: убей Тирана (много HP, броня −1 урон, свита с тяжёлым). Он помечен красным кольцом.' : 'Цель: убить командира пришельцев (он помечен красным кольцом и виден всегда).',
    sabotage: 'Цель: взорвать два маяка (подойди вплотную: заряд тратит 1 AP и 1 гранату).',
    defend: `Цель: выжить ${DEFEND_TURNS} ходов. Отряд ${dKind === 'hill' ? 'удерживает высоту' : dKind === 'house' ? 'обороняет дом на холме' : 'обороняет укрепление'}; пришельцы идут волнами со всех сторон.`,
  }[o.objective];
  return {
    size: n, cover, terrain, height, look, houses, trenches: [], biome: o.biome, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: DIFF[o.difficulty].kits + (o.tech.kits ? 1 : 0),
    aiming: null, mines: [], barrels, fires: [], scorched: grid(n, false), bridges, targetBarrel: null, turning: false, busy: false, vis: grid(n, false), seen, revealed: [], missionNo: o.missionNo, difficulty: o.difficulty,
    objective: o.objective, markId: aliens.find(a => a.kind === 'commander')?.id ?? null, beacons, holdTurns: defend ? DEFEND_TURNS : HOLD_TURNS, zone,
    log: [`Миссия ${o.missionNo} · ${BIOME_NAME[o.biome]}. ${brief}`, 'Разведка: пехота, снайпер, тяжёлый (ломает укрытия).'],
    rng: rng.rng, boss: !!o.boss,
  };
}

/** Подкрепление: в «Удержании» — с юга; в «Обороне» — волна по краям карты (размер растёт с ходом). */
export function reinforce(s: GameState) {
  if (s.objective === 'defend' && s.turnNo < 2) return; // первый ход — на обустройство
  const c = s.size >> 1;
  const free: [number, number][] = [];
  if (s.objective === 'defend') {
    const reach = reachSet(s, s.size, Math.round(s.units.find(u => u.team === 'human' && u.hp > 0)?.x ?? c), Math.round(s.units.find(u => u.team === 'human' && u.hp > 0)?.y ?? c));
    for (let y = 1; y < s.size - 1; y++) for (let x = 1; x < s.size - 1; x++) {
      if (Math.min(x, y, s.size - 1 - x, s.size - 1 - y) > 3 || !reach.has(`${x},${y}`) || s.units.some(u => u.hp > 0 && u.x === x && u.y === y)) continue;
      free.push([x, y]);
    }
  } else {
    for (let y = Math.max(3, s.size - 30); y <= s.size - 22; y++) for (let x = 1; x < s.size - 1; x++) {
      if (s.cover[y][x] === 'none' && s.terrain[y][x] === 'ground' && !s.units.some(u => u.hp > 0 && u.x === x && u.y === y)) free.push([x, y]);
    }
  }
  if (!free.length) return;
  const wave = s.objective === 'defend' ? Math.min(3, 1 + Math.floor(s.turnNo / 5) + (s.size >= 64 ? 1 : 0)) : 1;
  const kinds: AlienKind[] = ['trooper', 'trooper', 'trooper', 'trooper', 'heavy', 'sniper', 'psi'];
  for (let k = 0; k < wave && free.length; k++) {
    const j = Math.floor(rand(s) * free.length), [x, y] = free.splice(j, 1)[0];
    const kind = s.objective === 'defend' ? kinds[Math.floor(rand(s) * Math.min(kinds.length, 4 + Math.floor(s.turnNo / 3)))] : 'trooper';
    const id = Math.max(...s.units.map(u => u.id)) + 1;
    const rn = alien(id, kind, s.units.filter(u => u.kind === 'trooper').length + 1, x, y, s.difficulty);
    rn.alert = true;
    s.units.push(rn);
  }
  log(s, s.objective === 'defend' ? `Волна пришельцев: ${wave}!` : 'Подкрепление пришельцев!');
}
