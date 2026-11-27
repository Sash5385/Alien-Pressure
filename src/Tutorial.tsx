import { useEffect, useRef, useState } from 'react';
import type { GameState } from './game/types';
import { INK } from './ui';

const KEY = 'ap_tut_done';
export const tutorialDone = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* */ } };
const finish = () => { try { localStorage.setItem(KEY, '1'); } catch { /* */ } };

type Step = { text: string; done?: (s: GameState, base: Base) => boolean };
interface Base { pos: string; ammo: number; turn: number; paused: boolean }
const humans = (s: GameState) => s.units.filter(u => u.team === 'human' && u.hp > 0);
const snap = (s: GameState): Base => ({ pos: humans(s).map(u => `${u.x},${u.y}`).join(';'), ammo: humans(s).reduce((a, u) => a + u.ammo + u.mags * 100, 0), turn: s.turnNo, paused: !!s.rt?.paused });

/** Навчання в першій місії: покрокові підказки, кожна закривається сама, щойно гравець зробив дію. */
export function Tutorial({ s, narrow, force }: { s: GameState; narrow: boolean; force?: boolean }) {
  const [on, setOn] = useState(() => !tutorialDone() && (s.missionNo <= 1 || !!force));
  const [i, setI] = useState(0);
  const base = useRef<Base>(snap(s));
  const rt = !!s.rt;
  const steps: Step[] = [
    { text: 'Тапни свого бійця, щоб вибрати його. Вибраний підсвічується, а внизу з’являються його дії.', done: x => x.selectedId != null },
    { text: 'Тапни клітинку, куди йти. Щит біля клітинки — укриття: за повним укриттям влучити у бійця значно важче.', done: (x, b) => snap(x).pos !== b.pos },
    { text: 'Бачиш ворога? Тапни його, потім кнопку ВОГОНЬ. Відсоток на кнопці — шанс влучити. Ближче й із флангу — вищий.', done: (x, b) => snap(x).ammo < b.ammo },
    { text: 'Засідка 👁: боєць сам вистрілить у ворога, що рухається в полі зору. Ставити її варто наприкінці ходу.' },
    rt
      ? { text: 'Реальний час: кнопка II ставить паузу. У паузі можна спокійно віддати накази всім бійцям.', done: (x, b) => !!x.rt?.paused !== b.paused }
      : { text: 'Коли всі походили, тисни «Кінець ходу» — далі ходять пришельці.', done: (x, b) => x.turnNo > b.turn },
    { text: 'Готово! Решту дій знайдеш у меню 🎒 (інвентар) і 📣 (накази). Навчання можна повторити в ⚙. Удачі!' },
  ];
  useEffect(() => { // перевірка виконання кроку: стан гри змінюється без перерендеру цього компонента
    if (!on) return;
    const t = setInterval(() => { const d = steps[i]?.done; if (d && d(s, base.current)) next(); }, 400);
    return () => clearInterval(t);
  });
  const next = () => { base.current = snap(s); if (i + 1 >= steps.length) { finish(); setOn(false); } else setI(i + 1); };
  const skip = () => { finish(); setOn(false); };
  if (!on) return null;
  const last = i === steps.length - 1;
  return (
    <div role="dialog" aria-label="Навчання" style={{ position: 'fixed', left: '50%', top: narrow ? 164 : 86, transform: 'translateX(-50%)', zIndex: 30, width: narrow ? 'calc(100vw - 24px)' : 440, background: '#fff', color: INK, border: `4px solid ${INK}`, borderRadius: 14, boxShadow: `0 5px 0 ${INK}`, padding: '10px 12px', display: 'grid', gap: 8, fontFamily: "'Onest',system-ui,sans-serif", pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#4a5a7a' }}>
        <span>Навчання · {i + 1}/{steps.length}</span>
        {!last && <button onClick={skip} style={{ border: 0, background: 'none', color: '#4a5a7a', font: 'inherit', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Пропустити</button>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{steps[i].text}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        <button onClick={next} style={{ border: `3px solid ${INK}`, borderRadius: 10, background: '#ffe14d', color: INK, fontWeight: 800, padding: '7px 10px', font: 'inherit', cursor: 'pointer', boxShadow: `0 3px 0 ${INK}` }}>{last ? 'Зрозуміло' : steps[i].done ? 'Далі (або зроби дію)' : 'Далі'}</button>
      </div>
    </div>
  );
}
