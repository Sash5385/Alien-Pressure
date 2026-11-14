import { alienSees, canPsi, digIn, hitChance, isFlanked, log, peekShot, peekTile, suppress, trenchAt, triggerMine, living, psiAttack, raiseAlert, rand, reactions, reload, shoot, type ShotResult } from './combat';
import { findPath, reachable } from './pathfinding';
import type { GameState, Unit } from './types';
import type { GrenadeResult } from './combat';

export interface AiHooks {
  moved(u: Unit): Promise<void>; // позиции обновились — перерисовать
  shot(r: ShotResult): Promise<void>;
  alerted?(ids: number[]): void; // пришельцы заметили бойцов
  blast?(r: GrenadeResult): Promise<void>; // взрыв мины
}

/** Непредупреждённый пришелец бродит у своей точки; заметив бойца, поднимает тревогу в радиусе 8. */
async function patrol(s: GameState, u: Unit, h: AiHooks) {
  const cands: [number, number][] = [];
  for (const k of reachable(s, u.x, u.y, u.move).keys()) {
    const [x, y] = k.split(',').map(Number);
    if ((x !== u.x || y !== u.y) && Math.hypot(x - u.homeX, y - u.homeY) <= 6) cands.push([x, y]);
  }
  u.ap -= 1;
  u.stance = 'stand';
  if (!cands.length) return;
  const [tx, ty] = cands[Math.floor(rand(s) * cands.length)];
  for (const [x, y] of findPath(s, u.x, u.y, tx, ty, u.move)) {
    u.x = x; u.y = y;
    await h.moved(u);
    const mr = triggerMine(s, u);
    if (mr) await h.blast?.(mr);
    for (const r of reactions(s, u)) await h.shot(r);
    if (u.hp <= 0 || s.status !== 'playing') return;
    if (alienSees(s, u)) { h.alerted?.(raiseAlert(s, u.x, u.y, 8)); return; }
  }
}

/** Привлекательность цели: шанс попадания (прямой или из-за укрытия «стрейфом»), для псионика — слабая мораль. */
function score(s: GameState, u: Unit, t: Unit): number | null {
  if (u.kind === 'psi') return canPsi(u, t) ? 100 - t.morale : null;
  const c = hitChance(s, u, t);
  if (c !== null) return c;
  return peekTile(s, u, t)?.chance ?? null;
}

/** Желаемая дистанция до ближайшего бойца: снайпер и псионик держатся на расстоянии. */
const ideal = (u: Unit, near: number) =>
  u.kind === 'sniper' ? Math.abs(near - 10) : u.kind === 'psi' ? Math.abs(near - 7) : near;

const hasCover = (s: GameState, x: number, y: number) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.cover[y + dy]?.[x + dx] && s.cover[y + dy][x + dx] !== 'none') || trenchAt(s, x, y) !== undefined && !!trenchAt(s, x, y);

/** Тактическая группа: общее решение на ход (штурм / отход с боем / оборона), фокус огня, прикрывающий. */
export interface Grp { members: Unit[]; ratio: number; mode: 'assault' | 'retreat' | 'hold'; focus?: number; rear?: number }

export function planGroups(s: GameState): Map<number, Grp> {
  const out = new Map<number, Grp>();
  const all = s.units.filter(u => u.team === 'alien' && !u.dormant);
  const humans = living(s, 'human');
  for (const g of new Set(all.map(u => u.grp).filter((x): x is number => x !== undefined))) {
    const mem = all.filter(u => u.grp === g);
    const alive = mem.filter(u => u.hp > 0);
    if (!alive.length) continue;
    const ratio = alive.reduce((a, u) => a + u.hp, 0) / mem.reduce((a, u) => a + u.maxHp, 0);
    const cx = alive.reduce((a, u) => a + u.x, 0) / alive.length, cy = alive.reduce((a, u) => a + u.y, 0) / alive.length;
    const near = humans.filter(h => Math.hypot(h.x - cx, h.y - cy) <= 14).length;
    const engaged = alive.some(u => u.alert) && near > 0;
    const boss = alive.some(u => u.kind === 'commander');
    const holding = alive.some(u => (u.retreatUntil ?? -1) >= s.turnNo);
    let mode: Grp['mode'] = 'assault';
    if (holding) mode = 'hold';
    else if (engaged && !boss && mem.length > 1 && ((ratio < 0.5 && near >= alive.length) || ratio < 0.34)) {
      mode = 'retreat';
      alive.forEach(u => { u.retreatUntil = s.turnNo + 3; });
      log(s, 'Группа пришельцев отступает с боем.');
    }
    // фокус огня: боец, по которому группа попадает лучше всего (слабых добиваем)
    let focus: number | undefined, fs = -1;
    for (const h of humans) {
      let sum = 0;
      for (const m of alive) sum += hitChance(s, m, h) ?? 0;
      sum += (10 - h.hp) * 2 + (h.down ? -50 : 0);
      if (sum > fs && sum > 0) { fs = sum; focus = h.id; }
    }
    const rear = mode === 'retreat' ? [...alive].sort((a, b) => b.aim - a.aim)[0]?.id : undefined;
    out.set(g, { members: alive, ratio, mode, focus, rear });
  }
  return out;
}

