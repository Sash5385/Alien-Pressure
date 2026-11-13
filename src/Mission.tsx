import { useEffect, useReducer, useRef, useState } from 'react';
import { runAlienTurn } from './game/ai';
import { aimedShot, bandage, canLaunch, LAUNCH, peekShot, peekTile, canMelee, canRevive, coverSource, melee, revive, canShootBarrel, checkEnd, digIn, setStance, trenchAt, hitChance, isVisible, living, log, medicHeal, mineTile, nearBeacon, placeCharge, placeMine, reload, shoot, shootBarrel, startHumanTurn, suppress } from './game/combat';
import { CLASSES } from './game/classes';
import type { GameState, Unit } from './game/types';
import { btn, cta, NM, VERSION } from './ui';
import { TRAITS } from './game/traits';
import { reinforce } from './game/mission';
import { GameView, WEATHER_NAME, weatherOf, type Weather } from './render/GameView';
import { loadModels } from './render/models';
import { isMuted, setMuted, sfx } from './audio';
import { BIOME_NAME } from './game/difficulty';
import { ARMORS, WEAPONS } from './game/weapons';

/** Миникарта: рельеф, укрытия, туман войны, бойцы и видимые пришельцы; клик — перенос камеры. */
function Minimap({ s, narrow, onPick }: { s: GameState; narrow: boolean; onPick: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = s.size <= 44 ? 3 : 2;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const n = s.size;
    const cov: Record<string, string> = { tree: '#2f6a2a', bush: '#3f7a2e', rock: '#8a8a84', house: '#c9b88f', crate: '#8a6a42', container: '#4a5a72' };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let col = s.terrain[y][x] === 'water' ? '#2d6aa0' : s.cover[y][x] !== 'none' ? (cov[s.look[y][x]] ?? '#6b6254') : `hsl(95 22% ${22 + s.height[y][x] * 7}%)`;
      g.fillStyle = col;
      g.fillRect(x * px, y * px, px, px);
      if (!s.vis[y][x]) { g.fillStyle = s.seen[y][x] ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.7)'; g.fillRect(x * px, y * px, px, px); }
    }
    if (s.zone) { g.strokeStyle = '#35e07a'; g.strokeRect(s.zone.x * px + 0.5, s.zone.y * px + 0.5, s.zone.w * px, s.zone.h * px); }
    g.fillStyle = '#ffd34d';
    for (const b of s.beacons) if (!b.done) g.fillRect(b.x * px - 1, b.y * px - 1, px + 2, px + 2);
    for (const t of s.trenches) { g.fillStyle = '#1c150d'; g.fillRect(t.x * px, t.y * px, px, px); }
    for (const u of s.units) {
      if (u.hp <= 0) continue;
      if (u.team === 'human') { g.fillStyle = u.id === s.selectedId ? '#ffd34d' : '#4fc3ff'; g.fillRect(u.x * px - 1, u.y * px - 1, px + 2, px + 2); }
      else if (isVisible(s, u)) { g.fillStyle = u.id === s.markId ? '#ff2222' : '#ff6b6b'; g.fillRect(u.x * px - 1, u.y * px - 1, px + 2, px + 2); }
    }
  });
  return (
    <canvas
      ref={ref} width={s.size * px} height={s.size * px}
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onPick(Math.floor(((e.clientX - r.left) / r.width) * s.size), Math.floor(((e.clientY - r.top) / r.height) * s.size)); }}
      style={{ border: '1px solid #667', borderRadius: 4, background: '#000', width: s.size * px * (narrow ? 0.75 : 1), imageRendering: 'pixelated', pointerEvents: 'auto', display: 'block' }}
    />
  );
}

