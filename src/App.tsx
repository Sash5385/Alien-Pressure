import { useState } from 'react';
import { Camp } from './Camp';
import { clearMission, clearSave, finishMission, load, loadMission, newCampaign, save, saveMission, type Campaign } from './game/campaign';
import { DIFF } from './game/difficulty';
import { createMission } from './game/mission';
import { rtInit } from './game/rt';
import type { Difficulty, GameState } from './game/types';
import { Mission } from './Mission';
import { Title } from './Title';

type Screen_ = 'menu' | 'camp' | 'mission';

export function App() {
  const [saved, setSaved] = useState<Campaign | null>(() => load());
  const [savedSb, setSavedSb] = useState<Campaign | null>(() => load(true));
  const [c, setC] = useState<Campaign | null>(saved);
  const [screen, setScreen] = useState<Screen_>('menu');
  const [mission, setMission] = useState<{ state: GameState; deployed: number[]; before: Campaign; run: number } | null>(null);
  const [midSave] = useState(() => loadMission());

  const update = (n: Campaign) => { setC(n); if (n.sandbox) setSavedSb(n); else setSaved(n); save(n); };
  const start = (d: Difficulty, sandbox = false) => { clearSave(sandbox); clearMission(); const n = newCampaign(d, undefined, sandbox); update(n); setScreen('camp'); };

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
        onSave={s => { if (!s.huge) saveMission({ state: s, deployed: mission.deployed, before: mission.before }); }}
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

  const diffs = Object.keys(DIFF) as Difficulty[];
  return (
    <Title
      labels={diffs.map(d => DIFF[d].label)}
      onNew={i => start(diffs[i])}
      onSandbox={() => start('normal', true)}
      hasSb={!!savedSb}
      midCont={midSave && saved && !saved.over ? `миссия ${midSave.before.missionNo}, ход ${midSave.state.turnNo}` : null}
      onMid={() => { if (midSave) { setC(midSave.before); if (midSave.state.rt) midSave.state.rt.paused = true; setMission({ state: midSave.state, deployed: midSave.deployed, before: midSave.before, run: Date.now() }); setScreen('mission'); } }}
      cont={saved && !saved.over ? `миссия ${saved.missionNo}, бойцов ${saved.roster.length}` : null}
      onCont={() => setScreen('camp')}
      sbCont={savedSb ? `миссия ${savedSb.missionNo}` : null}
      onSbCont={() => { if (savedSb) { setC(savedSb); setScreen('camp'); } }}
    />
  );
}
