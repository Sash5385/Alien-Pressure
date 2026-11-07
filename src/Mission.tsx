import { useEffect, useReducer, useRef } from 'react';
import { runAlienTurn } from './game/ai';
import { bandage, checkEnd, hitChance, isVisible, living, log, reload, shoot, startHumanTurn } from './game/combat';
import type { GameState } from './game/types';
import { btn } from './ui';
import { TRAITS } from './game/traits';
import { reinforce } from './game/mission';
import { GameView } from './render/GameView';
import { loadModels } from './render/models';
import { isMuted, setMuted, sfx } from './audio';

export function Mission({ initial, onExit }: { initial: GameState; onExit: (s: GameState) => void }) {
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
  const sel = s.units.find(u => u.id === s.selectedId && u.hp > 0);
  const tgt = s.units.find(u => u.id === s.targetId && u.hp > 0);
  const chance = sel && tgt ? hitChance(s, sel, tgt) : null;
  const canAct = !!view.current && s.turn === 'human' && !s.busy && s.status === 'playing';
  const canFire = canAct && !!sel && sel.ap > 0 && chance !== null;
  const canBandage = canAct && !!sel && sel.ap > 0 && s.medkits > 0 &&
    living(s, 'human').some(h => h.bleeding && Math.abs(h.x - sel.x) + Math.abs(h.y - sel.y) <= 1);
  const canOw = canAct && !!sel && sel.ap > 0 && sel.ammo > 0 && !sel.overwatch;

  const fire = async () => {
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
    s.selectedId = id; s.targetId = null;
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
    s.turn = 'alien'; s.busy = true; s.targetId = null;
    if (s.objective === 'hold' && s.turnNo % 2 === 0) reinforce(s);
    view.current!.syncUnits();
    rerender();
    await runAlienTurn(s, {
      moved: async () => { await view.current!.moved(); rerender(); },
      shot: async r => { rerender(); await view.current!.shotFx(r); view.current!.syncUnits(); rerender(); },
    });
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
    ? `${sel.name} · HP ${sel.hp}/${sel.maxHp} · AP ${sel.ap}/${sel.maxAp} · патроны ${sel.ammo}/${sel.maxAmmo} (+${sel.mags}) · мораль ${sel.morale}${sel.overwatch ? ' · overwatch' : ''}${sel.bleeding ? ' · кровотечение' : ''}${sel.fracture ? ' · перелом' : ''}${sel.panic ? ' · ПАНИКА' : ''}`
    : 'Выбери бойца';
  const goal = s.objective === 'clear' ? 'зачистка' : s.objective === 'extract' ? 'эвакуация: все в зелёную зону' : `удержание ${Math.min(s.turnNo, s.holdTurns)}/${s.holdTurns}`;
  const aliens = living(s, 'alien').filter(u => isVisible(s, u)).length;

  return (
    <div style={{ position: 'fixed', inset: 0, color: '#d8dccf', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, pointerEvents: 'none', textShadow: '0 1px 2px #000' }}>
        <b>Миссия {s.missionNo}</b> · {goal} · Ход {s.turnNo} · {s.turn === 'human' ? 'твой ход' : 'ход пришельцев…'} · в поле зрения: {aliens}
        <div>{info}</div>
        {sel && <div style={{ opacity: 0.8, fontSize: 12 }}>{sel.traits.map(t => TRAITS[t].name).join(', ')} — {sel.bio}</div>}
        {tgt && <div style={{ color: '#ff8a8a' }}>Цель: {tgt.name} · HP {tgt.hp}/{tgt.maxHp} · {chance === null ? 'нет линии огня' : `шанс ${chance}%`}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, pointerEvents: 'auto' }}>
          {s.units.filter(u => u.team === 'human').map(u => (
            <button key={u.id} disabled={u.hp <= 0 || !canAct} onClick={() => pick(u.id)}
              style={{ ...btn(false, u.hp <= 0), padding: '4px 8px', fontSize: 12, border: u.id === s.selectedId ? '1px solid #ffd34d' : '1px solid #556', textDecoration: u.hp <= 0 ? 'line-through' : 'none' }}>
              {u.name} {u.hp}/{u.maxHp}{u.bleeding ? ' 🩸' : ''}{u.panic ? ' ⚠' : ''}
            </button>
          ))}
          <button style={{ ...btn(), padding: '4px 8px', fontSize: 12 }} onClick={() => { setMuted(!isMuted()); sfx('click'); rerender(); }}>{isMuted() ? 'Звук: выкл' : 'Звук: вкл'}</button>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', maxHeight: 110, overflow: 'hidden', fontSize: 12, textShadow: '0 1px 2px #000', pointerEvents: 'none' }}>
          {s.log.slice(-5).map((l, i) => <div key={s.log.length - 5 + i}>{l}</div>)}
        </div>
        <button style={btn(true, !canFire)} disabled={!canFire} onClick={fire}>Огонь{chance !== null ? ` ${chance}%` : ''}</button>
        <button style={btn(false, !canReload)} disabled={!canReload} onClick={doReload}>Заряд{sel ? ` (${sel.mags})` : ''}</button>
        <button style={btn(false, !canBandage)} disabled={!canBandage} onClick={heal}>Бинт ({s.medkits})</button>
        <button style={btn(false, !canOw)} disabled={!canOw} onClick={overwatch}>Overwatch</button>
        <button style={btn(false, !canAct)} disabled={!canAct} onClick={endTurn}>Конец хода</button>
      </div>
      {s.status !== 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#000a' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: 0 }}>{s.status === 'won' ? 'Зачистка завершена' : 'Отряд уничтожен'}</h1>
            <p>Ходов: {s.turnNo} · выжило: {living(s, 'human').length}/{s.units.filter(u => u.team === 'human').length}</p>
            <button style={btn(true)} onClick={leave}>{s.status === 'won' ? 'В лагерь' : 'Дальше'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
