import { useState } from 'react';
import { Camp, Screen } from './Camp';
import { clearSave, finishMission, load, newCampaign, save, type Campaign } from './game/campaign';
import { DIFF } from './game/difficulty';
import { createMission } from './game/mission';
import type { Difficulty, GameState } from './game/types';
import { Mission } from './Mission';
import { btn } from './ui';

type Screen_ = 'menu' | 'camp' | 'mission';

export function App() {
  const [saved, setSaved] = useState<Campaign | null>(() => load());
  const [c, setC] = useState<Campaign | null>(saved);
  const [screen, setScreen] = useState<Screen_>('menu');
  const [mission, setMission] = useState<{ state: GameState; deployed: number[] } | null>(null);

  const update = (n: Campaign) => { setC(n); setSaved(n); save(n); };
  const start = (d: Difficulty) => { clearSave(); const n = newCampaign(d); update(n); setScreen('camp'); };

  const launch = (c0: Campaign, deployed: number[]) => {
    setMission({
      deployed,
      state: createMission({
        rng: c0.rng, difficulty: c0.difficulty, missionNo: c0.missionNo, objective: c0.objective, tech: c0.tech,
        soldiers: c0.roster.filter(s => deployed.includes(s.id)),
      }),
    });
    setScreen('mission');
  };

  if (screen === 'mission' && c && mission) {
    return (
      <Mission
        key={c.missionNo + ':' + mission.state.rng}
        initial={mission.state}
        onExit={s => {
          const n = structuredClone(c);
          finishMission(n, s, mission.deployed);
          update(n);
          setMission(null);
          setScreen('camp');
        }}
      />
    );
  }
  if (screen === 'camp' && c) {
    return <Camp key={c.missionNo + ':' + c.roster.length} c={c} onChange={update} onStart={d => launch(c, d)} onMenu={() => setScreen('menu')} />;
  }

  return (
    <Screen>
      <h1 style={{ margin: '24px 0 0', fontSize: 32 }}>Alien Pressure</h1>
      <p style={{ margin: 0, opacity: 0.8 }}>Подпольный отряд землян против пришельцев. Кровь, паника, патроны на счёт.</p>
      {saved && !saved.over && (
        <button style={btn(true)} onClick={() => setScreen('camp')}>
          Продолжить: миссия {saved.missionNo}, бойцов {saved.roster.length}
        </button>
      )}
      <b>Новая игра — сложность</b>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(DIFF) as Difficulty[]).map(d => (
          <button key={d} style={btn()} onClick={() => start(d)}>{DIFF[d].label}</button>
        ))}
      </div>
      <p style={{ fontSize: 12, opacity: 0.6 }}>Прогресс хранится в браузере (localStorage). Новая игра перезапишет сохранение.</p>
    </Screen>
  );
}
