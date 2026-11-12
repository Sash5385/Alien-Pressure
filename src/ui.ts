import type { CSSProperties } from 'react';

/** Морф (неоморфизм): фон, выпуклые и вдавленные тени. */
export const NM = {
  bg: '#1e2433', fg: '#dfe5f2', dim: '#8b95ad', accent: '#ffd34d',
  out: '4px 4px 10px #141926, -4px -4px 10px #2a3348',
  outS: '2px 2px 6px #141926, -2px -2px 6px #2a3348',
  inn: 'inset 2px 2px 6px #141926, inset -2px -2px 6px #2a3348',
};

/** Кнопка. primary = выбрано/нажато (вдавлена, акцентный цвет). */
export const btn = (primary = false, off = false): CSSProperties => ({
  padding: '10px 14px', border: 0, borderRadius: 14, color: primary ? NM.accent : NM.fg, fontWeight: 700,
  background: NM.bg, boxShadow: primary ? NM.inn : NM.outS, opacity: off ? 0.45 : 1, font: 'inherit', cursor: off ? 'default' : 'pointer',
});

/** Главное действие: выпуклая жёлтая кнопка. */
export const cta = (off = false): CSSProperties => ({
  padding: '12px 20px', border: 0, borderRadius: 14, color: '#2b2410', fontWeight: 800, font: 'inherit',
  background: 'linear-gradient(145deg,#ffdf74,#e8b32a)', boxShadow: NM.out, opacity: off ? 0.45 : 1, cursor: off ? 'default' : 'pointer',
});

export const VERSION = `v${__APP_VERSION__}`;
export const BUILD = __BUILD__;
