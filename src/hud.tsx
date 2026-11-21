import type { CSSProperties } from 'react';
import { UI_NAMES, UI_SCALES, useUiSize } from './ui';

/** HUD-тема табору: тёмно-синий экран, циановый неон, скошенные углы, Orbitron/Rajdhani. */
export const HN = { bg: '#050b17', pn: '#071b33', solid: '#06203a', fg: '#cfeaff', dim: '#7fb6d8', accent: '#19d3ff', onAccent: '#02202e', line: '#19d3ff', warn: '#ffb020', good: '#2fe06a' };
export const INK = HN.accent;
export const HUDF = "'Rajdhani','Onest',system-ui,sans-serif";
export const HUDH = "'Orbitron','Onest',system-ui,sans-serif";

export const glass: CSSProperties = {
  background: 'linear-gradient(180deg,#0a2a4acc,#071b33e6)', border: `1px solid ${HN.accent}88`, borderRadius: 6, color: HN.fg,
  boxShadow: `0 0 0 1px #02101f, 0 0 26px ${HN.accent}1f, inset 0 0 34px ${HN.accent}10`,
};
export const btn = (primary = false, off = false): CSSProperties => ({
  padding: '8px 14px', border: `1px solid ${primary ? HN.accent : HN.accent + '77'}`, borderRadius: 4, fontWeight: 700, fontFamily: HUDF, fontSize: 14, letterSpacing: '.05em',
  background: primary ? `linear-gradient(180deg,${HN.accent},#0a8fb8)` : '#06203acc', color: primary ? HN.onAccent : HN.fg,
  boxShadow: primary ? `0 0 14px ${HN.accent}88` : 'none', opacity: off ? 0.4 : 1, cursor: off ? 'default' : 'pointer', font: 'inherit',
});
export const cta = (off = false): CSSProperties => ({
  padding: '13px 26px', border: `1px solid ${HN.accent}`, fontFamily: HUDH, fontWeight: 800, fontSize: 15, letterSpacing: '.22em', textTransform: 'uppercase',
  background: 'linear-gradient(90deg,#0a4a7a,#0a2a4a)', color: '#e6f8ff', clipPath: 'polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%)',
  boxShadow: `0 0 18px ${HN.accent}66`, opacity: off ? 0.4 : 1, cursor: off ? 'default' : 'pointer',
});
export const hudH: CSSProperties = { fontFamily: HUDH, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: HN.fg, textShadow: `0 0 14px ${HN.accent}`, margin: 0, lineHeight: 1.1 };

/** Тёмный экран с сеткой и мягким свечением сверху. */
export function HudBackdrop() {
  return <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, background: `radial-gradient(120% 70% at 50% 0%,#0e2b4d,transparent 70%), linear-gradient(${HN.accent}10 1px,transparent 1px) 0 0/44px 44px, linear-gradient(90deg,${HN.accent}10 1px,transparent 1px) 0 0/44px 44px, ${HN.bg}` }} />;
}

export function HudScreen({ children }: { children: React.ReactNode }) {
  const [ui, setUi] = useUiSize();
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', color: HN.fg, background: HN.bg, fontFamily: HUDF, fontWeight: 600, fontSize: 15 }}>
      <HudBackdrop />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: 16, display: 'grid', gap: 14, zoom: UI_SCALES[ui] }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: HN.dim }}>
          <span>Розмір інтерфейсу</span>
          {UI_NAMES.map((n, i) => <button key={n} style={{ ...btn(i === ui), padding: '3px 10px', fontSize: 12 }} onClick={() => setUi(i)}>{n}</button>)}
        </div>
        {children}
      </div>
    </div>
  );
}
