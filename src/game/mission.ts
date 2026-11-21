import { log, rand } from './combat';
import { BIOME_NAME, DIFF } from './difficulty';
import { applyTraits, shuffle } from './traits';
import { ARMORS, WEAPONS } from './weapons';
import { LOCATIONS } from './locations';
import { stashItems } from './inventory';
import { applyEquip } from './gear';
import { footprint, roofAccess, stairTiles, tileCover, type BuildingSpec } from '../render/buildings';
import type { Stash, Biome, Cover, Difficulty, GameState, House, Look, Objective, Soldier, Tech, Terrain, Unit } from './types';

export const MAP_SIZE = 44;
const SCN: string[] = ['storm', 'holdbld', 'hostage', 'bomb', 'counter', 'escort', 'ambush', 'raid'];
export const HOLD_TURNS = 6;
export const DEFEND_TURNS = 10;
export const HUMAN_AP = 3;
export const ALIEN_AP = 3;

const human = (s: Soldier, x: number, y: number, tech: Tech): Unit => {
  const w = WEAPONS[s.weapon], ar = ARMORS[s.armor];
  const u: Unit = {
    id: s.id, team: 'human', kind: 'soldier', name: s.name, x, y, hp: 8, maxHp: 8, ap: HUMAN_AP, maxAp: HUMAN_AP, move: 5 + w.move + ar.move,
    aim: w.aim + ar.aim, ammo: w.ammo, maxAmmo: w.ammo, weapon: s.weapon, armor: s.armor, burst: w.burst, falloffFrom: w.falloffFrom, falloff: w.falloff, cut: ar.cut, mags: 2, grenades: 2 + (tech.grenades ? 1 : 0), ugl: s.weapon === 'rifle' || s.weapon === 'smg' ? 3 : 0, facing: Math.PI, stance: 'stand', cls: s.cls, abilityUsed: 0, suppressed: false, alert: true, homeX: x, homeY: y, dmg: w.dmg, range: w.range, overwatch: false,
    bleeding: false, fracture: s.fracture, morale: 70, panic: false, traits: s.traits, perks: s.perks, bio: s.bio, kills: 0,
  };
  applyTraits(u);
  applyEquip(u, s);
  for (const p of s.perks) { if (p === 'aim') u.aim += 5; if (p === 'hp') u.maxHp += 2; }
  u.maxHp += ar.hp;
  if (s.cls === 'assault') u.move += 1;
  if (s.cls === 'sniper') u.aim += 5;
  if (s.cls === 'engineer') u.grenades += 1;
  if (s.att?.includes('optic')) { u.aim += 8; u.range += 3; u.optic = true; }
  if (s.att?.includes('mag')) { u.extMag = true; u.maxAmmo = Math.ceil(u.maxAmmo * 1.5); u.ammo = u.maxAmmo; }
  u.smoke = s.cls === 'engineer' ? { white: 2, dense: 1, thermal: 1, red: 1 } : { white: 1 }; // дымовые гранаты в рюкзаке
  if (s.sec) { u.sec = s.sec; u.secAmmo = WEAPONS[s.sec].ammo; }
  if (s.att?.includes('supp')) u.supp = true;
  if (s.att?.includes('nvg')) u.nvg = true;
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
const NAMES = { trooper: 'Піхотинець', sniper: 'Снайпер', psi: 'Псионік', heavy: 'Важкий', commander: 'Командир' };

const alien = (id: number, kind: AlienKind, n: number, x: number, y: number, d: Difficulty): Unit => {
  const b = ALIEN[kind];
  const hp = Math.max(1, Math.round(b.hp! * DIFF[d].hp));
  return {
    id, team: 'alien', kind, name: kind === 'trooper' ? `${NAMES[kind]} ${n}` : NAMES[kind], x, y,
    hp, maxHp: hp, ap: ALIEN_AP, maxAp: ALIEN_AP, move: b.move!, aim: kind === 'psi' ? 0 : b.aim! + DIFF[d].aim,
    ammo: b.ammo!, maxAmmo: b.ammo!, weapon: 'rifle', armor: 'none', burst: kind === 'sniper' ? 1 : kind === 'trooper' ? 2 : 3,
    falloffFrom: 6, falloff: kind === 'sniper' ? 1 : 3, cut: 0, stance: 'stand', cls: 'assault', abilityUsed: 0, suppressed: false, alert: false, homeX: x, homeY: y, mags: 99, grenades: kind === 'heavy' || kind === 'commander' ? 2 : kind === 'trooper' && n % 2 === 0 ? 1 : 0, facing: 0, dmg: b.dmg!, range: b.range!, overwatch: false,
    bleeding: false, fracture: false, morale: 100, panic: false, traits: [], perks: [], bio: '', kills: 0,
  };
};

export interface MissionOpts {
  rng: number;
  difficulty: Difficulty;
  missionNo: number;
  objective: Objective;
  biome: Biome;
  size?: number;
  loc?: number; // номер локації каталогу (великі карти)
  variant?: number;
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

/** Варианты обороны в центре карты: геометрия и правила. */
export const DEFEND_KINDS: { name: string; geo: 'hill' | 'fort' | 'house' | 'bunker' | 'crossroads' | 'bridge'; turns: number; weather?: string; boost?: number; sides?: 'ns'; desc: string }[] = [
  { name: 'Висота', geo: 'hill', turns: 10, desc: 'тримаємо пагорб: висота додає влучності' },
  { name: 'Укріпрайон', geo: 'fort', turns: 10, desc: 'стіна з контейнерів із чотирма воротами' },
  { name: 'Будинок на пагорбі', geo: 'house', turns: 10, desc: 'будинок на вершині (його можна зруйнувати)' },
  { name: 'Бункер', geo: 'bunker', turns: 10, desc: 'окопи й мішки навколо центру' },
  { name: 'Перехрестя', geo: 'crossroads', turns: 10, desc: 'чотири будинки по кутах перехрестя' },
  { name: 'Міст і острів', geo: 'bridge', turns: 10, desc: 'острів у кільці води, чотири мости (їх можна підірвати)' },
  { name: 'Нічна оборона', geo: 'hill', turns: 8, weather: 'night', desc: 'ніч і ліхтарі, але хвилі йдуть одразу' },
  { name: 'Облога', geo: 'fort', turns: 12, desc: '12 ходів замість 10' },
  { name: 'Кліщі', geo: 'house', turns: 10, sides: 'ns', desc: 'прибульці йдуть з півночі й півдня' },
];

/** Оборона: расчищаем центр и строим либо холм с мешками, либо укрепление с воротами. Возвращает вид. */
function fortify(g: Grids, n: number, kind: typeof DEFEND_KINDS[number]['geo'], trenches: { x: number; y: number }[]) {
  const c = n >> 1, R = 9;
  const dig = (list: number[][]) => { for (const [dx, dy] of list) if (g.cover[c + dy][c + dx] === 'none' && g.terrain[c + dy][c + dx] === 'ground') trenches.push({ x: c + dx, y: c + dy }); };
  g.houses = g.houses.filter(h => Math.hypot(h.x + h.w / 2 - c, h.y + h.h / 2 - c) > R + 2).map((h, i) => ({ ...h, id: i }));
  for (let y = c - R; y <= c + R; y++) for (let x = c - R; x <= c + R; x++) {
    if (g.look[y][x] === 'house' && !g.houses.some(h => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h)) { g.cover[y][x] = 'none'; g.look[y][x] = ''; }
    const d = Math.hypot(x - c, y - c);
    if (d > R) continue;
    g.terrain[y][x] = 'ground'; g.bridges = g.bridges.filter(b => b.x !== x || b.y !== y);
    if (g.look[y][x] !== 'house') { g.cover[y][x] = 'none'; g.look[y][x] = ''; }
    g.height[y][x] = kind === 'hill' ? (d <= 2.6 ? 3 : d <= 4.2 ? 2 : d <= 5.8 ? 1 : 0) : kind === 'house' ? (d <= 4 ? 3 : d <= 5.6 ? 2 : d <= 7.2 ? 1 : 0) : 0;
  }
  // плавный спуск от центра к окружающему рельефу: нет обрывов, отрезающих площадку от карты
  for (let y = Math.max(0, c - R - 7); y <= Math.min(n - 1, c + R + 7); y++) for (let x = Math.max(0, c - R - 7); x <= Math.min(n - 1, c + R + 7); x++) {
    const d = Math.hypot(x - c, y - c);
    if (d > R) g.height[y][x] = Math.min(g.height[y][x], Math.floor((d - R) / 1.4));
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
  } else if (kind === 'bunker') { // окопы кольцом и мешки снаружи
    for (let a = 0; a < 14; a++) { const t = (a / 14) * 6.283; trenches.push({ x: Math.round(c + Math.cos(t) * 2.6), y: Math.round(c + Math.sin(t) * 2.6) }); }
    for (let a = 0; a < 24; a++) { const t = (a / 24) * 6.283; if (a % 6 !== 0) put(Math.round(c + Math.cos(t) * 4.8), Math.round(c + Math.sin(t) * 4.8), 'half', 'crate'); }
    put(c - 1, c - 1, 'full', 'container'); put(c + 1, c + 1, 'full', 'container');
  } else if (kind === 'crossroads') { // четыре дома по углам
    for (const [dx, dy] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) {
      for (let y = c + dy; y < c + dy + 2; y++) for (let x = c + dx; x < c + dx + 2; x++) put(x, y, 'full', 'house');
      g.houses.push({ x: c + dx, y: c + dy, w: 2, h: 2, id: g.houses.length, hp: 7 });
    }
    for (const [dx, dy] of [[0, -6], [0, 6], [-6, 0], [6, 0], [-2, -2], [2, 2], [-2, 2], [2, -2]]) put(c + dx, c + dy, 'half', 'crate');
  } else if (kind === 'bridge') { // остров в кольце воды с мостами по сторонам света
    for (let y = c - R; y <= c + R; y++) for (let x = c - R; x <= c + R; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= 5.2 && d <= 7.4) { g.terrain[y][x] = 'water'; g.height[y][x] = 0; g.cover[y][x] = 'none'; g.look[y][x] = ''; }
    }
    for (let r = 5; r <= 8; r++) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (const o of [0, 1]) {
      const x = c + dx * r + (dx === 0 ? o : 0), y = c + dy * r + (dy === 0 ? o : 0);
      if (g.terrain[y][x] === 'water') { g.terrain[y][x] = 'ground'; g.bridges.push({ x, y }); }
    }
    for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3], [-3, 0], [3, 0]]) put(c + dx, c + dy, 'half', 'crate');
  } else { // стена из контейнеров, ворота по сторонам света, ящики внутри
    for (let i = -4; i <= 4; i++) {
      if (Math.abs(i) <= 1) continue;
      put(c + i, c - 4, 'full', 'container'); put(c + i, c + 4, 'full', 'container');
      put(c - 4, c + i, 'full', 'container'); put(c + 4, c + i, 'full', 'container');
    }
    put(c - 2, c - 1, 'half', 'crate'); put(c + 2, c + 1, 'half', 'crate'); put(c + 1, c - 2, 'half', 'crate'); put(c - 1, c + 2, 'half', 'crate');
    for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -6], [0, 6], [-6, 0], [6, 0]]) put(c + dx, c + dy, 'half', 'crate');
  }
  if (kind === 'fort') dig([[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [0, 3], [-3, 0], [3, 0]]);
  if (kind === 'crossroads') dig([[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1]]);
  if (kind === 'bridge') dig([[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -4], [0, 4], [-4, 0], [4, 0]]);
}

