import { log, rand } from './combat';
import { BIOME_NAME, DIFF } from './difficulty';
import { applyTraits, shuffle } from './traits';
import { ARMORS, WEAPONS } from './weapons';
import type { Biome, Cover, Difficulty, GameState, Objective, Soldier, Tech, Terrain, Unit } from './types';

const SIZE = 20;
export const HOLD_TURNS = 6;
export const HUMAN_AP = 3;
export const ALIEN_AP = 3;

const human = (s: Soldier, x: number, y: number, tech: Tech): Unit => {
  const w = WEAPONS[s.weapon], ar = ARMORS[s.armor];
  const u: Unit = {
    id: s.id, team: 'human', kind: 'soldier', name: s.name, x, y, hp: 8, maxHp: 8, ap: HUMAN_AP, maxAp: HUMAN_AP, move: 5 + w.move + ar.move,
    aim: w.aim + ar.aim, ammo: w.ammo, maxAmmo: w.ammo, weapon: s.weapon, armor: s.armor, burst: w.burst, falloffFrom: w.falloffFrom, falloff: w.falloff, cut: ar.cut, mags: 2, grenades: 2 + (tech.grenades ? 1 : 0), facing: Math.PI, cls: s.cls, abilityUsed: 0, suppressed: false, alert: true, homeX: x, homeY: y, dmg: w.dmg, range: w.range, overwatch: false,
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
    falloffFrom: 6, falloff: kind === 'sniper' ? 1 : 3, cut: 0, cls: 'assault', abilityUsed: 0, suppressed: false, alert: false, homeX: x, homeY: y, mags: 99, grenades: 0, facing: 0, dmg: b.dmg!, range: b.range!, overwatch: false,
    bleeding: false, fracture: false, morale: 100, panic: false, traits: [], perks: [], bio: '', kills: 0,
  };
};

export interface MissionOpts {
  rng: number;
  difficulty: Difficulty;
  missionNo: number;
  objective: Objective;
  biome: Biome;
  soldiers: Soldier[];
  tech: Tech;
}

type Zone = { x: number; y: number; w: number; h: number };

type Base = { cover: Cover[][]; terrain: Terrain[][] };
type Grids = Base & { bridges: { x: number; y: number }[] };

