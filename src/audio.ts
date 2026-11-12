/** Синтезированные звуки (WebAudio) — без файлов. Контекст создаётся лениво, после первого клика. */
export type Sfx =
  | 'alert' | 'throw' | 'pin' | 'grenade' | 'shot' | 'alienShot' | 'hit' | 'miss' | 'psi' | 'death' | 'panic'
  | 'reload' | 'click' | 'select' | 'step' | 'dig' | 'heal' | 'bandage' | 'stance' | 'stanceProne' | 'mine' | 'charge'
  | 'overwatch' | 'fire' | 'collapse' | 'splash' | 'crumble' | 'wound' | 'turnPlayer' | 'turnEnemy' | 'win' | 'lose';

export interface SfxOpts { vol?: number; pitch?: number; variant?: string }

const KEY = 'alien-pressure:mute';
let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let V = 1; // громкость текущего звука
let P = 1; // высота (множитель частот)
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor(); // много звуков сразу не клиппуют
      comp.threshold.value = -14; comp.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      comp.connect(master).connect(ctx.destination);
      bus = comp;
    } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(c: AudioContext, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq * P;
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, gain * V), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus!);
  src.start(t);
}

function tone(c: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0 * P, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * P), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, gain * V), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Россыпь коротких щелчков/хрустов (огонь, обломки). */
function pops(c: AudioContext, t: number, n: number, span: number, gain: number, lo: number, hi: number) {
  for (let i = 0; i < n; i++) noise(c, t + Math.random() * span, 0.02 + Math.random() * 0.04, gain * (0.5 + Math.random() * 0.8), 'highpass', lo + Math.random() * (hi - lo));
}

function gun(c: AudioContext, t: number, variant: string) {
  switch (variant) {
    case 'smg': noise(c, t, 0.05, 0.5, 'highpass', 1500); noise(c, t, 0.09, 0.3, 'bandpass', 2200); tone(c, t, 0.08, 220, 90, 0.3); noise(c, t + 0.02, 0.25, 0.08, 'lowpass', 600); break;
    case 'shotgun': noise(c, t, 0.06, 0.6, 'highpass', 900); noise(c, t, 0.28, 0.5, 'lowpass', 1000); tone(c, t, 0.24, 120, 35, 0.6); noise(c, t + 0.04, 0.6, 0.14, 'lowpass', 400); break;
    case 'sniper': noise(c, t, 0.07, 0.65, 'highpass', 800); tone(c, t, 0.4, 95, 28, 0.6); noise(c, t, 0.2, 0.4, 'bandpass', 1400); noise(c, t + 0.06, 1.0, 0.2, 'lowpass', 300); break;
    default: noise(c, t, 0.05, 0.55, 'highpass', 1200); noise(c, t, 0.14, 0.35, 'bandpass', 1800); tone(c, t, 0.12, 150, 45, 0.45); noise(c, t + 0.03, 0.4, 0.12, 'lowpass', 500);
  }
}

