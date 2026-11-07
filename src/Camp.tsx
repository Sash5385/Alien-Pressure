import { useState } from 'react';
import { buy, choosePerk, COST, DEPLOY, heal, maxHpOf, MAX_ROSTER, OBJECTIVE_NAME, recruit, TECH_INFO, type Campaign } from './game/campaign';
import { DIFF } from './game/difficulty';
import { PERKS, RANKS, TRAITS, XP_STEPS } from './game/traits';
import type { PerkId, Tech } from './game/types';
import { btn } from './ui';

const panel: React.CSSProperties = { background: '#161b1f', border: '1px solid #2c343b', borderRadius: 8, padding: 12 };

export function Camp({ c, onChange, onStart, onMenu }: {
  c: Campaign;
  onChange: (c: Campaign) => void;
  onStart: (deploy: number[]) => void;
  onMenu: () => void;
}) {
  const [deploy, setDeploy] = useState<number[]>(() =>
    [...c.roster].sort((a, b) => a.hpLoss - b.hpLoss).slice(0, DEPLOY).map(s => s.id));
  const [msg, setMsg] = useState('');
  const ids = deploy.filter(id => c.roster.some(s => s.id === id));

  const act = (fn: (x: Campaign) => string | null) => {
    const c2 = structuredClone(c);
    const err = fn(c2);
    setMsg(err ?? '');
    if (!err) onChange(c2);
  };
  const toggle = (id: number) =>
    setDeploy(ids.includes(id) ? ids.filter(x => x !== id) : ids.length < DEPLOY ? [...ids, id] : ids);

  if (c.over) {
    return (
      <Screen>
        <h1 style={{ margin: 0 }}>Отряд уничтожен</h1>
        <p>Миссий пройдено: {c.missionNo - 1}</p>
        <div style={panel}>
          <b>Мемориал</b>
          {c.fallen.map((f, i) => <div key={i}>{f.name} — миссия {f.mission}</div>)}
        </div>
        <button style={btn(true)} onClick={onMenu}>В меню</button>
      </Screen>
    );
  }

  return (
    <Screen>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Подпольная база</h1>
        <span>Следующая миссия: {c.missionNo} — {OBJECTIVE_NAME[c.objective]}</span>
        <span>Сложность: {DIFF[c.difficulty].label}</span>
        <b style={{ color: '#ffd34d' }}>Трофеи: {c.scrap}</b>
      </div>

      {c.roster.map(s => {
        const max = maxHpOf(s, c.tech);
        const on = ids.includes(s.id);
        return (
          <div key={s.id} style={{ ...panel, borderColor: on ? '#ffd34d' : '#2c343b' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <b style={{ flex: '1 1 140px' }}>{RANKS[s.rank]} {s.name}</b>
              <span>HP {Math.max(1, max - s.hpLoss)}/{max}{s.fracture ? ' · перелом' : ''}</span>
              <span style={{ opacity: 0.7 }}>убито: {s.kills} · миссий: {s.missions} · опыт {s.xp}{s.rank < XP_STEPS.length ? `/${XP_STEPS[s.rank]}` : ' (макс.)'}</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{s.traits.map(t => TRAITS[t].name).join(', ')} — {s.bio}</div>
            {s.perks.length > 0 && <div style={{ fontSize: 12, color: '#9be86a' }}>{s.perks.map(p => PERKS[p].split(' (')[0]).join(', ')}</div>}
            {s.perkPoints > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                <b style={{ color: '#ffd34d' }}>Повышение!</b>
                {(Object.keys(PERKS) as PerkId[]).map(p => (
                  <button key={p} style={{ ...btn(), padding: '4px 8px', fontSize: 12 }} onClick={() => act(x => choosePerk(x, s.id, p))}>{PERKS[p]}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btn(false, s.hpLoss === 0 && !s.fracture)} onClick={() => act(x => heal(x, s.id))}>Лечить ({COST.heal})</button>
              <button style={btn(on)} onClick={() => toggle(s.id)}>{on ? 'В отряде' : 'В резерве'}</button>
            </div>
          </div>
        );
      })}

      <div style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button style={btn(false, c.roster.length >= MAX_ROSTER)} onClick={() => act(recruit)}>
          Нанять бойца ({COST.recruit}) · {c.roster.length}/{MAX_ROSTER}
        </button>
        {(Object.keys(TECH_INFO) as (keyof Tech)[]).map(k => (
          <button key={k} style={btn(false, c.tech[k])} onClick={() => act(x => buy(x, k))}>
            {TECH_INFO[k]} {c.tech[k] ? '✓' : `(${COST[k]})`}
          </button>
        ))}
      </div>

      {msg && <div style={{ color: '#ff8a8a' }}>{msg}</div>}
      {c.fallen.length > 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>Павшие: {c.fallen.map(f => f.name).join(', ')}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn(true, ids.length === 0)} disabled={ids.length === 0} onClick={() => onStart(ids)}>
          В миссию ({ids.length}/{DEPLOY})
        </button>
        <button style={btn()} onClick={onMenu}>В меню</button>
      </div>
    </Screen>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', color: '#d8dccf', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>{children}</div>
    </div>
  );
}