/** Клетки, достижимые от точки высадки. */
function reachSet({ cover, terrain }: Base): Set<string> {
  const seen = new Set<string>(['9,18']);
  const q: [number, number][] = [[9, 18]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || cover[ny][nx] !== 'none' || terrain[ny][nx] === 'water' || seen.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

/** Достижимо почти всё открытое поле (и зона эвакуации). */
function connected({ cover, terrain }: Base, zone: Zone | null): boolean {
  const seen = reachSet({ cover, terrain });
  let open = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (cover[y][x] === 'none' && terrain[y][x] === 'ground') open++;
  return seen.size >= open * 0.95 && (!zone || seen.has(`${zone.x + 1},${zone.y + 1}`));
}

/** Случайная карта по локации. Деревья — полное укрытие, кусты — половинное, вода непроходима. */
function genMap(rng: { rng: number }, biome: Biome, missionNo: number, zone: Zone | null): Grids {
  let g: Grids = { cover: [], terrain: [], bridges: [] };
  for (let attempt = 0; attempt < 14; attempt++) {
    const cover: Cover[][] = Array.from({ length: SIZE }, () => Array<Cover>(SIZE).fill('none'));
    const terrain: Terrain[][] = Array.from({ length: SIZE }, () => Array<Terrain>(SIZE).fill('ground'));
    const bridges: { x: number; y: number }[] = [];
    const free = (x: number, y: number) => x >= 1 && x < SIZE - 1 && y >= 3 && y <= 15 && cover[y][x] === 'none' && terrain[y][x] === 'ground';

    if (biome === 'ruins') {
      const x0 = 5 + Math.floor(rand(rng) * 7);
      for (let i = 0; i < 4; i++) cover[1][x0 + i] = 'full';
      cover[2][x0] = 'full'; cover[2][x0 + 3] = 'full';
      const count = 16 + Math.min(missionNo, 4) * 2;
      for (let i = 0; i < count; i++) {
        const x = 1 + Math.floor(rand(rng) * 18), y = 4 + Math.floor(rand(rng) * 12);
        const t: Cover = rand(rng) < 0.6 ? 'half' : 'full';
        if (cover[y][x] !== 'none') continue;
        cover[y][x] = t;
        if (rand(rng) < 0.5 && x + 1 < SIZE - 1 && cover[y][x + 1] === 'none') cover[y][x + 1] = t;
      }
    } else {
      if (biome === 'lake') {
        // река с извилистыми берегами и 3 бродами
        const y0 = 6 + Math.floor(rand(rng) * 4), width = 2 + (rand(rng) < 0.5 ? 1 : 0), phase = rand(rng) * 6.28;
        for (let x = 0; x < SIZE; x++) {
          const shift = Math.round(Math.sin(x * 0.45 + phase) * 1.3);
          for (let w = 0; w < width; w++) { const y = y0 + shift + w; if (y >= 3 && y <= 15) terrain[y][x] = 'water'; }
        }
        for (const fx of [2 + Math.floor(rand(rng) * 4), 8 + Math.floor(rand(rng) * 4), 14 + Math.floor(rand(rng) * 4)]) {
          for (let y = 0; y < SIZE; y++) for (const xx of [fx, Math.min(SIZE - 1, fx + 1)]) { if (terrain[y][xx] === 'water') bridges.push({ x: xx, y }); terrain[y][xx] = 'ground'; }
        }
      }
      // рощи: кластеры деревьев и кустов
      const clumps = biome === 'forest' ? 6 : 4;
      for (let i = 0; i < clumps; i++) {
        const cx = 1 + Math.floor(rand(rng) * 18), cy = 3 + Math.floor(rand(rng) * 13), r = 1.4 + rand(rng) * 1.6;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (Math.hypot(dx, dy) <= r && rand(rng) < 0.45 && free(cx + dx, cy + dy)) cover[cy + dy][cx + dx] = rand(rng) < 0.5 ? 'full' : 'half';
        }
      }
      for (let i = 0; i < (biome === 'forest' ? 8 : 6); i++) {
        const x = 1 + Math.floor(rand(rng) * 18), y = 3 + Math.floor(rand(rng) * 13);
        if (free(x, y)) cover[y][x] = rand(rng) < 0.5 ? 'full' : 'half';
      }
    }
    if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) { cover[y][x] = 'none'; terrain[y][x] = 'ground'; }
    g = { cover, terrain, bridges };
    if (connected(g, zone)) break;
  }
  return g;
}

