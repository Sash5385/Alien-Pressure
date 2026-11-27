/** Малюнки предметів рюкзака: впізнавані силуети з контуром у стилі комікс. */
const L = '#16213a';
export type BagKind = 'mag' | 'gren' | 'smoke' | 'kit' | 'mat' | 'empty';

export function BagIcon({ kind, color = '#cfd3d6', size = 34 }: { kind: BagKind; color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {kind === 'mag' && <>{/* вигнутий автоматний магазин з набоями зверху */}
        <path d="M14 8 H26 L27 14 C28 22 26 28 22 34 H12 C15 28 16 22 15 14 Z" fill="#3a3f45" stroke={L} strokeWidth="2" strokeLinejoin="round" />
        <path d="M15.5 17 H26.5 M15.8 23 H26 M15 29 H24" stroke="#5a6068" strokeWidth="1.5" />
        <rect x="16" y="4" width="8" height="5" rx="2" fill="#d4a63a" stroke={L} strokeWidth="1.5" />
      </>}
      {kind === 'gren' && <>{/* осколкова граната: корпус, запал, скоба й кільце */}
        <ellipse cx="19" cy="25" rx="10" ry="11" fill="#4a6a32" stroke={L} strokeWidth="2" />
        <path d="M11 22 H27 M11 28 H27 M19 14 V36" stroke="#2f4a23" strokeWidth="1.5" />
        <rect x="15" y="9" width="8" height="6" rx="1.5" fill="#9aa4ae" stroke={L} strokeWidth="1.5" />
        <path d="M23 11 L30 16 L28 24" fill="none" stroke="#9aa4ae" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="10" r="4" fill="none" stroke="#d4a63a" strokeWidth="2" />
      </>}
      {kind === 'smoke' && <>{/* димова: циліндр зі смугою кольору диму */}
        <rect x="12" y="10" width="16" height="26" rx="3" fill="#e9ecef" stroke={L} strokeWidth="2" />
        <rect x="12" y="18" width="16" height="7" fill={color} stroke={L} strokeWidth="1.5" />
        <rect x="15" y="5" width="10" height="6" rx="1.5" fill="#9aa4ae" stroke={L} strokeWidth="1.5" />
        <path d="M25 4 C30 2 33 6 31 9" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </>}
      {kind === 'kit' && <>
        <rect x="6" y="11" width="28" height="22" rx="4" fill="#fff" stroke={L} strokeWidth="2" />
        <rect x="17" y="15" width="6" height="14" fill="#d8342c" /><rect x="13" y="19" width="14" height="6" fill="#d8342c" />
        <path d="M15 11 V7 H25 V11" fill="none" stroke={L} strokeWidth="2" />
      </>}
      {kind === 'mat' && <>{/* мішок із піском і дошки */}
        <path d="M8 30 C6 22 10 16 20 16 C30 16 34 22 32 30 C26 34 14 34 8 30 Z" fill="#c9a66b" stroke={L} strokeWidth="2" />
        <path d="M14 18 L12 12 M26 18 L28 12" stroke={L} strokeWidth="2" /><path d="M12 25 H28" stroke="#8a6a3a" strokeWidth="1.5" />
      </>}
      {kind === 'empty' && <rect x="8" y="8" width="24" height="24" rx="5" fill="none" stroke="#9aa6bd" strokeWidth="2" strokeDasharray="4 3" />}
    </svg>
  );
}
