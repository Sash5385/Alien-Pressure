import type { Cover, GameState, Unit } from './types';

const SIZE = 20;

const mk = (id: number, team: Unit['team'], name: string, x: number, y: number, hp: number): Unit => ({
  id, team, name, x, y, hp, maxHp: hp, ap: 2, maxAp: 2, move: 5,
});

/** Миссия 1: зачистка у корабля. Корабль занимает центр-север, укрытия — руины/ящики. */
export function createMission(): GameState {
  const cover: Cover[][] = Array.from({ length: SIZE }, () => Array<Cover>(SIZE).fill('none'));
  const put = (c: Cover, pts: [number, number][]) => pts.forEach(([x, y]) => (cover[y][x] = c));

  put('full', [[8, 2], [9, 2], [10, 2], [11, 2], [8, 3], [11, 3]]); // корпус корабля
  put('half', [[3, 8], [4, 8], [5, 8], [14, 9], [15, 9], [9, 10], [10, 10], [2, 13], [17, 12], [7, 14], [12, 14]]);
  put('full', [[6, 6], [13, 6], [9, 7], [10, 7], [4, 11], [15, 11]]);

  const humans = ['Ковальчук', 'Мельник', 'Бойко', 'Шевчук'].map((n, i) => mk(i + 1, 'human', n, 7 + i * 2, 18, 8));
  const aliens: Unit[] = [
    [6, 4], [9, 5], [12, 4], [14, 7], [4, 6], [10, 8],
  ].map(([x, y], i) => mk(100 + i, 'alien', `Пехотинец ${i + 1}`, x, y, 6));

  return { size: SIZE, cover, units: [...humans, ...aliens], selectedId: null, turn: 'human', turnNo: 1 };
}
