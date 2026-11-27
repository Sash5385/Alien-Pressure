import { bldgAt, flOf } from './floors';
import { openDoorAt } from './doors';
import { alienSees, blast, BLAST, los, canFire, hurtN, canPsi, faceToward, GRENADE_RANGE, digIn, hitChance, isFlanked, log, peekShot, peekTile, suppress, trenchAt, triggerMine, living, psiAttack, raiseAlert, rand, reactions, reload, shoot, type ShotResult } from './combat';
import { findPath, reachable } from './pathfinding';
import type { GameState, Unit } from './types';
import type { GrenadeResult } from './combat';

export interface AiHooks {
  moved(u: Unit): Promise<void>; // позиции обновились — перерисовать
  shot(r: ShotResult): Promise<void>;
  alerted?(ids: number[]): void; // пришельцы заметили бойцов
  blast?(r: GrenadeResult): Promise<void>; // взрыв мины
}

/** Непредупреждённый пришелец бродит у своей точки; заметив бойца, піднімає тревогу в радиусе 8. */
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
    u.x = x; u.y = y; openDoorAt(s, x, y);
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

/** Ценность цели сверх шанса попасть: добить слабого, выбить опасного (медик, снайпер), не тратить огонь на лежащих и безоружных. */
function prio(u: Unit, t: Unit): number {
  const avg = (u.dmg[0] + u.dmg[1]) / 2;
  let p = (t.hp <= avg ? 25 : t.hp <= avg * 2 ? 10 : 0) + (t.maxHp - t.hp) * 1.2;
  if (t.down) p -= 35;
  p += ({ medic: 8, sniper: 8, heavy: 5, engineer: 3 } as Record<string, number>)[t.cls] ?? 0;
  if (t.overwatch) p += 6;
  if (hurtN(t, 'leg') >= 2) p += 8; // обездвижен — лёгкая добыча
  if (!canFire(t)) p -= 12; // безоружный не опасен
  if (t.suppressed) p -= 4;
  return p;
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
      log(s, 'Група прибульців відступає з боєм.');
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

/** Память пришельцев: боец, замеченный кем-то из группы, запоминается; у старых записей позиция устаревает. */
const MEM_TURNS = 14;
function learn(s: GameState, u: Unit, g: Grp | undefined, humans: Unit[]) {
  const mem = (s.aiMem ??= {});
  for (const m of g?.members ?? [u]) for (const h of humans) if (Math.hypot(h.x - m.x, h.y - m.y) <= m.range + 6 && los(s, m, h)) mem[h.id] = { x: h.x, y: h.y, t: s.turnNo };
  for (const [id, m] of Object.entries(mem)) { // дошли до места и никого нет — запись снимается
    const h = humans.find(v => v.id === Number(id));
    if (!h || s.turnNo - m.t > MEM_TURNS || (Math.hypot(u.x - m.x, u.y - m.y) <= 2.2 && !(los(s, u, h) && Math.hypot(h.x - u.x, h.y - u.y) <= u.range + 6))) delete mem[Number(id)];
  }
}
/** Где пришелец считает бойцов: по памяти (позиции могли измениться). */
const believed = (s: GameState, humans: Unit[]) => humans.filter(h => s.aiMem?.[h.id]).map(h => ({ ...h, x: s.aiMem![h.id].x, y: s.aiMem![h.id].y }));

/** Состояние решений одного пришельца в рамках хода (в реальном времени хранится между вызовами). */
export interface AiSt { shots: number; retreated: boolean }

/** Один шаг решения пришельца. 'stop' — дальше в этот ход (цикл) он не действует. */
export async function alienIter(s: GameState, u: Unit, h: AiHooks, g: Grp | undefined, st: AiSt): Promise<'next' | 'stop'> {
  const idx = g ? g.members.indexOf(u) : 0;
  if (!u.alert && alienSees(s, u)) h.alerted?.(raiseAlert(s, u.x, u.y, 8));
  if (u.kind === 'commander' && u.alert && !u.horn && u.hp > 0) { // командир трубит: просыпаются и встают на тревогу все в радиусе 22
    u.horn = true;
    for (const a of living(s, 'alien')) if (a !== u && Math.hypot(a.x - u.x, a.y - u.y) <= 22) { a.dormant = false; a.alert = true; }
    log(s, `${u.name} здіймає тривогу — гарнізон прокидається!`); h.alerted?.(living(s, 'alien').filter(a => Math.hypot(a.x - u.x, a.y - u.y) <= 22).map(a => a.id));
  }
  if (!u.alert && u.march) { // колонна идёт по улице к выходу
    const m = u.march;
    for (let d = 4; d >= 1; d--) for (const dy of [0, 1, -1]) {
      const tx = Math.max(m.x, u.x - d), path = findPath(s, u.x, u.y, tx, u.y + dy, 6);
      if (path.length) { const [x, y] = path[0]; u.x = x; u.y = y; u.facing = Math.atan2(-1, 0) + Math.PI / 2; await h.moved(u); return 'stop'; }
    }
    return 'stop';
  }
  if (!u.alert) { if ((u.fl ?? 0) > 0 || u.static) return 'stop'; await patrol(s, u, h); return u.alert ? 'next' : 'stop'; }
  const humans = living(s, 'human');
  learn(s, u, g, humans);
  if (u.maxAmmo > 0 && u.ammo <= 0) { reload(s, u); return 'next'; }
  const options = humans
    .map(t => ({ t, c: score(s, u, t) }))
    .filter((e): e is { t: Unit; c: number } => e.c !== null)
    .sort((a, b) => (b.c + prio(u, b.t) + (b.t.id === g?.focus ? 20 : 0)) - (a.c + prio(u, a.t) + (a.t.id === g?.focus ? 20 : 0)));
  const near = humans.length ? Math.min(...humans.map(t => Math.hypot(t.x - u.x, t.y - u.y))) : 99;
  const mode = u.kind === 'commander' ? 'assault' : g?.mode ?? 'assault';
  const walk = async (spot: [number, number]) => {
    if ((u.fl ?? 0) > 0 || u.static) return; // на верхних этажах и турели пришельцы не ходят: держат позицию
    for (const [x, y] of findPath(s, u.x, u.y, spot[0], spot[1], u.move)) {
      u.x = x; u.y = y; openDoorAt(s, x, y);
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

  // тяжело раненый не лезет под огонь: отходит к укрытию и ждёт в засаде
  if (u.kind !== 'commander' && !u.static && (u.fl ?? 0) === 0 && u.hp <= Math.ceil(u.maxHp * 0.3) && !st.retreated && near <= 12 && u.ap >= 1 && rand(s) < 0.6) {
    const spot = retreatSpot(s, u, humans);
    if (spot) { st.retreated = true; u.ap -= 1; u.stance = 'stand'; await walk(spot); if (u.hp > 0 && u.ap > 0 && u.ammo > 0 && hasCover(s, u.x, u.y)) { u.overwatch = true; u.ap = 0; await h.moved(u); return 'stop'; } return 'next'; }
  }
  // гранаты: по скоплению бойцов или по тем, кто сидит за укрытием/в здании
  if (u.grenades > 0 && u.ap >= 1 && humans.length && near <= GRENADE_RANGE + 1 && mode !== 'hold') {
    let pick: Unit | null = null, bestV = 0;
    for (const t of humans) {
      const d = Math.hypot(t.x - u.x, t.y - u.y); if (d > GRENADE_RANGE || d < 3) continue;
      if (s.units.some(a => a.team === 'alien' && a.hp > 0 && flOf(a) === flOf(t) && Math.hypot(a.x - t.x, a.y - t.y) <= BLAST + 0.2)) continue; // не бить по своим
      const cl = humans.filter(o => Math.hypot(o.x - t.x, o.y - t.y) <= 1.6).length, hc = hitChance(s, u, t), sheltered = hc === null || hc < 40;
      const v = cl * 2 + (sheltered ? 1.5 : 0) + (t.id === g?.focus ? 1 : 0);
      if ((cl >= 2 || sheltered) && v > bestV) { bestV = v; pick = t; }
    }
    if (pick && rand(s) < 0.5) {
      u.grenades -= 1; u.ap -= 1; u.overwatch = false; faceToward(u, pick.x, pick.y);
      const same = bldgAt(s, pick.x, pick.y) >= 0 && bldgAt(s, pick.x, pick.y) === bldgAt(s, u.x, u.y);
      const r = blast(s, u, pick.x, pick.y, `${u.name} кидає гранату`, false, undefined, same ? flOf(pick) : 0);
      await h.blast?.(r); return 'next';
    }
  }
  if (options.length) {
    const t = options[0].t;
    // тяжёлые и снайперы прижимают огнём, когда попасть трудно
    const sup = ['heavy', 'sniper', 'commander'].includes(u.kind) && u.ammo >= 2 && options[0].c < 35 && !t.suppressed ? suppress(s, u, t) : null;
    if (sup) { await h.shot(sup); return 'next'; }
    // «якорь» группы прижимает фокус-цель, пока остальные заходят с флангов
    const pin = g && g.members.length >= 3 && idx === 0 && mode === 'assault' && !t.suppressed && u.ammo >= 3 && ['trooper', 'heavy', 'sniper', 'commander'].includes(u.kind) && rand(s) < 0.5 ? suppress(s, u, t) : null;
    if (pin) { await h.shot(pin); return 'next'; }
    await h.shot(shoot2(s, u, t));
    if (u.kind === 'sniper' && !u.static && flOf(u) === 0 && u.hp > 0 && u.ap > 0 && !st.retreated && rand(s) < 0.45) { // снайпер меняет позицию после выстрела
      const spot = retreatSpot(s, u, humans);
      if (spot) { st.retreated = true; u.ap -= 1; u.stance = 'stand'; await walk(spot); return 'next'; }
    }
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
  const bel = believed(s, humans);
  const H = bel.length ? bel : humans; // куда идти: к запомненным позициям, а без памяти — на шум и тревогу
  let best: [number, number] | null = null;
  let bestScore = Infinity;
  const cands: { p: [number, number]; sc: number }[] = [];
  const foc = g?.focus !== undefined ? H.find(h2 => h2.id === g.focus) : undefined; // окружение: каждый член группы выходит на свой сектор вокруг цели
  const cx = g && g.members.length ? g.members.reduce((a, m) => a + m.x, 0) / g.members.length : u.x, cy = g && g.members.length ? g.members.reduce((a, m) => a + m.y, 0) / g.members.length : u.y;
  const n = g?.members.length ?? 1, R = u.kind === 'sniper' ? 10 : 6;
  let px = 0, py = 0;
  if (foc && n >= 2) { const th = Math.atan2(cy - foc.y, cx - foc.x) + ((idx / (n - 1)) - 0.5) * Math.PI * 0.9; px = foc.x + Math.cos(th) * R; py = foc.y + Math.sin(th) * R; }
  for (const k of reachable(s, u.x, u.y, u.move).keys()) {
    const [x, y] = k.split(',').map(Number);
    if (x === u.x && y === u.y) continue;
    const ghost = { ...u, x, y };
    const nearT = Math.min(...H.map(t => Math.hypot(t.x - x, t.y - y)));
    const seen = H.some(t => score(s, ghost, t) !== null);
    const flank = H.some(t => hitChance(s, ghost, t) !== null && isFlanked(s, ghost, t));
    const cov = hasCover(s, x, y);
    const sc = ideal(u, nearT) - (seen ? 3 : 0) - (cov ? (bound ? 3.5 : 1.5) : 0) - (flank && idx % 2 === 1 ? 2.5 : 0) - s.height[y][x] * (u.kind === 'sniper' ? 1.5 : 0.7) - (trenchAt(s, x, y) ? 2 : 0) - (near < 16 && (u.kind === 'trooper' || u.kind === 'heavy') && bldgAt(s, x, y) >= 0 ? 2 : 0); // здания — укрытие и позиция у окон
    const sc2 = sc + (foc && n >= 2 ? 0.25 * Math.hypot(x - px, y - py) : 0);
    cands.push({ p: [x, y], sc: sc2 });
  }
  cands.sort((a, b) => a.sc - b.sc);
  for (const c of cands.slice(0, 6)) { // из лучших — та клетка, где под огнём меньше бойцов (засады overwatch весят втрое)
    const gh = { ...u, x: c.p[0], y: c.p[1] };
    const expo = H.reduce((a, t) => a + (!t.down && hitChance(s, t, gh) !== null ? (t.overwatch ? 3 : 1) : 0), 0);
    const fin = c.sc + 0.7 * expo;
    if (fin < bestScore) { bestScore = fin; best = c.p; }
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
  const role = (a: Unit) => (['heavy', 'sniper', 'commander'].includes(a.kind) ? 0 : 1); // прижимающие ходят первыми — остальные идут уже под подавлением
  for (const u of living(s, 'alien').sort((a, b) => role(a) - role(b))) {
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