/** Состояние решений одного пришельца в рамках хода (в реальном времени хранится между вызовами). */
export interface AiSt { shots: number; retreated: boolean }

/** Один шаг решения пришельца. 'stop' — дальше в этот ход (цикл) он не действует. */
export async function alienIter(s: GameState, u: Unit, h: AiHooks, g: Grp | undefined, st: AiSt): Promise<'next' | 'stop'> {
  const idx = g ? g.members.indexOf(u) : 0;
  if (!u.alert && alienSees(s, u)) h.alerted?.(raiseAlert(s, u.x, u.y, 8));
  if (!u.alert) { await patrol(s, u, h); return u.alert ? 'next' : 'stop'; }
  const humans = living(s, 'human');
  if (u.maxAmmo > 0 && u.ammo <= 0) { reload(s, u); return 'next'; }
  const options = humans
    .map(t => ({ t, c: score(s, u, t) }))
    .filter((e): e is { t: Unit; c: number } => e.c !== null)
    .sort((a, b) => (b.c + (b.t.id === g?.focus ? 20 : 0)) - (a.c + (a.t.id === g?.focus ? 20 : 0)));
  const near = humans.length ? Math.min(...humans.map(t => Math.hypot(t.x - u.x, t.y - u.y))) : 99;
  const mode = u.kind === 'commander' ? 'assault' : g?.mode ?? 'assault';
  const walk = async (spot: [number, number]) => {
    for (const [x, y] of findPath(s, u.x, u.y, spot[0], spot[1], u.move)) {
      u.x = x; u.y = y;
      await h.moved(u);
      const mr = triggerMine(s, u);
      if (mr) await h.blast?.(mr);
      for (const r of reactions(s, u)) await h.shot(r);
      if (u.hp <= 0 || s.status !== 'playing') break;
    }
  };

  // ——— отход с боем: стреляем и отходим, один боец прикрывает ———
  if (mode === 'retreat') {
    if (g?.rear === u.id && u.ap >= 1) {
      if (options.length && options[0].c >= 25 && st.shots < 2) { st.shots++; await h.shot(shoot2(s, u, options[0].t)); return 'next'; }
      u.overwatch = true; u.ap = 0; await h.moved(u); return 'stop';
    }
    if (!st.retreated && options.length && options[0].c >= 25 && u.ap >= 2 && st.shots === 0) { st.shots++; await h.shot(shoot2(s, u, options[0].t)); return 'next'; }
    if (!st.retreated) {
      const spot = retreatSpot(s, u, humans);
      if (spot) {
        st.retreated = true; u.ap -= 1; u.stance = 'stand';
        await walk(spot);
        return 'next';
      }
    }
    if (options.length && st.shots < 2) { st.shots++; await h.shot(shoot2(s, u, options[0].t)); return 'next'; }
    return 'stop';
  }

  if (options.length) {
    const t = options[0].t;
    // тяжёлые и снайперы прижимают огнём, когда попасть трудно
    const sup = ['heavy', 'sniper', 'commander'].includes(u.kind) && u.ammo >= 2 && options[0].c < 35 && !t.suppressed ? suppress(s, u, t) : null;
    if (sup) { await h.shot(sup); return 'next'; }
    await h.shot(shoot2(s, u, t));
    // стрелки дальнего боя окапываются, если рядом нет укрытия
    const covered = hasCover(s, u.x, u.y);
    if (u.hp > 0 && u.ap > 0 && ['sniper', 'heavy', 'commander', 'trooper'].includes(u.kind) && !covered && !trenchAt(s, u.x, u.y) && (u.kind !== 'trooper' || mode === 'hold') && digIn(s, u)) await h.moved(u);
    else if (u.kind === 'sniper' && u.hp > 0 && u.ap > 0 && u.stance !== 'prone') { u.stance = 'prone'; u.ap -= 1; await h.moved(u); } // снайпер ложится
    return 'next';
  }

  // ——— нет целей ———
  if (mode === 'hold') { // после отхода: занять укрытие/окоп и ждать
    if (!hasCover(s, u.x, u.y) && !trenchAt(s, u.x, u.y) && digIn(s, u)) { await h.moved(u); return 'next'; }
    u.overwatch = u.ammo > 0; u.ap = 0; await h.moved(u); return 'stop';
  }
  const bound = g && g.members.length >= 2 && near < 20 && (idx + s.turnNo) % 2 === 0; // перебежки: половина группы прикрывает
  if (u.ap === 1 && u.ammo > 0 && u.kind !== 'psi' && (bound || rand(s) < 0.2)) { // последнее действие: встать на overwatch
    u.overwatch = true; u.ap = 0;
    await h.moved(u);
    return 'stop';
  }
  let best: [number, number] | null = null;
  let bestScore = Infinity;
  for (const k of reachable(s, u.x, u.y, u.move).keys()) {
    const [x, y] = k.split(',').map(Number);
    if (x === u.x && y === u.y) continue;
    const ghost = { ...u, x, y };
    const nearT = Math.min(...humans.map(t => Math.hypot(t.x - x, t.y - y)));
    const seen = humans.some(t => score(s, ghost, t) !== null);
    const flank = humans.some(t => hitChance(s, ghost, t) !== null && isFlanked(s, ghost, t));
    const cov = hasCover(s, x, y);
    const sc = ideal(u, nearT) - (seen ? 3 : 0) - (cov ? (bound ? 3.5 : 1.5) : 0) - (flank && idx % 2 === 1 ? 2.5 : 0) - s.height[y][x] * (u.kind === 'sniper' ? 1.5 : 0.7) - (trenchAt(s, x, y) ? 2 : 0);
    if (sc < bestScore) { bestScore = sc; best = [x, y]; }
  }
  if (!best) return 'stop';
  u.ap -= 1;
  u.stance = 'stand';
  await walk(best);
  return 'next';
}

