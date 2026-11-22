import { useState } from 'react';
import { CLASS_IDS, CLASSES } from './game/classes';
import { LOCATIONS } from './game/locations';
import { ACH, emptyStats } from './game/achievements';
import { weaponIcon } from './render/models';
import { Arsenal } from './Arsenal';
import { Equip, type EquipTab } from './Equip';
import { ATT, setSec, setHelmet, toggleAtt, toggleGearItem, unlockGear, type AttId } from './game/campaign';
import { chooseOption, sandboxMission, setMapSize, setLoc, setRt, buy, choosePerk, COST, DEPLOY, equip, heal, setClass, maxHpOf, MAX_ROSTER, OBJECTIVE_NAME, recruit, TECH_INFO, unlock, type Campaign } from './game/campaign';
import { BIOME_NAME, DIFF } from './game/difficulty';
import { PERKS, RANKS, TRAITS, XP_STEPS } from './game/traits';
import type { ArmorId, PerkId, Tech } from './game/types';
import { ARMORS, WEAPONS } from './game/weapons';
import { GEARS, GEAR_SLOTS, HELMETS, type GearDef } from './game/gear';
import { btn, cta, glass, HN, hudH, HudScreen } from './hud';
import { SoldierView } from './SoldierView';
import { DEFEND_KINDS } from './game/mission';

