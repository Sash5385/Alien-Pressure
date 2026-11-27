import type { CSSProperties } from 'react';
import { btn as cBtn, comicH, cta as cCta, glass as cGlass, INK as CINK, UI_NAMES, UI_SCALES, useUiSize } from './ui';
import { Backdrop } from './Title';

/** Єдина тема гри — комікс: білі картки з товстим контуром, жовте виділення, небо з пагорбами. */
export const HN = { bg: '#2f8fff', pn: '#ffffff', solid: '#fff4c9', card: '#ffffff', sel: '#ffe14d', track: '#dfe6f2', fg: CINK, dim: '#4a5a7a', accent: '#e8590c', onAccent: CINK, line: CINK, warn: '#e8590c', good: '#2fae4a' };
export const INK = CINK;
export const HUDF = "'Onest',system-ui,sans-serif";
export const HUDH = "'Rubik Mono One','Onest',system-ui,sans-serif";
export const glass: CSSProperties = cGlass;
export const btn = cBtn;
export const cta = cCta;
export const hudH: CSSProperties = comicH;

export function HudScreen({ children }: { children: React.ReactNode }) {
  const [ui, setUi] = useUiSize();
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', color: HN.fg, background: HN.bg, fontFamily: HUDF, fontWeight: 600, fontSize: 14 }}>
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
