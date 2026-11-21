import { useState } from 'react';
import { CLASS_IDS, CLASSES } from './game/classes';
import { LOCATIONS } from './game/locations';
import { ACH, emptyStats } from './game/achievements';
import { ATT, toggleAtt, type AttId } from './game/campaign';
import { chooseOption, sandboxMission, setMapSize, setLoc, setRt, buy, choosePerk, COST, DEPLOY, equip, heal, setClass, maxHpOf, MAX_ROSTER, OBJECTIVE_NAME, recruit, TECH_INFO, unlock, type Campaign } from './game/campaign';
import { BIOME_NAME, DIFF } from './game/difficulty';
import { PERKS, RANKS, TRAITS, XP_STEPS } from './game/traits';
import type { ArmorId, PerkId, Tech, WeaponId } from './game/types';
import { ARMORS, WEAPONS } from './game/weapons';
import { btn, comicH, cta, glass, INK, NM, UI_NAMES, UI_SCALES, useUiSize } from './ui';
import { Backdrop } from './Title';
import { SoldierView } from './SoldierView';
import { DEFEND_KINDS } from './game/mission';

const HEX = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const panel: React.CSSProperties = { ...glass, borderRadius: 18, padding: 14 };

export function Camp({ c, onChange, onStart, onMenu }: {
  c: Campaign;
  onChange: (c: Campaign) => void;
  onStart: (deploy: number[]) => void;
  onMenu: () => void;
}) {
  const [deploy, setDeploy] = useState<number[]>(() =>
    [...c.roster].sort((a, b) => a.hpLoss - b.hpLoss).slice(0, DEPLOY).map(s => s.id));
  const cap = c.sandbox ? MAX_ROSTER : DEPLOY; // в песочнице можно выставить до 6 бойцов
  const [msg, setMsg] = useState('');
  const [selId, setSelId] = useState<number>(() => c.roster[0]?.id ?? 0);
  const [worldMap, setWorldMap] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const [open, setOpen] = useState<'weapon' | 'armor' | 'cls' | 'att' | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
  const ids = deploy.filter(id => c.roster.some(s => s.id === id));

  const act = (fn: (x: Campaign) => string | null) => {
    const c2 = structuredClone(c);
    const err = fn(c2);
    setMsg(err ?? '');
    if (!err) onChange(c2);
  };
  const toggle = (id: number) =>
    setDeploy(ids.includes(id) ? ids.filter(x => x !== id) : ids.length < cap ? [...ids, id] : ids);

  if (c.over) {
    return (
      <Screen>
        <h1 style={{ margin: 0 }}>Загін знищено</h1>
        <p>Місій пройдено: {c.missionNo - 1}</p>
        <div style={panel}>
          <b>Меморіал</b>
          {c.fallen.map((f, i) => <div key={i}>{f.name} — місія {f.mission}</div>)}
        </div>
        <button style={cta()} onClick={onMenu}>До меню</button>
      </Screen>
    );
  }

  return (
    <Screen>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <h1 style={{ ...comicH, fontSize: 34 }}>База</h1>
        <span style={{ background: '#fff', border: `4px solid ${INK}`, borderRadius: 12, padding: '3px 12px', fontWeight: 800, boxShadow: `0 4px 0 ${INK}` }}>Складність: {DIFF[c.difficulty].label}</span>
        <b style={{ background: '#ffe14d', border: `4px solid ${INK}`, borderRadius: 12, padding: '3px 12px', boxShadow: `0 4px 0 ${INK}`, color: INK }}>{c.sandbox ? 'Пісочниця: усе відкрито' : `Трофеї: ${c.scrap}`}</b>
      </div>
      {c.sandbox && (() => {
        const cur = { objective: c.objective, biome: c.biome, boss: c.boss, risky: c.risky, variant: c.variant ?? 0 };
        const set = (patch: Partial<typeof cur>) => act(x => sandboxMission(x, { ...cur, ...patch }));
        const chip = (on: boolean, label: string, click: () => void, title?: string) => <button key={label} title={title} style={{ ...btn(on), padding: '5px 10px', fontSize: 12 }} onClick={click}>{label}</button>;
        return (
          <div style={{ ...panel, display: 'grid', gap: 10 }}>
            <b>Пісочниця · обери будь-яку місію</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ opacity: 0.7, fontSize: 12, width: 64 }}>Завдання</span>
              {(Object.keys(OBJECTIVE_NAME) as (keyof typeof OBJECTIVE_NAME)[]).filter(o => o !== 'rescue').map(o => chip(c.objective === o && !c.boss, OBJECTIVE_NAME[o], () => set({ objective: o, boss: false })))}
            </div>
            {c.objective === 'defend' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ opacity: 0.7, fontSize: 12, width: 64 }}>Оборона</span>
                {DEFEND_KINDS.map((d, i) => chip((c.variant ?? 0) === i, d.name, () => set({ variant: i })))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ opacity: 0.7, fontSize: 12, width: 64 }}>Місцевість</span>
              {(Object.keys(BIOME_NAME) as (keyof typeof BIOME_NAME)[]).map(b => chip(c.biome === b, BIOME_NAME[b], () => set({ biome: b })))}
              <span style={{ opacity: 0.7, fontSize: 12, marginLeft: 8 }}>Умови</span>
              {chip(c.boss, 'Бос', () => set({ boss: !c.boss, objective: !c.boss ? 'assassinate' : c.objective }), 'Бос «Тиран» зі свитою')}
              {chip(c.risky, 'Ризикована', () => set({ risky: !c.risky }), '+2 вороги')}
            </div>
          </div>
        );
      })()}
      {!c.sandbox && (      <div style={{ ...panel, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
          <b>Карта операцій · місія {c.missionNo}</b>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{c.options.length > 1 ? 'Обери завдання' : c.options[0]?.boss ? 'Бос: вибору немає' : 'Єдине завдання'}</span>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, c.options.length)}, minmax(0, 1fr))`, gap: 10, paddingTop: 34 }}>
          <svg aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 34 }} viewBox="0 0 300 34" preserveAspectRatio="none">
            {c.options.map((_, i) => {
              const x = ((i + 0.5) / c.options.length) * 300;
              return <path key={i} d={`M150 0 Q150 20 ${x} 34`} stroke="rgba(255,255,255,.3)" strokeWidth="2" fill="none" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 14, height: 14, clipPath: HEX, background: NM.accent }} title="База" />
          {c.options.map((o, i) => {
            const on = c.objective === o.objective && c.biome === o.biome && c.boss === o.boss && c.risky === o.risky && (c.variant ?? 0) === (o.variant ?? 0);
            return (
              <button key={i} onClick={() => act(x => chooseOption(x, i))} style={{ ...btn(on), padding: '10px 8px', display: 'grid', gap: 3, justifyItems: 'center', textAlign: 'center', fontSize: 12 }}>
                <span style={{ fontSize: 22 }}>{o.boss ? '☠' : { clear: '⚔', extract: '🚁', hold: '🛡', defend: '🏠', assassinate: '🎯', sabotage: '💣', rescue: '🆘' }[o.objective]}</span>
                <b style={{ fontSize: 13 }}>{o.boss ? 'Бос: Тиран' : o.objective === 'defend' ? `Оборона: ${DEFEND_KINDS[o.variant ?? 0].name}` : OBJECTIVE_NAME[o.objective]}</b>
                <span style={{ opacity: 0.75 }}>{BIOME_NAME[o.biome]}</span>
                <span style={{ color: NM.accent }}>{o.boss ? 'нагорода +4' : o.risky ? 'ризик: +2 вороги, нагорода +3' : 'стандарт'}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}
      <div style={{ ...panel, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, padding: 10 }}>
        <span style={{ opacity: 0.8 }}>Режим бою:</span>
        <button style={{ ...btn(!c.rt), padding: '4px 10px', fontSize: 12 }} onClick={() => act(x => setRt(x, false))}>Покроковий</button>
        <button style={{ ...btn(c.rt), padding: '4px 10px', fontSize: 12 }} title="Час іде сам, пауза на пробіл, швидкість ×0.5 або ×1" onClick={() => act(x => setRt(x, true))}>Реальний час</button>
        <span style={{ opacity: 0.7, marginLeft: 10 }}>Розмір карти:</span>
        {([44, 64, 640, 1024] as const).map(n => (
          <button key={n} style={{ ...btn(c.mapSize === n), padding: '4px 10px', fontSize: 12 }} title={n >= 640 ? 'Величезний ліс: прибульці чекають у таборах-руїнах і сидять у ямах, доки не підійдеш. Лише реальний час, без збереження посеред місії' : undefined} onClick={() => act(x => setMapSize(x, n))}>{n === 44 ? 'Середня 44×44' : n === 64 ? 'Велика 64×64' : n === 640 ? 'Величезний ліс 640×640' : 'Гігант 1024×1024'}</button>
        ))}
        {c.mapSize >= 640 && (
          <select value={c.loc ?? -1} onChange={e => act(x => setLoc(x, Number(e.target.value)))} style={{ ...btn(false), padding: '4px 8px', fontSize: 12, maxWidth: 230 }} title="Локація великої карти: тип місцевості, забудова, погода">
            <option value={-1}>🎲 Локація за місією</option>
            {Array.from(new Set(LOCATIONS.map(l => l.arch))).map(a => <optgroup key={a} label={a}>{LOCATIONS.filter(l => l.arch === a).map(l => <option key={l.id} value={l.id}>{l.name}{l.weather ? ' · ' + ({ night: 'ніч', rain: 'дощ', fog: 'туман' } as Record<string, string>)[l.weather] : ''}</option>)}</optgroup>)}
          </select>
        )}
        <button style={{ ...btn(achOpen), padding: '4px 10px', fontSize: 12 }} onClick={() => { setAchOpen(true); if (c.achNew?.length) act(x => { x.achNew = []; return null; }); }}>🏆 Досягнення ({(c.ach ?? []).length}/{ACH.length}){c.achNew?.length ? ` · нових ${c.achNew.length}` : ''}</button>
        {c.mapSize >= 640 && <button style={{ ...btn(worldMap), padding: '4px 10px', fontSize: 12 }} onClick={() => setWorldMap(true)}>🗺 Карта світу ({(c.cleared ?? []).length}/{LOCATIONS.length})</button>}
      </div>
      {achOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,14,28,.9)', overflow: 'auto', padding: 14 }} onClick={() => setAchOpen(false)}>
          <div style={{ maxWidth: 720, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b style={{ fontSize: 18 }}>🏆 Досягнення {(c.ach ?? []).length}/{ACH.length}</b>
              <button style={{ ...btn(false), padding: '4px 12px' }} onClick={() => setAchOpen(false)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8 }}>
              {ACH.map(a => { const done = (c.ach ?? []).includes(a.id), [v, m] = a.prog(c.stats ?? emptyStats()); return (
                <div key={a.id} style={{ ...btn(done), display: 'grid', gap: 3, padding: 10, opacity: done ? 1 : 0.7, cursor: 'default' }}>
                  <span style={{ fontSize: 22 }}>{done ? a.icon : '🔒'}</span><b style={{ fontSize: 13 }}>{a.name}</b>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{a.desc}</span>
                  <span style={{ fontSize: 11 }}>{Math.min(v, m)}/{m}</span>
                </div>); })}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>Убивств: {c.stats?.kills ?? 0} · перемог: {c.stats?.wins ?? 0} · поразок: {c.stats?.losses ?? 0}</div>
          </div>
        </div>
      )}
      {worldMap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,14,28,.9)', overflow: 'auto', padding: 14 }} onClick={() => setWorldMap(false)}>
          <div style={{ maxWidth: 980, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b style={{ fontSize: 18 }}>🗺 Карта світу — зачищено {(c.cleared ?? []).length} з {LOCATIONS.length}</b>
              <button style={{ ...btn(false), padding: '4px 12px' }} onClick={() => setWorldMap(false)}>✕</button>
            </div>
            {Array.from(new Set(LOCATIONS.map(l => l.arch))).map(a => (
              <div key={a} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 3 }}>{a} · {{ clear: '⚔ зачистка', sabotage: '💣 диверсія', assassinate: '🎯 ліквідація', rescue: '🆘 порятунок' }[LOCATIONS.find(l => l.arch === a)!.obj]}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 6 }}>
                  {LOCATIONS.filter(l => l.arch === a).map(l => {
                    const done = (c.cleared ?? []).includes(l.id), on = c.loc === l.id;
                    return <button key={l.id} style={{ ...btn(on), padding: '8px 6px', fontSize: 12, display: 'grid', gap: 2, opacity: done && !on ? 0.75 : 1 }} onClick={() => { act(x => setLoc(x, l.id)); setWorldMap(false); }}>
                      <b>{done ? '✓ ' : ''}{l.name}</b>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{l.weather ? ({ night: '🌙 ніч', rain: '☔ дощ', fog: '🌫 туман' } as Record<string, string>)[l.weather] : '☀ день'} · {Math.round(l.damage * 100)}% руйн.</span>
                    </button>;
                  })}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, opacity: 0.7 }}>Перше проходження локації дає +3 трофеї. Обрана локація запам’ятовується.</div>
          </div>
        </div>
      )}

      {(() => {
        const s = c.roster.find(x => x.id === selId) ?? c.roster[0];
        if (!s) return null;
        const max = maxHpOf(s, c.tech), on = ids.includes(s.id);
        const w = WEAPONS[s.weapon], ar = ARMORS[s.armor];
        const grenades = 2 + (c.tech.grenades ? 1 : 0) + (s.cls === 'engineer' ? 1 : 0);
        const hex = (k: 'weapon' | 'armor' | 'cls' | 'att' | null, icon: string, lab: string, val: string, side: 'l' | 'r', dx: number) => (
          <div style={{ display: 'flex', flexDirection: narrow ? 'column' : side === 'l' ? 'row' : 'row-reverse', alignItems: 'center', gap: narrow ? 4 : 10, transform: narrow ? undefined : `translateX(${side === 'l' ? dx : -dx}px)`, cursor: k ? 'pointer' : 'default' }}
            role={k ? 'button' : undefined} tabIndex={k ? 0 : undefined} onClick={() => k && setOpen(open === k ? null : k)} onKeyDown={e => { if (k && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(open === k ? null : k); } }}>
            <div style={{ width: 62, height: 70, flex: 'none', clipPath: HEX, background: open === k && k ? NM.accent : NM.line, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 58, height: 66, clipPath: HEX, background: NM.solid, display: 'grid', placeItems: 'center', fontSize: 22 }}>{icon}</div>
            </div>
            <div style={{ textAlign: narrow ? 'center' : side === 'l' ? 'left' : 'right', minWidth: 0, fontSize: narrow ? 11 : undefined }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: NM.dim }}>{lab}</div>
              <b style={{ fontSize: 13 }}>{val}</b>
            </div>
          </div>
        );
        return (
          <div style={{ ...panel, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {c.roster.map(x => <button key={x.id} style={btn(x.id === s.id)} onClick={() => { setSelId(x.id); setOpen(null); }}>{x.name}{ids.includes(x.id) ? ' ✓' : ''}</button>)}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: NM.dim }}>{RANKS[s.rank]}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{s.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>HP {Math.max(1, max - s.hpLoss)}/{max}{s.fracture ? ' · перелом' : ''} · вбито {s.kills} · місій {s.missions} · досвід {s.xp}{s.rank < XP_STEPS.length ? `/${XP_STEPS[s.rank]}` : ' (макс.)'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: narrow ? 2 : 8 }}>
              <div style={{ display: 'grid', gap: narrow ? 10 : 26 }}>
                {hex('weapon', '🔫', 'Зброя', w.name, 'l', 0)}
                {hex('armor', '🛡', 'Броня', ar.name, 'l', 14)}
                {hex('cls', '⚔', 'Клас', CLASSES[s.cls].name, 'l', 0)}
                {hex('att', '🔧', 'Обвіс', (s.att?.length ?? 0) ? s.att!.map(a => ATT[a].name).join(', ') : 'немає', 'l', 14)}
              </div>
              <div style={{ position: 'relative', display: 'grid', justifyItems: 'center' }}>
                <SoldierView weapon={s.weapon} armor={s.armor} width={narrow ? 130 : 210} height={narrow ? 230 : 380} />
                <div style={{ width: narrow ? 120 : 190, height: 30, borderRadius: '50%', background: 'radial-gradient(ellipse,#7ee0ff55 -20%,transparent 70%)', marginTop: -14 }} />
              </div>
              <div style={{ display: 'grid', gap: narrow ? 10 : 26 }}>
                {hex(null, '💣', 'Гранати', `× ${grenades}`, 'r', 0)}
                {hex(null, '▮', 'Магазини', `× 2 · ${w.ammo} набоїв`, 'r', 14)}
                {hex(null, '✚', 'Аптечки', `× ${DIFF[c.difficulty].kits + (c.tech.kits ? 1 : 0)} (на загін)`, 'r', 0)}
              </div>
            </div>
            {open && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {open === 'weapon' && c.weapons.map(x => <button key={x} title={WEAPONS[x].desc} style={btn(s.weapon === x)} onClick={() => act(cc => equip(cc, s.id, 'weapon', x))}>{WEAPONS[x].name}</button>)}
                {open === 'armor' && c.armors.map(x => <button key={x} title={ARMORS[x].desc} style={btn(s.armor === x)} onClick={() => act(cc => equip(cc, s.id, 'armor', x))}>{ARMORS[x].name}</button>)}
                {open === 'att' && (Object.keys(ATT) as AttId[]).map(a => <button key={a} title={ATT[a].desc} style={btn(!!s.att?.includes(a))} onClick={() => act(cc => toggleAtt(cc, s.id, a))}>{ATT[a].icon} {ATT[a].name}{s.att?.includes(a) ? ' ✓' : ` · ${ATT[a].cost} тр.`}</button>)}
                {open === 'cls' && CLASS_IDS.map(k => <button key={k} title={CLASSES[k].desc} style={btn(s.cls === k)} onClick={() => act(cc => setClass(cc, s.id, k))}>{CLASSES[k].name}</button>)}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.75, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              {open === 'att' ? 'Обвіс зберігається за бійцем. Установка коштує трофеїв, зняття безкоштовне.' : open === 'weapon' ? w.desc : open === 'armor' ? (ar.desc || 'Без захисту') : `${CLASSES[s.cls].desc} Пасивно: ${CLASSES[s.cls].passive}.`}
              <div style={{ marginTop: 4 }}>{s.traits.map(t => TRAITS[t].name).join(', ')} — {s.bio}</div>
              {s.perks.length > 0 && <div style={{ color: '#9be86a' }}>{s.perks.map(p => PERKS[p].split(' (')[0]).join(', ')}</div>}
            </div>
            {s.perkPoints > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                <b style={{ color: NM.accent }}>Підвищення!</b>
                {(Object.keys(PERKS) as PerkId[]).map(p => (
                  <button key={p} style={{ ...btn(), padding: '6px 12px', fontSize: 12 }} onClick={() => act(x => choosePerk(x, s.id, p))}>{PERKS[p]}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button style={btn(false, s.hpLoss === 0 && !s.fracture)} onClick={() => act(x => heal(x, s.id))}>Лікувати ({COST.heal})</button>
              <button style={btn(on)} onClick={() => toggle(s.id)}>{on ? 'У загоні' : 'У резерві'}</button>
            </div>
          </div>
        );
      })()}

      <div style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button style={btn(false, c.roster.length >= MAX_ROSTER)} onClick={() => act(recruit)}>
          Найняти бійця ({COST.recruit}) · {c.roster.length}/{MAX_ROSTER}
        </button>
        {(Object.keys(TECH_INFO) as (keyof Tech)[]).map(k => (
          <button key={k} style={btn(false, c.tech[k])} onClick={() => act(x => buy(x, k))}>
            {TECH_INFO[k]} {c.tech[k] ? '✓' : `(${COST[k]})`}
          </button>
        ))}
      </div>

      <div style={{ ...panel, display: 'grid', gap: 8 }}>
        <b>Арсенал</b>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(WEAPONS) as WeaponId[]).filter(w => !c.weapons.includes(w)).map(w => (
            <button key={w} title={WEAPONS[w].desc} style={btn()} onClick={() => act(x => unlock(x, 'weapon', w))}>{WEAPONS[w].name} ({WEAPONS[w].cost})</button>
          ))}
          {(Object.keys(ARMORS) as ArmorId[]).filter(a => !c.armors.includes(a)).map(a => (
            <button key={a} title={ARMORS[a].desc} style={btn()} onClick={() => act(x => unlock(x, 'armor', a))}>{ARMORS[a].name} ({ARMORS[a].cost})</button>
          ))}
          {c.weapons.length === Object.keys(WEAPONS).length && c.armors.length === Object.keys(ARMORS).length && <span style={{ opacity: 0.7 }}>Усе відкрито.</span>}
        </div>
      </div>

      {msg && <div style={{ color: '#ff8a8a' }}>{msg}</div>}
      {c.fallen.length > 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>Полеглі: {c.fallen.map(f => f.name).join(', ')}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={cta(ids.length === 0)} disabled={ids.length === 0} onClick={() => onStart(ids)}>
          До місії ({ids.length}/{cap})
        </button>
        <button style={btn()} onClick={onMenu}>До меню</button>
      </div>
    </Screen>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  const [ui, setUi] = useUiSize();
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', color: NM.fg, background: NM.bg, fontFamily: "'Onest',system-ui,sans-serif", fontWeight: 600, fontSize: 14 }}>
      <Backdrop />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: 16, display: 'grid', gap: 14, zoom: UI_SCALES[ui] }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: 12, fontWeight: 800, color: INK }}>
          <span style={{ background: '#fff', border: `3px solid ${INK}`, borderRadius: 10, padding: '2px 10px' }}>Розмір інтерфейсу</span>
          {UI_NAMES.map((n, i) => <button key={n} style={{ ...btn(i === ui), padding: '3px 10px', fontSize: 12, borderWidth: 3, boxShadow: `0 3px 0 ${INK}` }} onClick={() => setUi(i)}>{n}</button>)}
        </div>
        {children}
      </div>
    </div>
  );
}