export function createMission(o: MissionOpts): GameState {
  const rng = { rng: o.rng };
  const zone: Zone | null = o.objective === 'extract'
    ? { x: rand(rng) < 0.5 ? 0 : SIZE - 3, y: 0, w: 3, h: 3 } : null;
  const { cover, terrain, bridges } = genMap(rng, o.biome, o.missionNo, zone);

  // взрывоопасные бочки: половинное укрытие, которое можно взорвать
  const barrels: GameState['barrels'] = [];
  for (let tries = 0, want = o.biome === 'ruins' ? 4 : 2; tries < 40 && barrels.length < want; tries++) {
    const x = 1 + Math.floor(rand(rng) * 18), y = 4 + Math.floor(rand(rng) * 11);
    if (cover[y][x] !== 'none' || terrain[y][x] !== 'ground' || (zone && x >= zone.x - 1 && x <= zone.x + zone.w && y <= zone.y + zone.h + 1)) continue;
    cover[y][x] = 'half';
    if (!connected({ cover, terrain }, zone)) { cover[y][x] = 'none'; continue; }
    barrels.push({ x, y });
  }

  const humans = o.soldiers.map((s, i) => human(s, 7 + i * 2, 18, o.tech));

  let kinds: AlienKind[] = ['trooper', 'sniper', 'trooper', 'psi', 'trooper', 'heavy'];
  if (o.missionNo >= 3) kinds.push('trooper');
  if (o.missionNo >= 5) kinds.push('trooper');
  if (o.missionNo >= 7) kinds.push('heavy');
  if (o.objective === 'hold') kinds = kinds.slice(0, 5);
  if (o.objective === 'extract' || o.objective === 'sabotage') kinds = kinds.slice(0, 5);
  if (o.objective === 'assassinate') kinds = [...kinds.slice(0, 5), 'commander'];

  const reach = reachSet({ cover, terrain });
  let spots: [number, number][] = [];
  for (let y = 2; y <= 9; y++) for (let x = 1; x < SIZE - 1; x++) {
    const inZone = zone && x >= zone.x - 1 && x <= zone.x + zone.w && y <= zone.y + zone.h + 1;
    if (cover[y][x] === 'none' && terrain[y][x] === 'ground' && !inZone && reach.has(`${x},${y}`)) spots.push([x, y]);
  }
  // диверсия: два маяка на стороне пришельцев (полное укрытие, помечены на карте)
  const beacons: GameState['beacons'] = [];
  if (o.objective === 'sabotage') {
    for (const p of shuffle(spots.filter(([, y]) => y <= 6), rng)) {
      if (beacons.length === 2) break;
      if (beacons.every(b => Math.hypot(b.x - p[0], b.y - p[1]) >= 7)) beacons.push({ x: p[0], y: p[1], done: false });
    }
    for (const b of beacons) cover[b.y][b.x] = 'full';
    spots = spots.filter(([x, y]) => !beacons.some(b => Math.abs(b.x - x) + Math.abs(b.y - y) <= 1));
  }
  const chosen: [number, number][] = [];
  for (const p of shuffle(spots, rng)) {
    if (chosen.length === kinds.length) break;
    if (chosen.every(c => Math.hypot(c[0] - p[0], c[1] - p[1]) >= 2.5)) chosen.push(p);
  }
  if (o.objective === 'assassinate' && chosen.length === kinds.length) { // командир — в самой дальней точке
    let j = 0;
    chosen.forEach((p, i) => { if (p[1] < chosen[j][1]) j = i; });
    [chosen[j], chosen[chosen.length - 1]] = [chosen[chosen.length - 1], chosen[j]];
  }
  let tn = 0;
  const aliens = kinds.slice(0, chosen.length).map((k, i) => alien(1000 + i, k, k === 'trooper' ? ++tn : 0, chosen[i][0], chosen[i][1], o.difficulty));

  if (o.objective === 'hold') aliens.forEach(a => { a.alert = true; }); // волны атакуют сразу
  const grid = () => Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const seen = grid();
  if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) seen[y][x] = true;
  for (const b of beacons) seen[b.y][b.x] = true;

  const brief = {
    clear: 'Цель: уничтожить всех пришельцев.',
    extract: 'Цель: эвакуация — все выжившие бойцы должны дойти до зелёной зоны.',
    hold: `Цель: продержаться ${HOLD_TURNS} ходов. Пришельцы получают подкрепление.`,
    assassinate: 'Цель: убить командира пришельцев (он помечен красным кольцом и виден всегда).',
    sabotage: 'Цель: взорвать два маяка (подойди вплотную: заряд тратит 1 AP и 1 гранату).',
  }[o.objective];
  return {
    size: SIZE, cover, terrain, biome: o.biome, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: DIFF[o.difficulty].kits + (o.tech.kits ? 1 : 0),
    aiming: null, mines: [], barrels, fires: [], scorched: grid(), bridges, targetBarrel: null, turning: false, busy: false, vis: grid(), seen, revealed: [], missionNo: o.missionNo, difficulty: o.difficulty,
    objective: o.objective, markId: aliens.find(a => a.kind === 'commander')?.id ?? null, beacons, holdTurns: HOLD_TURNS, zone,
    log: [`Миссия ${o.missionNo} · ${BIOME_NAME[o.biome]}. ${brief}`, 'Разведка: пехота, снайпер, псионик (давит на мораль), тяжёлый (ломает укрытия).'],
    rng: rng.rng,
  };
}

/** Подкрепление в режиме удержания: новый пехотинец у северного края. */
export function reinforce(s: GameState) {
  const free: [number, number][] = [];
  for (let y = 0; y <= 2; y++) for (let x = 0; x < s.size; x++) {
    if (s.cover[y][x] === 'none' && s.terrain[y][x] === 'ground' && !s.units.some(u => u.hp > 0 && u.x === x && u.y === y)) free.push([x, y]);
  }
  if (!free.length) return;
  const [x, y] = free[Math.floor(rand(s) * free.length)];
  const id = Math.max(...s.units.map(u => u.id)) + 1;
  const rn = alien(id, 'trooper', s.units.filter(u => u.kind === 'trooper').length + 1, x, y, s.difficulty);
  rn.alert = true;
  s.units.push(rn);
  log(s, 'Подкрепление пришельцев!');
}
