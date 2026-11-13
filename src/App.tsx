import { useState } from 'react';
import { Camp, Screen } from './Camp';
import { clearMission, clearSave, finishMission, load, loadMission, newCampaign, save, saveMission, type Campaign } from './game/campaign';
import { DIFF } from './game/difficulty';
import { createMission } from './game/mission';
import { rtInit } from './game/rt';
import type { Difficulty, GameState } from './game/types';
import { Mission } from './Mission';
import { btn, BUILD, cta, VERSION } from './ui';

type Screen_ = 'menu' | 'camp' | 'mission';

export function App() {
  const [saved, setSaved] = useState<Campaign | null>(() => load());
  const [c, setC] = useState<Campaign | null>(saved);
  const [screen, setScreen] = useState<Screen_>('menu');
  const [mission, setMission] = useState<{ state: GameState; deployed: number[]; before: Campaign; run: number } | null>(null);
  const [midSave] = useState(() => loadMission());

  const update = (n: Campaign) => { setC(n); setSaved(n); save(n); };
  const start = (d: Difficulty, sandbox = false) => { clearSave(); clearMission(); const n = newCampaign(d, undefined, sandbox); update(n); setScreen('camp'); };

  const launch = (c0: Campaign, deployed: number[]) => {
    clearMission();
    const st = createMission({
        rng: c0.rng, difficulty: c0.difficulty, missionNo: c0.missionNo, objective: c0.objective, biome: c0.biome, size: c0.mapSize, boss: c0.boss, risky: c0.risky, variant: c0.variant, tech: c0.tech,
        soldiers: c0.roster.filter(s => deployed.includes(s.id)),
    });
    if (c0.rt) rtInit(st);
    setMission({ deployed, before: structuredClone(c0), run: Date.now(), state: st });
    setScreen('mission');
  };

  if (screen === 'mission' && c && mission) {
    return (
      <Mission
        key={c.missionNo + ':' + mission.run}
        initial={mission.state}
        onSave={s => saveMission({ state: s, deployed: mission.deployed, before: mission.before })}
        onExit={(s, repeat) => {
          clearMission();
          if (repeat) { launch(mission.before, mission.deployed); return; }
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
      <h1 style={{ margin: '24px 0 0', fontSize: 32 }}>Alien Pressure <span style={{ fontSize: 14, opacity: 0.6, fontWeight: 400 }}>{VERSION}</span></h1>
      <p style={{ margin: 0, opacity: 0.8 }}>Подпольный отряд землян против пришельцев. Кровь, паника, патроны на счёт.</p>
      {midSave && saved && !saved.over && (
        <button style={cta()} onClick={() => { setC(midSave.before); if (midSave.state.rt) midSave.state.rt.paused = true; setMission({ state: midSave.state, deployed: midSave.deployed, before: midSave.before, run: Date.now() }); setScreen('mission'); }}>
          Продолжить миссию {midSave.before.missionNo} (ход {midSave.state.turnNo})
        </button>
      )}
      {saved && !saved.over && (
        <button style={cta()} onClick={() => setScreen('camp')}>
          Продолжить: миссия {saved.missionNo}, бойцов {saved.roster.length}
        </button>
      )}
      <b>Новая игра — сложность</b>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(DIFF) as Difficulty[]).map(d => (
          <button key={d} style={btn()} onClick={() => start(d)}>{DIFF[d].label}</button>
        ))}
      </div>
      <b>Песочница</b>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btn(true)} title="Всё оружие, броня и технологии открыты и бесплатны, любая миссия на выбор, отряд не кончается" onClick={() => start('normal', true)}>Режим песочницы</button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>всё доступно: оружие, броня, любая миссия</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.5 }}>Версия {VERSION} · сборка {BUILD}</p>
      <p style={{ fontSize: 12, opacity: 0.6 }}>Прогресс хранится в браузере (localStorage). Новая игра перезапишет сохранение.</p>
    </Screen>
  );
}
