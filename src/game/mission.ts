import { log, rand } from './combat';
import { DIFF } from './difficulty';
import { applyTraits, shuffle } from './traits';
import type { Cover, Difficulty, GameState, Objective, Soldier, Tech, Unit } from './types';

const SIZE = 20;
export const HOLD_TURNS = 6;

const human = (s: Soldier, x: number, y: number, tech: Tech): Unit => {
  const u: Unit = {
    id: s.id, team: 'human', kind: 'soldier', name: s.name, x, y, hp: 8, maxHp: 8, ap: 2, maxAp: 2, move: 5,
    aim: 70, ammo: 5, maxAmmo: 5, dmg: [2, 4], range: 14, overwatch: false,
    bleeding: false, fracture: s.fracture, morale: 70, panic: false, traits: s.traits, perks: s.perks, bio: s.bio, kills: 0,
  };
  applyTraits(u);
  for (const p of s.perks) { if (p === 'aim') u.aim += 5; if (p === 'hp') u.maxHp += 2; }
  if (tech.armor) u.maxHp += 2;
  if (tech.optics) u.aim += 5;
  u.hp = Math.max(1, u.maxHp - s.hpLoss);
  return u;
};

const ALIEN: Record<'trooper' | 'sniper' | 'psi' | 'heavy', Partial<Unit>> = {
  trooper: { hp: 6, aim: 55, ammo: 6, dmg: [2, 3], range: 12, move: 5 },
  sniper: { hp: 4, aim: 70, ammo: 4, dmg: [3, 4], range: 20, move: 4 },
  psi: { hp: 5, aim: 0, ammo: 0, dmg: [0, 0], range: 10, move: 5 },
  heavy: { hp: 10, aim: 50, ammo: 4, dmg: [3, 5], range: 10, move: 4 },
};
type AlienKind = keyof typeof ALIEN;
const NAMES = { trooper: 'Пехотинец', sniper: 'Снайпер', psi: 'Псионик', heavy: 'Тяжёлый' };

const alien = (id: number, kind: AlienKind, n: number, x: number, y: number, d: Difficulty): Unit => {
  const b = ALIEN[kind];
  const hp = Math.max(1, Math.round(b.hp! * DIFF[d].hp));
  return {
    id, team: 'alien', kind, name: kind === 'trooper' ? `${NAMES[kind]} ${n}` : NAMES[kind], x, y,
    hp, maxHp: hp, ap: 2, maxAp: 2, move: b.move!, aim: kind === 'psi' ? 0 : b.aim! + DIFF[d].aim,
    ammo: b.ammo!, maxAmmo: b.ammo!, dmg: b.dmg!, range: b.range!, overwatch: false,
    bleeding: false, fracture: false, morale: 100, panic: false, traits: [], perks: [], bio: '', kills: 0,
  };
};

export interface MissionOpts {
  rng: number;
  difficulty: Difficulty;
  missionNo: number;
  objective: Objective;
  soldiers: Soldier[];
  tech: Tech;
}

type Zone = { x: number; y: number; w: number; h: number };

/** Случайная карта: корабль, россыпь укрытий; требует, чтобы поле оставалось проходимым. */
function genCover(rng: { rng: number }, missionNo: number, zone: Zone | null): Cover[][] {
  let cover: Cover[][] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    cover = Array.from({ length: SIZE }, () => Array<Cover>(SIZE).fill('none'));
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
    if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) cover[y][x] = 'none';
    // проходимость: от точки высадки должно быть достижимо почти всё открытое поле
    const seen = new Set<string>(['9,18']);
    const q: [number, number][] = [[9, 18]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || cover[ny][nx] !== 'none' || seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const open = cover.flat().filter(c => c === 'none').length;
    const zoneOk = !zone || seen.has(`${zone.x + 1},${zone.y + 1}`);
    if (seen.size >= open * 0.95 && zoneOk) break;
  }
  return cover;
}

export function createMission(o: MissionOpts): GameState {
  const rng = { rng: o.rng };
  const zone: Zone | null = o.objective === 'extract'
    ? { x: rand(rng) < 0.5 ? 0 : SIZE - 3, y: 0, w: 3, h: 3 } : null;
  const cover = genCover(rng, o.missionNo, zone);

  const humans = o.soldiers.map((s, i) => human(s, 7 + i * 2, 18, o.tech));

  let kinds: AlienKind[] = ['trooper', 'sniper', 'trooper', 'psi', 'trooper', 'heavy'];
  if (o.missionNo >= 2) kinds.push('trooper');
  if (o.missionNo >= 3) kinds.push('trooper');
  if (o.missionNo >= 4) kinds.push('heavy');
  if (o.objective === 'hold') kinds = kinds.slice(0, 4);

  const spots: [number, number][] = [];
  for (let y = 2; y <= 9; y++) for (let x = 1; x < SIZE - 1; x++) {
    const inZone = zone && x >= zone.x - 1 && x <= zone.x + zone.w && y <= zone.y + zone.h + 1;
    if (cover[y][x] === 'none' && !inZone) spots.push([x, y]);
  }
  const chosen: [number, number][] = [];
  for (const p of shuffle(spots, rng)) {
    if (chosen.length === kinds.length) break;
    if (chosen.every(c => Math.hypot(c[0] - p[0], c[1] - p[1]) >= 2.5)) chosen.push(p);
  }
  let tn = 0;
  const aliens = kinds.slice(0, chosen.length).map((k, i) => alien(1000 + i, k, k === 'trooper' ? ++tn : 0, chosen[i][0], chosen[i][1], o.difficulty));

  const grid = () => Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const seen = grid();
  if (zone) for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) seen[y][x] = true;

  const brief = {
    clear: 'Цель: уничтожить всех пришельцев.',
    extract: 'Цель: эвакуация — все выжившие бойцы должны дойти до зелёной зоны.',
    hold: `Цель: продержаться ${HOLD_TURNS} ходов. Пришельцы получают подкрепление.`,
  }[o.objective];
  return {
    size: SIZE, cover, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: DIFF[o.difficulty].kits + (o.tech.kits ? 1 : 0),
    busy: false, vis: grid(), seen, revealed: [], missionNo: o.missionNo, difficulty: o.difficulty,
    objective: o.objective, holdTurns: HOLD_TURNS, zone,
    log: [`Миссия ${o.missionNo}. ${brief}`, 'Разведка: пехота, снайпер, псионик (давит на мораль), тяжёлый (ломает укрытия).'],
    rng: rng.rng,
  };
}

/** Подкрепление в режиме удержания: новый пехотинец у северного края. */
export function reinforce(s: GameState) {
  const free: [number, number][] = [];
  for (let y = 0; y <= 2; y++) for (let x = 0; x < s.size; x++) {
    if (s.cover[y][x] === 'none' && !s.units.some(u => u.hp > 0 && u.x === x && u.y === y)) free.push([x, y]);
  }
  if (!free.length) return;
  const [x, y] = free[Math.floor(rand(s) * free.length)];
  const id = Math.max(...s.units.map(u => u.id)) + 1;
  s.units.push(alien(id, 'trooper', s.units.filter(u => u.kind === 'trooper').length + 1, x, y, s.difficulty));
  log(s, 'Подкрепление пришельцев!');
}
