import type { SessionRecord } from './types';

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Days in a row with a completed session. A streak is still alive today if the last training day was yesterday
 * (today's session may not have been done yet); `today` says whether today already counts.
 */
export function dayStreak(sessions: Pick<SessionRecord, 'completed' | 'startedAt'>[], now = Date.now()): { days: number; today: boolean } {
  const days = new Set(sessions.filter((s) => s.completed).map((s) => dayKey(s.startedAt)));
  const back = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return dayKey(d.getTime());
  };
  const today = days.has(back(0));
  let n = 0;
  for (let i = today ? 0 : 1; days.has(back(i)); i++) n++;
  return { days: n, today };
}
