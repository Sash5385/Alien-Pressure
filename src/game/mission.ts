import { applyTraits, pickTraits, ROSTER, shuffle } from './traits';
import type { Cover, GameState, Unit } from './types';

const SIZE = 20;

const human = (id: number, name: string, x: number, y: number): Unit => ({
  id, team: 'human', kind: 'soldier', name, x, y, hp: 8, maxHp: 8, ap: 2, maxAp: 2, move: 5,
  aim: 70, ammo: 5, maxAmmo: 5, dmg: [2, 4], range: 14, overwatch: false,
  bleeding: false, fracture: false, morale: 70, panic: false, traits: [], bio: '',
});
const ALIEN: Record<'trooper' | 'sniper' | 'psi' | 'heavy', Partial<Unit>> = {
  trooper: { hp: 6, aim: 55, ammo: 6, dmg: [2, 3], range: 12, move: 5 },
  sniper: { hp: 4, aim: 70, ammo: 4, dmg: [3, 4], range: 20, move: 4 },
  psi: { hp: 5, aim: 0, ammo: 0, dmg: [0, 0], range: 10, move: 5 },
  heavy: { hp: 10, aim: 50, ammo: 4, dmg: [3, 5], range: 10, move: 4 },
};
const NAMES = { trooper: 'Пехотинец', sniper: 'Снайпер', psi: 'Псионик', heavy: 'Тяжёлый' };

const alien = (id: number, kind: keyof typeof ALIEN, n: number, x: number, y: number): Unit => {
  const b = ALIEN[kind];
  return {
    id, team: 'alien', kind, name: kind === 'trooper' ? `${NAMES[kind]} ${n}` : NAMES[kind], x, y,
    hp: b.hp!, maxHp: b.hp!, ap: 2, maxAp: 2, move: b.move!, aim: b.aim!, ammo: b.ammo!, maxAmmo: b.ammo!,
    dmg: b.dmg!, range: b.range!, overwatch: false,
    bleeding: false, fracture: false, morale: 100, panic: false, traits: [], bio: '',
  };
};

/** Миссия 1: зачистка у корабля. seed — для воспроизводимых прохождений. */
export function createMission(seed = Date.now() >>> 0): GameState {
  const cover: Cover[][] = Array.from({ length: SIZE }, () => Array<Cover>(SIZE).fill('none'));
  const put = (c: Cover, pts: [number, number][]) => pts.forEach(([x, y]) => (cover[y][x] = c));

  put('full', [[8, 2], [9, 2], [10, 2], [11, 2], [8, 3], [11, 3]]); // корпус корабля
  put('half', [[3, 8], [4, 8], [5, 8], [14, 9], [15, 9], [9, 10], [10, 10], [2, 13], [17, 12], [7, 14], [12, 14]]);
  put('full', [[6, 6], [13, 6], [9, 7], [10, 7], [4, 11], [15, 11]]);

  const rng = { rng: seed };
  const humans = shuffle(ROSTER, rng).slice(0, 4).map((r, i) => {
    const u = human(i + 1, r.name, 7 + i * 2, 18);
    u.bio = r.bio;
    u.traits = pickTraits(rng);
    applyTraits(u);
    return u;
  });
  const spawn: [keyof typeof ALIEN, number, number][] = [
    ['trooper', 6, 4], ['sniper', 9, 5], ['trooper', 12, 4], ['psi', 14, 7], ['trooper', 4, 6], ['heavy', 10, 8],
  ];
  let tn = 0;
  const aliens = spawn.map(([k, x, y], i) => alien(100 + i, k, k === 'trooper' ? ++tn : 0, x, y));

  return {
    size: SIZE, cover, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: 2, busy: false, log: ['Миссия: зачистка у корабля. Разведка: пехота, снайпер, псионик (давит на мораль), тяжёлый (ломает укрытия).'], rng: rng.rng,
  };
}
