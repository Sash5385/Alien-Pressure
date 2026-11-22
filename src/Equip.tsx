import { useState } from 'react';
import type { Campaign } from './game/campaign';
import { GEARS, GEAR_SLOTS, HELMETS, type Fx, type GearDef } from './game/gear';
import { ARMORS } from './game/weapons';
import type { Soldier } from './game/types';
import { SoldierView } from './SoldierView';
import { btn, glass, HN, HUDF, HUDH } from './hud';

export type EquipTab = 'helm' | 'armor' | 'gear';
const panel = { ...glass, borderRadius: 12, padding: 12 };
const hex = (n?: number, d = '#4a5a34') => (n === undefined ? d : '#' + n.toString(16).padStart(6, '0'));
const ARMOR_COL: Record<string, string> = { jacket: '#4a5a34', vest: '#3b3f45', carrier: '#4a4f3a', stealth: '#3d5a3a', ghillie: '#5a5a30', plate: '#4a4e55', assault: '#33373d', exo: '#5a6068', heavy: '#2f3338', sapper: '#6a4a2a', riot: '#2b2e33' };

/** Намальований значок шолома / броні (вигляд спереду). */
function Icon({ kind, id, size = 72 }: { kind: EquipTab; id: string; size?: number }) {
  const line = '#0a1420';
  if (kind === 'helm') {
    const d = HELMETS[id], c = hex(d?.color), look = d?.look ?? 'none';
    const head = <ellipse cx="32" cy="42" rx="13" ry="15" fill="#c98e6b" stroke={line} strokeWidth="1.5" />;
    const dome = (h = 18) => <path d={`M12 38 C12 ${38 - h - 4} 52 ${38 - h - 4} 52 38 Z`} fill={c} stroke={line} strokeWidth="1.5" />;
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        {look === 'none' && <><ellipse cx="32" cy="42" rx="13" ry="15" fill="none" stroke={HN.dim} strokeDasharray="3 3" /><path d="M20 24 h24" stroke={HN.dim} strokeDasharray="3 3" /></>}
        {look !== 'none' && look !== 'hood' && head}
        {look === 'cap' && <>{dome(12)}<ellipse cx="32" cy="38" rx="21" ry="4" fill={c} stroke={line} strokeWidth="1.5" /></>}
        {look === 'steel' && <>{dome()}<ellipse cx="32" cy="37" rx="22" ry="4" fill={c} stroke={line} strokeWidth="1.5" /></>}
        {look === 'kevlar' && <>{dome(19)}{[22, 32, 42].map(x => <path key={x} d={`M${x} 22 V37`} stroke={line} strokeWidth="1.5" />)}<path d="M13 40 L21 56 M51 40 L43 56" stroke={line} strokeWidth="1.5" /><rect x="22" y="33" width="20" height="5" fill="#2a2a20" /></>}
        {look === 'ach' && <>{dome(18)}<rect x="8" y="30" width="5" height="12" fill="#55595f" stroke={line} /><rect x="51" y="30" width="5" height="12" fill="#55595f" stroke={line} /><rect x="26" y="20" width="12" height="8" fill="#33373d" stroke={line} /></>}
        {look === 'boonie' && <><ellipse cx="32" cy="34" rx="29" ry="7" fill={c} stroke={line} strokeWidth="1.5" /><path d="M16 34 C16 14 48 14 48 34 Z" fill={c} stroke={line} strokeWidth="1.5" /><path d="M16 30 H48" stroke={line} strokeWidth="1" /></>}
        {look === 'nvg' && <>{dome(18)}<rect x="24" y="20" width="16" height="9" rx="2" fill="#1d2024" stroke={line} />{[27, 37].map(x => <circle key={x} cx={x} cy="28" r="4" fill="#6aff6a" stroke={line} />)}</>}
        {look === 'visor' && <>{dome(18)}<rect x="15" y="34" width="34" height="16" rx="3" fill="#4a9ad0" fillOpacity=".55" stroke={line} strokeWidth="1.5" /></>}
        {look === 'command' && <>{dome(18)}<rect x="14" y="30" width="36" height="4" fill="#c42a2a" /><path d="M52 34 L58 8" stroke={line} strokeWidth="2" /></>}
        {look === 'hood' && <><path d="M8 58 C4 14 60 14 56 58 L46 50 H18 Z" fill={c} stroke={line} strokeWidth="1.5" /><ellipse cx="32" cy="44" rx="11" ry="12" fill="#c98e6b" stroke={line} />{[14, 22, 30, 38, 46].map((x, i) => <path key={x} d={`M${x} 18 l-2 ${8 + (i % 2) * 3}`} stroke={i % 2 ? '#6a5a32' : '#3a4a22'} strokeWidth="2" />)}</>}
        {look === 'heavy' && <>{dome(19)}<rect x="13" y="34" width="38" height="20" rx="4" fill={c} stroke={line} strokeWidth="1.5" />{[20, 26, 32, 38, 44].map(x => <path key={x} d={`M${x} 38 V50`} stroke={line} strokeWidth="1.5" />)}</>}
      </svg>
    );
  }
  if (kind === 'armor') {
    const c = ARMOR_COL[id] ?? '#4a4e55', look = ARMORS[id]?.look ?? 'none';
    const body = <path d="M10 22 L22 14 H42 L54 22 L50 58 H14 Z" fill={look === 'none' ? 'none' : '#3a4a5a'} stroke={look === 'none' ? HN.dim : line} strokeWidth="1.5" strokeDasharray={look === 'none' ? '3 3' : undefined} />;
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        {body}
        {look === 'jacket' && id !== 'stealth' && <><path d="M10 22 L22 14 H42 L54 22 L50 58 H14 Z" fill={c} stroke={line} strokeWidth="1.5" /><path d="M26 14 L32 26 L38 14" fill="#2d3626" stroke={line} /><rect x="17" y="38" width="12" height="9" fill="#3a4630" stroke={line} /><rect x="35" y="38" width="12" height="9" fill="#3a4630" stroke={line} /></>}
        {look === 'vest' && <><path d="M18 18 L26 14 H38 L46 18 L44 56 H20 Z" fill={c} stroke={line} strokeWidth="1.5" /><rect x="23" y="22" width="18" height="22" fill="#555a62" stroke={line} /></>}
        {look === 'carrier' && <><path d="M16 18 L26 14 H38 L48 18 L46 56 H18 Z" fill={c} stroke={line} strokeWidth="1.5" /><rect x="22" y="20" width="20" height="20" fill="#555a62" stroke={line} />{[19, 29, 39].map(x => <rect key={x} x={x} y="44" width="8" height="11" fill="#2b3022" stroke={line} />)}</>}
        {(id === 'stealth' || look === 'ghillie') && <><path d="M10 22 L22 14 H42 L54 22 L50 58 H14 Z" fill={c} stroke={line} strokeWidth="1.5" />{Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${14 + (i % 11) * 3.6} ${20 + Math.floor(i / 11) * 18} l${(i % 3) - 1} ${12 + (i % 4) * 2}`} stroke={['#6a8a3a', '#8a7a3a', '#35502a'][i % 3]} strokeWidth="2" />)}</>}
        {look === 'plate' && <><path d="M12 22 L22 14 H42 L52 22 L48 58 H16 Z" fill={c} stroke={line} strokeWidth="1.5" /><rect x="20" y="20" width="24" height="28" rx="3" fill="#6a707a" stroke={line} /><rect x="10" y="16" width="10" height="9" fill="#5a606a" stroke={line} /><rect x="44" y="16" width="10" height="9" fill="#5a606a" stroke={line} /></>}
        {look === 'exo' && <><path d="M10 22 L22 14 H42 L54 22 L50 58 H14 Z" fill="#2a2f36" stroke={line} strokeWidth="1.5" /><path d="M32 16 V56 M18 30 H46 M20 44 H44" stroke="#19d3ff" strokeWidth="2" />{[[18, 30], [46, 30], [20, 44], [44, 44]].map(([x, y]) => <circle key={x + '' + y} cx={x} cy={y} r="3.5" fill="#9aa4ae" stroke={line} />)}</>}
        {(look === 'heavy' || look === 'sapper' || look === 'riot') && <><path d="M12 22 L22 14 H42 L52 22 L48 58 H16 Z" fill={c} stroke={line} strokeWidth="1.5" /><ellipse cx="12" cy="22" rx="8" ry="6" fill="#4a5058" stroke={line} /><ellipse cx="52" cy="22" rx="8" ry="6" fill="#4a5058" stroke={line} /><rect x="20" y="20" width="24" height="26" rx="3" fill="#5a606a" stroke={line} />{look === 'riot' && [28, 34, 40].map(y => <path key={y} d={`M20 ${y} H44`} stroke={line} />)}{look === 'sapper' && <rect x="16" y="48" width="32" height="6" fill="#d8742a" stroke={line} />}</>}
      </svg>
    );
  }
  const L = line, dark = '#2b3022', red = '#c42a2a';
  const G: Record<string, React.ReactElement> = {
    kneepads: <>{[22, 42].map(x => <g key={x}><rect x={x - 8} y="8" width="16" height="22" rx="4" fill="#3a3f45" stroke={L} /><ellipse cx={x} cy="40" rx="12" ry="10" fill="#23282a" stroke={L} strokeWidth="1.5" /><path d={`M${x - 8} 40 H${x + 8}`} stroke="#5a6068" /><rect x={x - 8} y="48" width="16" height="10" rx="3" fill="#3a3f45" stroke={L} /></g>)}</>,
    pouches: <>{[10, 25, 40].map(x => <g key={x}><rect x={x} y="22" width="14" height="26" rx="2" fill={dark} stroke={L} /><rect x={x} y="22" width="14" height="8" rx="2" fill="#3a4630" stroke={L} /><rect x={x + 5} y="27" width="4" height="4" fill="#9aa4ae" /></g>)}</>,
    backpack: <><rect x="14" y="10" width="36" height="46" rx="8" fill="#3a4a2c" stroke={L} strokeWidth="1.5" /><rect x="20" y="30" width="24" height="18" rx="3" fill="#2f3a24" stroke={L} /><path d="M20 10 V4 M44 10 V4" stroke={L} strokeWidth="3" /><path d="M32 30 V48" stroke={L} /></>,
    grenrig: <>{[12, 26, 40].map(x => <g key={x}><ellipse cx={x + 6} cy="36" rx="7" ry="10" fill="#2f4a23" stroke={L} strokeWidth="1.5" /><rect x={x + 3} y="22" width="6" height="5" fill="#9aa4ae" stroke={L} /><path d={`M${x + 6} 24 q6 -6 8 -2`} stroke="#d8d8d8" fill="none" /></g>)}<path d="M6 52 H58" stroke={L} strokeWidth="3" /></>,
    smokerig: <>{[0, 1, 2].map(i => <g key={i}><rect x={13 + i * 13} y="16" width="10" height="34" rx="3" fill="#cfd3d6" stroke={L} /><rect x={13 + i * 13} y="16" width="10" height="7" fill={i === 2 ? red : '#8a929a'} stroke={L} /></g>)}</>,
    ifak: <><rect x="10" y="16" width="44" height="32" rx="5" fill="#2f3a24" stroke={L} strokeWidth="1.5" /><rect x="28" y="22" width="8" height="20" fill={red} /><rect x="22" y="28" width="20" height="8" fill={red} /></>,
    tourniquet: <><rect x="22" y="6" width="20" height="52" rx="8" fill="#c98e6b" stroke={L} /><rect x="20" y="24" width="24" height="14" rx="3" fill={red} stroke={L} /><path d="M32 6 V24" stroke="none" /><rect x="29" y="14" width="6" height="26" fill="#111" opacity=".55" /></>,
    gloves: <><path d="M14 56 V30 q0 -6 5 -6 q3 -14 6 -2 l2 -14 q4 -2 5 6 l1 -8 q4 -1 4 6 l1 -3 q4 0 4 6 V40 q0 16 -12 16 Z" fill="#1b1d1a" stroke="#5a6068" strokeWidth="1.5" /><path d="M20 44 H46" stroke="#5a6068" /></>,
    goggles: <><path d="M6 24 H58 V40 H6 Z" fill="none" /><rect x="8" y="22" width="22" height="20" rx="8" fill="#4a9ad0" fillOpacity=".6" stroke={L} strokeWidth="2" /><rect x="34" y="22" width="22" height="20" rx="8" fill="#4a9ad0" fillOpacity=".6" stroke={L} strokeWidth="2" /><path d="M30 30 H34 M2 30 H8 M56 30 H62" stroke={L} strokeWidth="3" /></>,
    laser: <><rect x="8" y="24" width="30" height="16" rx="3" fill="#2a2e32" stroke={L} strokeWidth="1.5" /><circle cx="40" cy="32" r="5" fill="#ff3b3b" stroke={L} /><path d="M45 32 H62" stroke="#ff3b3b" strokeWidth="2" /><rect x="14" y="28" width="8" height="4" fill="#5a6068" /></>,
    headset: <><path d="M12 38 C12 10 52 10 52 38" fill="none" stroke="#2a2e32" strokeWidth="5" /><rect x="6" y="32" width="12" height="20" rx="5" fill="#33373d" stroke={L} strokeWidth="1.5" /><rect x="46" y="32" width="12" height="20" rx="5" fill="#33373d" stroke={L} strokeWidth="1.5" /><path d="M50 52 q-4 6 -14 6" stroke={L} strokeWidth="2" fill="none" /><circle cx="35" cy="58" r="2.5" fill="#9aa4ae" /></>,
    flask: <><rect x="22" y="6" width="20" height="8" rx="2" fill="#2a2e32" stroke={L} /><path d="M20 16 H44 V54 q0 6 -6 6 H26 q-6 0 -6 -6 Z" fill="#5a6a3a" stroke={L} strokeWidth="1.5" /><rect x="20" y="26" width="24" height="16" fill="#3a4630" /></>,
    sling: <><path d="M10 6 L54 58" stroke="#1b1d1a" strokeWidth="7" /><path d="M10 6 L54 58" stroke="#5a6068" strokeWidth="1" strokeDasharray="3 3" /><rect x="44" y="46" width="14" height="10" rx="2" fill="#9aa4ae" stroke={L} /></>,
  };
  return <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">{G[id] ?? <text x="32" y="42" textAnchor="middle" fontSize="28">{GEARS[id]?.icon}</text>}</svg>;
}

const sign = (n: number) => (n > 0 ? '+' : '') + n;
/** Стислий список ефектів предмета. */
function fxList(fx: Fx, extra: string[] = []): string[] {
  const o = [...extra];
  if (fx.hp) o.push(`${sign(fx.hp)} HP`);
  if (fx.aim) o.push(`${sign(fx.aim)} влуч.`);
  if (fx.move) o.push(`${sign(fx.move)} хід`);
  if (fx.hcut) o.push(`${fx.hcut}% погашення`);
  if (fx.stealth) o.push(`непомітність ${Math.round(fx.stealth * 100)}%`);
  if (fx.sight) o.push(`${sign(fx.sight)} зір`);
  if (fx.bag) o.push(`${sign(fx.bag)} слоти`);
  if (fx.gren) o.push(`${sign(fx.gren)} гран.`);
  if (fx.nvg) o.push('ПНБ');
  if (fx.radio) o.push('рація');
  return o;
}

/** Вікно екіпірування: шоломи, броня, обвіс — картки з малюнками, ефектами й вартістю; боєць праворуч показує результат одразу. */
export function Equip({ c, soldier, tab: t0, onEquip, onBuy, onClose }: {
  c: Campaign; soldier: Soldier; tab: EquipTab;
  onEquip: (kind: EquipTab, id: string) => void; onBuy: (kind: EquipTab, id: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<EquipTab>(t0);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700;
  const TABS: [EquipTab, string][] = [['helm', '⛑ Шоломи'], ['armor', '▣ Броня'], ['gear', '✦ Обвіс']];
  const items: { id: string; d: { name: string; desc: string; kg: number; cost: number }; fx: string[]; own: boolean; on: boolean }[] =
    tab === 'helm' ? Object.entries(HELMETS).map(([id, d]: [string, GearDef]) => ({ id, d, fx: fxList(d.fx), own: d.cost === 0 || (c.helmets ?? []).includes(id), on: (soldier.helmet ?? 'none') === id }))
    : tab === 'armor' ? Object.entries(ARMORS).map(([id, d]) => ({ id, d, fx: fxList({ hp: d.hp, aim: d.aim, move: d.move, stealth: d.stealth }, d.cut ? [`−${d.cut} шкоди`] : []), own: d.cost === 0 || c.armors.includes(id), on: soldier.armor === id }))
    : Object.entries(GEARS).map(([id, d]: [string, GearDef]) => ({ id, d, fx: fxList(d.fx), own: d.cost === 0 || (c.gears ?? []).includes(id), on: !!soldier.gear?.includes(id) }));
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,8,18,.98)', overflow: 'auto', padding: 12, fontFamily: HUDF, color: HN.fg }} onClick={onClose}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 10 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontFamily: HUDH, letterSpacing: '.12em', fontSize: 15 }}>ЕКІПІРУВАННЯ · {soldier.name} · трофеїв: {c.scrap}</b>
          <button style={{ ...btn(false), padding: '4px 12px' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {TABS.map(([k, n]) => <button key={k} style={btn(tab === k)} onClick={() => setTab(k)}>{n}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0, 1fr) 230px', gap: 10, alignItems: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow ? 2 : 3}, minmax(0, 1fr))`, gap: 8 }}>
            {tab === 'gear' && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: HN.dim }}>Слотів обвісу: {soldier.gear?.length ?? 0}/{GEAR_SLOTS}. Придбане лишається назавжди.</div>}
            {items.map(it => (
              <button key={it.id} title={it.d.desc}
                onClick={() => (it.own ? onEquip(tab, it.id) : onBuy(tab, it.id))}
                style={{ ...panel, padding: 8, textAlign: 'center', cursor: 'pointer', font: 'inherit', color: HN.fg, display: 'grid', gap: 3, justifyItems: 'center', alignContent: 'start', border: `1px solid ${it.on ? HN.accent : HN.accent + '55'}`, background: it.on ? '#0a4a7acc' : '#06203acc', boxShadow: it.on ? `0 0 16px ${HN.accent}88` : 'none', opacity: it.own ? 1 : 0.8 }}>
                <Icon kind={tab} id={it.id} />
                <b style={{ fontSize: 13, lineHeight: 1.1 }}>{it.d.name}</b>
                <span style={{ fontSize: 10, color: HN.dim, lineHeight: 1.2 }}>{it.d.kg} кг{it.fx.length ? ' · ' + it.fx.join(' · ') : ''}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: it.on ? '#9dffb0' : it.own ? HN.accent : HN.warn, letterSpacing: '.08em' }}>{it.on ? '✓ НАДЯГНУТО' : it.own ? 'НАДЯГТИ' : `КУПИТИ · ${it.d.cost} тр.`}</span>
              </button>
            ))}
          </div>
          <div style={{ ...panel, display: 'grid', justifyItems: 'center', position: narrow ? 'static' : 'sticky', top: 8 }}>
            <SoldierView weapon={soldier.weapon} armor={soldier.armor} helmet={soldier.helmet} gear={soldier.gear} sec={soldier.sec} grenades={3} mags={2} width={narrow ? 160 : 210} height={narrow ? 250 : 340} />
          </div>
        </div>
      </div>
    </div>
  );
}
