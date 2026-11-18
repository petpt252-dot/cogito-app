import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { db } from '../core/storage';
import {
  ALL_RULES,
  CLASSIC_RULES,
  POSNER_ITI_MS,
  POSNER_LEVELS,
  POSNER_TRIALS,
  correctIsSame,
  genPosnerBlock,
  levelStep,
  posnerWindowMs,
  type PosnerRule,
} from '../core/posner';
import { mean, round } from '../core/stats';
import { realClock } from '../core/timer';
import { Stage } from './shared';
import { Button, Kbd, Toggle, cx, useKey } from '../ui/kit';
import { useAnswerKeys } from '../ui/answerKeys';
import { playErrorSound } from '../ui/feedbackSound';

// X1 Posner mixed-rule task (see core/posner.ts). Its level lives in its own store and changes within the block:
// - streak (PASAT-style, default): N correct in a row → level up, M errors in a row → level down;
// - normal: ≥ 91% over the block → level up at the end; 3 errors in a row → level down;
// - fixed: the chosen level is kept.
// Options and level persist between blocks and sessions.

export type Progression = 'streak' | 'normal' | 'fixed';
export interface PosnerOptions {
  progression: Progression;
  up: number;
  down: number;
  rules: PosnerRule[];
  ufov: boolean;
  inversion: boolean;
}
export interface PosnerState {
  level: number;
  best: number;
}
export const POSNER_OPTIONS_KEY = 'posnerOptions';
export const POSNER_STATE_KEY = 'posnerState';
export const DEFAULT_POSNER_OPTIONS: PosnerOptions = { progression: 'streak', up: 5, down: 3, rules: ALL_RULES, ufov: false, inversion: false };

/** Next level after one answer under streak/normal rules; returns the new level and streak counters. */
export function posnerAfterAnswer(level: number, ok: boolean, streak: { right: number; wrong: number }, o: Pick<PosnerOptions, 'progression' | 'up' | 'down'>) {
  let right = ok ? streak.right + 1 : 0;
  let wrong = ok ? 0 : streak.wrong + 1;
  let next = level;
  if (o.progression === 'streak') {
    if (right >= o.up) (next = levelStep(level, 'up')), (right = 0);
    if (wrong >= o.down) (next = levelStep(level, 'down')), (wrong = 0);
  } else if (o.progression === 'normal' && wrong >= 3) (next = levelStep(level, 'down')), (wrong = 0);
  return { level: next, streak: { right, wrong } };
}

