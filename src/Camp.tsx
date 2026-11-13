import { useState } from 'react';
import { CLASS_IDS, CLASSES } from './game/classes';
import { chooseOption, setMapSize, buy, choosePerk, COST, DEPLOY, equip, heal, setClass, maxHpOf, MAX_ROSTER, OBJECTIVE_NAME, recruit, TECH_INFO, unlock, type Campaign } from './game/campaign';
import { BIOME_NAME, DIFF } from './game/difficulty';
import { PERKS, RANKS, TRAITS, XP_STEPS } from './game/traits';
import type { ArmorId, PerkId, Tech, WeaponId } from './game/types';
import { ARMORS, WEAPONS } from './game/weapons';
import { btn, cta, NM } from './ui';
import { Silhouette } from './Silhouette';

const HEX = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const panel: React.CSSProperties = { background: NM.bg, boxShadow: NM.out, borderRadius: 18, padding: 14 };

export function Camp({ c, onChange, onStart, onMenu }: {
  c: Campaign;
  onChange: (c: Campaign) => void;
  onStart: (deploy: number[]) => void;
  onMenu: () => void;
}) {
  const [deploy, setDeploy] = useState<number[]>(() =>
    [...c.roster].sort((a, b) => a.hpLoss - b.hpLoss).slice(0, DEPLOY).map(s => s.id));
  const [msg, setMsg] = useState('');
  const [selId, setSelId] = useState<number>(() => c.roster[0]?.id ?? 0);
  const [open, setOpen] = useState<'weapon' | 'armor' | 'cls' | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
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
        <button style={cta()} onClick={onMenu}>В меню</button>
      </Screen>
    );
  }

  return (
    <Screen>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Подпольная база</h1>
        <span>Сложность: {DIFF[c.difficulty].label}</span>
        <b style={{ color: NM.accent }}>Трофеи: {c.scrap}</b>
      </div>
      <div style={{ ...panel, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
          <b>Карта операций · миссия {c.missionNo}</b>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{c.options.length > 1 ? 'Выбери задание' : c.options[0]?.boss ? 'Босс: выбора нет' : 'Единственное задание'}</span>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, c.options.length)}, minmax(0, 1fr))`, gap: 10, paddingTop: 34 }}>
          <svg aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 34 }} viewBox="0 0 300 34" preserveAspectRatio="none">
            {c.options.map((_, i) => {
              const x = ((i + 0.5) / c.options.length) * 300;
              return <path key={i} d={`M150 0 Q150 20 ${x} 34`} stroke="#2f3a54" strokeWidth="2" fill="none" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 14, height: 14, clipPath: HEX, background: NM.accent }} title="База" />
          {c.options.map((o, i) => {
            const on = c.objective === o.objective && c.biome === o.biome && c.boss === o.boss && c.risky === o.risky;
            return (
              <button key={i} onClick={() => act(x => chooseOption(x, i))} style={{ ...btn(on), padding: '10px 8px', display: 'grid', gap: 3, justifyItems: 'center', textAlign: 'center', fontSize: 12 }}>
                <span style={{ fontSize: 22 }}>{o.boss ? '☠' : { clear: '⚔', extract: '🚁', hold: '🛡', defend: '🏠', assassinate: '🎯', sabotage: '💣' }[o.objective]}</span>
                <b style={{ fontSize: 13 }}>{o.boss ? 'Босс: Тиран' : OBJECTIVE_NAME[o.objective]}</b>
                <span style={{ opacity: 0.75 }}>{BIOME_NAME[o.biome]}</span>
                <span style={{ color: NM.accent }}>{o.boss ? 'награда +4' : o.risky ? 'риск: +2 врага, награда +3' : 'стандарт'}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <span style={{ opacity: 0.7 }}>Размер карты:</span>
        {([44, 64] as const).map(n => (
          <button key={n} style={{ ...btn(c.mapSize === n), padding: '4px 10px', fontSize: 12 }} onClick={() => act(x => setMapSize(x, n))}>{n === 44 ? 'Средняя 44×44' : 'Большая 64×64'}</button>
        ))}
      </div>

      {(() => {
        const s = c.roster.find(x => x.id === selId) ?? c.roster[0];
        if (!s) return null;
        const max = maxHpOf(s, c.tech), on = ids.includes(s.id);
        const w = WEAPONS[s.weapon], ar = ARMORS[s.armor];
        const kit = true;
        const grenades = 2 + (c.tech.grenades ? 1 : 0) + (s.cls === 'engineer' ? 1 : 0);
        const hex = (k: 'weapon' | 'armor' | 'cls' | null, icon: string, lab: string, val: string, side: 'l' | 'r', dx: number) => (
          <div style={{ display: 'flex', flexDirection: narrow ? 'column' : side === 'l' ? 'row' : 'row-reverse', alignItems: 'center', gap: narrow ? 4 : 10, transform: narrow ? undefined : `translateX(${side === 'l' ? dx : -dx}px)`, cursor: k ? 'pointer' : 'default' }}
            role={k ? 'button' : undefined} tabIndex={k ? 0 : undefined} onClick={() => k && setOpen(open === k ? null : k)} onKeyDown={e => { if (k && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(open === k ? null : k); } }}>
            <div style={{ width: 62, height: 70, flex: 'none', clipPath: HEX, background: open === k && k ? NM.accent : '#2f3a54', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 58, height: 66, clipPath: HEX, background: NM.bg, display: 'grid', placeItems: 'center', fontSize: 22 }}>{icon}</div>
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
              <div style={{ fontSize: 12, opacity: 0.7 }}>HP {Math.max(1, max - s.hpLoss)}/{max}{s.fracture ? ' · перелом' : ''} · убито {s.kills} · миссий {s.missions} · опыт {s.xp}{s.rank < XP_STEPS.length ? `/${XP_STEPS[s.rank]}` : ' (макс.)'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: narrow ? 2 : 8 }}>
              <div style={{ display: 'grid', gap: narrow ? 10 : 26 }}>
                {hex('weapon', '🔫', 'Оружие', w.name, 'l', 0)}
                {hex('armor', '🛡', 'Броня', ar.name, 'l', 14)}
                {hex('cls', '⚔', 'Класс', CLASSES[s.cls].name, 'l', 0)}
              </div>
              <div style={{ position: 'relative', display: 'grid', justifyItems: 'center' }}>
                <Silhouette weapon={s.weapon} armor={s.armor} grenades={grenades} mags={2} kit={kit} width={narrow ? 96 : 150} />
                <div style={{ width: narrow ? 120 : 190, height: 30, borderRadius: '50%', background: 'radial-gradient(ellipse,#ffd34d55 -20%,transparent 70%)', marginTop: -14 }} />
              </div>
              <div style={{ display: 'grid', gap: narrow ? 10 : 26 }}>
                {hex(null, '💣', 'Гранаты', `× ${grenades}`, 'r', 0)}
                {hex(null, '▮', 'Магазины', `× 2 · ${w.ammo} патр.`, 'r', 14)}
                {hex(null, '✚', 'Аптечки', `× ${DIFF[c.difficulty].kits + (c.tech.kits ? 1 : 0)} (на отряд)`, 'r', 0)}
              </div>
            </div>
            {open && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {open === 'weapon' && c.weapons.map(x => <button key={x} title={WEAPONS[x].desc} style={btn(s.weapon === x)} onClick={() => act(cc => equip(cc, s.id, 'weapon', x))}>{WEAPONS[x].name}</button>)}
                {open === 'armor' && c.armors.map(x => <button key={x} title={ARMORS[x].desc} style={btn(s.armor === x)} onClick={() => act(cc => equip(cc, s.id, 'armor', x))}>{ARMORS[x].name}</button>)}
                {open === 'cls' && CLASS_IDS.map(k => <button key={k} title={CLASSES[k].desc} style={btn(s.cls === k)} onClick={() => act(cc => setClass(cc, s.id, k))}>{CLASSES[k].name}</button>)}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.75, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              {open === 'weapon' ? w.desc : open === 'armor' ? (ar.desc || 'Без защиты') : `${CLASSES[s.cls].desc} Пассивно: ${CLASSES[s.cls].passive}.`}
              <div style={{ marginTop: 4 }}>{s.traits.map(t => TRAITS[t].name).join(', ')} — {s.bio}</div>
              {s.perks.length > 0 && <div style={{ color: '#9be86a' }}>{s.perks.map(p => PERKS[p].split(' (')[0]).join(', ')}</div>}
            </div>
            {s.perkPoints > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                <b style={{ color: NM.accent }}>Повышение!</b>
                {(Object.keys(PERKS) as PerkId[]).map(p => (
                  <button key={p} style={{ ...btn(), padding: '6px 12px', fontSize: 12 }} onClick={() => act(x => choosePerk(x, s.id, p))}>{PERKS[p]}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button style={btn(false, s.hpLoss === 0 && !s.fracture)} onClick={() => act(x => heal(x, s.id))}>Лечить ({COST.heal})</button>
              <button style={btn(on)} onClick={() => toggle(s.id)}>{on ? 'В отряде' : 'В резерве'}</button>
            </div>
          </div>
        );
      })()}

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

      <div style={{ ...panel, display: 'grid', gap: 8 }}>
        <b>Арсенал</b>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(WEAPONS) as WeaponId[]).filter(w => !c.weapons.includes(w)).map(w => (
            <button key={w} title={WEAPONS[w].desc} style={btn()} onClick={() => act(x => unlock(x, 'weapon', w))}>{WEAPONS[w].name} ({WEAPONS[w].cost})</button>
          ))}
          {(Object.keys(ARMORS) as ArmorId[]).filter(a => !c.armors.includes(a)).map(a => (
            <button key={a} title={ARMORS[a].desc} style={btn()} onClick={() => act(x => unlock(x, 'armor', a))}>{ARMORS[a].name} ({ARMORS[a].cost})</button>
          ))}
          {c.weapons.length === Object.keys(WEAPONS).length && c.armors.length === Object.keys(ARMORS).length && <span style={{ opacity: 0.7 }}>Всё открыто.</span>}
        </div>
      </div>

      {msg && <div style={{ color: '#ff8a8a' }}>{msg}</div>}
      {c.fallen.length > 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>Павшие: {c.fallen.map(f => f.name).join(', ')}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={cta(ids.length === 0)} disabled={ids.length === 0} onClick={() => onStart(ids)}>
          В миссию ({ids.length}/{DEPLOY})
        </button>
        <button style={btn()} onClick={onMenu}>В меню</button>
      </div>
    </Screen>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', color: NM.fg, background: NM.bg, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16, display: 'grid', gap: 14 }}>{children}</div>
    </div>
  );
}
