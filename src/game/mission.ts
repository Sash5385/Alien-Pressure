import type { Cover, GameState, Unit } from './types';

const SIZE = 20;

const human = (id: number, name: string, x: number, y: number): Unit => ({
  id, team: 'human', name, x, y, hp: 8, maxHp: 8, ap: 2, maxAp: 2, move: 5,
  aim: 70, ammo: 5, maxAmmo: 5, dmg: [2, 4], range: 14, overwatch: false,
  bleeding: false, fracture: false, morale: 70, panic: false,
});
const alien = (id: number, name: string, x: number, y: number): Unit => ({
  id, team: 'alien', name, x, y, hp: 6, maxHp: 6, ap: 2, maxAp: 2, move: 5,
  aim: 55, ammo: 6, maxAmmo: 6, dmg: [2, 3], range: 12, overwatch: false,
  bleeding: false, fracture: false, morale: 100, panic: false,
});

/** Миссия 1: зачистка у корабля. seed — для воспроизводимых прохождений. */
export function createMission(seed = Date.now() >>> 0): GameState {
  const cover: Cover[][] = Array.from({ length: SIZE }, () => Array<Cover>(SIZE).fill('none'));
  const put = (c: Cover, pts: [number, number][]) => pts.forEach(([x, y]) => (cover[y][x] = c));

  put('full', [[8, 2], [9, 2], [10, 2], [11, 2], [8, 3], [11, 3]]); // корпус корабля
  put('half', [[3, 8], [4, 8], [5, 8], [14, 9], [15, 9], [9, 10], [10, 10], [2, 13], [17, 12], [7, 14], [12, 14]]);
  put('full', [[6, 6], [13, 6], [9, 7], [10, 7], [4, 11], [15, 11]]);

  const humans = ['Ковальчук', 'Мельник', 'Бойко', 'Шевчук'].map((n, i) => human(i + 1, n, 7 + i * 2, 18));
  const aliens = ([[6, 4], [9, 5], [12, 4], [14, 7], [4, 6], [10, 8]] as const).map(([x, y], i) =>
    alien(100 + i, `Пехотинец ${i + 1}`, x, y));

  return {
    size: SIZE, cover, units: [...humans, ...aliens], selectedId: null, targetId: null,
    turn: 'human', turnNo: 1, status: 'playing', medkits: 2, busy: false, log: ['Миссия: зачистка у корабля.'], rng: seed,
  };
}
