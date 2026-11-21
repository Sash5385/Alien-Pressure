import { alienIter, planGroups, type AiHooks, type AiSt, type Grp } from './ai';
import { bldgAt, climb, flOf, stairPos } from './floors';
import { checkEnd, hitChance, humanPulse, isVisible, living, log, peekShot, peekTile, reload, shoot, type ShotResult, updateVision } from './combat';
import { reinforce } from './mission';
import { findPath, reachable } from './pathfinding';
import type { GameState, Unit } from './types';
import { WEAPONS } from './weapons';

/** Реальний час. 1 AP пошагового режима = CD_PER_AP секунд ожидания; «ход» (волны, кровь, огонь) = TURN_SECS секунд. */
export const CD_PER_AP = 2.4;
/** Скорость бега в клетках в секунду (совпадает с GameView). */
export const RUN_SPEED = 3.6;
export const CRAWL_SPEED = 1.1; // ползком, клеток в секунду
export const SNEAK_SPEED = 1.9; // крадучись (на колене), клеток в секунду, без шума
export const TURN_SECS = 9;

export interface RtHooks extends AiHooks {
  step(u: Unit): Promise<void>; // анимация шага бойца
}

export function rtInit(s: GameState) {
  s.rt = { speed: 1, paused: true, clock: 0, pulseAt: 0, planAt: -9, auto: true };
  s.turn = 'human';
}

const aiState = new WeakMap<Unit, AiSt>();
let plan = new Map<number, Grp>();

/** Приказ идти (бойцы выполняют по клетке за раз). */
export function orderMove(u: Unit, x: number, y: number, fl = 0, append = false) {
  u.atk = undefined;
  if (append && u.dest) { (u.queue ??= []).push({ x, y, fl }); return; }
  u.dest = { x, y, fl }; u.queue = undefined; u.route = undefined;
}
/** Точка достигнута: берём следующую из очереди. */
const nextDest = (u: Unit) => { u.dest = u.queue?.shift(); u.route = undefined; };
/** Приказ атаковать цель до её гибели. */
export function orderAttack(u: Unit, t: Unit) { u.atk = t.id; u.dest = undefined; u.queue = undefined; }

/** AP → время: потратил действие — ждёшь; AP показывает «готов / не готов». */
function settle(u: Unit, d: number) {
  if ((u.cd ?? 0) > 0) {
    u.cd = (u.cd ?? 0) - d; u.ap = 0;
    if (u.cd <= 0) { u.cd = 0; u.ap = u.maxAp; u.overwatch = false; }
  } else if (u.ap < u.maxAp && !u.busyRt) {
    const spent = u.maxAp - u.ap;
    u.cd = spent * CD_PER_AP * (u.suppressed ? 1.25 : 1);
    u.ap = 0;
  }
}

/** Проход занят своими: ждём и пробуем снова, прежде чем отменять приказ. */
function waitOrCancel(u: Unit) {
  u.stuck = (u.stuck ?? 0) + 1;
  if (u.stuck > 12) { u.dest = undefined; u.queue = undefined; u.stuck = 0; } else { u.cd = 0.6; u.ap = 0; }
}

const launcher = (u: Unit) => !!WEAPONS[u.weapon].launch;

/** Лучшая видимая цель для автоогня. */
function autoTarget(s: GameState, u: Unit): Unit | null {
  let best: Unit | null = null, bc = 29;
  for (const a of living(s, 'alien')) {
    if (!isVisible(s, a)) continue;
    const c = hitChance(s, u, a);
    if (c !== null && c > bc) { bc = c; best = a; }
  }
  return best;
}

function fire(s: GameState, u: Unit, t: Unit, hooks: RtHooks, peek = false) {
  const r: ShotResult | null = peek ? peekShot(s, u, t) : shoot(s, u, t);
  if (!r) return;
  u.overwatch = false; u.busyRt = true;
  void hooks.shot(r).catch(() => {}).finally(() => { u.busyRt = false; });
}

