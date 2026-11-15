import { useState, type CSSProperties } from 'react';

/** Комикс: белые карточки с толстым тёмным контуром и сплошной тенью на ярком небе. */
export const INK = '#16213a';
export const NM = {
  bg: '#2f8fff', pn: '#ffffff', solid: '#fff4c9',
  fg: INK, dim: '#4a5a7a', accent: '#e8590c', onAccent: INK, line: INK,
  out: `0 7px 0 ${INK}`, outS: `0 4px 0 ${INK}`, inn: 'inset 0 3px 0 rgba(22,33,58,.25)',
};

/** Карточка в стиле комикса. */
export const glass: CSSProperties = { background: NM.pn, border: `4px solid ${INK}`, boxShadow: NM.out, color: INK };

/** Кнопка: белая с толстым контуром; primary = выбрано (жёлтая). */
export const btn = (primary = false, off = false): CSSProperties => ({
  padding: '9px 16px', border: `4px solid ${INK}`, borderRadius: 12, color: INK, fontWeight: 800, background: primary ? '#ffe14d' : '#fff',
  boxShadow: `0 4px 0 ${INK}`, opacity: off ? 0.45 : 1, font: 'inherit', cursor: off ? 'default' : 'pointer', letterSpacing: '.02em',
});

/** Главное действие: яркая жёлто-оранжевая кнопка. */
export const cta = (off = false): CSSProperties => ({
  padding: '12px 22px', border: `5px solid ${INK}`, borderRadius: 16, color: INK, fontWeight: 900, font: 'inherit', fontSize: 16, letterSpacing: '.04em', textTransform: 'uppercase',
  background: 'linear-gradient(180deg,#ffe14d,#ffae1f)', boxShadow: `0 6px 0 ${INK}`, opacity: off ? 0.45 : 1, cursor: off ? 'default' : 'pointer',
});

/** Заголовок: толстые буквы с контуром, как на первой странице. */
export const comicH: CSSProperties = {
  fontFamily: "'Rubik Mono One','Onest',sans-serif", textTransform: 'uppercase', color: '#ffe14d', WebkitTextStroke: `9px ${INK}`, paintOrder: 'stroke fill',
  textShadow: `0 4px 0 ${INK}`, margin: 0, letterSpacing: '.02em', lineHeight: 1.05,
};

export const VERSION = `v${__APP_VERSION__}`;
export const BUILD = __BUILD__;

/** Розмір інтерфейсу: пять ступеней, выбор общий для лагеря, меню и боя. */
export const UI_SCALES = [0.8, 0.9, 1, 1.15, 1.3];
export const UI_NAMES = ['XS', 'S', 'M', 'L', 'XL'];
const UI_KEY = 'alien-pressure:ui';
export const loadUi = (): number => { try { const raw = localStorage.getItem(UI_KEY); const v = Number(raw); return raw !== null && v >= 0 && v < UI_SCALES.length ? v : 2; } catch { return 2; } };
export const saveUi = (i: number) => { try { localStorage.setItem(UI_KEY, String(i)); } catch { /* ignore */ } };
export const useUiSize = (): [number, (i: number) => void] => {
  const [i, set] = useState(loadUi);
  return [i, (n: number) => { set(n); saveUi(n); }];
};