export function createMission(o: MissionOpts): GameState {
  if (o.objective === 'rescue') o = { ...o, objective: 'clear' }; // «Порятунок» — лише локації великих карт
  if (SCN.includes(o.objective)) return createHugeForest({ ...o, size: 96 }); // сценарий «квартал»
  if ((o.size ?? 0) >= 256) return createHugeForest(o);
  const rng = { rng: o.rng };
  const n = o.size ?? MAP_SIZE, cx = n >> 1;
  const zone: Zone | null = o.objective === 'extract'
    ? { x: rand(rng) < 0.5 ? 0 : n - 3, y: 0, w: 3, h: 3 } : null;
  const gm = genMap(rng, o.biome, n, o.missionNo, zone);
  const defend = o.objective === 'defend';
  const dv = defend ? DEFEND_KINDS[(o.variant ?? Math.floor(rand(rng) * DEFEND_KINDS.length)) % DEFEND_KINDS.length] : null;
  const preTrenches: { x: number; y: number }[] = [];
  if (dv) fortify(gm, n, dv.geo, preTrenches);
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

  // оборона: бойцы стоят на свободных клетках вокруг центра
  const starts: [number, number][] = [];
  if (defend) {
    const free: [number, number][] = [];
    for (let y = cx - 6; y <= cx + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) {
      if (cover[y][x] === 'none' && terrain[y][x] === 'ground') free.push([x, y]);
    }
    const pref = (p: [number, number]) => Math.hypot(p[0] - cx, p[1] - cx) - (preTrenches.some(t => t.x === p[0] && t.y === p[1]) ? 3 : 0) - ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cover[p[1] + dy]?.[p[0] + dx] && cover[p[1] + dy][p[0] + dx] !== 'none') ? 2 : 0) + (rand(rng) - 0.5) * 1.2;
    free.sort((a, b) => pref(a) - pref(b));
    for (const p of free) { if (starts.length >= o.soldiers.length) break; if (Math.hypot(p[0] - cx, p[1] - cx) <= 6 && starts.every(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) >= 2)) starts.push(p); }
    for (const p of free) { if (starts.length >= o.soldiers.length) break; if (!starts.includes(p)) starts.push(p); }
  }
  const humans = o.soldiers.map((s, i) => defend ? human(s, starts[i][0], starts[i][1], o.tech) : human(s, cx - 3 + i * 2, n - 2, o.tech));

  const base: AlienKind[] = ['trooper', 'trooper', 'sniper', 'trooper', 'heavy', 'trooper', 'trooper', 'sniper'];
  let kinds: AlienKind[] = base.slice(0, 6);
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
  const aliens = kinds.slice(0, chosen.length).map((k, i) => { const a = alien(1000 + i, k, k === 'trooper' ? ++tn : 0, chosen[i][0], chosen[i][1], o.difficulty); a.grp = i % Math.max(1, centers.length); return a; });

  const bossU = o.boss ? aliens.find(a => a.kind === 'commander') : undefined;
  if (bossU) { bossU.maxHp = bossU.hp = Math.round((11 + o.missionNo) * DIFF[o.difficulty].hp); bossU.cut = 1; bossU.name = 'Тиран'; bossU.dmg = [3, 6]; bossU.ap = bossU.maxAp = 3; }
  if (hold) aliens.forEach(a => { a.alert = true; }); // волны атакуют сразу
  const seen = grid(n, false);
  if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) seen[y][x] = true;
  for (const b of beacons) seen[b.y][b.x] = true;

  const brief = {
    clear: 'Ціль: знищити всіх прибульців.',
    rescue: 'Ціль: звільнити полонених.',
    storm: '', holdbld: '', hostage: '', bomb: '', counter: '', escort: '', ambush: '', raid: '',
    extract: 'Ціль: евакуація — усі вцілілі бійці мають дійти до зеленої зони.',
    hold: `Ціль: протриматися ${HOLD_TURNS} ходів. Прибульці отримують підкріплення.`,
    assassinate: o.boss ? 'БОС: убий Тирана (багато HP, броня −1 шкоди, свита з важким). Його позначено червоним кільцем.' : 'Ціль: вбити командира прибульців (його позначено червоним кільцем, і він видимий завжди).',
    sabotage: 'Ціль: підірвати два маяки (підійди впритул: заряд витрачає 1 AP і 1 гранату).',
    defend: `Ціль: вижити ${dv?.turns ?? DEFEND_TURNS} ходів. ${dv ? dv.name : 'Оборона'}: ${dv?.desc ?? ''}. Прибульці йдуть хвилями з усіх боків${dv?.sides ? ' (тут — з півночі й півдня)' : ''}.`,
  }[o.objective];
  const st: GameState = {
    size: n, cover, terrain, height, look, houses, trenches: preTrenches, biome: o.biome, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: DIFF[o.difficulty].kits + (o.tech.kits ? 1 : 0),
    aiming: null, mines: [], barrels, fires: [], scorched: grid(n, false), bridges, targetBarrel: null, turning: false, busy: false, vis: grid(n, false), seen, revealed: [], missionNo: o.missionNo, difficulty: o.difficulty,
    objective: o.objective, markId: aliens.find(a => a.kind === 'commander')?.id ?? null, beacons, holdTurns: defend ? (dv?.turns ?? DEFEND_TURNS) : HOLD_TURNS, zone, weather: dv?.weather, sides: dv?.sides ?? 'all', waveBoost: dv?.boost ?? 0, defendName: dv?.name,
    log: [`Місія ${o.missionNo} · ${BIOME_NAME[o.biome]}. ${brief}`, 'Розвідка: піхота, снайпер, важкий (ламає укриття).'],
    rng: rng.rng, boss: !!o.boss,
  };
  st.mats = defend ? 8 : 4; st.loot = [];
  if (defend || hold) planWave(st); // волну видно заранее
  return st;
}

