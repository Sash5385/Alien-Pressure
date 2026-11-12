import { useEffect, useReducer, useRef, useState } from 'react';
import { runAlienTurn } from './game/ai';
import { aimedShot, bandage, canShootBarrel, checkEnd, digIn, setStance, trenchAt, hitChance, isVisible, living, log, medicHeal, mineTile, nearBeacon, placeCharge, placeMine, reload, shoot, shootBarrel, startHumanTurn, suppress } from './game/combat';
import { CLASSES } from './game/classes';
import type { GameState } from './game/types';
import { btn, VERSION } from './ui';
import { TRAITS } from './game/traits';
import { reinforce } from './game/mission';
import { GameView } from './render/GameView';
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
  const [showMap, setShowMap] = useState(true);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const bb = (primary = false, off = false) => ({ ...btn(primary, off), ...(touch ? { minHeight: 46, padding: '10px 12px' } : {}) });
  // автосохранение: в начале хода и после каждого действия игрока
  useEffect(() => { if (s.turn === 'human' && !s.busy && s.status === 'playing') onSave(s); });
  const sel = s.units.find(u => u.id === s.selectedId && u.hp > 0);
  const tgt = s.units.find(u => u.id === s.targetId && u.hp > 0);
  const chance = sel && tgt ? hitChance(s, sel, tgt) : null;
  const canAct = !!view.current && s.turn === 'human' && !s.busy && s.status === 'playing';
  const tb = s.targetBarrel;
  const barrelOk = canAct && !!sel && !!tb && canShootBarrel(s, sel, tb.x, tb.y);
  const canFire = (canAct && !!sel && sel.ap > 0 && chance !== null) || barrelOk;
  const canBandage = canAct && !!sel && sel.ap > 0 && s.medkits > 0 &&
    living(s, 'human').some(h => h.bleeding && Math.abs(h.x - sel.x) + Math.abs(h.y - sel.y) <= 1);
  const canGrenade = canAct && !!sel && sel.ap > 0 && sel.grenades > 0 && sel.stance !== 'prone';
  const toggleGrenade = () => {
    if (!canGrenade) return;
    s.aiming = s.aiming === 'grenade' ? null : 'grenade';
    s.targetId = null;
    view.current!.syncUnits();
    rerender();
  };
  const canCharge = canAct && !!sel && sel.ap > 0 && sel.grenades > 0 && !!nearBeacon(s, sel);
  const doCharge = () => {
    if (!canCharge || !sel) return;
    if (placeCharge(s, sel)) sfx('grenade');
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
    } else if (cls === 'medic') { if (medicHeal(s, sel)) sfx('reload'); }
    else if (placeMine(s, sel)) sfx('click');
    view.current!.syncUnits();
    rerender();
  };
  const abilityLabel = sel ? { assault: 'Подавить', sniper: 'Прицельный (2 AP)', medic: `Лечение (${2 - sel.abilityUsed})`, engineer: `Мина (${2 - sel.abilityUsed})` }[sel.cls] : '';
  const canDig = canAct && !!sel && sel.ap > 0 && !trenchAt(s, sel.x, sel.y) && s.terrain[sel.y][sel.x] !== 'water';
  const doDig = () => {
    if (!canDig || !sel) return;
    if (digIn(s, sel)) sfx('reload');
    view.current!.syncUnits();
    rerender();
  };
  const rank = { stand: 0, kneel: 1, prone: 2 } as const;
  const stanceNow = sel?.stance ?? 'stand';
  const canStance = (st: 'stand' | 'kneel' | 'prone') => canAct && !!sel && st !== stanceNow && (rank[st] <= rank[stanceNow] || sel.ap > 0);
  const doStance = (st: 'stand' | 'kneel' | 'prone') => {
    if (!sel || !setStance(s, sel, st)) return;
    sfx('click');
    view.current!.syncUnits();
    rerender();
  };
  const canOw = canAct && !!sel && sel.ap > 0 && sel.ammo > 0 && !sel.overwatch;

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
    if (!canFire || !sel || !tgt) return;
    s.busy = true;
    const r = shoot(s, sel, tgt);
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
    if (reload(s, sel)) sfx('reload');
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
    s.turn = 'alien'; s.busy = true; s.targetId = null; s.aiming = null;
    if (s.objective === 'hold' && s.turnNo % 2 === 0) reinforce(s);
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
      if (living(s, 'human').some(u => u.panic)) sfx('panic');
    }
    s.turn = 'human'; s.busy = false;
    view.current!.syncUnits();
    rerender();
  };

  const leave = () => onExit(s);

  const info = sel
    ? `${sel.name} · HP ${sel.hp}/${sel.maxHp} · AP ${sel.ap}/${sel.maxAp} · мораль ${sel.morale}${sel.overwatch ? ' · overwatch' : ''}${sel.bleeding ? ' · кровотечение' : ''}${sel.fracture ? ' · перелом' : ''}${sel.panic ? ' · ПАНИКА' : ''}`
    : 'Выбери бойца';
  const cmd = s.units.find(u => u.kind === 'commander' && u.hp > 0);
  const goal = {
    clear: 'зачистка',
    extract: 'эвакуация: все в зелёную зону',
    hold: `удержание ${Math.min(s.turnNo, s.holdTurns)}/${s.holdTurns}`,
    assassinate: cmd ? `убить командира (HP ${cmd.hp}/${cmd.maxHp})` : 'командир убит',
    sabotage: `маяки ${s.beacons.filter(b => b.done).length}/${s.beacons.length}`,
  }[s.objective];
  const aliens = living(s, 'alien').filter(u => isVisible(s, u)).length;

  return (
    <div style={{ position: 'fixed', inset: 0, color: '#d8dccf', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, pointerEvents: 'none', textShadow: '0 1px 2px #000' }}>
        <b>Миссия {s.missionNo}</b> · {BIOME_NAME[s.biome]} · {goal} · Ход {s.turnNo} · {s.turn === 'human' ? 'твой ход' : 'ход пришельцев…'} · в поле зрения: {aliens}
        <div>{info}</div>
        {sel && !touch && <div style={{ opacity: 0.8, fontSize: 12 }}>{sel.traits.map(t => TRAITS[t].name).join(', ')} — {sel.bio}</div>}
        {sel && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, fontSize: 12 }}>
            {[`🎖 ${CLASSES[sel.cls].name}`, `🔫 ${sel.team === 'human' ? WEAPONS[sel.weapon].name : ''} ${sel.ammo}/${sel.maxAmmo}`, ...(sel.armor !== 'none' ? [`🛡 ${ARMORS[sel.armor].name}`] : []), `📦 магазины ${sel.mags}`, `💣 гранаты ${sel.grenades}`, `🩹 аптечки ${s.medkits} (отряд)`].map(t => (
              <span key={t} style={{ border: '1px solid #445', borderRadius: 4, padding: '2px 6px', background: '#0008' }}>{t}</span>
            ))}
          </div>
        )}
        {sel && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4, pointerEvents: 'auto', alignItems: 'center', fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>Стойка:</span>
            {([['stand', 'Стоя'], ['kneel', 'Колено'], ['prone', 'Лёжа']] as const).map(([st, label]) => (
              <button key={st} disabled={!canStance(st)} title="Опуститься — 1 AP, встать — бесплатно. Лёжа: +10% меткости, −20% шанс попасть по тебе, гранаты нельзя"
                style={{ ...btn(stanceNow === st, !canStance(st) && stanceNow !== st), padding: '4px 8px', fontSize: 12 }} onClick={() => doStance(st)}>{label}</button>
            ))}
            <span style={{ opacity: 0.5, fontSize: 11 }}>вниз — 1 AP</span>
          </div>
        )}
        {s.turning && <div style={{ color: '#9be86a' }}>Поворот: нажми клетку, куда смотреть бойцу (долгое нажатие на карте делает то же).</div>}
        {s.aiming === 'grenade' && <div style={{ color: '#ffb36b' }}>Бросок гранаты: кликни клетку в оранжевой зоне (красный круг — радиус взрыва, бьёт и по своим). ПКМ — отмена.</div>}
        {tb && !tgt && <div style={{ color: '#ff8a8a' }}>Цель: взрывоопасная бочка · {barrelOk ? 'попадание 100%, взрыв радиусом 2' : 'нет линии огня'}</div>}
        {tgt && <div style={{ color: '#ff8a8a' }}>Цель: {tgt.name} · HP {tgt.hp}/{tgt.maxHp} · {chance === null ? 'нет линии огня' : `шанс ${chance}%`}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, pointerEvents: 'auto' }}>
          {s.units.filter(u => u.team === 'human').map(u => (
            <button key={u.id} disabled={u.hp <= 0 || !canAct} onClick={() => pick(u.id)}
              style={{ ...btn(false, u.hp <= 0), padding: '4px 8px', fontSize: 12, border: u.id === s.selectedId ? '1px solid #ffd34d' : '1px solid #556', textDecoration: u.hp <= 0 ? 'line-through' : 'none' }}>
              {u.name} {u.hp}/{u.maxHp}{u.bleeding ? ' 🩸' : ''}{u.panic ? ' ⚠' : ''}
            </button>
          ))}
          {(!narrow || more) && <>
          <button style={{ ...btn(s.turning), padding: '4px 8px', fontSize: 12 }} onClick={() => { s.turning = !s.turning; s.aiming = null; rerender(); }}>↻ Поворот</button>
          {!touch && <span style={{ alignSelf: 'center', fontSize: 11, opacity: 0.6 }}>ПКМ — повернуть бойца · СКМ — сдвиг камеры</span>}
          {touch && (!narrow || more) && <span style={{ alignSelf: 'center', fontSize: 11, opacity: 0.7 }}>1 палец — двигать карту · 2 пальца — вращать, щипок — масштаб · долгое нажатие — повернуть бойца</span>}
          <button style={{ ...btn(), padding: '4px 8px', fontSize: 12 }} onClick={() => { const v = view.current; if (v) v.setQuality(v.getQuality() === 'high' ? 'low' : 'high'); rerender(); }}>Графика: {view.current?.getQuality() === 'low' ? 'обычная' : 'высокая'}</button>
          <button style={{ ...btn(), padding: '4px 8px', fontSize: 12 }} onClick={() => { const v = view.current; if (v) v.setAutoCam(!v.getAutoCam()); rerender(); }}>Камера: {view.current?.getAutoCam() === false ? 'ручная' : 'авто'}</button>
          <button style={{ ...btn(), padding: '4px 8px', fontSize: 12 }} onClick={() => { setMuted(!isMuted()); sfx('click'); rerender(); }}>{isMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button>
          </>}
          <button style={{ ...btn(showMap), padding: '4px 8px', fontSize: 12 }} onClick={() => setShowMap(!showMap)}>🗺</button>
          <span style={{ alignSelf: 'center', fontSize: 11, opacity: 0.45 }}>{VERSION}</span>
          {narrow && <button style={{ ...btn(more), padding: '4px 8px', fontSize: 12 }} onClick={() => setMore(!more)}>⚙</button>}
        </div>
      </div>
      {showMap && (
        <div style={{ position: 'absolute', right: 8, top: narrow ? 210 : 140 }}>
          <Minimap s={s} narrow={narrow} onPick={(x, y) => view.current?.panTo(x, y)} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', maxHeight: 110, overflow: 'hidden', fontSize: narrow ? 11 : 12, textShadow: '0 1px 2px #000', pointerEvents: 'none' }}>
          {s.log.slice(narrow ? -2 : -5).map((l, i) => <div key={s.log.length + ':' + i}>{l}</div>)}
        </div>
        <button style={bb(true, !canFire)} disabled={!canFire} onClick={fire}>Огонь{chance !== null ? ` ${chance}%` : tb ? ' по бочке' : ''}</button>
        <button style={bb(false, !canReload)} disabled={!canReload} onClick={doReload}>Заряд{sel ? ` (${sel.mags})` : ''}</button>
        {sel && <button style={bb(false, !canDig)} disabled={!canDig} title="Окоп: укрытие со всех сторон, −1 урон от взрывов" onClick={doDig}>Окопаться</button>}
        {sel && <button style={bb(false, !canAbility)} disabled={!canAbility} title={CLASSES[sel.cls].desc} onClick={doAbility}>{abilityLabel}</button>}
        <button style={bb(s.aiming === 'grenade', !canGrenade)} disabled={!canGrenade} onClick={toggleGrenade}>Граната{sel ? ` (${sel.grenades})` : ''}</button>
        {s.objective === 'sabotage' && <button style={bb(true, !canCharge)} disabled={!canCharge} onClick={doCharge}>Взорвать маяк</button>}
        <button style={bb(false, !canBandage)} disabled={!canBandage} onClick={heal}>Бинт ({s.medkits})</button>
        <button style={bb(false, !canOw)} disabled={!canOw} onClick={overwatch}>Overwatch</button>
        <button style={bb(false, !canAct)} disabled={!canAct} onClick={endTurn}>Конец хода</button>
      </div>
      {s.status !== 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#000a' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: 0 }}>{s.status === 'won' ? 'Зачистка завершена' : 'Отряд уничтожен'}</h1>
            <p>Ходов: {s.turnNo} · выжило: {living(s, 'human').length}/{s.units.filter(u => u.team === 'human').length}</p>
            {s.status === 'lost' && <button style={{ ...btn(true), marginRight: 8 }} onClick={() => onExit(s, true)}>Повторить миссию</button>}
            <button style={btn(s.status === 'won')} onClick={leave}>{s.status === 'won' ? 'В лагерь' : 'Дальше (отряд потерян)'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
