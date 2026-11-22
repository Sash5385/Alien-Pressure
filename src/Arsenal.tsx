import { useState } from 'react';
import { CAT_NAME, CATALOG, SPEC, type Cat } from './game/catalog';
import { WEAPONS } from './game/weapons';
import type { Campaign } from './game/campaign';
import type { Soldier, WeaponId } from './game/types';
import { weaponIcon } from './render/models';
import { btn, glass } from './hud';
const panel = { ...glass, borderRadius: 18, padding: 14 };

const TABS: { k: 'base' | Cat; name: string }[] = [{ k: 'base', name: 'Базові' }, { k: 'pistol', name: CAT_NAME.pistol }, { k: 'auto', name: CAT_NAME.auto }, { k: 'rifle', name: CAT_NAME.rifle }, { k: 'mg', name: CAT_NAME.mg }];

/** Арсенал: вкладки по видах, картки з іконками й характеристиками; вибір основної/запасної зброї та відкриття за трофеї. */
export function Arsenal({ c, soldier, mode, onPick, onBuy, onClose }: {
  c: Campaign; soldier: Soldier; mode: 'weapon' | 'sec'; onPick: (id: WeaponId | undefined) => void; onBuy: (id: WeaponId) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'base' | Cat>(SPEC[soldier.weapon]?.cat ?? 'base');
  const ids: WeaponId[] = tab === 'base' ? (Object.keys(WEAPONS) as WeaponId[]).filter(i => !SPEC[i]) : CATALOG.filter(g => g.cat === tab).map(g => g.id);
  const sorted = [...ids].sort((a, b) => WEAPONS[a].cost - WEAPONS[b].cost);
  const owned = (id: WeaponId) => c.weapons.includes(id) || WEAPONS[id].cost === 0;
  const cur = mode === 'weapon' ? soldier.weapon : soldier.sec;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,14,28,.92)', overflow: 'auto', padding: 12 }} onClick={onClose}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 18 }}>🔫 {mode === 'weapon' ? 'Основна зброя' : 'Запасна зброя'} · {soldier.name} · трофеїв: {c.scrap}</b>
          <div style={{ display: 'flex', gap: 6 }}>
            {mode === 'sec' && <button style={{ ...btn(!soldier.sec), padding: '4px 10px' }} onClick={() => onPick(undefined)}>Без запасної</button>}
            <button style={{ ...btn(false), padding: '4px 12px' }} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {TABS.map(t => <button key={t.k} style={{ ...btn(tab === t.k), padding: '5px 12px', fontSize: 13 }} onClick={() => setTab(t.k)}>{t.name}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: 8 }}>
          {sorted.map(id => {
            const w = WEAPONS[id], have = owned(id), on = cur === id, ic = weaponIcon(id), sp = SPEC[id];
            return (
              <div key={id} style={{ ...panel, padding: 8, display: 'grid', gap: 3, justifyItems: 'center', textAlign: 'center', outline: on ? '2px solid #7ee0ff' : undefined, opacity: have ? 1 : 0.75 }} title={w.desc}>
                {ic ? <img src={ic} alt="" style={{ width: '100%', height: 84, objectFit: 'contain', filter: 'drop-shadow(0 0 3px rgba(25,211,255,.55))' }} /> : <div style={{ height: 64, fontSize: 30 }}>🔫</div>}
                <b style={{ fontSize: 13 }}>{w.name}</b>
                <span style={{ fontSize: 10, opacity: 0.7 }}>{sp ? `${sp.caliber} · ${sp.finish}${sp.scope ? ' · приціл' : ''}${sp.supp ? ' · глушник' : ''}${sp.bipod ? ' · сошки' : ''}` : 'базова'}</span>
                <span style={{ fontSize: 11 }}>🎯{w.aim} · 💥{w.dmg[0]}–{w.dmg[1]} · ▮{w.ammo} · ↔{w.falloffFrom}/{w.range} · {w.kg} кг</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>↩ віддача {w.recoil ?? 5} · 🔊 шум {w.noise ?? 22}{(w.pen ?? 0) > 0 ? ` · 🛡 пробиття +${w.pen}` : ''}</span>
                {have
                  ? <button style={{ ...btn(on), padding: '3px 10px', fontSize: 12 }} onClick={() => onPick(id)}>{on ? '✓ Обрано' : 'Обрати'}</button>
                  : <button style={{ ...btn(false), padding: '3px 10px', fontSize: 12, opacity: c.scrap >= w.cost ? 1 : 0.5 }} onClick={() => onBuy(id)}>🔓 Відкрити ({w.cost})</button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