/** Подкрепление: в «Удержании» — с юга; в «Обороне» — волна по краям карты (размер растёт с ходом). */
/** Клетки, где может появиться подкрепление. */
function spawnTiles(s: GameState): [number, number][] {
  const c = s.size >> 1;
  const free: [number, number][] = [];
  if (s.objective === 'defend') {
    const hu = s.units.find(u => u.team === 'human' && u.hp > 0);
    const reach = reachSet(s, s.size, Math.round(hu?.x ?? c), Math.round(hu?.y ?? c));
    for (let y = 1; y < s.size - 1; y++) for (let x = 1; x < s.size - 1; x++) {
      if (Math.min(x, y, s.size - 1 - x, s.size - 1 - y) > 3 || (s.sides === 'ns' && Math.min(y, s.size - 1 - y) > 6) || !reach.has(`${x},${y}`) || s.units.some(u => u.hp > 0 && u.x === x && u.y === y)) continue;
      free.push([x, y]);
    }
  } else {
    for (let y = Math.max(3, s.size - 30); y <= s.size - 22; y++) for (let x = 1; x < s.size - 1; x++) {
      if (s.cover[y][x] === 'none' && s.terrain[y][x] === 'ground' && !s.units.some(u => u.hp > 0 && u.x === x && u.y === y)) free.push([x, y]);
    }
  }
  return free;
}

/** Планирует следующую волну заранее: игрок видит, откуда и кто придёт, и успевает подготовить оборону. */
export function planWave(s: GameState) {
  const free = spawnTiles(s);
  const turn = s.turnNo + 1;
  const wave = s.objective === 'defend' ? Math.min(3 + (s.waveBoost ?? 0), 1 + Math.floor(turn / 5) + (s.size >= 64 ? 1 : 0) + (s.waveBoost ?? 0)) : 1;
  const kinds: AlienKind[] = ['trooper', 'trooper', 'trooper', 'trooper', 'heavy', 'sniper', 'psi'];
  const plan: NonNullable<GameState['wavePlan']> = [];
  for (let k = 0; k < wave && free.length; k++) {
    const j = Math.floor(rand(s) * free.length), [x, y] = free.splice(j, 1)[0];
    const kind = s.objective === 'defend' ? kinds[Math.floor(rand(s) * Math.min(kinds.length, 4 + Math.floor(turn / 4)))] : 'trooper';
    plan.push({ x, y, kind });
  }
  s.wavePlan = plan;
}

