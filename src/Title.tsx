import type { ReactNode } from 'react';
import { BUILD, VERSION } from './ui';

const INK = '#16213a';
const OUT = { stroke: INK, strokeWidth: 5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Облако в комиксе: контур слоем ниже, заливка выше — внутренние линии скрыты. */
function Cloud({ x, y, s = 1, flip = false }: { x: number; y: number; s?: number; flip?: boolean }) {
  const c = [[0, 0, 70], [80, -28, 86], [172, -8, 74], [244, 14, 56], [-62, 20, 50], [110, 26, 80]];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <g {...OUT} fill={INK}>{c.map((k, i) => <circle key={i} cx={k[0]} cy={k[1]} r={k[2] + 5} />)}</g>
      <g fill="#fff">{c.map((k, i) => <circle key={i} cx={k[0]} cy={k[1]} r={k[2]} />)}</g>
      <g fill="#d8ecff"><circle cx={150} cy={50} r={48} /><circle cx={40} cy={46} r={44} /></g>
      <g fill="#fff"><circle cx={120} cy={10} r={56} /><circle cx={40} cy={-10} r={50} /></g>
    </g>
  );
}

function Pine({ x, y, s = 1, tilt = 0 }: { x: number; y: number; s?: number; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
      <rect x="-14" y="-40" width="28" height="140" rx="6" fill="#8a5a2e" {...OUT} />
      <path d="M-8 -10V90M6 -20V92" stroke="#5e3a18" strokeWidth="4" />
      {[[-300, 190], [-220, 170], [-140, 150], [-60, 125]].map(([yy, w], i) => (
        <g key={i}>
          <path d={`M0 ${yy - 90}L${w * 0.5} ${yy + 40}Q0 ${yy + 70} ${-w * 0.5} ${yy + 40}Z`} fill={['#2e8a3a', '#3aa043', '#2a7a34', '#3aa043'][i]} {...OUT} />
          <path d={`M0 ${yy - 60}L${w * 0.26} ${yy + 10}`} stroke="#6ad06a" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function Soldier({ x, y, s = 1, flip = false, rifle = true }: { x: number; y: number; s?: number; flip?: boolean; rifle?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <rect x="-26" y="-6" width="22" height="64" rx="8" fill="#4a5a2a" {...OUT} />
      <rect x="2" y="-6" width="22" height="64" rx="8" fill="#56682f" {...OUT} />
      <rect x="-34" y="-86" width="68" height="86" rx="20" fill="#6b7d3a" {...OUT} />
      <rect x="-26" y="-60" width="52" height="38" rx="8" fill="#3b4524" {...OUT} />
      {[-14, 0, 14].map(k => <rect key={k} x={k - 5} y="-52" width="10" height="20" rx="3" fill="#ffd34d" stroke={INK} strokeWidth="3" />)}
      <circle cx="0" cy="-112" r="30" fill="#f6c49a" {...OUT} />
      <path d="M-36 -116Q0 -168 36 -116L30 -104H-30Z" fill="#5d7a34" {...OUT} />
      <path d="M-30 -126Q-10 -142 10 -130M6 -146Q24 -138 28 -122" stroke="#34451c" strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="-10" cy="-106" r="4.5" fill={INK} /><circle cx="14" cy="-106" r="4.5" fill={INK} />
      <path d="M-6 -92Q4 -86 14 -92" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      {rifle && <g><rect x="10" y="-56" width="120" height="16" rx="5" fill="#333a4a" {...OUT} /><rect x="-14" y="-62" width="40" height="26" rx="6" fill="#8a5a2e" {...OUT} /><rect x="56" y="-42" width="14" height="30" rx="3" fill="#333a4a" {...OUT} /><circle cx="22" cy="-46" r="12" fill="#f6c49a" {...OUT} /></g>}
    </g>
  );
}

function Alien({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-70 10Q-76 -100 0 -112Q76 -100 70 10Z" fill="#6fd07a" {...OUT} />
      <path d="M-40 -88Q-20 -104 4 -104" stroke="#a8f0a8" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M-22 -112Q-30 -146 -44 -150M22 -112Q30 -146 44 -150" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="-44" cy="-152" r="9" fill="#ff5a8a" {...OUT} /><circle cx="44" cy="-152" r="9" fill="#ff5a8a" {...OUT} />
      <ellipse cx="-28" cy="-52" rx="22" ry="28" fill={INK} transform="rotate(14 -28 -52)" />
      <ellipse cx="28" cy="-52" rx="22" ry="28" fill={INK} transform="rotate(-14 28 -52)" />
      <circle cx="-34" cy="-62" r="7" fill="#fff" /><circle cx="22" cy="-62" r="7" fill="#fff" />
      <path d="M-18 -8Q0 8 18 -8" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Scene() {
  const lines: ReactNode[] = [];
  for (let i = 0; i < 34; i++) { // скоростные линии из углов и по краям, как в комиксе
    const a = (i / 34) * Math.PI * 2, r0 = 520 + (i % 3) * 40, r1 = 1100;
    const cx = 500, cy = 430, w = 0.018 + (i % 4) * 0.006;
    lines.push(<polygon key={i} fill={INK} opacity={0.9} points={`${cx + Math.cos(a) * r0},${cy + Math.sin(a) * r0} ${cx + Math.cos(a - w) * r1},${cy + Math.sin(a - w) * r1} ${cx + Math.cos(a + w) * r1},${cy + Math.sin(a + w) * r1}`} />);
  }
  const star = (cx: number, cy: number, r: number, k = 8) => Array.from({ length: k * 2 }, (_, i) => { const a = (i / (k * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.55 : r; return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`; }).join(' ');
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f8fff" /><stop offset="0.62" stopColor="#7cc8ff" /><stop offset="1" stopColor="#c9eeff" /></linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#56c25a" /><stop offset="1" stopColor="#2f8f3a" /></linearGradient>
        <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8c27a" /><stop offset="1" stopColor="#c9964a" /></linearGradient>
      </defs>
      <rect width="1000" height="1000" fill="url(#sky)" />
      {lines}
      <Cloud x={820} y={110} s={1.05} /><Cloud x={150} y={230} s={0.8} flip /><Cloud x={900} y={430} s={0.7} /><Cloud x={40} y={520} s={0.6} />
      {/* тарелка */}
      <g transform="translate(150 90) rotate(-12)">
        <ellipse cx="0" cy="10" rx="74" ry="22" fill="#c4cde0" {...OUT} /><path d="M-34 4Q0 -50 34 4Z" fill="#9fe6ff" {...OUT} /><circle cx="-40" cy="14" r="5" fill="#ffd34d" /><circle cx="0" cy="20" r="5" fill="#ffd34d" /><circle cx="40" cy="14" r="5" fill="#ffd34d" />
      </g>
      {/* дальний лес и холмы */}
      <path d="M-20 700Q120 600 260 660T520 640T800 650T1040 620V780H-20Z" fill="#3a9a52" {...OUT} />
      {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M${20 + i * 64} 690l22 -64l22 64z`} fill="#2e7a42" stroke={INK} strokeWidth="3" strokeLinejoin="round" />)}
      <path d="M-20 760Q200 700 420 740T860 730T1040 720V1020H-20Z" fill="url(#grass)" {...OUT} />
      <path d="M380 1020Q460 860 520 770Q580 860 700 1020Z" fill="url(#dirt)" {...OUT} />
      <path d="M470 1000Q500 900 520 800M560 1000Q560 910 530 800" stroke="#a87a34" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* яма с пришельцем слева */}
      <ellipse cx="200" cy="830" rx="130" ry="38" fill="#c9964a" {...OUT} /><ellipse cx="200" cy="836" rx="96" ry="26" fill="#2a1d10" stroke={INK} strokeWidth="4" />
      <Alien x={200} y={846} s={0.9} />
      <ellipse cx="200" cy="842" rx="106" ry="14" fill="none" />
      {/* бойцы за мешками справа */}
      <Soldier x={820} y={850} s={0.82} flip /><Soldier x={720} y={880} s={0.7} flip />
      <g {...OUT}>{[0, 1, 2, 3].map(i => <rect key={i} x={640 + i * 64} y={888 + (i % 2) * 2} width="62" height="34" rx="14" fill={['#c9b77a', '#b8a666'][i % 2]} />)}{[0, 1, 2].map(i => <rect key={i} x={672 + i * 64} y={856} width="62" height="34" rx="14" fill={['#b8a666', '#c9b77a'][i % 2]} />)}</g>
      {/* ящики, бочка */}
      <g {...OUT}><rect x="90" y="960" width="86" height="62" rx="6" fill="#e8913a" /><path d="M90 960L176 1022M176 960L90 1022" stroke={INK} strokeWidth="4" /></g>
      <g {...OUT}><rect x="900" y="900" width="56" height="86" rx="10" fill="#e84a3a" /><rect x="900" y="928" width="56" height="16" fill="#ffd34d" /></g>
      {/* ёлки переднего плана */}
      <Pine x={70} y={420} s={1.5} tilt={-4} /><Pine x={940} y={470} s={1.35} tilt={5} /><Pine x={310} y={640} s={0.8} /><Pine x={720} y={650} s={0.7} />
      {/* искры */}
      {[[330, 250, 22], [700, 190, 26], [880, 330, 18], [120, 380, 20], [610, 520, 16], [420, 560, 16]].map(([x, y, r], i) => <polygon key={i} points={star(x, y, r, 5)} fill="#ffd34d" stroke={INK} strokeWidth="3" strokeLinejoin="round" />)}
      <polygon points={star(500, 430, 430, 12)} fill="#ffe14d" stroke={INK} strokeWidth="5" strokeLinejoin="round" opacity="0.0" />
    </svg>
  );
}

const css = `
.tt{position:fixed;inset:0;overflow:auto;font-family:'Onest',system-ui,sans-serif;color:${INK};background:#2f8fff}
.tt .in{position:relative;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:clamp(10px,3vh,28px) 14px clamp(10px,2.5vh,22px);gap:10px}
.tt .burst{position:absolute;left:50%;top:clamp(120px,26vh,300px);width:min(980px,150vw);transform:translate(-50%,-50%);z-index:0;pointer-events:none}
.tt .logo{position:relative;z-index:1;text-align:center;line-height:.92;margin-top:clamp(4px,2vh,26px)}
.tt .w{display:block;font-family:'Rubik Mono One','Onest',sans-serif;position:relative;letter-spacing:.01em;text-transform:uppercase;font-weight:900}
.tt .w span{position:relative;display:inline-block}
.tt .w .bk,.tt .w .ft{display:block}
.tt .w .bk{position:absolute;left:0;right:0;top:0;color:${INK};-webkit-text-stroke:calc(var(--fs) * .2) ${INK};text-shadow:0 calc(var(--fs) * .09) 0 ${INK},0 calc(var(--fs) * .16) 0 ${INK},calc(var(--fs) * .07) calc(var(--fs) * .13) 0 ${INK}}
.tt .w .ft{position:relative;background:linear-gradient(180deg,var(--a) 0 50%,var(--b) 50% 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;-webkit-text-stroke:0}
.tt .l1{--fs:clamp(54px,15.5vw,150px);font-size:var(--fs);--a:#ffe14d;--b:#ff9a1f}
.tt .l2{--fs:clamp(40px,12.4vw,122px);font-size:var(--fs);--a:#ff7ac8;--b:#ff3fa8;margin-top:calc(var(--fs) * .08)}
.tt .l3{--fs:clamp(30px,8.6vw,84px);font-size:var(--fs);--a:#8fe4ff;--b:#2bb6ff;margin-top:calc(var(--fs) * .14)}
.tt .sub{position:relative;z-index:1;margin-top:clamp(6px,1.6vh,14px);font-weight:800;font-size:clamp(11px,2.8vw,16px);letter-spacing:.1em;text-transform:uppercase;background:#fff;border:4px solid ${INK};border-radius:999px;padding:5px 16px;box-shadow:4px 4px 0 ${INK};transform:rotate(-1.5deg)}
.tt .menu{position:relative;z-index:2;display:grid;gap:12px;width:min(480px,100%);margin-bottom:6px}
.tt .btn{appearance:none;font:inherit;cursor:pointer;border:5px solid ${INK};border-radius:18px;padding:12px 16px;font-weight:900;font-size:clamp(15px,4.2vw,22px);letter-spacing:.04em;text-transform:uppercase;color:${INK};box-shadow:0 7px 0 ${INK};transition:transform .08s,box-shadow .08s;display:block;width:100%}
.tt .btn:hover,.tt .btn:focus-visible{transform:translateY(-2px);box-shadow:0 9px 0 ${INK};outline:none}
.tt .btn:active{transform:translateY(5px);box-shadow:0 2px 0 ${INK}}
.tt .btn small{display:block;font-size:.55em;font-weight:700;letter-spacing:.06em;opacity:.8;text-transform:none;margin-top:2px}
.tt .go{background:linear-gradient(180deg,#ffe14d,#ffae1f)}
.tt .sb{background:linear-gradient(180deg,#9fe9ff,#35b9ff)}
.tt .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.tt .row .btn{padding:10px 4px;font-size:clamp(12px,3.4vw,20px)}
.tt .menu{box-sizing:border-box}
.tt .d1{background:linear-gradient(180deg,#9df0a8,#43c25a)}
.tt .d2{background:linear-gradient(180deg,#ffd9a0,#ffa23d)}
.tt .d3{background:linear-gradient(180deg,#ff9fb0,#ff4a6a)}
.tt .lab{justify-self:center;background:#fff;border:4px solid ${INK};border-radius:12px;padding:3px 12px;font-weight:900;font-size:13px;letter-spacing:.08em;text-transform:uppercase;transform:rotate(1.5deg);box-shadow:3px 3px 0 ${INK}}
.tt .ver{position:relative;z-index:2;font-size:11px;font-weight:700;background:#ffffffcc;border:3px solid ${INK};border-radius:8px;padding:2px 8px}
@media (prefers-reduced-motion:no-preference){.tt .logo{animation:ttbob 4.5s ease-in-out infinite}@keyframes ttbob{0%,100%{transform:translateY(0) rotate(-.6deg)}50%{transform:translateY(-6px) rotate(.6deg)}}}
`;

function Word({ cls, children }: { cls: string; children: string }) {
  return <span className={`w ${cls}`}><span className="bk" aria-hidden="true">{children}</span><span className="ft">{children}</span></span>;
}

/** Первая страница игры: комикс — яркое небо, толстые контуры, объёмные буквы. */
export function Title({ cont, onCont, sbCont, onSbCont, midCont, onMid, onNew, onSandbox, hasSb, labels }: {
  cont: string | null; onCont: () => void; sbCont: string | null; onSbCont: () => void; midCont: string | null; onMid: () => void;
  onNew: (i: number) => void; onSandbox: () => void; hasSb: boolean; labels: string[];
}) {
  return (
    <div className="tt">
      <style>{css}</style>
      <Scene />
      <div className="in">
        <svg className="burst" viewBox="-500 -300 1000 600" aria-hidden="true">
          <polygon fill="#ffe14d" stroke={INK} strokeWidth="6" strokeLinejoin="round" points={Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, r = i % 2 ? 190 : 430, ry = i % 2 ? 120 : 270; return `${Math.cos(a) * r},${Math.sin(a) * ry}`; }).join(' ')} />
        </svg>
        <div className="logo">
          <Word cls="l1">Alien</Word>
          <Word cls="l2">Pressure</Word>
          <Word cls="l3">Squad Tactics</Word>
          <div className="sub">Подпольный отряд против пришельцев</div>
        </div>
        <div className="menu">
          {midCont && <button className="btn go" onClick={onMid}>Продолжить миссию<small>{midCont}</small></button>}
          {cont && <button className="btn go" onClick={onCont}>Продолжить<small>{cont}</small></button>}
          {sbCont && <button className="btn sb" onClick={onSbCont}>Продолжить песочницу<small>{sbCont}</small></button>}
          <span className="lab">Новая игра</span>
          <div className="row">{labels.map((l, i) => <button key={l} className={`btn d${i + 1}`} onClick={() => onNew(i)}>{l}</button>)}</div>
          <button className="btn sb" onClick={onSandbox} title="Всё оружие, броня и технологии открыты и бесплатны, любая миссия на выбор">{hasSb ? 'Новая песочница' : 'Песочница'}<small>всё доступно: оружие, броня, любая миссия</small></button>
        </div>
        <div className="ver">v{VERSION.replace(/^v/, '')} · {BUILD}</div>
      </div>
    </div>
  );
}