function humanThink(s: GameState, u: Unit, hooks: RtHooks) {
  if (u.down || u.panic || u.busyRt || u.hp <= 0) return;
  if (u.ammo <= 0 && u.mags > 0 && !launcher(u)) { reload(s, u); return; }
  const t = u.atk !== undefined ? s.units.find(v => v.id === u.atk && v.hp > 0) : undefined;
  if (u.atk !== undefined && !t) u.atk = undefined;
  if (t && !launcher(u)) {
    if (hitChance(s, u, t) !== null) { fire(s, u, t, hooks); return; }
    if (peekTile(s, u, t)) { fire(s, u, t, hooks, true); return; }
    // немає лінії вогню: подойти к ближайшей клетке, откуда цель видна
    let best: [number, number] | null = null, bd = 1e9;
    for (const k of reachable(s, u.x, u.y, 14, flOf(u)).keys()) {
      const [x, y] = k.split(',').map(Number);
      const c = hitChance(s, { ...u, x, y }, t);
      const d = Math.hypot(x - u.x, y - u.y);
      if (c !== null && d < bd) { bd = d; best = [x, y]; }
    }
    if (best) u.dest = { x: best[0], y: best[1], fl: flOf(u) }; else { u.atk = undefined; return; }
  }
  if (u.dest) {
    const cf = flOf(u), tf = u.dest.fl ?? 0;
    let wp: { x: number; y: number } | null = null; // лестница по пути на другой этаж
    if (tf !== cf) {
      const bi = cf > 0 ? bldgAt(s, u.x, u.y) : bldgAt(s, u.dest.x, u.dest.y);
      if (bi < 0) { u.dest = undefined; return; }
      wp = stairPos(s, bi, tf > cf ? 'bottom' : 'top');
      if (u.x === wp.x && u.y === wp.y) {
        if (climb(s, u, tf > cf ? 1 : -1)) { u.route = undefined; u.cd = CD_PER_AP * 0.6; u.ap = 0; u.overwatch = false; void hooks.step(u).catch(() => {}); } else waitOrCancel(u);
        return;
      }
    } else if (cf > 0 && bldgAt(s, u.dest.x, u.dest.y) !== bldgAt(s, u.x, u.y)) { u.dest = undefined; return; }
    const tx0 = wp ? wp.x : u.dest.x, ty0 = wp ? wp.y : u.dest.y;
    if (!wp && u.dest.x === u.x && u.dest.y === u.y) { nextDest(u); return; }
    let path: [number, number][];
    if (cf > 0) path = findPath(s, u.x, u.y, tx0, ty0, 40, cf);
    else if (s.huge) { // далёкие цели: маршрут считается кусками по 60 клеток и кэшируется
      const nxt = u.route?.[0];
      if (!u.route?.length || (nxt && s.units.some(v => v.hp > 0 && v.id !== u.id && flOf(v) === 0 && v.x === nxt[0] && v.y === nxt[1]))) {
        const dx = tx0 - u.x, dy = ty0 - u.y, dd = Math.hypot(dx, dy);
        let tx = tx0, ty = ty0;
        if (dd > 60) { tx = Math.round(u.x + dx / dd * 60); ty = Math.round(u.y + dy / dd * 60); }
        let best: [number, number] | null = null; // ближайшая свободная клетка к промежуточной точке
        for (let r = 0; r <= 12 && !best; r++) for (let oy = -r; oy <= r && !best; oy++) for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const x = tx + ox, y = ty + oy;
          if (x >= 1 && y >= 1 && x < s.size - 1 && y < s.size - 1 && s.cover[y][x] === 'none' && s.terrain[y][x] === 'ground' && !s.units.some(v => v.hp > 0 && flOf(v) === 0 && v.x === x && v.y === y)) { best = [x, y]; break; }
        }
        u.route = best ? findPath(s, u.x, u.y, best[0], best[1], 110) : [];
        if (!u.route.length) { u.route = undefined; waitOrCancel(u); return; }
      }
      path = u.route!;
    } else {
      path = findPath(s, u.x, u.y, tx0, ty0, 80);
    }
    if (!path.length) { waitOrCancel(u); return; }
    u.stuck = 0;
    const step = Math.hypot(path[0][0] - u.x, path[0][1] - u.y);
    [u.x, u.y] = path[0]; if (s.huge && cf === 0) u.route = u.route!.slice(1); if (u.stance === 'stand' || u.stance === undefined) u.stance = 'stand'; u.overwatch = false; // лёжа ползёт, на колене крадётся
    if (s.huge && u.stance === 'stand') (s.noise ??= []).push({ x: u.x, y: u.y, r: 8 }); // бег шумит: лагеря в 8 клетках просыпаются
    // следующий шаг назначается раньше, чем боец дойдёт до клетки, поэтому бег непрерывный (без остановок на каждой клетке)
    u.cd = step * 0.8 / (u.stance === 'prone' ? CRAWL_SPEED : u.stance === 'kneel' ? SNEAK_SPEED : RUN_SPEED); u.ap = 0;
    void hooks.step(u).catch(() => {});
    if ((!s.huge || cf > 0) && path.length === 1 && !wp) nextDest(u);
    return;
  }
  if (s.rt?.auto && !launcher(u)) { // огонь по готовности
    const a = autoTarget(s, u);
    if (a) fire(s, u, a, hooks);
  }
}

/** Один кадр симуляции: dt — реальные секунды; скорость и пауза учитываются внутри. */
export function rtTick(s: GameState, dt: number, hooks: RtHooks) {
  const rt = s.rt;
  if (!rt || s.status !== 'playing') return;
  const d = rt.paused ? 0 : dt * rt.speed;
  rt.clock += d;
  for (const u of living(s)) settle(u, d);
  if (d > 0) {
    // «ход»: волны, кровь, огонь, паника
    if (rt.clock - rt.pulseAt >= TURN_SECS) {
      rt.pulseAt = rt.clock;
      s.turnNo += 1;
      log(s, `— Хід ${s.turnNo} —`);
      humanPulse(s);
      if ((s.objective === 'hold' && s.turnNo % 2 === 0) || s.objective === 'defend') reinforce(s);
      checkEnd(s);
      if (s.status !== 'playing') return;
    }
    if (rt.clock - rt.planAt >= 1) { rt.planAt = rt.clock; plan = planGroups(s); }
    for (const u of living(s, 'human')) if (u.ap === u.maxAp && (u.cd ?? 0) <= 0) humanThink(s, u, hooks);
    for (const u of living(s, 'alien')) {
      if (u.dormant || u.busyRt || u.ap < u.maxAp || (u.cd ?? 0) > 0) continue;
      const g = u.grp !== undefined ? plan.get(u.grp) : undefined;
      const st = aiState.get(u) ?? { shots: 0, retreated: false };
      aiState.set(u, st);
      u.busyRt = true;
      void alienIter(s, u, hooks, g, st).then(r => { if (r === 'stop') { st.shots = 0; st.retreated = false; } })
        .catch(() => {})
        .finally(() => { u.busyRt = false; if (u.hp > 0 && u.ap === u.maxAp) u.cd = 0.6; });
    }
    checkEnd(s);
  }
  updateVision(s);
}