/** Подкрепление по плану: в «Удержании» — с юга; в «Обороне» — волна по краям карты (размер растёт с ходом). */
export function reinforce(s: GameState) {
  if (s.objective === 'defend' && s.turnNo < 2) return; // первые ходы — подготовка: стройка и разведка
  if (!s.wavePlan) planWave(s);
  const plan = s.wavePlan ?? [];
  let spawned = 0;
  plan.forEach((p, k) => {
    if (s.units.some(u => u.hp > 0 && u.x === p.x && u.y === p.y)) return;
    const id = Math.max(...s.units.map(u => u.id)) + 1;
    const rn = alien(id, p.kind as AlienKind, s.units.filter(u => u.kind === 'trooper').length + 1, p.x, p.y, s.difficulty);
    rn.alert = true;
    rn.grp = 100 + s.turnNo * 10 + Math.floor(k / 2); // волна делится на пары
    s.units.push(rn);
    spawned++;
  });
  if (!spawned) { planWave(s); return; }
  s.mats = (s.mats ?? 0) + 2; // снабжение после каждой волны
  log(s, s.objective === 'defend' ? `Хвиля прибульців: ${spawned}! Постачання: +2 матеріали.` : 'Підкріплення прибульців!');
  planWave(s);
}


// ---------- ОГРОМНЫЙ ЛЕС ----------
const hhash = (a: number, b: number, seed: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1597334677)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hnoise = (x: number, y: number, seed: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hhash(xi, yi, seed) * (1 - sx) + hhash(xi + 1, yi, seed) * sx) * (1 - sy) + (hhash(xi, yi + 1, seed) * (1 - sx) + hhash(xi + 1, yi + 1, seed) * sx) * sy;
};

/** Огромная карта (до 1024): лес, холмы и поляны; развалины-лагеря и ямы, где пришельцы ждут засады. Линейная по размеру генерация. */
/** Свободная клетка внутри здания на этаже f (не на лестнице), ближе к центру. */
function innerSpot(b: BuildingSpec, f: number, taken: (x: number, y: number) => boolean): [number, number] | null {
  const st = stairTiles(b);
  let best: [number, number] | null = null, bd = 1e9;
  for (let dy = 1; dy < b.d - 1; dy++) for (let dx = 1; dx < b.w - 1; dx++) {
    if (tileCover(b, dx, dy, f) !== 'none' || (dx === st.dx && dy >= st.bottom && dy <= st.top) || taken(b.x! + dx, b.y! + dy)) continue;
    const d = Math.hypot(dx - b.w / 2, dy - b.d / 2);
    if (d < bd) { bd = d; best = [b.x! + dx, b.y! + dy]; }
  }
  return best;
}