export function PosnerMixed({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const keys = useAnswerKeys();
  const [opts, setOpts] = useState<PosnerOptions | null>(null);
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<'setup' | 'run'>('setup');
  useEffect(() => {
    Promise.all([db.kv<PosnerOptions>(POSNER_OPTIONS_KEY), db.kv<PosnerState>(POSNER_STATE_KEY)]).then(([o, s]) => {
      setOpts({ ...DEFAULT_POSNER_OPTIONS, ...(o ?? {}) });
      setLevel(s?.level ?? 1);
    });
  }, []);
  const saveOpts = (patch: Partial<PosnerOptions>) =>
    setOpts((prev) => {
      // functional update: two quick changes must not overwrite each other
      const next = { ...(prev as PosnerOptions), ...patch };
      db.setKv(POSNER_OPTIONS_KEY, next);
      return next;
    });

  if (!opts) return <div className="text-center text-dim">{t('common.loading')}</div>;
  if (phase === 'run') return <PosnerRun ctx={ctx} opts={opts} startLevel={level} onDone={onDone} keys={keys} />;

  const toggleRule = (r: PosnerRule) => saveOpts({ rules: opts.rules.includes(r) ? opts.rules.filter((x) => x !== r) : [...opts.rules, r] });
  return (
    <Stage
      title={t('ex.X1.name')}
      wide
      footer={
        <Button autoFocus disabled={!opts.rules.length} onClick={() => setPhase('run')}>
          {t('common.start')}
        </Button>
      }
    >
      <p className="mb-4 text-center text-sm text-white">{t('posner.setupIntro', { left: keys.left.toUpperCase(), right: keys.right.toUpperCase() })}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-dim">{t('posner.progression')}</div>
          <div className="flex flex-wrap gap-2">
            {(['streak', 'normal', 'fixed'] as Progression[]).map((p) => (
              <button key={p} type="button" onClick={() => saveOpts({ progression: p })} className={cx('rounded-lg border px-3 py-1.5 text-xs', opts.progression === p ? 'border-violet bg-violet/20 text-white' : 'border-line text-dim hover:text-white')}>
                {t(`posner.mode.${p}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-dim">{t(`posner.modeHint.${opts.progression}`, { up: opts.up, down: opts.down })}</p>
          {opts.progression === 'streak' && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink">
              {t('posner.upAfter')}
              <select value={opts.up} onChange={(e) => saveOpts({ up: Number(e.target.value) })} className="rounded border border-line bg-panel2 px-2 py-1 text-white">
                {[2, 3, 4, 5, 6, 7, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {t('posner.downAfter')}
              <select value={opts.down} onChange={(e) => saveOpts({ down: Number(e.target.value) })} className="rounded border border-line bg-panel2 px-2 py-1 text-white">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-3 text-xs text-ink">
            {t('posner.level')}
            <select
              value={level}
              onChange={(e) => {
                const l = Number(e.target.value);
                setLevel(l);
                db.kv<PosnerState>(POSNER_STATE_KEY).then((s) => db.setKv(POSNER_STATE_KEY, { level: l, best: Math.max(s?.best ?? 1, 1) }));
              }}
              className="rounded border border-line bg-panel2 px-2 py-1 text-white"
            >
              {POSNER_LEVELS.map((l) => <option key={l} value={l}>{l} · {posnerWindowMs(l)} ms</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3 text-xs text-ink">
            {t('posner.ufov')}
            <Toggle checked={opts.ufov} onChange={(ufov) => saveOpts({ ufov })} label={t('posner.ufov')} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-ink">
            {t('posner.inversion')}
            <Toggle checked={opts.inversion} onChange={(inversion) => saveOpts({ inversion })} label={t('posner.inversion')} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-dim">
            {t('posner.rules')}
            <span className="flex gap-2 normal-case tracking-normal">
              <button type="button" className="text-dim hover:text-white" onClick={() => saveOpts({ rules: CLASSIC_RULES })}>{t('posner.classicOnly')}</button>
              <button type="button" className="text-dim hover:text-white" onClick={() => saveOpts({ rules: ALL_RULES })}>{t('posner.all')}</button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_RULES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel2/50 px-2 py-1.5 text-xs text-white">
                <input type="checkbox" className="accent-violet" checked={opts.rules.includes(r)} onChange={() => toggleRule(r)} />
                <span>
                  {t(`posner.rule.${r}`)}
                  <span className="block text-[10px] text-dim">{t(`posner.ruleHint.${r}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Stage>
  );
}

function PosnerRun({ ctx, opts, startLevel, onDone, keys }: ExProps & { opts: PosnerOptions; startLevel: number; keys: { left: string; right: string } }) {
  const { t } = useI18n();
  const trials = useMemo(() => genPosnerBlock(ctx.seed, opts.rules, ctx.lang, opts.inversion), [ctx.seed]);
  const [i, setI] = useState(-1);
  const [level, setLevelState] = useState(startLevel);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const levelRef = useRef(startLevel);
  const peak = useRef(startLevel);
  const streak = useRef({ right: 0, wrong: 0 });
  const onset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const results = useRef<{ ok: boolean; rt: number | null; switched: boolean; inverted: boolean }[]>([]);
  const pos = useRef<{ l: number; r: number; top: number }>({ l: 0, r: 0, top: 0 });

  const setLevel = (l: number) => {
    levelRef.current = l;
    peak.current = Math.max(peak.current, l);
    setLevelState(l);
  };

  const finish = async () => {
    const r = results.current;
    const acc = r.filter((x) => x.ok).length / r.length;
    if (opts.progression === 'normal' && acc >= 0.91) setLevel(levelStep(levelRef.current, 'up'));
    const prev = await db.kv<PosnerState>(POSNER_STATE_KEY);
    await db.setKv(POSNER_STATE_KEY, { level: levelRef.current, best: Math.max(prev?.best ?? 1, peak.current) });
    const rts = (xs: typeof r) => xs.filter((x) => x.ok && x.rt !== null).map((x) => x.rt as number);
    const sw = rts(r.filter((x) => x.switched));
    const rep = rts(r.filter((x) => !x.switched));
    onDone({
      accuracy: acc,
      metrics: {
        correct: r.filter((x) => x.ok).length,
        items: r.length,
        timeouts: r.filter((x) => x.rt === null).length,
        meanRtMs: rts(r).length ? Math.round(mean(rts(r))) : null,
        switchCostMs: sw.length && rep.length ? Math.round(mean(sw) - mean(rep)) : null,
        ...(opts.inversion ? { invertedAccuracy: round(r.filter((x) => x.inverted).length ? r.filter((x) => x.inverted && x.ok).length / r.filter((x) => x.inverted).length : 0) } : {}),
        startLevel: startLevel,
        endLevel: levelRef.current,
        peakLevel: peak.current,
      },
      conditionKey: `X1|${opts.progression}|rules=${[...opts.rules].sort().join('+')}|ufov=${opts.ufov ? 1 : 0}|inv=${opts.inversion ? 1 : 0}`,
      params: { posnerLevel: levelRef.current },
    });
  };

  const show = (k: number) => {
    timer.current = setTimeout(() => {
      if (k >= trials.length) return void finish();
      if (opts.ufov) pos.current = { l: Math.floor(Math.random() * 35) + 5, r: Math.floor(Math.random() * 35) + 55, top: Math.floor(Math.random() * 60) - 30 };
      setI(k);
      setFlash(null);
      onset.current = realClock.now();
      timer.current = setTimeout(() => record(k, null), posnerWindowMs(levelRef.current));
    }, POSNER_ITI_MS);
  };
  const record = (k: number, saidSame: boolean | null) => {
    if (k < 0 || results.current[k]) return;
    if (timer.current) clearTimeout(timer.current);
    const tr = trials[k];
    const rt = saidSame === null ? null : Math.round(realClock.now() - onset.current);
    // a key press after the window (a late timer) still counts as a timeout
    const late = rt !== null && rt > posnerWindowMs(levelRef.current);
    const ok = saidSame !== null && !late && saidSame === correctIsSame(tr);
    results.current[k] = { ok, rt: late ? null : rt, switched: k > 0 && trials[k - 1].rule !== tr.rule, inverted: tr.inverted };
    if (!ok && ctx.settings.errorSound) playErrorSound();
    setFlash(ok ? 'ok' : 'bad');
    if (opts.progression !== 'fixed') {
      const n = posnerAfterAnswer(levelRef.current, ok, streak.current, opts);
      streak.current = n.streak;
      if (n.level !== levelRef.current) setLevel(n.level);
    }
    setI(-1);
    show(k + 1);
  };
  useEffect(() => {
    show(0);
    return () => void (timer.current && clearTimeout(timer.current));
  }, []);
  useKey([keys.left, keys.right], (e) => record(i, e.key.toLowerCase() === keys.left), i >= 0);

  const tr = i >= 0 ? trials[i] : null;
  const stim = (txt: string, side: 'l' | 'r') => (
    <div
      className={cx('max-w-[46%] break-words text-center font-mono text-xl font-semibold sm:min-w-[7rem] sm:text-4xl', tr?.inverted ? 'text-bad' : 'text-white', opts.ufov && 'absolute')}
      style={opts.ufov ? { left: `${side === 'l' ? pos.current.l : pos.current.r}%`, top: `calc(50% + ${pos.current.top}px)`, transform: 'translate(-50%, -50%)' } : undefined}
    >
      {txt}
    </div>
  );
  return (
    <Stage title={`${t('ex.X1.name')} · ${Math.max(1, i + 1)} / ${trials.length} · ${t('posner.levelShort')} ${level} (${posnerWindowMs(level)} ms)`} wide>
      <div className="mb-2 h-6 text-center text-sm uppercase tracking-widest text-volt">
        {tr && (
          <>
            {t('posner.ruleCue')}: {t(`posner.rule.${tr.rule}`)}
            {tr.inverted && <span className="ml-2 text-bad">({t('posner.inverted')})</span>}
          </>
        )}
      </div>
      <div className={cx('relative flex min-h-[180px] items-center justify-center gap-4 rounded-2xl border transition sm:gap-16', flash === 'ok' ? 'border-ok/50' : flash === 'bad' ? 'border-bad/60' : 'border-transparent')}>
        {tr ? (
          <>
            {stim(tr.left, 'l')}
            {stim(tr.right, 'r')}
          </>
        ) : (
          <span className="text-2xl text-line">+</span>
        )}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Button variant="ghost" className="py-3" onPointerDown={() => record(i, true)} onClick={(e) => e.detail === 0 && record(i, true)}>
          <Kbd>{keys.left.toUpperCase()}</Kbd> {t('speed.same')}
        </Button>
        <Button variant="ghost" className="py-3" onPointerDown={() => record(i, false)} onClick={(e) => e.detail === 0 && record(i, false)}>
          {t('speed.different')} <Kbd>{keys.right.toUpperCase()}</Kbd>
        </Button>
      </div>
      <p className="mt-3 text-center text-[11px] text-dim">{t('posner.trialsNote', { n: POSNER_TRIALS })}</p>
    </Stage>
  );
}
