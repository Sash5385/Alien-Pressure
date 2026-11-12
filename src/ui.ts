import type { CSSProperties } from 'react';

/** Морф (неоморфизм): фон, выпуклые и вдавленные тени. */
export const NM = {
  bg: '#1e2433', fg: '#dfe5f2', dim: '#8b95ad', accent: '#ffd34d',
  out: '4px 4px 10px #141926, -4px -4px 10px #2a3348',
  outS: '2px 2px 6px #141926, -2px -2px 6px #2a3348',
  inn: 'inset 2px 2px 6px #141926, inset -2px -2px 6px #2a3348',
};

const bevel = 'polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)';

/** Кнопка со скошенными углами. primary = выбрано (акцентная рамка и текст). */
export const btn = (primary = false, off = false): CSSProperties => ({
  padding: '10px 16px', border: 0, color: primary ? NM.accent : NM.fg, fontWeight: 700, clipPath: bevel,
  background: NM.bg,
  boxShadow: `inset 0 0 0 1px ${primary ? NM.accent : '#2f3a54'}`, opacity: off ? 0.45 : 1, font: 'inherit', cursor: off ? 'default' : 'pointer',
});

/** Главное действие: залитая акцентом кнопка со скошенными углами. */
export const cta = (off = false): CSSProperties => ({
  padding: '12px 22px', border: 0, color: '#1a1405', fontWeight: 800, font: 'inherit', clipPath: bevel,
  background: NM.accent, opacity: off ? 0.45 : 1, cursor: off ? 'default' : 'pointer',
});

export const VERSION = `v${__APP_VERSION__}`;
export const BUILD = __BUILD__;
