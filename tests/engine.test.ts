import { describe, expect, it } from 'vitest';
import { adapt, initialState, paramsFor } from '../src/core/adaptive';
import { LEVELS, paramDiff } from '../src/core/levels';
import { createProbe, dueProbes, isDue, overnightCopies, overnightDueAt, retention, spacedSchedule, DAY, MINUTE } from '../src/core/scheduler';
import { countdown, runSequence, type Clock } from '../src/core/timer';
import { buildPlan, cycleProgress, PROBE_SOURCES, programDay, rotate, slotMinutes, PROGRAM } from '../src/core/protocol';
import { chooseForm, reassessmentDue } from '../src/core/assessmentPlan';
import { DEFAULT_SETTINGS, type ExerciseId } from '../src/core/types';

const T = DEFAULT_SETTINGS.thresholds;

describe('adaptive difficulty', () => {
  it('increases after two comparable blocks ≥ 85%', () => {
    let s = initialState('A1');
    let r = adapt(s, 0.9, T);
    expect(r.decision).toBe('hold');
    r = adapt(r.state, 0.86, T);
    expect(r.decision).toBe('up');
    expect(r.state.level).toBe(2);
    expect(r.state.history).toEqual([]); // blocks at a new level start fresh
  });

  it('decreases after two blocks < 60%, never below 1', () => {
    let s = { ...initialState('B1'), level: 3 };
    s = adapt(s, 0.5, T).state;
    const r = adapt(s, 0.4, T);
    expect(r).toMatchObject({ decision: 'down' });
    expect(r.state.level).toBe(2);
    let one = initialState('B1');
    one = adapt(one, 0.1, T).state;
    expect(adapt(one, 0.1, T).state.level).toBe(1);
  });

  it('uses the two-block average, so small sets need not be perfect twice (4 pairs: 4/4 then 3/4 → up)', () => {
    let s = initialState('B1');
    s = adapt(s, 1, T).state;
    expect(adapt(s, 0.75, T)).toMatchObject({ decision: 'up' });
    let d = { ...initialState('B1'), level: 2 };
    d = adapt(d, 0.5, T).state;
    expect(adapt(d, 0.75, T).decision).toBe('hold'); // mean 62.5% ≥ 60%
  });

  it('holds for 60–84%, and for mixed blocks', () => {
    let s = initialState('C1');
    s = adapt(s, 0.7, T).state;
    expect(adapt(s, 0.8, T).decision).toBe('hold');
    s = adapt(initialState('C1'), 0.95, T).state;
    expect(adapt(s, 0.5, T).decision).toBe('hold');
  });

  it('respects the maximum level and configurable thresholds', () => {
    const max = LEVELS.E4.length;
    let s = { ...initialState('E4'), level: max };
    s = adapt(s, 1, T).state;
    expect(adapt(s, 1, T).state.level).toBe(max);
    const strict = { up: 0.95, down: 0.3, blocks: 3 };
    let u = initialState('A1');
    u = adapt(u, 0.9, strict).state;
    u = adapt(u, 0.9, strict).state;
    expect(adapt(u, 0.9, strict).decision).toBe('hold');
  });

  it('adapts each exercise / condition independently', () => {
    const a = adapt(adapt(initialState('E1:forward'), 1, T).state, 1, T).state;
    const b = initialState('E1:backward');
    expect(a.level).toBe(2);
    expect(b.level).toBe(1);
    expect(adapt(adapt({ ...initialState('E1:backward'), level: 6 }, 1, T).state, 1, T).state.level).toBe(7);
  });

  it('every level table changes exactly one parameter between adjacent levels', () => {
    for (const [id, table] of Object.entries(LEVELS)) {
      for (let i = 1; i < table.length; i++) expect(paramDiff(table[i - 1], table[i]), `${id} level ${i}→${i + 1}`).toBe(1);
    }
  });

  it('A1 spans 10–40 words; C1 covers grids 3×3 to 6×6', () => {
    expect(paramsFor('A1', 1).items).toBe(10);
    expect(paramsFor('A1', 99).items).toBe(40);
    expect(new Set(LEVELS.C1.map((l) => l.size))).toEqual(new Set([3, 4, 5, 6]));
  });
});

