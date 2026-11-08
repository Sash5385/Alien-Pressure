/** Синтезированные звуки (WebAudio) — без файлов. Контекст создаётся лениво, после первого клика. */
export type Sfx = 'throw' | 'grenade' | 'shot' | 'alienShot' | 'hit' | 'miss' | 'psi' | 'death' | 'panic' | 'reload' | 'click';

const KEY = 'alien-pressure:mute';
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
}

function ac(): AudioContext | null {
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
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
  f.type = type; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

function tone(c: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sfx(kind: Sfx) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  switch (kind) {
    case 'shot': noise(c, t, 0.05, 0.55, 'highpass', 1200); noise(c, t, 0.14, 0.35, 'bandpass', 1800); tone(c, t, 0.12, 150, 45, 0.45); noise(c, t + 0.03, 0.4, 0.12, 'lowpass', 500); break;
    case 'throw': noise(c, t, 0.25, 0.12, 'bandpass', 900); break;
    case 'grenade': noise(c, t, 0.9, 0.7, 'lowpass', 350); tone(c, t, 0.7, 90, 28, 0.6); noise(c, t, 0.15, 0.5, 'bandpass', 2000); break;
    case 'alienShot': tone(c, t, 0.2, 1000, 220, 0.14, 'sawtooth'); noise(c, t, 0.06, 0.12, 'highpass', 3000); break;
    case 'hit': noise(c, t, 0.1, 0.35, 'lowpass', 700); break;
    case 'miss': tone(c, t, 0.14, 2600, 1100, 0.08); break;
    case 'psi': tone(c, t, 0.6, 200, 480, 0.18); tone(c, t, 0.6, 300, 360, 0.1, 'triangle'); break;
    case 'death': tone(c, t, 0.55, 320, 60, 0.25, 'triangle'); break;
    case 'panic': tone(c, t, 0.14, 440, 440, 0.1, 'square'); tone(c, t + 0.16, 0.14, 330, 330, 0.1, 'square'); break;
    case 'reload': noise(c, t, 0.04, 0.25, 'highpass', 2000); noise(c, t + 0.14, 0.05, 0.3, 'highpass', 1500); break;
    case 'click': noise(c, t, 0.03, 0.15, 'highpass', 2500); break;
  }
}