function createHugeForest(o: MissionOpts): GameState {
  const n = o.size!, seed = o.rng & 0xffff, rng = { rng: o.rng };
  const scn = SCN.includes(o.objective) ? o.objective as NonNullable<GameState['scn']> : undefined;
  let loc = LOCATIONS[((o.loc ?? 0) % LOCATIONS.length + LOCATIONS.length) % LOCATIONS.length];
  if (scn) { const L = LOCATIONS[[5, 6, 7, 8, 10, 11, 15, 16, 17, 45, 46, 47][(o.rng >>> 3) % 12]]; loc = { ...L, radius: 17, fill: 0.88, floors: [2, 3], towns: 1, forest: Math.min(L.forest, 0.4), water: 0.02, weather: L.weather ?? (o.missionNo % 3 === 0 ? 'dusk' : undefined) }; }
  const cover: Cover[][] = grid(n, 'none' as Cover), terrain: Terrain[][] = grid(n, 'ground' as Terrain), look: Look[][] = grid(n, '' as Look), height: number[][] = grid(n, 0);
  const houses: House[] = [], bldgs: BuildingSpec[] = [], roads: { x: number; y: number; w: number; h: number }[] = [];
  const bmask = grid(n, false); // забудова и отступ вокруг
  // холмы: крупный и средний шум; масштаб зависит от локации
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v0 = hnoise(x / 70, y / 70, seed) * 0.65 + hnoise(x / 24, y / 24, seed + 3) * 0.35;
    const v = (v0 - 0.5) * loc.hill + 0.5;
    height[y][x] = v < 0.42 ? 0 : v < 0.55 ? 1 : v < 0.66 ? 2 : 3;
  }
  const startX = n >> 1, startY = n - 6;
  const clear = (x: number, y: number) => Math.hypot(x - startX, y - startY) < 16; // посадочная поляна
  // озёра: порог — квантиль шума, чтобы доля воды = loc.water
  const wnoise = (x: number, y: number) => hnoise(x / 80, y / 80, seed + 29) * 0.6 + hnoise(x / 30, y / 30, seed + 31) * 0.4;
  const samp: number[] = []; for (let y = 0; y < n; y += 8) for (let x = 0; x < n; x += 8) samp.push(wnoise(x, y));
  samp.sort((a, b) => a - b);
  const wth = samp[Math.floor(samp.length * loc.water)] ?? -1;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) if (!clear(x, y) && Math.hypot(x - startX, y - startY) > 26 && wnoise(x, y) < wth) { terrain[y][x] = 'water'; height[y][x] = 0; }
  // лес: густота по шуму и локации
  const k = loc.forest, off = 0.62 - 0.3 * k, mul = 0.3 + 0.35 * k;
  for (let y = 2; y < n - 2; y++) for (let x = 1; x < n - 1; x++) {
    if (clear(x, y) || terrain[y][x] === 'water') continue;
    const d = hnoise(x / 40, y / 40, seed + 11) * 0.7 + hnoise(x / 9, y / 9, seed + 17) * 0.3;
    const r = hhash(x, y, seed + 5);
    if (r < Math.max(0, d - off) * mul) { const tree = hhash(x, y, seed + 9) < 0.72; cover[y][x] = tree ? 'full' : 'half'; look[y][x] = tree ? 'tree' : 'bush'; }
    else if (r > 0.9985) { const full = hhash(x, y, seed + 13) < 0.4; cover[y][x] = full ? 'full' : 'half'; look[y][x] = 'rock'; }
  }
  // населённые пункты: кварталы зданий с этажами, улицы 1–2 клетки; пришельцы ждут внутри и вокруг
  const camps: { x: number; y: number }[] = [];
  const nCamps = scn ? 1 : Math.max(6, Math.round(n / 40 * loc.towns));
  for (let t = 0; camps.length < nCamps && t < nCamps * 40; t++) {
    const cx = scn ? n >> 1 : 30 + Math.floor(rand(rng) * (n - 60)), cy = scn ? (n >> 1) - 8 : 20 + Math.floor(rand(rng) * (n - 90));
    if (!scn && Math.hypot(cx - startX, cy - startY) < 80 || camps.some(c => Math.hypot(c.x - cx, c.y - cy) < loc.radius * 2 + 24)) continue;
    camps.push({ x: cx, y: cy });
    const R = loc.radius, lo = height[cy][cx];
    for (let yy = cy - R - 2; yy <= cy + R + 2; yy++) for (let xx = cx - R - 2; xx <= cx + R + 2; xx++) { // расчистка и выравнивание
      if (Math.hypot(xx - cx, yy - cy) < R + 2.5 && cover[yy]?.[xx] !== undefined) { cover[yy][xx] = 'none'; look[yy][xx] = ''; height[yy][xx] = lo; if (terrain[yy][xx] === 'water' && Math.hypot(xx - cx, yy - cy) < R * 0.7) terrain[yy][xx] = 'ground'; }
    }
    const ri = (a: [number, number]) => a[0] + Math.floor(rand(rng) * (a[1] - a[0] + 1));
    for (let y = cy - R; y < cy + R;) {
      let rowD = 3, x = cx - R;
      while (x < cx + R) {
        const w = ri(loc.w), dd = ri(loc.d);
        rowD = Math.max(rowD, dd);
        const mx = x + w / 2, my = y + dd / 2;
        if (Math.hypot(mx - cx, my - cy) < R && rand(rng) < loc.fill && x > 1 && y > 1 && x + w < n - 1 && y + dd < n - 2) {
          let ok = true;
          for (let yy = y - 1; yy <= y + dd && ok; yy++) for (let xx = x - 1; xx <= x + w && ok; xx++) if (bmask[yy][xx] || terrain[yy][xx] === 'water' || clear(xx, yy)) ok = false;
          if (ok) {
            const style = loc.styles[Math.floor(rand(rng) * loc.styles.length)];
            const sp: BuildingSpec = { w, d: dd, floors: ri(loc.floors), style, door: rand(rng) < 0.6 ? 'closed' : 'open', roof: rand(rng) < loc.gable ? 'gable' : 'flat', damage: Math.min(1, Math.max(0, loc.damage + (rand(rng) - 0.5) * 0.4)), seed: Math.floor(rand(rng) * 1e6), id: bldgs.length, x, y };
            for (const f of footprint(sp)) { cover[y + f.dy][x + f.dx] = f.cover; look[y + f.dy][x + f.dx] = f.look as Look; height[y + f.dy][x + f.dx] = lo; }
            for (let yy = y - 1; yy <= y + dd; yy++) for (let xx = x - 1; xx <= x + w; xx++) bmask[yy][xx] = true;
            bldgs.push(sp);
          }
        }
        x += w + 1 + (rand(rng) < 0.3 ? 1 : 0);
      }
      { const rx0 = Math.max(2, cx - R), rx1 = Math.min(n - 2, cx + R), ry0 = y + rowD; if (rx1 - rx0 > 4 && ry0 + 2 < n - 2 && Math.hypot(0, ry0 + 1 - cy) < R) roads.push({ x: rx0, y: ry0, w: rx1 - rx0, h: 2 }); }
      y += rowD + 2;
    }
    for (let i = 0; i < loc.crates; i++) { const xx = cx - R + Math.floor(rand(rng) * (2 * R + 1)), yy = cy - R + Math.floor(rand(rng) * (2 * R + 1)); if (cover[yy]?.[xx] === 'none' && !bmask[yy][xx] && terrain[yy][xx] === 'ground') { const half = rand(rng) < 0.6; cover[yy][xx] = half ? 'half' : 'full'; look[yy][xx] = half ? 'crate' : 'container'; } }
  }
  const roadm = new Uint8Array(n * n);
  for (const r of roads) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) if (!bmask[yy][xx] || cover[yy][xx] === 'none') { if (terrain[yy][xx] === 'ground') roadm[yy * n + xx] = 1; }
  const doorFront = new Set<string>(); // клетки перед дверями не загораживаем
  for (const b of bldgs) for (let k2 = -1; k2 <= 1; k2++) for (let r2 = 0; r2 <= 1; r2++) doorFront.add(`${b.x! + (b.w >> 1) + k2},${b.y! + b.d + r2}`);
  for (const r of roads) for (let xx = r.x + 2; xx < r.x + r.w - 2; xx += 5 + Math.floor(rand(rng) * 4)) { // машины на улицах — полуукрытие
    const yy = r.y + Math.floor(rand(rng) * 2);
    if (cover[yy][xx] === 'none' && roadm[yy * n + xx] && !doorFront.has(`${xx},${yy}`) && rand(rng) < 0.5) { cover[yy][xx] = 'half'; look[yy][xx] = 'car'; }
  }
  const bidx = new Int16Array(n * n);
  bldgs.forEach((b, i) => { for (let yy = b.y!; yy < b.y! + b.d; yy++) for (let xx = b.x!; xx < b.x! + b.w; xx++) bidx[yy * n + xx] = i + 1; });
  // ямы: по одной, по лесу; в яме сидит пришелец
  const pits: { x: number; y: number }[] = [];
  const nPits = scn ? 0 : Math.round(n / 14);
  for (let t = 0; pits.length < nPits && t < nPits * 30; t++) {
    const x = 6 + Math.floor(rand(rng) * (n - 12)), y = 6 + Math.floor(rand(rng) * (n - 40));
    if (cover[y][x] !== 'none' || Math.hypot(x - startX, y - startY) < 60 || pits.some(p => Math.hypot(p.x - x, p.y - y) < 18) || camps.some(c => Math.hypot(c.x - x, c.y - y) < loc.radius + 4) || terrain[y][x] === 'water') continue;
    pits.push({ x, y });
  }
  // тайники снабжения по всей карте: магазины, гранаты и материалы вдали от базы
  const loot: NonNullable<GameState['loot']> = [];
  for (let t = 0, want = Math.round(n / 16); loot.length < want && t < want * 30; t++) {
    const x = 5 + Math.floor(rand(rng) * (n - 10)), y = 5 + Math.floor(rand(rng) * (n - 30));
    if (cover[y][x] !== 'none' || terrain[y][x] === 'water' || loot.some(l => Math.hypot(l.x - x, l.y - y) < 12)) continue;
    const r = rand(rng);
    loot.push({ x, y, kind: r < 0.4 ? 'mag' : r < 0.7 ? 'gren' : 'mat', n: 1 });
  }
  const humans = o.soldiers.map((s, i) => human(s, startX - 3 + i * 2, startY, o.tech));
  const aliens: Unit[] = [];
  let id = 1000, tn = 0;
  const campKinds: AlienKind[] = ['trooper', 'trooper', 'heavy', 'sniper', 'trooper'];
  camps.forEach((c, ci) => {
    const cnt = Math.max(2, Math.round((3 + (ci % 2)) * loc.aliens));
    for (let k = 0; k < cnt; k++) {
      let x = c.x, y = c.y;
      for (let tries = 0; tries < 30; tries++) { x = c.x - 5 + Math.floor(rand(rng) * 11); y = c.y - 5 + Math.floor(rand(rng) * 11); if (cover[y][x] === 'none' && terrain[y][x] === 'ground' && !aliens.some(a => a.x === x && a.y === y)) break; }
      const hq = ci === 0 && k === 0; // лагерь 0 — штаб с командиром
      const kind: AlienKind = hq ? 'commander' : campKinds[(ci + k) % campKinds.length];
      const a = alien(id++, kind, kind === 'trooper' ? ++tn : 0, x, y, o.difficulty);
      if (hq) a.name = 'Командир штабу';
      a.grp = ci; a.dormant = true; a.alert = false;
      aliens.push(a);
    }
  });
  const occ = (x: number, y: number) => aliens.some(a => a.x === x && a.y === y);
  // штаб: командир на верхнем этаже ближайшего многоэтажного здания
  const hqU = aliens.find(a => a.kind === 'commander');
  if (hqU && camps[0]) {
    const hb = bldgs.filter(b => b.floors >= 2 && Math.hypot(b.x! + b.w / 2 - camps[0].x, b.y! + b.d / 2 - camps[0].y) < loc.radius + 3).sort((a, b) => Math.hypot(a.x! - camps[0].x, a.y! - camps[0].y) - Math.hypot(b.x! - camps[0].x, b.y! - camps[0].y))[0];
    const sp = hb && innerSpot(hb, hb.floors - 1, occ);
    if (hb && sp) { hqU.x = sp[0]; hqU.y = sp[1]; hqU.fl = hb.floors - 1; hqU.name = 'Командир штабу (нагорі)'; }
  }
  // засады за дверями: боец стоит внутри у входа и ждёт
  camps.forEach((c, ci) => {
    let n2 = 0;
    for (const b of bldgs) {
      if (n2 >= 3 || Math.hypot(b.x! + b.w / 2 - c.x, b.y! + b.d / 2 - c.y) > loc.radius || hhash(b.id!, 91, seed) > 0.15) continue;
      const x = b.x! + (b.w >> 1), y = b.y! + b.d - 2;
      if (tileCover(b, x - b.x!, y - b.y!, 0) !== 'none' || occ(x, y)) continue;
      const a = alien(id++, 'trooper', ++tn, x, y, o.difficulty);
      a.name = 'Засідка за дверима'; a.grp = ci; a.dormant = true; a.alert = false;
      aliens.push(a); n2++;
    }
  });
  // турели на базах и заводах: стоят на месте, прочные и меткие
  if (loc.obj === 'sabotage') camps.forEach((c, ci) => {
    if (ci === 0 || ci % 2) return;
    for (let k = 0; k < 1 && aliens.filter(q => q.static).length < 8; k++) {
      let x = c.x + 5, y = c.y + 2;
      for (let t2 = 0; t2 < 20 && (cover[y]?.[x] !== 'none' || terrain[y][x] !== 'ground' || occ(x, y)); t2++) { x = c.x + Math.floor(rand(rng) * 13) - 6; y = c.y + Math.floor(rand(rng) * 13) - 6; }
      if (cover[y]?.[x] !== 'none' || occ(x, y)) continue;
      const a = alien(id++, 'heavy', 0, x, y, o.difficulty);
      a.name = 'Турель'; a.static = true; a.maxHp = a.hp = 14; a.aim += 10; a.grp = ci; a.dormant = true; a.alert = false;
      aliens.push(a);
    }
  });
  camps.forEach((c, ci) => { // склады: в лагерях с нечётным номером лежит запас снабжения
    if (ci % 3 !== 1) return;
    for (let k = 0; k < 4; k++) { const x = c.x - 3 + k * 2, y = c.y + 3; if (cover[y][x] === 'none') loot.push({ x, y, kind: (['mag', 'gren', 'mat', 'mag'] as const)[k], n: 1 }); }
  });
  pits.forEach((p, i) => {
    const a = alien(id++, i % 5 === 0 ? 'sniper' : 'trooper', ++tn, p.x, p.y, o.difficulty);
    a.grp = 500 + i; a.dormant = true; a.hidden = true; a.alert = false;
    aliens.push(a);
  });
  // снайперы на верхних этажах: сидят на месте, стреляют из окон (до 25)
  let upN = 0;
  for (const b of bldgs) {
    if (upN >= 25 || b.floors < 2 || hhash(b.id!, 77, seed) > 0.08) continue;
    const f = b.floors - 1, st = stairTiles(b);
    const spots: [number, number][] = [];
    for (let dy = 1; dy < b.d - 1; dy++) for (let dx = 1; dx < b.w - 1; dx++) if (tileCover(b, dx, dy, f) === 'none' && !(dx === st.dx && dy >= st.bottom && dy <= st.top)) spots.push([dx, dy]);
    if (!spots.length) continue;
    const [dx, dy] = spots[Math.floor(hhash(b.id!, 78, seed) * spots.length)];
    const a = alien(id++, 'sniper', 0, b.x! + dx, b.y! + dy, o.difficulty);
    a.fl = f; a.grp = 800 + upN; a.dormant = true; a.alert = false;
    aliens.push(a); upN++;
  }
  // снайперские гнёзда: на холмах, далеко от старта; сидят скрытно и замечают издалека
  for (let t = 0, want = scn ? 0 : Math.round(n / 40), made = 0; made < want && t < want * 60; t++) {
    const x = 8 + Math.floor(rand(rng) * (n - 16)), y = 8 + Math.floor(rand(rng) * (n - 50));
    if (height[y][x] < 2 || cover[y][x] !== 'none' || Math.hypot(x - startX, y - startY) < 90 || aliens.some(a => Math.hypot(a.x - x, a.y - y) < 10)) continue;
    const a = alien(id++, 'sniper', 0, x, y, o.difficulty);
    a.grp = 700 + made; a.dormant = true; a.hidden = true; a.alert = false;
    aliens.push(a); made++;
  }
  const campSpot = (c: { x: number; y: number }): [number, number] => {
    const b = bldgs.find(q => Math.hypot(q.x! + q.w / 2 - c.x, q.y! + q.d / 2 - c.y) < loc.radius);
    const sp = b && innerSpot(b, 0, occ);
    if (sp) return sp;
    for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = c.x + dx, y = c.y + dy; if (cover[y]?.[x] === 'none' && terrain[y][x] === 'ground' && !occ(x, y)) return [x, y]; }
    return [c.x, c.y];
  };
  const captives: { x: number; y: number; fl?: number; saved: boolean }[] = [];
  const hugeBeacons: { x: number; y: number; done: boolean; fl?: number }[] = [];
  if (loc.obj === 'rescue') camps.slice(1, 4).forEach(c => { const [x, y] = campSpot(c); captives.push({ x, y, saved: false }); });
  if (loc.obj === 'sabotage') camps.slice(1, 4).forEach(c => { const [x, y] = campSpot(c); hugeBeacons.push({ x, y, done: false }); });
  // ——— сценарий «квартал»: одно здание-цель, всё остальное — вокруг ———
  let objectiveOut: Objective = loc.obj === 'clear' ? 'clear' : loc.obj, holdTurnsOut = HOLD_TURNS, targetIdx: number | undefined;
  let exitOut: { x: number; y: number } | undefined, raidOut: number | undefined;
  if (scn) {
    aliens.length = 0; captives.length = 0; hugeBeacons.length = 0; loot.length = 0;
    const cand = bldgs.map((b, i) => ({ b, i })).filter(e => e.b.floors >= 2).sort((a, c) => c.b.floors * c.b.w * c.b.d - a.b.floors * a.b.w * a.b.d)[0] ?? bldgs.map((b, i) => ({ b, i })).sort((a, c) => c.b.w * c.b.d - a.b.w * a.b.d)[0];
    if (cand) {
      targetIdx = cand.i; const tb = cand.b;
      tb.damage = Math.min(tb.damage ?? 0, 0.12); tb.roof = 'flat'; tb.door = scn === 'ambush' ? 'open' : 'closed';
      for (const f of footprint(tb)) { cover[tb.y! + f.dy][tb.x! + f.dx] = f.cover; look[tb.y! + f.dy][tb.x! + f.dx] = f.look as Look; }
      const taken = (x: number, y: number) => aliens.some(a => a.x === x && a.y === y && (a.fl ?? 0) === curF) || humans.some(h => h.x === x && h.y === y);
      let curF = 0;
      const put = (kind: AlienKind, f: number, name?: string) => {
        curF = f; const sp = innerSpot(tb, f, taken); if (!sp) return;
        const a = alien(id++, kind, kind === 'trooper' ? ++tn : 0, sp[0], sp[1], o.difficulty);
        a.fl = f; a.grp = 0; a.dormant = true; a.alert = false; if (name) a.name = name; aliens.push(a);
      };
      const ring = (n2: number) => { for (let k2 = 0; k2 < n2; k2++) { const ang = (k2 / n2) * 6.283, x = Math.round(tb.x! + tb.w / 2 + Math.cos(ang) * (tb.w / 2 + 3)), y = Math.round(tb.y! + tb.d / 2 + Math.sin(ang) * (tb.d / 2 + 3)); if (cover[y]?.[x] === 'none' && terrain[y][x] === 'ground' && !aliens.some(a => a.x === x && a.y === y)) { const a = alien(id++, k2 % 3 === 0 ? 'heavy' : 'trooper', ++tn, x, y, o.difficulty); a.grp = 0; a.dormant = true; a.alert = false; aliens.push(a); } } };
      if (scn === 'storm') {
        for (let f = 0; f < tb.floors; f++) { put('trooper', f); put(f === 0 ? 'heavy' : 'trooper', f); }
        put('sniper', tb.floors - 1); put('commander', tb.floors - 1, 'Командир гарнізону'); ring(5);
        objectiveOut = 'clear';
      } else if (scn === 'hostage' || scn === 'escort') {
        const f = tb.floors - 1, sp = innerSpot(tb, f, () => false);
        if (sp) captives.push({ x: sp[0], y: sp[1], fl: f, saved: false });
        for (let k2 = 0; k2 < tb.floors; k2++) { put('trooper', k2); put(k2 === tb.floors - 1 ? 'heavy' : 'trooper', k2); }
        put('sniper', tb.floors - 1); ring(4);
        objectiveOut = 'rescue';
      } else if (scn === 'bomb') { // заряд на верхнем этаже
        const f = tb.floors - 1, sp = innerSpot(tb, f, () => false);
        if (sp) hugeBeacons.push({ x: sp[0], y: sp[1], done: false, fl: f });
        for (let k2 = 0; k2 < tb.floors; k2++) put('trooper', k2);
        put('heavy', 0); put('sniper', tb.floors - 1); ring(4);
        objectiveOut = 'sabotage';
      } else if (scn === 'counter') { // снайперы на крышах вокруг, бодрствуют
        const roofs = bldgs.filter(b => b !== tb && b.floors >= 2).sort((a, c) => Math.hypot(a.x! - n / 2, a.y! - n / 2) - Math.hypot(c.x! - n / 2, c.y! - n / 2)).slice(0, 3);
        roofs.forEach((b, i) => {
          const f = roofAccess(b) ? b.floors : b.floors - 1, sp = innerSpot(b, f, occ);
          if (!sp) return;
          const a = alien(id++, 'sniper', 0, sp[0], sp[1], o.difficulty);
          a.fl = f; a.grp = 10 + i; a.alert = true; a.dormant = false; a.name = 'Снайпер на даху'; aliens.push(a);
        });
        ring(5); objectiveOut = 'clear';
      } else if (scn === 'ambush') { // колонна идёт по самой длинной улице; отряд ждёт в доме у дороги
        const r = [...roads].sort((a, c) => c.w - a.w)[0];
        if (r) {
          exitOut = { x: r.x, y: r.y };
          const kinds: AlienKind[] = ['trooper', 'trooper', 'heavy', 'trooper', 'commander', 'trooper', 'heavy', 'trooper'];
          kinds.forEach((kd, k2) => {
            const x = r.x + r.w - 2 - k2 * 2, y = r.y + (k2 % 2);
            const a = alien(id++, kd, kd === 'trooper' ? ++tn : 0, x, y, o.difficulty);
            a.grp = 0; a.alert = false; a.dormant = false; a.march = { x: r.x - 1, y: r.y }; if (kd === 'commander') a.name = 'Командир колони'; aliens.push(a);
          });
          const mid = r.x + r.w / 2;
          const hb = bldgs.filter(b => b.y! + b.d <= r.y && r.y - (b.y! + b.d) <= 2).sort((a, c) => Math.abs(a.x! + a.w / 2 - mid) - Math.abs(c.x! + c.w / 2 - mid))[0];
          if (hb) { const taken2 = (x: number, y: number) => humans.some(h => h.x === x && h.y === y); humans.forEach(h => { const sp = innerSpot(hb, 0, taken2); if (sp) { h.x = sp[0]; h.y = sp[1]; h.homeX = sp[0]; h.homeY = sp[1]; } }); }
        }
        objectiveOut = 'clear';
      } else if (scn === 'raid') { // добыча на складе, время ограничено, волны с краёв
        const f0: [number, number][] = [];
        for (let dy = 1; dy < tb.d - 1; dy++) for (let dx = 1; dx < tb.w - 1; dx++) if (tileCover(tb, dx, dy, 0) === 'none') f0.push([tb.x! + dx, tb.y! + dy]);
        f0.slice(0, 6).forEach(([x, y], k2) => loot.push({ x, y, kind: (['mat', 'mag', 'gren', 'mat', 'mag', 'mat'] as const)[k2], n: 1, raid: true }));
        put('trooper', 0); put('heavy', 0); ring(3);
        objectiveOut = 'defend'; holdTurnsOut = 99; raidOut = 150;
      } else { // holdbld: бойцы внутри здания, волны снаружи
        humans.forEach(h => { curF = 0; const sp = innerSpot(tb, 0, taken); if (sp) { h.x = sp[0]; h.y = sp[1]; h.homeX = sp[0]; h.homeY = sp[1]; } });
        objectiveOut = 'defend'; holdTurnsOut = 12;
      }
    }
  }
  // ящики с содержимым: в домах (30% зданий) и на улице (ящики и контейнеры)
  if (!scn) for (const b of bldgs) {
    if (hhash(b.id!, 55, seed) > 0.3) continue;
    const st2 = stairTiles(b);
    spot: for (let dy = 1; dy < b.d - 1; dy++) for (let dx = 1; dx < b.w - 1; dx++) {
      if (tileCover(b, dx, dy, 0) !== 'none' || (dx === st2.dx && dy >= st2.bottom && dy <= st2.top)) continue;
      const x = b.x! + dx, y = b.y! + dy; cover[y][x] = 'half'; look[y][x] = 'crate'; break spot;
    }
  }
  const stash: Stash[] = [];
  for (let y = 0; y < n && stash.length < 1800; y++) for (let x = 0; x < n; x++) {
    const l = look[y][x]; if (l !== 'crate' && l !== 'container') continue;
    const big = l === 'container'; stash.push({ x, y, opened: false, big, items: stashItems(rng, big) });
  }
  const w0 = loc.weather ?? (o.missionNo % 2 === 0 ? 'night' : undefined); // стартовая погода
  const cycleOn = w0 === undefined || w0 === 'night' || w0 === 'dusk' || w0 === 'dawn'; // дождь и туман — без смены суток
  const tod0 = w0 === 'night' ? 0.02 : w0 === 'dusk' ? 0.7 : w0 === 'dawn' ? 0.27 : 0.42;
  const seen = grid(n, false);
  const st: GameState = {
    exitPt: exitOut, raidUntil: raidOut,
    size: n, cover, terrain, height, look, houses, bldgs, bidx, roads, roadm, locName: loc.name, trenches: [], biome: 'forest', stash, locId: scn ? undefined : loc.id, scn, target: targetIdx, captives, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: DIFF[o.difficulty].kits + (o.tech.kits ? 1 : 0),
    aiming: null, mines: [], barrels: [], fires: [], scorched: grid(n, false), bridges: [], targetBarrel: null, turning: false, busy: false, vis: grid(n, false), seen, revealed: [], missionNo: o.missionNo, difficulty: o.difficulty,
    objective: objectiveOut, markId: null, beacons: hugeBeacons, holdTurns: holdTurnsOut, zone: null, weather: cycleOn ? undefined : w0, todOn: cycleOn, tod: tod0, tod0, sides: 'all', waveBoost: 0,
    log: scn ? [`Місія ${o.missionNo} · Квартал «${loc.name}» (${loc.arch}). ${({ storm: 'ШТУРМ БУДІВЛІ: ворог засів у найбільшому будинку — на всіх поверхах і на даху. Заходьте через двері чи вікна, зачищайте поверх за поверхом (⬆/⬇ біля сходів). Ціль: знищити гарнізон.', hostage: 'ЗАРУЧНИК: бранця утримують на верхньому поверсі будинку. Прорвіться нагору й дійдіть до нього живим. Ціль: звільнити бранця.', bomb: 'ПІДРИВ БУДІВЛІ: на верхньому поверсі стоїть маяк. Прорвіться нагору, закладіть заряд (⚡ Підірвати біля маяка, потрібна граната) і біжіть геть: вибух через 25 с, радіус 6.', counter: 'КОНТРСНАЙПЕР: на дахах навколо засіли три снайпери й уже чекають. Підходьте крізь укриття, зайдіть у будинки й заберіть їх. Ціль: прибрати снайперів і весь гарнізон.', escort: 'ЕВАКУАЦІЯ ЗАРУЧНИКА: бранця тримають нагорі. Після звільнення піднімуть тривогу — усім бігти до зеленої зони на півдні.', ambush: 'ЗАСІДКА: колона прибульців іде вулицею на захід. Загін сидить у будинку біля дороги. Знищте колону, поки вона не пройшла (вихід — західний край вулиці).', raid: 'НАЛІТ НА СКЛАД: у складі 6 ящиків — підбирайте їх, ставши на клітинку. На все 150 секунд, а прибульці вже йдуть із країв карти.', holdbld: 'УТРИМАННЯ БУДІВЛІ: загін усередині. Хвилі прибульців підуть з усіх боків — тримайте вікна, двері й дах 12 ходів. Матеріали: мішки й окопи.' } as Record<string, string>)[scn]}`, `Прибульців на старті: ${aliens.length}. Рекомендується реальний час.`] : [`Місія ${o.missionNo} · ${loc.arch} «${loc.name}» ${n}×${n}. ${loc.blurb} ${({ clear: 'Ціль: прочесати локацію.', sabotage: 'Ціль: підірвати склади-маяки (3).', assassinate: 'Ціль: ліквідувати командира — він на верхньому поверсі штабу.', rescue: 'Ціль: звільнити полонених (3).' } as Record<string, string>)[loc.obj]} Прибульці чекають у будівлях і сидять у ямах (${pits.length}), доки не підійдеш близько. Рекомендується реальний час.`, `Пунктів: ${camps.length}, будівель: ${bldgs.length} (у першому штаб із командиром, у кожному третьому склад). Прибульців: ${aliens.length}. Рація (📡) викликає скид постачання раз на 90 секунд.`],
    rng: rng.rng, boss: false, pits, huge: true, mats: 8, loot,
  };
  return st;
}