describe('delayed recall scheduling', () => {
  const base = { id: 'p', exerciseId: 'A1' as ExerciseId, kind: 'wordList' as const, sourceTrialId: 't', payload: {}, lang: 'en' as const };
  it('a probe becomes due after its delay', () => {
    const p = createProbe({ ...base, delayMs: 10 * MINUTE, now: 1000 });
    expect(isDue(p, 1000 + 9 * MINUTE)).toBe(false);
    expect(isDue(p, 1000 + 10 * MINUTE)).toBe(true);
    expect(isDue({ ...p, done: true }, 1e15)).toBe(false);
  });
  it('filters by session and sorts oldest first', () => {
    const a = createProbe({ ...base, id: 'a', delayMs: 0, now: 50, sessionId: 's1' });
    const b = createProbe({ ...base, id: 'b', delayMs: 0, now: 10, sessionId: 's1' });
    const c = createProbe({ ...base, id: 'c', delayMs: 0, now: 5, sessionId: 's2' });
    expect(dueProbes([a, b, c], 100, 's1').map((p) => p.id)).toEqual(['b', 'a']);
  });
  it('spaced retrieval uses expanding 1/3/7-day intervals', () => {
    expect(spacedSchedule(0)).toEqual([DAY, 3 * DAY, 7 * DAY]);
  });
  it('overnight recall is due next morning and never less than 8 h later', () => {
    const evening = new Date(2026, 9, 25, 21, 0).getTime();
    expect(overnightDueAt(evening)).toBe(new Date(2026, 9, 26, 5, 0).getTime());
    const lateNight = new Date(2026, 9, 25, 23, 30).getTime();
    expect(overnightDueAt(lateNight)).toBe(lateNight + 8 * 60 * MINUTE);
  });
  it('overnight copies are new, unscheduled-by-session, flagged probes; spaced reviews are excluded', () => {
    const src = [
      createProbe({ ...base, id: 'w', delayMs: 0, now: 1, sessionId: 's1' }),
      createProbe({ ...base, id: 'x', kind: 'spaced', delayMs: 0, now: 1, sessionId: 's1' }),
    ];
    let n = 0;
    const copies = overnightCopies(src, () => `n${n++}`, 1000);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ id: 'n0', overnight: true, done: false, sessionId: undefined, payload: src[0].payload });
    expect(copies[0].dueAt).toBe(overnightDueAt(1000));
  });
  it('retention ratio', () => {
    expect(retention(10, 8)).toBe(0.8);
    expect(retention(0, 3)).toBeNull();
  });
});

function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      timers.push({ at: now + ms, fn, id: ++id });
      return id;
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  /** Advance time; each timer fires `lateness` ms late to simulate a busy event loop. */
  const advance = (ms: number, lateness = 0) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at + lateness > end) break;
      timers.shift();
      now = t.at + lateness;
      t.fn();
    }
    now = end;
  };
  return { clock, advance };
}

describe('timers', () => {
  it('runSequence schedules against absolute targets, so lateness does not accumulate', () => {
    const { clock, advance } = fakeClock();
    const steps: number[] = [];
    let done = false;
    const seq = runSequence([100, 100, 100, 100, 100], (i) => steps.push(i), () => (done = true), clock);
    advance(1000, 7); // every callback 7 ms late
    expect(steps).toEqual([0, 1, 2, 3, 4]);
    expect(done).toBe(true);
    // onsets stay within one lateness of the ideal schedule instead of drifting by 7 ms per step
    seq.onsets.forEach((o, i) => expect(Math.abs(o - i * 100)).toBeLessThanOrEqual(7));
  });

  it('runSequence can be cancelled', () => {
    const { clock, advance } = fakeClock();
    const steps: number[] = [];
    const seq = runSequence([100, 100, 100], (i) => steps.push(i), () => steps.push(-1), clock);
    advance(150);
    seq.cancel();
    advance(1000);
    expect(steps).toEqual([0, 1]);
  });

  it('countdown reports remaining time and finishes once', () => {
    const { clock, advance } = fakeClock();
    const ticks: number[] = [];
    let finished = 0;
    countdown(1000, (r) => ticks.push(r), () => finished++, clock, 250);
    advance(2000);
    expect(ticks[0]).toBe(1000);
    expect(ticks[ticks.length - 1]).toBe(0);
    expect(finished).toBe(1);
  });
});

