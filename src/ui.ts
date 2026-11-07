import type { CSSProperties } from 'react';

export const btn = (primary = false, off = false): CSSProperties => ({
  padding: '10px 14px', border: '1px solid #556', borderRadius: 6, color: '#eef',
  background: primary ? '#8a2a2a' : '#232a30', opacity: off ? 0.4 : 1, font: 'inherit', cursor: off ? 'default' : 'pointer',
});
