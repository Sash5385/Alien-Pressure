import { useState, type CSSProperties } from 'react';

/** Стекло: полупрозрачные панели с размытием на сине-зелёном фоне, голубой акцент. */
export const NM = {
  bg: 'linear-gradient(135deg,#0f1a2b,#1d3b4a 55%,#2c4a3a)', pn: 'rgba(255,255,255,.11)', solid: '#17283a',
  fg: '#f2f6ff', dim: '#a6b4cc', accent: '#7ee0ff', onAccent: '#04222c', line: 'rgba(255,255,255,.25)',
  out: '0 8px 24px rgba(0,0,0,.35)', outS: '0 4px 12px rgba(0,0,0,.3)', inn: 'inset 0 1px 4px rgba(0,0,0,.5)',
};

/** Стеклянная панель. */
export const glass: CSSProperties = { background: NM.pn, border: `1px solid ${NM.line}`, boxShadow: NM.out, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' };

const bevel = 'polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)';

/** Кнопка со скошенными углами. primary = выбрано (акцентная рамка и текст). */
export const btn = (primary = false, off = false): CSSProperties => ({
  padding: '10px 16px', border: 0, color: primary ? NM.accent : NM.fg, fontWeight: 700, clipPath: bevel,
  background: NM.pn, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
  boxShadow: `inset 0 0 0 1px ${primary ? NM.accent : NM.line}`, opacity: off ? 0.45 : 1, font: 'inherit', cursor: off ? 'default' : 'pointer',
});

/** Главное действие: залитая акцентом кнопка со скошенными углами. */
export const cta = (off = false): CSSProperties => ({
  padding: '12px 22px', border: 0, color: NM.onAccent, fontWeight: 800, font: 'inherit', clipPath: bevel,
  background: NM.accent, opacity: off ? 0.45 : 1, cursor: off ? 'default' : 'pointer',
});

export const VERSION = `v${__APP_VERSION__}`;
export const BUILD = __BUILD__;

/** Размер интерфейса: пять ступеней, выбор общий для лагеря, меню и боя. */
export const UI_SCALES = [0.8, 0.9, 1, 1.15, 1.3];
export const UI_NAMES = ['XS', 'S', 'M', 'L', 'XL'];
const UI_KEY = 'alien-pressure:ui';
export const loadUi = (): number => { try { const raw = localStorage.getItem(UI_KEY); const v = Number(raw); return raw !== null && v >= 0 && v < UI_SCALES.length ? v : 2; } catch { return 2; } };
export const saveUi = (i: number) => { try { localStorage.setItem(UI_KEY, String(i)); } catch { /* ignore */ } };
export const useUiSize = (): [number, (i: number) => void] => {
  const [i, set] = useState(loadUi);
  return [i, (n: number) => { set(n); saveUi(n); }];
};
