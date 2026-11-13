import type { ReactElement } from 'react';
import type { ArmorId, WeaponId } from './game/types';

const GEAR = '#8fa0c4', SIL = '#0f1420', ACC = '#ffd34d';

/** Силуэт бойца с навешенными бронёй, оружием и амуницией. */
export function Silhouette({ weapon, armor, grenades, mags, kit, width = 200 }: {
  weapon: WeaponId; armor: ArmorId; grenades: number; mags: number; kit: boolean; width?: number;
}) {
  const W: Record<WeaponId, ReactElement> = {
    rifle: <><rect x="18" y="-4" width="124" height="8" rx="2" /><rect x="0" y="-6" width="26" height="12" rx="3" /><rect x="62" y="4" width="9" height="20" rx="1" /><rect x="100" y="-8" width="22" height="4" /></>,
    smg: <><rect x="38" y="-4" width="78" height="8" rx="2" /><rect x="22" y="-6" width="20" height="12" rx="3" /><rect x="66" y="4" width="8" height="26" rx="1" /></>,
    shotgun: <><rect x="14" y="-4" width="132" height="7" rx="3" /><rect x="0" y="-6" width="24" height="12" rx="4" /><rect x="70" y="3" width="30" height="7" rx="3" /></>,
    launcher: <><rect x="0" y="-9" width="128" height="14" rx="6" /><rect x="116" y="-12" width="26" height="20" rx="4" /><rect x="50" y="5" width="9" height="16" rx="1" /></>,
    mortar: <><rect x="30" y="-6" width="100" height="11" rx="4" /><path d="M56 5 L38 34 M104 5 L122 34" stroke={GEAR} strokeWidth="3" /><rect x="26" y="32" width="104" height="5" rx="2" /></>,
    ags: <><rect x="10" y="-5" width="122" height="12" rx="3" /><circle cx="70" cy="16" r="14" /><path d="M40 7 L26 34 M100 7 L116 34" stroke={GEAR} strokeWidth="3" /></>,
    sniper: <><rect x="10" y="-3" width="150" height="6" rx="2" /><rect x="-6" y="-6" width="30" height="12" rx="3" /><rect x="60" y="-12" width="34" height="8" rx="3" /><path d="M40 3 L30 18 M120 3 L128 18" stroke={GEAR} strokeWidth="2" /></>,
  };
  return (
    <svg viewBox="0 0 200 360" width={width} height={width * 1.8} style={{ display: 'block' }} aria-hidden="true">
      <rect x="70" y="84" width="60" height="70" rx="8" fill={GEAR} opacity=".18" />
      <g fill={SIL}>
        <circle cx="100" cy="46" r="17" /><rect x="92" y="60" width="16" height="14" />
        <path d="M62 78 Q62 70 74 70 H126 Q138 70 138 78 V178 H62Z" />
        <path d="M62 78 L46 84 L40 176 L56 178 L66 110Z" /><path d="M138 78 L154 84 L160 176 L144 178 L134 110Z" />
        <rect x="68" y="176" width="29" height="150" rx="6" /><rect x="103" y="176" width="29" height="150" rx="6" />
        <rect x="64" y="322" width="36" height="22" rx="5" /><rect x="100" y="322" width="36" height="22" rx="5" />
      </g>
      <path d="M82 46 A18 18 0 0 1 118 46 L122 52 H78Z" fill={GEAR} opacity=".85" /><rect x="80" y="48" width="40" height="5" fill={SIL} opacity=".6" />
      {armor !== 'none' && <><path d="M70 80 H130 V150 Q100 162 70 150Z" fill={GEAR} opacity=".75" /><path d="M84 80 V150 M116 80 V150" stroke={SIL} strokeWidth="2" opacity=".5" /></>}
      {(armor === 'plate' || armor === 'exo') && <><path d="M56 78 H78 V96 H52Z M144 78 H122 V96 H148Z" fill={GEAR} /><rect x="70" y="150" width="60" height="16" fill={GEAR} opacity=".9" /></>}
      {armor === 'exo' && <><rect x="68" y="230" width="29" height="26" rx="5" fill={GEAR} /><rect x="103" y="230" width="29" height="26" rx="5" fill={GEAR} /><rect x="66" y="176" width="32" height="40" rx="5" fill={GEAR} opacity=".7" /><rect x="102" y="176" width="32" height="40" rx="5" fill={GEAR} opacity=".7" /><path d="M100 84 V166" stroke={ACC} strokeWidth="2" /></>}
      <rect x="62" y="170" width="76" height="8" fill={GEAR} opacity=".55" />
      {Array.from({ length: Math.min(grenades, 5) }, (_, i) => <circle key={'g' + i} cx={110 + i * 12} cy="190" r="5" fill={ACC} />)}
      {Array.from({ length: Math.min(mags, 5) }, (_, i) => <rect key={'m' + i} x={70 + i * 10} y="182" width="7" height="14" rx="1" fill={GEAR} />)}
      {kit && <><rect x="64" y="198" width="22" height="16" rx="2" fill="#e8e8e8" opacity=".85" /><path d="M75 201v10M70 206h10" stroke="#d33" strokeWidth="3" /></>}
      <g transform="translate(30 148) rotate(-14)" fill={GEAR} stroke={SIL} strokeWidth="1.5">{W[weapon]}</g>
      <circle cx="48" cy="168" r="7" fill={SIL} /><circle cx="116" cy="140" r="7" fill={SIL} />
    </svg>
  );
}
