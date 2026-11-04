import { useEffect, useReducer, useRef } from 'react';
import { createMission } from './game/mission';
import { GameView } from './render/GameView';

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(createMission());
  const view = useRef<GameView | null>(null);
  const [, rerender] = useReducer(n => n + 1, 0);

  useEffect(() => {
    view.current = new GameView(host.current!, state.current, rerender);
    return () => view.current?.dispose();
  }, []);

  const s = state.current;
  const sel = s.units.find(u => u.id === s.selectedId);

  const endTurn = () => {
    s.units.forEach(u => { if (u.team === 'human') u.ap = u.maxAp; });
    s.turnNo += 1;
    view.current?.syncUnits();
    rerender();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, color: '#d8dccf', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', gap: 12, alignItems: 'center', pointerEvents: 'none' }}>
        <b>Alien Pressure</b>
        <span>Ход {s.turnNo}</span>
        <span style={{ flex: 1 }}>
          {sel ? `${sel.name} · HP ${sel.hp}/${sel.maxHp} · AP ${sel.ap}/${sel.maxAp}` : 'Выбери бойца'}
        </span>
        <button onClick={endTurn} style={{ pointerEvents: 'auto', padding: '8px 14px' }}>Конец хода</button>
      </div>
    </div>
  );
}