export function Mission({ initial, onExit, onSave }: { initial: GameState; onExit: (s: GameState, repeat?: boolean) => void; onSave: (s: GameState) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(initial);
  const view = useRef<GameView | null>(null);
  const [, rerender] = useReducer(n => n + 1, 0);

  useEffect(() => {
    let dead = false;
    loadModels().then(() => {
      if (dead) return;
      view.current = new GameView(host.current!, state.current, rerender);
      rerender();
    });
    return () => { dead = true; view.current?.dispose(); view.current = null; };
  }, []);

  const s = state.current;
  if (import.meta.env.DEV) Object.assign(window, { __s: s, __view: view.current });
  const [more, setMore] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
  const lift = typeof window !== 'undefined' && window.innerWidth < 1400; // на средних экранах угловые блоки поднимаем над диском
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  // автосохранение: в начале хода и после каждого действия игрока
  useEffect(() => { if (s.turn === 'human' && !s.busy && s.status === 'playing') onSave(s); });
  useEffect(() => { if (s.status === 'won') sfx('win'); else if (s.status === 'lost') sfx('lose'); }, [s.status]);
  const sel = s.units.find(u => u.id === s.selectedId && u.hp > 0);
  const tgt = s.units.find(u => u.id === s.targetId && u.hp > 0);
  const wl = sel ? WEAPONS[sel.weapon].launch : undefined;
  const direct = sel && tgt ? hitChance(s, sel, tgt) : null;
  const peek = sel && tgt && direct === null ? peekTile(s, sel, tgt) : null;
  const chance = direct ?? peek?.chance ?? null;
  const canAct = !!view.current && s.turn === 'human' && !s.busy && s.status === 'playing';
  const tb = s.targetBarrel;
  const barrelOk = canAct && !!sel && !!tb && canShootBarrel(s, sel, tb.x, tb.y);
  const canFire = wl ? canAct && !!sel && sel.ap >= LAUNCH[wl].ap && sel.ammo >= LAUNCH[wl].rounds : (canAct && !!sel && sel.ap > 0 && chance !== null) || barrelOk;
  const canBandage = canAct && !!sel && sel.ap > 0 && s.medkits > 0 &&
    living(s, 'human').some(h => h.bleeding && Math.abs(h.x - sel.x) + Math.abs(h.y - sel.y) <= 1);
  const canGrenade = canAct && !!sel && sel.ap > 0 && sel.grenades > 0 && sel.stance !== 'prone';
  const toggleGrenade = () => {
    if (!canGrenade) return;
    s.smokeMode = false; s.launch = undefined;
    s.aiming = s.aiming === 'grenade' && !s.smokeMode ? null : 'grenade';
    s.targetId = null;
    view.current!.syncUnits();
    rerender();
  };
  const toggleSmoke = () => {
    if (!canGrenade) return;
    const on = s.aiming === 'grenade' && s.smokeMode;
    s.launch = undefined; s.smokeMode = !on; s.aiming = on ? null : 'grenade'; s.targetId = null;
    view.current!.syncUnits(); rerender();
  };
  const canUgl = canAct && !!sel && (sel.ugl ?? 0) > 0 && sel.ap >= 1 && !wl;
  const toggleUgl = () => {
    if (!canUgl) return;
    const on = s.aiming === 'grenade' && s.launch === 'ugl';
    s.launch = on ? undefined : 'ugl'; s.smokeMode = false; s.aiming = on ? null : 'grenade'; s.targetId = null;
    view.current!.syncUnits(); rerender();
  };
  const canMeleeNow = canAct && !!sel && !!tgt && canMelee(sel, tgt);
  const doMelee = async () => {
    if (!canMeleeNow || !sel || !tgt) return;
    s.busy = true;
    const r = melee(s, sel, tgt);
    rerender();
    await view.current!.meleeFx(r);
    if (tgt.hp <= 0) s.targetId = null;
    s.busy = false; checkEnd(s);
    view.current!.syncUnits(); rerender();
  };
  const downedAlly = sel ? s.units.find(h => h.team === 'human' && h !== sel && h.hp > 0 && h.down && canRevive(sel, h)) : undefined;
  const doRevive = () => {
    if (!canAct || !sel || !downedAlly) return;
    if (revive(s, sel, downedAlly)) sfx('heal');
    view.current!.syncUnits(); rerender();
  };
  const canCharge = canAct && !!sel && sel.ap > 0 && sel.grenades > 0 && !!nearBeacon(s, sel);
  const doCharge = () => {
    if (!canCharge || !sel) return;
    if (placeCharge(s, sel)) sfx('charge');
    view.current!.syncUnits();
    rerender();
  };
  const cls = sel?.cls;
  const canAbility = canAct && !!sel && sel.ap > 0 && (
    cls === 'assault' ? !!tgt && chance !== null && sel.ammo >= 2 :
    cls === 'sniper' ? sel.ap >= 2 && !!tgt && hitChance(s, sel, tgt, false, 30) !== null :
    cls === 'medic' ? sel.abilityUsed < 2 && living(s, 'human').some(h => Math.max(Math.abs(h.x - sel.x), Math.abs(h.y - sel.y)) <= 2 && (h.hp < h.maxHp || h.bleeding)) :
    sel.abilityUsed < 2 && !!mineTile(s, sel));
  const doAbility = async () => {
    if (!canAbility || !sel) return;
    if (cls === 'assault' || cls === 'sniper') {
      if (!tgt) return;
      s.busy = true;
      const r = cls === 'assault' ? suppress(s, sel, tgt) : aimedShot(s, sel, tgt);
      rerender();
      if (r) await view.current!.shotFx(r);
      if (tgt.hp <= 0) s.targetId = null;
      s.busy = false;
    } else if (cls === 'medic') medicHeal(s, sel);
    else placeMine(s, sel);
    view.current!.syncUnits();
    rerender();
  };
  const abilityLabel = sel ? { assault: 'Подавить', sniper: 'Прицельный (2 AP)', medic: `Лечение (${2 - sel.abilityUsed})`, engineer: `Мина (${2 - sel.abilityUsed})` }[sel.cls] : '';
  const canDig = canAct && !!sel && sel.ap > 0 && !trenchAt(s, sel.x, sel.y) && s.terrain[sel.y][sel.x] !== 'water';
  const doDig = () => {
    if (!canDig || !sel) return;
    digIn(s, sel);
    view.current!.syncUnits();
    rerender();
  };
  const rank = { stand: 0, kneel: 1, prone: 2 } as const;
  const stanceNow = sel?.stance ?? 'stand';
  const canStance = (st: 'stand' | 'kneel' | 'prone') => canAct && !!sel && st !== stanceNow && (rank[st] <= rank[stanceNow] || sel.ap > 0);
  const doStance = (st: 'stand' | 'kneel' | 'prone') => {
    if (!sel || !setStance(s, sel, st)) return;
    view.current!.syncUnits();
    rerender();
  };
  const canOw = canAct && !!sel && sel.ap > 0 && sel.ammo > 0 && !sel.overwatch && !wl;

  const fire = async () => {
    if (barrelOk && sel && tb) {
      s.busy = true;
      const res = shootBarrel(s, sel, tb.x, tb.y);
      rerender();
      if (res) await view.current!.barrelShotFx(sel, res);
      s.busy = false;
      view.current!.syncUnits();
      rerender();
      return;
    }
    if (wl && sel) { // гранатомёт/миномёт/АГС: по цели или выбор клетки
      if (!canFire) return;
      if (tgt && canLaunch(s, sel, tgt.x, tgt.y, wl)) {
        s.launch = wl; s.targetId = null;
        await view.current!.launchAt(sel, tgt.x, tgt.y);
      } else {
        const on = s.aiming === 'grenade' && s.launch === wl;
        s.launch = on ? undefined : wl; s.smokeMode = false; s.aiming = on ? null : 'grenade'; s.targetId = null;
        view.current!.syncUnits();
      }
      rerender();
      return;
    }
    if (!canFire || !sel || !tgt) return;
    s.busy = true;
    const r = (direct === null ? peekShot(s, sel, tgt) : null) ?? shoot(s, sel, tgt);
    sel.overwatch = false;
    rerender();
    await view.current!.shotFx(r);
    if (tgt.hp <= 0) s.targetId = null;
    s.busy = false;
    view.current!.syncUnits();
    rerender();
  };

  const canReload = canAct && !!sel && sel.ap > 0 && sel.ammo < sel.maxAmmo && sel.mags > 0;
  const doReload = () => {
    if (!canReload || !sel) return;
    reload(s, sel);
    view.current!.syncUnits();
    rerender();
  };

  const heal = () => {
    if (!canBandage || !sel) return;
    bandage(s, sel);
    view.current!.syncUnits();
    rerender();
  };

  const pick = (id: number) => {
    if (!canAct) return;
    s.selectedId = id; s.targetId = null; s.targetBarrel = null; s.aiming = null;
    sfx('select');
    const u = s.units.find(v => v.id === id);
    if (u) view.current!.focusOn(u.x, u.y);
    view.current!.syncUnits();
    rerender();
  };

  const overwatch = () => {
    if (!canOw || !sel) return;
    sel.overwatch = true; sel.ap = 0; s.targetId = null;
    log(s, `${sel.name} занимает overwatch.`);
    view.current!.syncUnits();
    rerender();
  };

  const endTurn = async () => {
    if (!canAct) return;
    sfx('turnEnemy');
    s.turn = 'alien'; s.busy = true; s.targetId = null; s.aiming = null;
    if ((s.objective === 'hold' && s.turnNo % 2 === 0) || s.objective === 'defend') reinforce(s);
    view.current!.syncUnits();
    rerender();
    await runAlienTurn(s, {
      moved: async u => { await view.current!.moved(u); rerender(); },
      alerted: ids => view.current!.alertFx(ids),
      blast: async r => { await view.current!.blastFx(r); rerender(); },
      shot: async r => { rerender(); await view.current!.shotFx(r); view.current!.syncUnits(); rerender(); },
    });
    view.current!.unfocus();
    checkEnd(s);
    if (s.status === 'playing') {
      s.turnNo += 1;
      log(s, `— Ход ${s.turnNo} —`);
      startHumanTurn(s);
      sfx('turnPlayer');
      if (s.fires.length) setTimeout(() => sfx('fire'), 400);
      if (living(s, 'human').some(u => u.panic)) setTimeout(() => sfx('panic'), 500);
    }
    s.turn = 'human'; s.busy = false;
    view.current!.syncUnits();
    rerender();
  };

  const leave = () => onExit(s);

  const info = sel
    ? `${sel.name} · HP ${sel.hp}/${sel.maxHp} · AP ${sel.ap}/${sel.maxAp} · мораль ${sel.morale}${sel.overwatch ? ' · overwatch' : ''}${sel.bleeding ? ' · кровотечение' : ''}${sel.fracture ? ' · перелом' : ''}${sel.panic ? ' · ПАНИКА' : ''}${sel.down ? ` · ТЯЖЕЛО РАНЕН (${sel.bleedOut ?? 3} хода)` : ''}`
    : 'Выбери бойца';
  const cmd = s.units.find(u => u.kind === 'commander' && u.hp > 0);
  const goal = {
    clear: 'зачистка',
    extract: 'эвакуация: все в зелёную зону',
    hold: `удержание ${Math.min(s.turnNo, s.holdTurns)}/${s.holdTurns}`,
    defend: `оборона ${Math.min(s.turnNo, s.holdTurns)}/${s.holdTurns}`,
    assassinate: cmd ? `убить командира (HP ${cmd.hp}/${cmd.maxHp})` : 'командир убит',
    sabotage: `маяки ${s.beacons.filter(b => b.done).length}/${s.beacons.length}`,
  }[s.objective];
  const aliens = living(s, 'alien').filter(u => isVisible(s, u)).length;

  const humans = s.units.filter(u => u.team === 'human');
  const half = Math.ceil(humans.length / 2);
  const nbBase: React.CSSProperties = { background: '#1e2433', color: '#dfe5f2', border: 0, font: 'inherit' };
  const OUT = '4px 4px 10px #141926, -4px -4px 10px #2a3348', OUTS = '2px 2px 6px #141926, -2px -2px 6px #2a3348', IN = 'inset 2px 2px 6px #141926, inset -2px -2px 6px #2a3348';
  const nb = (on = false, off = false): React.CSSProperties => ({
    ...nbBase, color: on ? '#ffd34d' : '#dfe5f2', borderRadius: 14, boxShadow: on ? IN : OUTS, opacity: off ? 0.45 : 1, fontWeight: 700, fontSize: narrow ? 10 : 13,
    padding: narrow ? '4px 2px' : '6px 8px', minWidth: narrow ? 0 : 76, width: narrow ? '100%' : undefined, minHeight: 46, cursor: off ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
  });
  const round = (on = false): React.CSSProperties => ({ ...nbBase, width: 46, height: 46, borderRadius: '50%', boxShadow: on ? IN : OUTS, color: on ? '#ffd34d' : '#dfe5f2', fontSize: 18, cursor: 'pointer' });
  const ab = (label: string, sub: string, on: boolean, off: boolean, click: () => void, title?: string) => (
    <button key={label} style={nb(on, off)} disabled={off} title={title} onClick={click}>{label}{sub && <small style={{ fontWeight: 500, opacity: 0.7, fontSize: 10 }}>{sub}</small>}</button>
  );
  const leftBtns = [
    ab('Заряд', sel ? `маг. ${sel.mags}` : '', false, !canReload, doReload),
    ab('Граната', sel ? `${sel.grenades}` : '', s.aiming === 'grenade', !canGrenade, toggleGrenade),
    ab('Окопаться', '', false, !canDig || !sel, doDig, 'Окоп: укрытие со всех сторон, −1 урон от взрывов'),
    ab('Удар', '1 AP', false, !canMeleeNow, doMelee, 'Ближний бой: цель в соседней клетке, без патронов, тихо'),
  ];
  const rightBtns = [
    ab('Бинт', `${s.medkits}`, false, !canBandage, heal),
    ab('Overwatch', '', false, !canOw, overwatch),
    sel ? ab(abilityLabel.replace(/ \(.*\)/, ''), abilityLabel.match(/\((.*)\)/)?.[1] ?? '', false, !canAbility, doAbility, CLASSES[sel.cls].desc) : ab('Умение', '', false, true, () => {}),
    ...(s.objective === 'sabotage' ? [ab('Взорвать', 'маяк', true, !canCharge, doCharge)] : []),
    ...(sel && (sel.ugl ?? 0) > 0 && !wl ? [ab('Подствольник', `${sel.ugl}`, s.aiming === 'grenade' && s.launch === 'ugl', !canUgl, toggleUgl, 'Граната из подствольника: дальность 2–10, радиус 1,2, 1 AP')] : []),
    ...(downedAlly ? [ab('Поднять', downedAlly.name, true, !canAct, doRevive)] : []),
    ...(sel?.cls === 'engineer' ? [ab('Дымовая', '3×3, 2 хода', !!s.smokeMode && s.aiming === 'grenade', !canGrenade, toggleSmoke, 'Дым закрывает обзор и линию огня. Тратит гранату')] : []),
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, color: '#d8dccf', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {/* ——— верх: статус по центру, отряд зеркально слева/справа ——— */}
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', maxWidth: narrow ? '94vw' : 560, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ ...nbBase, borderRadius: 999, boxShadow: OUTS, padding: '6px 14px', fontSize: narrow ? 11 : 13, fontWeight: 700 }}>
          Миссия {s.missionNo} · {BIOME_NAME[s.biome]} · {goal} · Ход {s.turnNo} · {s.turn === 'human' ? 'твой ход' : 'ход пришельцев…'} · видно: {aliens}{((s.weather as Weather | undefined) ?? weatherOf(s.missionNo, s.biome)) !== 'clear' && view.current?.isWeatherOn() !== false ? ` · ${WEATHER_NAME[(s.weather as Weather | undefined) ?? weatherOf(s.missionNo, s.biome)]}` : ''}
        </div>
      </div>
      {[[humans.slice(0, half), 'left'], [humans.slice(half), 'right']].map(([list, side]) => (
        <div key={side as string} style={{ position: 'absolute', top: narrow ? 46 : 8, [side as string]: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: side === 'left' ? 'flex-start' : 'flex-end', width: narrow ? '46vw' : undefined }}>
          {(list as Unit[]).map(u => (
            <button key={u.id} disabled={u.hp <= 0 || !canAct} onClick={() => pick(u.id)} title={u.traits.map(t => TRAITS[t].name).join(', ')}
              style={{ ...nbBase, borderRadius: 14, boxShadow: u.id === s.selectedId ? IN : OUTS, color: u.id === s.selectedId ? '#ffd34d' : '#dfe5f2', padding: '6px 10px', fontSize: narrow ? 11 : 12, fontWeight: 700, minWidth: narrow ? 0 : 160, width: narrow ? '100%' : undefined, opacity: u.hp <= 0 ? 0.4 : 1, textDecoration: u.hp <= 0 ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', cursor: 'pointer', minHeight: touch ? 40 : undefined }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}{u.bleeding ? ' 🩸' : ''}{u.panic ? ' ⚠' : ''}{u.down ? ' ⬇' : ''}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                <span style={{ width: 36, height: 6, borderRadius: 3, boxShadow: IN, position: 'relative' }}><b style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.max(0, u.hp) / u.maxHp * 100}%`, borderRadius: 3, background: u.hp / u.maxHp < 0.5 ? '#ff7a7a' : '#6fe39a' }} /></span>
                <i style={{ fontStyle: 'normal', opacity: 0.7, fontWeight: 500 }}>{u.hp}/{u.maxHp}</i>
              </span>
            </button>
          ))}
        </div>
      ))}
      {/* ——— инфо о бойце и цели, по центру ——— */}
      <div style={{ position: 'absolute', top: narrow ? 150 : 50, left: '50%', transform: 'translateX(-50%)', width: narrow ? '94vw' : 560, display: 'grid', gap: 5, justifyItems: 'center', textAlign: 'center', pointerEvents: 'none', textShadow: '0 1px 2px #000' }}>
        <div style={{ fontWeight: 700 }}>{info}</div>
        {sel && !narrow && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', fontSize: 12 }}>
            {[`🎖 ${CLASSES[sel.cls].name}`, `🔫 ${sel.team === 'human' ? WEAPONS[sel.weapon].name : ''} ${sel.ammo}/${sel.maxAmmo}`, ...(sel.armor !== 'none' ? [`🛡 ${ARMORS[sel.armor].name}`] : []), `📦 ${sel.mags}`, `💣 ${sel.grenades}`, ...(s.medkits > 0 ? [`➕ ${s.medkits}`] : [])].map(t => (
              <span key={t} style={{ borderRadius: 999, padding: '2px 8px', background: '#1e2433cc' }}>{t}</span>
            ))}
          </div>
        )}
        {sel && (
          <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto', alignItems: 'center' }}>
            {([['stand', 'Стоя'], ['kneel', 'Колено'], ['prone', 'Лёжа']] as const).map(([st, label]) => (
              <button key={st} disabled={!canStance(st)} title="Опуститься — 1 AP, встать — бесплатно. Лёжа: +10% меткости, −20% шанс попасть по тебе, гранаты нельзя"
                style={{ ...nb(stanceNow === st, !canStance(st) && stanceNow !== st), minWidth: 0, minHeight: touch ? 40 : 32, padding: '4px 12px', borderRadius: 999, fontSize: 12 }} onClick={() => doStance(st)}>{label}</button>
            ))}
          </div>
        )}
        {s.turning && <div style={{ color: '#9be86a' }}>Поворот: нажми клетку, куда смотреть бойцу (долгое нажатие на карте делает то же).</div>}
        {s.aiming === 'grenade' && s.launch && <div style={{ color: '#ffb36b' }}>{LAUNCH[s.launch].name}: кликни клетку в оранжевой зоне (дальность {LAUNCH[s.launch].min}–{LAUNCH[s.launch].range}, радиус {LAUNCH[s.launch].r}; есть разброс, бьёт и по своим). ПКМ — отмена.</div>}
        {s.aiming === 'grenade' && !s.launch && <div style={{ color: '#ffb36b' }}>Бросок гранаты: кликни клетку в оранжевой зоне (красный круг — радиус взрыва, бьёт и по своим). ПКМ — отмена.</div>}
        {tb && !tgt && <div style={{ color: '#ff8a8a' }}>Цель: взрывоопасная бочка · {barrelOk ? 'попадание 100%, взрыв радиусом 2' : 'нет линии огня'}</div>}
        {!narrow && sel && !tgt && !s.aiming && !s.turning && <div style={{ fontSize: 12, opacity: 0.75 }}>Укрытие защищает со стороны, где оно стоит: <span style={{ color: '#3cff7a' }}>зелёная полоска</span> — полное (−40% к попаданию), <span style={{ color: '#ffd34d' }}>жёлтая</span> — половинное (−20%). Зелёные клетки — где можно укрыться.</div>}
        {tgt && <div style={{ color: '#ff8a8a' }}>Цель: {tgt.name} · HP {tgt.hp}/{tgt.maxHp} · {chance === null ? 'нет линии огня' : `${peek ? 'стрейф из-за укрытия' : 'шанс'} ${chance}%`}{direct !== null && sel && (() => { const cs = coverSource(s, sel, tgt); return cs ? ` · укрытие −${cs.bonus}% (${cs.trench ? 'окоп' : cs.bonus === 40 ? 'полное' : 'половинное'})` : ' · без укрытия'; })()}</div>}
      </div>
      {/* ——— низ: миникарта и меню по углам, диск действий по центру ——— */}
      {showMap && (
        <div style={{ position: 'absolute', left: 8, bottom: lift ? (narrow ? 215 : 150) : 8, ...nbBase, borderRadius: 16, boxShadow: OUT, padding: 6 }}>
          <Minimap s={s} narrow={narrow} onPick={(x, y) => view.current?.panTo(x, y)} />
        </div>
      )}
      <div style={{ position: 'absolute', right: 8, bottom: lift ? (narrow ? 215 : 150) : 8, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {showLog && (
          <div style={{ ...nbBase, borderRadius: 16, boxShadow: OUT, padding: 10, width: narrow ? 'calc(100vw - 16px)' : 340, maxHeight: 260, overflowY: 'auto', fontSize: 12, lineHeight: 1.45, pointerEvents: 'auto' }}>
            {[...s.log].reverse().slice(0, 60).map((l, i) => <div key={i} style={{ opacity: l.startsWith('—') ? 0.55 : 1, borderTop: l.startsWith('—') ? '1px solid #2a3348' : undefined, paddingTop: l.startsWith('—') ? 4 : 0 }}>{l}</div>)}
          </div>
        )}
        {more && (
          <div style={{ ...nbBase, borderRadius: 16, boxShadow: OUT, padding: 10, display: 'grid', gap: 8, fontSize: 12 }}>
            <button style={nb(false, false)} onClick={() => { const v = view.current; if (v) v.setQuality(v.getQuality() === 'high' ? 'low' : 'high'); rerender(); }}>Графика: {view.current?.getQuality() === 'low' ? 'обычная' : 'высокая'}</button>
            <button style={nb(false, false)} onClick={() => { const v = view.current; if (v) v.setAutoCam(!v.getAutoCam()); rerender(); }}>Камера: {view.current?.getAutoCam() === false ? 'ручная' : 'авто'}</button>
            <button style={nb(false, false)} onClick={() => { const v = view.current; if (v) v.setWeatherOn(!v.isWeatherOn()); rerender(); }}>Погода: {view.current?.isWeatherOn() === false ? 'выкл' : 'вкл'}</button>
            <button style={nb(false, false)} onClick={() => { setMuted(!isMuted()); sfx('click'); rerender(); }}>{isMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button>
            <div style={{ opacity: 0.6, maxWidth: 200, lineHeight: 1.35 }}>{touch ? '1 палец — двигать карту, 2 — вращать, щипок — масштаб, долгое нажатие — повернуть бойца.' : 'ПКМ — повернуть бойца, СКМ — сдвиг камеры.'}</div>
            <div style={{ opacity: 0.45, textAlign: 'center' }}>{VERSION}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={round(showMap)} title="Миникарта" onClick={() => setShowMap(!showMap)}>🗺</button>
          {(() => { const k = s.undo, uu = k && s.units.find(v => v.id === k.id && v.hp > 0); const ok = !!k && !!uu && canAct && `${uu.x},${uu.y},${uu.ap},${uu.ammo},${uu.stance},${uu.overwatch},${s.log.length}` === k.fp; return ok ? <button style={round(false)} title="Отменить последний ход" onClick={() => { if (view.current?.undoMove()) { sfx('click'); } rerender(); }}>↶</button> : null; })()}
          <button style={round(s.turning)} title="Повернуть бойца" onClick={() => { s.turning = !s.turning; s.aiming = null; rerender(); }}>↻</button>
          <button style={round(showLog)} title="Журнал боя" onClick={() => setShowLog(!showLog)}>📜</button>
          <button style={round(more)} title="Настройки" onClick={() => setMore(!more)}>⚙</button>
        </div>
      </div>
      <div style={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', display: 'grid', gap: 8, justifyItems: 'center', width: narrow ? 'calc(100vw - 16px)' : undefined, pointerEvents: 'none' }}>
        <div style={{ maxWidth: narrow ? '34vw' : 420, fontSize: narrow ? 9 : 12, textAlign: 'center', textShadow: '0 1px 2px #000', pointerEvents: 'none', maxHeight: narrow ? 42 : 64, overflow: 'hidden' }}>
          {s.log.slice(narrow ? -1 : -3).map((l, i) => <div key={s.log.length + ':' + i}>{l}</div>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: narrow ? 6 : 14, pointerEvents: 'auto' }}>
          <div style={{ display: narrow ? 'grid' : 'flex', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'flex-end', width: narrow ? 'calc((100vw - 16px - 84px - 12px) / 2)' : undefined }}>
            {leftBtns.map((b, i) => <div key={i} style={{ marginBottom: narrow ? 0 : i * 16, minWidth: 0 }}>{b}</div>)}
          </div>
          <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
            <button style={{ ...nb(false, !canAct), color: '#ffd34d', minWidth: narrow ? 84 : 110 }} disabled={!canAct} onClick={endTurn}>Конец хода</button>
            <button disabled={!canFire} onClick={fire} style={{ width: narrow ? 84 : 104, height: narrow ? 84 : 104, borderRadius: '50%', border: 0, background: 'linear-gradient(145deg,#ffdf74,#e8b32a)', color: '#2b2410', fontWeight: 800, fontSize: narrow ? 14 : 16, font: 'inherit', cursor: canFire ? 'pointer' : 'default', opacity: canFire ? 1 : 0.45, boxShadow: OUT, display: 'grid', placeItems: 'center', alignContent: 'center' }}>
              <span style={{ fontWeight: 800 }}>{peek ? 'ВЫГЛЯНУТЬ' : wl && !tgt ? 'ЦЕЛЬ' : 'ОГОНЬ'}</span>
              <small style={{ fontWeight: 600, opacity: 0.75 }}>{wl ? LAUNCH[wl].name : chance !== null ? `${chance}%` : tb ? 'бочка' : ''}</small>
            </button>
          </div>
          <div style={{ display: narrow ? 'grid' : 'flex', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'flex-end', width: narrow ? 'calc((100vw - 16px - 84px - 12px) / 2)' : undefined }}>
            {rightBtns.map((b, i) => <div key={i} style={{ marginBottom: narrow ? 0 : (rightBtns.length - 1 - i) * 16, minWidth: 0 }}>{b}</div>)}
          </div>
        </div>
      </div>
      {view.current?.hover && s.turn === 'human' && !s.busy && (
        <div style={{ position: 'fixed', left: Math.min(view.current.hover.sx + 16, window.innerWidth - 220), top: view.current.hover.sy + 18, ...nbBase, borderRadius: 10, boxShadow: OUTS, padding: '4px 10px', fontSize: 12, fontWeight: 700, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>{view.current.hover.text}</div>
      )}
      {s.status !== 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#0b0f18cc' }}>
          <div style={{ textAlign: 'center', background: NM.bg, boxShadow: NM.out, borderRadius: 22, padding: '24px 32px', maxWidth: 'calc(100vw - 32px)' }}>
            <h1 style={{ margin: 0 }}>{s.status === 'won' ? 'Зачистка завершена' : 'Отряд уничтожен'}</h1>
            <p>Ходов: {s.turnNo} · выжило: {living(s, 'human').length}/{s.units.filter(u => u.team === 'human').length}</p>
            {s.status === 'lost' && <button style={{ ...cta(), marginRight: 8 }} onClick={() => onExit(s, true)}>Повторить миссию</button>}
            <button style={s.status === 'won' ? cta() : btn()} onClick={leave}>{s.status === 'won' ? 'В лагерь' : 'Дальше (отряд потерян)'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