const HEX = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const panel: React.CSSProperties = { ...glass, borderRadius: 18, padding: 14 };
/** Кількість стовпців, щоб n елементів заповнили рядки без «сиріт» (інакше max). */
const symCols = (n: number, max: number) => { for (let k = Math.min(max, n); k >= 2; k--) if (n % k === 0) return k; return Math.max(1, Math.min(max, n)); };

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
  const [arsenal, setArsenal] = useState<'weapon' | 'sec' | null>(null);
  const [equipTab, setEquipTab] = useState<EquipTab | null>(null);
  const [open, setOpen] = useState<'weapon' | 'armor' | 'helm' | 'gear' | 'cls' | 'att' | 'sec' | null>(null);
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
      <HudScreen>
        <h1 style={{ margin: 0 }}>Загін знищено</h1>
        <p>Місій пройдено: {c.missionNo - 1}</p>
        <div style={panel}>
          <b>Меморіал</b>
          {c.fallen.map((f, i) => <div key={i}>{f.name} — місія {f.mission}</div>)}
        </div>
        <button style={cta()} onClick={onMenu}>До меню</button>
      </HudScreen>
    );
  }

  return (
    <HudScreen>
      <div style={{ display: 'grid', gap: 10 }}>
        <h1 style={{ ...hudH, fontSize: 30, textAlign: 'center' }}>База</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center' }}>
        <span style={{ border: `1px solid ${HN.accent}88`, background: '#06203acc', borderRadius: 4, padding: '3px 12px', fontWeight: 700 }}>Складність: {DIFF[c.difficulty].label}</span>
        <b style={{ border: `1px solid ${HN.accent}`, background: '#0a4a7acc', borderRadius: 4, padding: '3px 12px', color: HN.fg, boxShadow: `0 0 12px ${HN.accent}66` }}>{c.sandbox ? 'Пісочниця: усе відкрито' : `Трофеї: ${c.scrap}`}</b>
        </div>
      </div>
      {c.sandbox && (() => {
        const cur = { objective: c.objective, biome: c.biome, boss: c.boss, risky: c.risky, variant: c.variant ?? 0 };
        const set = (patch: Partial<typeof cur>) => act(x => sandboxMission(x, { ...cur, ...patch }));
        const chip = (on: boolean, label: string, click: () => void, title?: string, extra?: React.CSSProperties) => <button key={label} title={title} style={{ ...btn(on), padding: '7px 8px', fontSize: 12, ...extra }} onClick={click}>{label}</button>;
        // рівна сітка: стовпців стільки, щоб рядки заповнювались; осиротілий останній елемент розтягується
        const grp = (items: { on: boolean; label: string; click: () => void; title?: string }[], max: number) => {
          const n = items.length, cols = symCols(n, max);
          return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6 }}>{items.map((it, i) => chip(it.on, it.label, it.click, it.title, n % cols && i === n - 1 ? { gridColumn: `span ${cols - (n % cols) + 1}` } : undefined))}</div>;
        };
        const lab = (t: string) => <span style={{ opacity: 0.7, fontSize: 12 }}>{t}</span>;
        const objs = (Object.keys(OBJECTIVE_NAME) as (keyof typeof OBJECTIVE_NAME)[]).filter(o => o !== 'rescue');
        return (
          <div style={{ ...panel, display: 'grid', gap: 8 }}>
            <b>Пісочниця · обери будь-яку місію</b>
            {lab('Завдання')}
            {grp(objs.map(o => ({ on: c.objective === o && !c.boss, label: OBJECTIVE_NAME[o], click: () => set({ objective: o, boss: false }) })), narrow ? 2 : 5)}
            {c.objective === 'defend' && <>{lab('Оборона')}{grp(DEFEND_KINDS.map((d, i) => ({ on: (c.variant ?? 0) === i, label: d.name, click: () => set({ variant: i }) })), narrow ? 2 : 4)}</>}
            {lab('Місцевість')}
            {grp((Object.keys(BIOME_NAME) as (keyof typeof BIOME_NAME)[]).map(b => ({ on: c.biome === b, label: BIOME_NAME[b], click: () => set({ biome: b }) })), 3)}
            {lab('Умови')}
            {grp([{ on: c.boss, label: 'Бос', click: () => set({ boss: !c.boss, objective: !c.boss ? 'assassinate' : c.objective }), title: 'Бос «Тиран» зі свитою' }, { on: c.risky, label: 'Ризикована', click: () => set({ risky: !c.risky }), title: '+2 вороги' }], 2)}
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
          <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 14, height: 14, clipPath: HEX, background: HN.accent }} title="База" />
          {c.options.map((o, i) => {
            const on = c.objective === o.objective && c.biome === o.biome && c.boss === o.boss && c.risky === o.risky && (c.variant ?? 0) === (o.variant ?? 0);
            return (
              <button key={i} onClick={() => act(x => chooseOption(x, i))} style={{ ...btn(on), padding: '10px 8px', display: 'grid', gap: 3, justifyItems: 'center', textAlign: 'center', fontSize: 12 }}>
                <span style={{ fontSize: 22 }}>{o.boss ? '☠' : { clear: '⚔', extract: '🚁', hold: '🛡', defend: '🏠', assassinate: '🎯', sabotage: '💣', rescue: '🆘', storm: '🏢', holdbld: '🏚', hostage: '🔑', bomb: '🧨', counter: '🔭', escort: '🚁', ambush: '🚛', raid: '📦' }[o.objective]}</span>
                <b style={{ fontSize: 13 }}>{o.boss ? 'Бос: Тиран' : o.objective === 'defend' ? `Оборона: ${DEFEND_KINDS[o.variant ?? 0].name}` : OBJECTIVE_NAME[o.objective]}</b>
                <span style={{ opacity: 0.75 }}>{BIOME_NAME[o.biome]}</span>
                <span style={{ color: HN.accent }}>{o.boss ? 'нагорода +4' : o.risky ? 'ризик: +2 вороги, нагорода +3' : 'стандарт'}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}
      <div style={{ ...panel, display: 'grid', gap: 8, fontSize: 13, padding: 12 }}>
        <span style={{ opacity: 0.8 }}>Режим бою</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button style={{ ...btn(!c.rt), padding: '8px 10px', fontSize: 13 }} onClick={() => act(x => setRt(x, false))}>Покроковий</button>
        <button style={{ ...btn(c.rt), padding: '8px 10px', fontSize: 13 }} title="Час іде сам, пауза на пробіл, швидкість ×0.5 або ×1" onClick={() => act(x => setRt(x, true))}>Реальний час</button>
        </div>
        <span style={{ opacity: 0.8 }}>Розмір карти</span>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow ? 2 : 4}, minmax(0, 1fr))`, gap: 6 }}>
        {([44, 64, 640, 1024] as const).map(n => (
          <button key={n} style={{ ...btn(c.mapSize === n), padding: '8px 10px', fontSize: 13 }} title={n >= 640 ? 'Величезний ліс: прибульці чекають у таборах-руїнах і сидять у ямах, доки не підійдеш. Лише реальний час, без збереження посеред місії' : undefined} onClick={() => act(x => setMapSize(x, n))}>{n === 44 ? 'Середня 44×44' : n === 64 ? 'Велика 64×64' : n === 640 ? 'Величезний ліс 640×640' : 'Гігант 1024×1024'}</button>
        ))}
        </div>
        {c.mapSize >= 640 && (
          <select value={c.loc ?? -1} onChange={e => act(x => setLoc(x, Number(e.target.value)))} style={{ ...btn(false), padding: '4px 8px', fontSize: 12, width: '100%' }} title="Локація великої карти: тип місцевості, забудова, погода">
            <option value={-1}>🎲 Локація за місією</option>
            {Array.from(new Set(LOCATIONS.map(l => l.arch))).map(a => <optgroup key={a} label={a}>{LOCATIONS.filter(l => l.arch === a).map(l => <option key={l.id} value={l.id}>{l.name}{l.weather ? ' · ' + ({ night: 'ніч', rain: 'дощ', fog: 'туман' } as Record<string, string>)[l.weather] : ''}</option>)}</optgroup>)}
          </select>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: c.mapSize >= 640 ? '1fr 1fr' : '1fr', gap: 6 }}>
        <button style={{ ...btn(achOpen), padding: '8px 10px', fontSize: 13 }} onClick={() => { setAchOpen(true); if (c.achNew?.length) act(x => { x.achNew = []; return null; }); }}>🏆 Досягнення ({(c.ach ?? []).length}/{ACH.length}){c.achNew?.length ? ` · нових ${c.achNew.length}` : ''}</button>
        {c.mapSize >= 640 && <button style={{ ...btn(worldMap), padding: '8px 10px', fontSize: 13 }} onClick={() => setWorldMap(true)}>🗺 Карта світу ({(c.cleared ?? []).length}/{LOCATIONS.length})</button>}
        </div>
      </div>
      {equipTab && (() => { const sd = c.roster.find(x => x.id === selId) ?? c.roster[0]; if (!sd) return null; return <Equip c={c} soldier={sd} tab={equipTab} onClose={() => setEquipTab(null)}
        onEquip={(kind, id) => act(cc => kind === 'helm' ? setHelmet(cc, sd.id, id) : kind === 'armor' ? equip(cc, sd.id, 'armor', id) : toggleGearItem(cc, sd.id, id))}
        onBuy={(kind, id) => act(cc => unlockGear(cc, kind === 'helm' ? 'helmet' : kind, id))} />; })()}
      {arsenal && (() => { const sd = c.roster.find(x => x.id === selId) ?? c.roster[0]; if (!sd) return null; return <Arsenal c={c} soldier={sd} mode={arsenal} onClose={() => setArsenal(null)} onPick={id => { act(cc => arsenal === 'weapon' ? equip(cc, sd.id, 'weapon', id!) : setSec(cc, sd.id, id)); if (id) setArsenal(null); }} onBuy={id => act(cc => unlock(cc, 'weapon', id))} />; })()}
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
        type K = 'weapon' | 'armor' | 'helm' | 'gear' | 'cls' | 'att' | 'sec';
        const hp = Math.max(1, max - s.hpLoss), kgTot = Math.round((w.kg + ar.kg + (HELMETS[s.helmet ?? 'none']?.kg ?? 0) + (s.gear ?? []).reduce((a2, g) => a2 + (GEARS[g]?.kg ?? 0), 0)) * 10) / 10;
        // слот-вузол: скошені кути, світиться, коли відкритий
        const node = (k: K | null, lab: string, val: string, side: 'l' | 'r', icon?: string) => (
          <button key={lab} disabled={!k} onClick={() => { if (k === 'helm' || k === 'armor' || k === 'gear') setEquipTab(k); else if (k) setOpen(open === k ? null : k); }}
            style={{ textAlign: side === 'l' ? 'left' : 'right', padding: narrow ? '5px 6px' : '6px 9px', border: `1px solid ${open === k && k ? HN.accent : HN.accent + '88'}`, background: open === k && k ? '#0a4a7acc' : '#06203acc', color: HN.fg, cursor: k ? 'pointer' : 'default', font: 'inherit', width: '100%', height: '100%', minWidth: 0, display: 'grid', alignContent: 'center',
              clipPath: side === 'l' ? 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))' : 'polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)', boxShadow: open === k && k ? `0 0 14px ${HN.accent}88` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: side === 'l' ? 'flex-start' : 'flex-end', fontSize: narrow ? 8 : 9, flexWrap: 'wrap', letterSpacing: narrow ? '.04em' : '.2em', textTransform: 'uppercase', color: HN.accent }}>
              {icon && (icon.startsWith('data:') ? <img src={icon} alt="" style={{ width: 28, height: 14, objectFit: 'contain', filter: 'drop-shadow(0 0 2px rgba(25,211,255,.6))' }} /> : <span style={{ fontSize: 12 }}>{icon}</span>)}{lab}
            </div>
            <b style={{ fontSize: narrow ? 12 : 14, lineHeight: 1.1, display: 'block', overflowWrap: 'anywhere' }}>{val}</b>
          </button>
        );
        const L: [K, string, string, string][] = [['helm', 'Шолом', HELMETS[s.helmet ?? 'none']?.name ?? 'немає', '⛑'], ['armor', 'Броня', ar.name, '▣'], ['gear', 'Спорядження', (s.gear?.length ?? 0) ? s.gear!.map(g => GEARS[g]?.name).join(', ') : 'немає', '✦'], ['cls', 'Клас', CLASSES[s.cls].name, '⚔']];
        const Rr: [K, string, string, string][] = [['weapon', 'Зброя', w.name, ''], ['sec', 'Запасна', s.sec ? WEAPONS[s.sec].name : 'немає', ''], ['att', 'Обвіс зброї', (s.att?.length ?? 0) ? s.att!.map(a2 => ATT[a2].name).join(', ') : 'немає', '🔧']];
        const ammoVal = `💣${grenades} ▮2 ✚${DIFF[c.difficulty].kits + (c.tech.kits ? 1 : 0)}`;
        const bar = (lab: string, pct: number, col = HN.accent) => <div key={lab} style={{ fontSize: 10, letterSpacing: '.14em', color: HN.dim, textTransform: 'uppercase' }}>{lab}<i style={{ display: 'block', height: 5, background: '#0b3558', marginTop: 3, position: 'relative' }}><i style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.max(2, Math.min(100, pct))}%`, background: col, boxShadow: `0 0 8px ${col}` }} /></i></div>;
        return (
          <div style={{ ...panel, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${symCols(c.roster.length, narrow ? 3 : 6)}, minmax(0, 1fr))`, gap: 8 }}>
              {c.roster.map(x => <button key={x.id} style={{ ...btn(x.id === s.id), padding: narrow ? '8px 4px' : '8px 14px', fontSize: narrow ? 13 : 14 }} onClick={() => { setSelId(x.id); setOpen(null); }}>{x.name}{ids.includes(x.id) ? ' ✓' : ''}</button>)}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: HN.accent }}>{RANKS[s.rank]}</div>
              <div style={{ ...hudH, fontSize: 24 }}>{s.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>HP {Math.max(1, max - s.hpLoss)}/{max}{s.fracture ? ' · перелом' : ''} · вбито {s.kills} · місій {s.missions} · досвід {s.xp}{s.rank < XP_STEPS.length ? `/${XP_STEPS[s.rank]}` : ' (макс.)'}</div>
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'stretch', gap: narrow ? 4 : 10 }}>
              <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <g stroke={`${HN.accent}99`} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke">
                  {L.map((_, i) => <path key={'l' + i} vectorEffect="non-scaling-stroke" d={`M${narrow ? 30 : 33} ${(i + 0.5) / L.length * 100} H${narrow ? 38 : 40} L45 ${[24, 44, 58, 70][i]}`} />)}
                  {[...Rr, 0].map((_, i) => <path key={'r' + i} vectorEffect="non-scaling-stroke" d={`M${narrow ? 70 : 67} ${(i + 0.5) / 4 * 100} H${narrow ? 62 : 60} L55 ${[46, 62, 54, 76][i]}`} />)}
                </g>
              </svg>
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(4,minmax(0,1fr))', gap: 8, position: 'relative' }}>{L.map(([k, lab, val, ic]) => node(k, lab, val, 'l', ic))}</div>
              <div style={{ display: 'grid', justifyItems: 'center', alignContent: 'center' }}>
                <SoldierView weapon={s.weapon} armor={s.armor} helmet={s.helmet} gear={s.gear} sec={s.sec} grenades={grenades} mags={2} width={narrow ? 130 : 210} height={narrow ? 250 : 400} />
              </div>
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(4,minmax(0,1fr))', gap: 8, position: 'relative' }}>{Rr.map(([k, lab, val, ic], i) => node(k, lab, val, 'r', i === 0 ? weaponIcon(s.weapon) ?? '⌖' : ic))}{node(null, 'Боєкомплект', ammoVal, 'r', '▮')}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
              {bar('HP ' + hp + '/' + max, hp / max * 100, hp / max < 0.4 ? HN.warn : HN.good)}{bar('Броня ' + ar.hp, ar.hp * 20)}{bar('Вага ' + kgTot + ' кг', kgTot * 6, kgTot > 11 ? HN.warn : HN.accent)}{bar('Рух ' + (5 + w.move + ar.move), (5 + w.move + ar.move) * 12)}
            </div>
            {open && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {open === 'weapon' && <button style={btn(false)} onClick={() => setArsenal('weapon')}>🔫 Відкрити арсенал ({Object.keys(WEAPONS).length})</button>}
                {open === 'armor' && (Object.keys(ARMORS) as ArmorId[]).map(x => { const own = c.armors.includes(x) || ARMORS[x].cost === 0; return <button key={x} title={`${ARMORS[x].desc} · ${ARMORS[x].kg} кг`} style={{ ...btn(s.armor === x), opacity: own ? 1 : 0.75 }} onClick={() => act(cc => own ? equip(cc, s.id, 'armor', x) : unlockGear(cc, 'armor', x))}>{ARMORS[x].name}{own ? '' : ` · ${ARMORS[x].cost} тр.`}</button>; })}
                {open === 'helm' && Object.entries(HELMETS).map(([x, d]: [string, GearDef]) => { const own = (c.helmets ?? []).includes(x) || d.cost === 0; return <button key={x} title={`${d.desc} · ${d.kg} кг`} style={{ ...btn((s.helmet ?? 'none') === x), opacity: own ? 1 : 0.75 }} onClick={() => act(cc => own ? setHelmet(cc, s.id, x) : unlockGear(cc, 'helmet', x))}>{d.icon} {d.name}{own ? '' : ` · ${d.cost} тр.`}</button>; })}
                {open === 'gear' && Object.entries(GEARS).map(([x, d]: [string, GearDef]) => { const own = (c.gears ?? []).includes(x) || d.cost === 0, on2 = !!s.gear?.includes(x); return <button key={x} title={`${d.desc} · ${d.kg} кг`} style={{ ...btn(on2), opacity: own ? 1 : 0.75 }} onClick={() => act(cc => own ? toggleGearItem(cc, s.id, x) : unlockGear(cc, 'gear', x))}>{d.icon} {d.name}{on2 ? ' ✓' : own ? '' : ` · ${d.cost} тр.`}</button>; })}
                {open === 'sec' && <button style={btn(false)} onClick={() => setArsenal('sec')}>🎽 Обрати запасну (арсенал)</button>}
                {open === 'att' && (Object.keys(ATT) as AttId[]).map(a => <button key={a} title={ATT[a].desc} style={btn(!!s.att?.includes(a))} onClick={() => act(cc => toggleAtt(cc, s.id, a))}>{ATT[a].icon} {ATT[a].name}{s.att?.includes(a) ? ' ✓' : ` · ${ATT[a].cost} тр.`}</button>)}
                {open === 'cls' && CLASS_IDS.map(k => <button key={k} title={CLASSES[k].desc} style={btn(s.cls === k)} onClick={() => act(cc => setClass(cc, s.id, k))}>{CLASSES[k].name}</button>)}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.75, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              {open === 'sec' ? 'Запасна зброя на ремені: у бою міняється кнопкою ⇄ у рюкзаку (🎒). Знайдена в бою зброя відкривається тут.' : open === 'att' ? 'Обвіс зберігається за бійцем. Установка коштує трофеїв, зняття безкоштовне.' : open === 'weapon' ? w.desc : open === 'armor' ? (ar.desc || 'Без захисту') : open === 'helm' ? (HELMETS[s.helmet ?? 'none']?.desc ?? '') : open === 'gear' ? `Слотів обвісу: ${GEAR_SLOTS}. Придбані предмети лишаються назавжди. Наведи на кнопку — опис і вага.` : `${CLASSES[s.cls].desc} Пасивно: ${CLASSES[s.cls].passive}.`}
              <div style={{ marginTop: 4 }}>{s.traits.map(t => TRAITS[t].name).join(', ')} — {s.bio}</div>
              {s.perks.length > 0 && <div style={{ color: '#9be86a' }}>{s.perks.map(p => PERKS[p].split(' (')[0]).join(', ')}</div>}
            </div>
            {s.perkPoints > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                <b style={{ color: HN.accent }}>Підвищення!</b>
                {(Object.keys(PERKS) as PerkId[]).map(p => (
                  <button key={p} style={{ ...btn(), padding: '6px 12px', fontSize: 12 }} onClick={() => act(x => choosePerk(x, s.id, p))}>{PERKS[p]}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button style={btn(false, s.hpLoss === 0 && !s.fracture)} onClick={() => act(x => heal(x, s.id))}>Лікувати ({COST.heal})</button>
              <button style={btn(on)} onClick={() => toggle(s.id)}>{on ? 'У загоні' : 'У резерві'}</button>
            </div>
          </div>
        );
      })()}

      <div style={{ ...panel, display: 'grid', gridTemplateColumns: `repeat(${narrow ? 1 : symCols(1 + Object.keys(TECH_INFO).length, 5)}, minmax(0, 1fr))`, gap: 8 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          <button style={{ ...btn(), gridColumn: '1 / -1' }} onClick={() => setArsenal('weapon')}>🔫 Зброя: {Object.keys(WEAPONS).filter(w => c.weapons.includes(w) || WEAPONS[w].cost === 0).length}/{Object.keys(WEAPONS).length} відкрито — арсенал</button>
          {(Object.keys(ARMORS) as ArmorId[]).filter(a => !c.armors.includes(a)).map(a => (
            <button key={a} title={ARMORS[a].desc} style={btn()} onClick={() => act(x => unlock(x, 'armor', a))}>{ARMORS[a].name} ({ARMORS[a].cost})</button>
          ))}
          {c.armors.length === Object.keys(ARMORS).length && <span style={{ opacity: 0.7, gridColumn: '1 / -1', textAlign: 'center' }}>Усе відкрито.</span>}
        </div>
      </div>

      {msg && <div style={{ color: '#ff8a8a' }}>{msg}</div>}
      {c.fallen.length > 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>Полеглі: {c.fallen.map(f => f.name).join(', ')}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8, alignItems: 'stretch' }}>
        <button style={cta(ids.length === 0)} disabled={ids.length === 0} onClick={() => onStart(ids)}>
          До місії ({ids.length}/{cap})
        </button>
        <button style={btn()} onClick={onMenu}>До меню</button>
      </div>
    </HudScreen>
  );
}