export function sfx(kind: Sfx, o: SfxOpts = {}) {
  if (import.meta.env.DEV) (globalThis as { __sfx?: string[] }).__sfx?.push(kind + (o.variant ? ':' + o.variant : '')); // журнал для тестов
  if (muted) return;
  const c = ac();
  if (!c || !bus) return;
  V = o.vol ?? 1;
  P = o.pitch ?? 1;
  const t = c.currentTime;
  switch (kind) {
    case 'shot': gun(c, t, o.variant ?? 'rifle'); break;
    case 'alienShot': tone(c, t, 0.2, 1000, 220, 0.14, 'sawtooth'); noise(c, t, 0.06, 0.12, 'highpass', 3000); break;
    case 'hit': noise(c, t, 0.1, 0.35, 'lowpass', 700); break;
    case 'miss': tone(c, t, 0.14, 2600, 1100, 0.08); break;
    case 'psi': tone(c, t, 0.6, 200, 480, 0.18); tone(c, t, 0.6, 300, 360, 0.1, 'triangle'); break;
    case 'death': tone(c, t, 0.55, 320, 60, 0.25, 'triangle'); break;
    case 'panic': tone(c, t, 0.14, 440, 440, 0.1, 'square'); tone(c, t + 0.16, 0.14, 330, 330, 0.1, 'square'); break;
    case 'alert': tone(c, t, 0.12, 700, 700, 0.12, 'square'); tone(c, t + 0.14, 0.18, 1000, 1000, 0.12, 'square'); break;
    case 'click': noise(c, t, 0.03, 0.15, 'highpass', 2500); break;
    case 'select': tone(c, t, 0.05, 900, 1100, 0.07); break;
    // перезарядка: магазин вынут — затвор — магазин вставлен
    case 'reload': noise(c, t, 0.04, 0.3, 'highpass', 2000); tone(c, t, 0.05, 1800, 1400, 0.1, 'square'); noise(c, t + 0.2, 0.14, 0.2, 'bandpass', 1500); tone(c, t + 0.2, 0.1, 400, 300, 0.1, 'sawtooth'); noise(c, t + 0.42, 0.05, 0.35, 'highpass', 1500); tone(c, t + 0.42, 0.06, 1500, 1100, 0.12, 'square'); break;
    // шаги: мягкий глухой удар
    case 'step': noise(c, t, 0.07, 0.22, 'lowpass', 450 + Math.random() * 300); tone(c, t, 0.07, 120, 62, 0.16); break;
    // окапывание: три взмаха лопаты по земле и глухой удар
    case 'dig':
      for (let i = 0; i < 3; i++) { noise(c, t + i * 0.2, 0.14, 0.2, 'bandpass', 950 - i * 150); tone(c, t + i * 0.2 + 0.12, 0.07, 160, 80, 0.12); }
      noise(c, t + 0.66, 0.2, 0.25, 'lowpass', 300);
      break;
    // лечение: мягкий аккорд
    case 'heal': [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.1, 0.35, f, f, 0.1)); break;
    case 'bandage': noise(c, t, 0.18, 0.2, 'highpass', 2600); noise(c, t + 0.22, 0.12, 0.14, 'bandpass', 1500); break;
    case 'stance': noise(c, t, 0.14, 0.12, 'bandpass', 1400); break;
    case 'stanceProne': noise(c, t, 0.16, 0.14, 'bandpass', 1200); tone(c, t + 0.1, 0.12, 90, 50, 0.2); noise(c, t + 0.1, 0.1, 0.2, 'lowpass', 400); break;
    case 'mine': tone(c, t, 0.06, 1800, 1800, 0.1, 'square'); tone(c, t + 0.14, 0.06, 1800, 1800, 0.1, 'square'); noise(c, t + 0.28, 0.06, 0.2, 'lowpass', 500); break;
    case 'pin': tone(c, t, 0.05, 3000, 2500, 0.14); noise(c, t, 0.05, 0.12, 'highpass', 3500); tone(c, t + 0.1, 0.04, 2000, 1800, 0.08); break;
    case 'throw': noise(c, t, 0.25, 0.12, 'bandpass', 900); break;
    case 'charge': [800, 900, 1000, 1200].forEach((f, i) => tone(c, t + i * 0.12, 0.06, f, f, 0.1, 'square')); break;
    case 'overwatch': tone(c, t, 0.08, 600, 600, 0.1, 'triangle'); tone(c, t + 0.1, 0.1, 900, 900, 0.1, 'triangle'); break;
    case 'grenade': noise(c, t, 0.9, 0.7, 'lowpass', 350); tone(c, t, 0.7, 90, 28, 0.6); noise(c, t, 0.15, 0.5, 'bandpass', 2000); break;
    case 'fire': noise(c, t, 0.9, 0.16, 'lowpass', 300); pops(c, t, 14, 0.8, 0.14, 1500, 3500); break;
    case 'collapse': noise(c, t, 1.1, 0.5, 'lowpass', 250); tone(c, t, 0.9, 70, 30, 0.4); pops(c, t + 0.1, 8, 0.9, 0.25, 500, 1500); break;
    case 'splash': noise(c, t, 0.5, 0.3, 'bandpass', 1200); tone(c, t, 0.2, 300, 150, 0.2); break;
    case 'crumble': noise(c, t, 0.4, 0.35, 'lowpass', 500); pops(c, t, 5, 0.35, 0.2, 700, 1800); break;
    case 'wound': tone(c, t, 0.15, 160, 90, 0.1, 'sawtooth'); noise(c, t, 0.1, 0.15, 'lowpass', 600); break;
    case 'turnPlayer': tone(c, t, 0.12, 440, 440, 0.09, 'triangle'); tone(c, t + 0.13, 0.16, 660, 660, 0.09, 'triangle'); break;
    case 'turnEnemy': tone(c, t, 0.32, 220, 165, 0.1, 'sawtooth'); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.14, 0.4, f, f, 0.12)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(c, t + i * 0.24, 0.5, f, f * 0.95, 0.12, 'triangle')); break;
  }
  V = 1; P = 1;
}