describe('session protocol', () => {
  it('15-minute default = 4/4/4/3', () => {
    expect(slotMinutes(15, false)).toMatchObject({ verbal: 4, visual: 4, associative: 4, delayed: 3, working: 0 });
  });
  it('scales for other lengths and keeps the total', () => {
    for (const m of [10, 20, 30, 25]) {
      const s = slotMinutes(m, false);
      expect(Math.abs(s.verbal + s.visual + s.associative + s.delayed - m)).toBeLessThanOrEqual(1);
    }
  });
  it('rotates to the least recently used exercise', () => {
    expect(rotate(['A1', 'A2', 'A3'], ['A1', 'A2'], 'x')).toBe('A3');
    expect(rotate(['A1', 'A2', 'A3'], ['A3', 'A2', 'A1'], 'x')).toBe('A3');
  });
  it('always includes a delayed-recall source when delayed recall is on', () => {
    for (const recent of [[], ['A1', 'A2'], ['A2', 'A1'], ['A1', 'A2', 'B1', 'D1']] as ExerciseId[][]) {
      const plan = buildPlan({ minutes: 15, includeWorking: false, recent, seed: 'seed', delayed: true });
      expect(plan.map((p) => p.kind)).toEqual(['verbal', 'visual', 'associative', 'delayed']);
      expect(plan.some((p) => p.exerciseId && PROBE_SOURCES.includes(p.exerciseId))).toBe(true);
    }
  });
  it('keeps working memory as a separate optional slot', () => {
    const plan = buildPlan({ minutes: 15, includeWorking: true, recent: [], seed: 's', delayed: true });
    const wm = plan.find((p) => p.kind === 'working');
    expect(wm?.exerciseId?.startsWith('E')).toBe(true);
    expect(plan.filter((p) => p.kind !== 'working').every((p) => !p.exerciseId?.startsWith('E'))).toBe(true);
  });
  it('30-session programme with reassessment every 10 sessions', () => {
    expect(PROGRAM).toHaveLength(30);
    expect(PROGRAM.filter((d) => d.reassessAfter).map((d) => d.day)).toEqual([10, 20, 30]);
    expect(programDay(1).strategy).toBe('imagery');
    expect(programDay(9).strategy).toBe('retrieval');
  });
  it('the programme continues after 30 sessions in further 30-session cycles', () => {
    expect(programDay(30)).toMatchObject({ cycle: 1, dayInCycle: 30, cycleEnd: true, reassessAfter: true });
    expect(programDay(31)).toMatchObject({ day: 31, cycle: 2, dayInCycle: 1, cycleEnd: false, phase: 3 });
    expect(programDay(60)).toMatchObject({ cycle: 2, dayInCycle: 30, cycleEnd: true, reassessAfter: true });
    expect(programDay(125)).toMatchObject({ cycle: 5, dayInCycle: 5 });
    // strategies keep rotating; reassessment stays every 10 sessions
    expect(new Set(Array.from({ length: 10 }, (_, i) => programDay(31 + i).strategy)).size).toBe(5);
    expect([40, 50, 70].every((d) => programDay(d).reassessAfter)).toBe(true);
  });
  it('cycle progress for the sidebar and dashboard', () => {
    expect(cycleProgress(0)).toEqual({ cycle: 1, done: 0 });
    expect(cycleProgress(29)).toEqual({ cycle: 1, done: 29 });
    expect(cycleProgress(30)).toEqual({ cycle: 2, done: 0 });
    expect(cycleProgress(47)).toEqual({ cycle: 2, done: 17 });
  });
});

describe('assessment forms and exposure control', () => {
  it('uses each alternate form before reusing any', () => {
    const hist: { form: number; startedAt: number; completed: boolean }[] = [];
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c = chooseForm(hist, i * 100 * DAY);
      seen.push(c.form);
      expect(c.reuseWarning).toBe(false);
      hist.push({ form: c.form, startedAt: i * 100 * DAY, completed: true });
    }
    expect(new Set(seen).size).toBe(4);
  });
  it('reuses the least recently used form, warning if too recent', () => {
    const hist = [0, 1, 2, 3].map((f) => ({ form: f, startedAt: f * DAY, completed: true }));
    expect(chooseForm(hist, 10 * DAY)).toEqual({ form: 0, reuseWarning: true });
    expect(chooseForm(hist, 400 * DAY)).toEqual({ form: 0, reuseWarning: false });
  });
  it('an incomplete assessment still reserves its form (its first list was already studied)', () => {
    expect(chooseForm([{ form: 0, startedAt: 0, completed: false }]).form).toBe(1);
  });
  it('baseline first, then every 10 sessions', () => {
    expect(reassessmentDue(0, [])).toBe(true);
    expect(reassessmentDue(9, [{ sessionIndex: 0, completed: true, kind: 'baseline' }])).toBe(false);
    expect(reassessmentDue(10, [{ sessionIndex: 0, completed: true, kind: 'baseline' }])).toBe(true);
    // transfer tests do not count as the baseline / reassessment
    expect(reassessmentDue(3, [{ sessionIndex: 0, completed: true, kind: 'transfer' }])).toBe(true);
  });
});