/** ИИ: группы действуют сообща: фокус огня, перебежки под прикрытием, отход с боем, окопы и укрытия. */
export async function runAlienTurn(s: GameState, h: AiHooks) {
  s.revealed = [];
  for (const hu of living(s, 'human')) hu.suppressed = false;
  for (const a of living(s, 'alien')) a.overwatch = false;
  const groups = planGroups(s);
  for (const u of living(s, 'alien')) {
    if (u.dormant) continue;
    u.ap = Math.max(1, u.maxAp - (u.suppressed ? 1 : 0));
    const g = u.grp !== undefined ? groups.get(u.grp) : undefined;
    const st: AiSt = { shots: 0, retreated: false };
    for (let i = 0; i < 4 && u.hp > 0 && u.ap > 0 && s.status === 'playing'; i++) {
      if ((await alienIter(s, u, h, g, st)) === 'stop') break;
    }
  }
}

/** Выстрел: прямой, а если линии нет — стрейфом из-за укрытия. */
function shoot2(s: GameState, u: Unit, t: Unit): ShotResult {
  if (u.kind === 'psi') return psiAttack(s, u, t);
  if (hitChance(s, u, t) === null) { const r = peekShot(s, u, t); if (r) return r; }
  return shoot(s, u, t);
}

/** Куда отходить: дальше от бойцов, к укрытию и к точке сбора. */
function retreatSpot(s: GameState, u: Unit, humans: Unit[]): [number, number] | null {
  if (!humans.length) return null;
  const here = Math.min(...humans.map(t => Math.hypot(t.x - u.x, t.y - u.y)));
  let best: [number, number] | null = null, bs = -Infinity;
  for (const k of reachable(s, u.x, u.y, u.move).keys()) {
    const [x, y] = k.split(',').map(Number);
    const d = Math.min(...humans.map(t => Math.hypot(t.x - x, t.y - y)));
    if (d < here + 1.5) continue;
    const sc = d + (hasCover(s, x, y) ? 3 : 0) - Math.hypot(x - u.homeX, y - u.homeY) * 0.15 + (humans.some(t => hitChance(s, { ...u, x, y }, t) !== null) ? -2 : 1);
    if (sc > bs) { bs = sc; best = [x, y]; }
  }
  return best;
}
