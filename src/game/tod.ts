// Смена дня и ночи: время суток 0..1 (0 — полночь, 0.25 — рассвет, 0.5 — полдень, 0.75 — закат).
export const DAY_SECONDS = 480; // длина суток в секундах реального времени миссии

/** Насколько темно: 0 — день, 1 — глубокая ночь (плавно в сумерках). */
export function nightAmount(t: number): number {
  const d = Math.min(Math.abs(t - 0.5), 0.5) * 2; // 0 в полдень … 1 в полночь
  return Math.min(1, Math.max(0, (d - 0.42) / 0.38));
}
export const todLabel = (t: number) => nightAmount(t) > 0.6 ? '🌙 ніч' : t < 0.5 ? (nightAmount(t) > 0.1 ? '🌅 світанок' : '☀ день') : (nightAmount(t) > 0.1 ? '🌇 вечір' : '☀ день');
