import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { useData } from '../useData';
import { dailySeed, planMinutes, programDay, sessionCompletion, type PlanSlot } from '../core/protocol';
import { planFor, sessionLabel } from '../ui/TodayCard';
import { createRng } from '../core/rng';
import { EXERCISES } from '../exercises/registry';
import { db, uid } from '../core/storage';
import { overnightCopies, overnightDueAt } from '../core/scheduler';
import type { DelayedProbe, ExerciseId, SessionRecord } from '../core/types';
import { ExerciseRunner, ProbeRunner } from '../exercises/runner';
import { Badge, Button, Card, H1, useCountdown } from '../ui/kit';
import { Stage } from '../exercises/shared';
import { faithfulParams } from '../core/faithful';
import { CalibrationNeeded, useCalibration } from './Calibration';
import { hardness, trialStairLevel } from '../core/stairProgress';
import { dayStreak } from '../core/streak';
import { carryMs, resumePoint, sessionAfterBlock, slotRemaining } from '../core/sessionProgress';
import { STAIRCASE_KEY, STAIRS, stairValue, type StairState } from '../core/staircase';

/** COGITO adaptive: how each task's level moved in this session (from the level it began at to where it ended). */
function LevelSummary({ session }: { session: SessionRecord }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<{ id: ExerciseId; from: number; to: number }[]>([]);
  useEffect(() => {
    db.trials().then((all) => {
      const mine = all.filter((x) => session.trialIds.includes(x.id)).sort((a, b) => a.startedAt - b.startedAt);
      const last = new Map<ExerciseId, number>();
      mine.forEach((x) => {
        const v = trialStairLevel(x);
        if (v !== undefined) last.set(x.exerciseId as ExerciseId, v);
      });
      setRows([...last].map(([id, to]) => ({ id, from: stairValue(id, session.stairStart ?? {}), to })));
    });
  }, [session.id]);
  if (!rows.length) return null;
  return (
    <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-line bg-void/50 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet">{t('session.levelsToday')}</div>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => {
          const h = hardness(r.id, r.to, r.from);
          const unit = t(`adaptive.unit.${STAIRS[r.id]!.unit}`);
          return (
            <li key={r.id} className="flex justify-between gap-3">
              <span className="text-ink">{t(`ex.${r.id}.name`)}</span>
              <span className="font-mono">
                <span className="text-dim">{r.from}</span> → <span className={h > 0.001 ? 'text-ok' : h < -0.001 ? 'text-warn' : 'text-white'}>{r.to}</span> <span className="text-xs text-dim">{unit}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-dim">{t('session.levelsTodayNote')}</p>
    </div>
  );
}

/** Time left in an exercise slot: only played blocks count, so it changes after each block. */
function SlotLeft({ ms }: { ms: number }) {
  const { t } = useI18n();
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return (
    <span className="font-mono text-xs text-dim">
      {t('session.slotLeft')}: {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

function SlotClock({ deadline }: { deadline: number }) {
  const { t } = useI18n();
  const ms = Math.max(0, deadline - Date.now());
  const remaining = useCountdown(ms, () => undefined);
  const s = Math.ceil(remaining / 1000);
  return (
    <span className="font-mono text-xs text-dim">
      {t('session.slotTime')}: {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

export function SessionPage() {
  const { settings, go, bump, focus } = useApp();
  const { t } = useI18n();
  const data = useData();
  const [seed, setSeed] = useState('');
  const [plan, setPlan] = useState<PlanSlot[] | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [slot, setSlot] = useState(0);
  const [deadline, setDeadline] = useState(0);
  /** Block time played in the current slot (ms). */
  const [slotUsed, setSlotUsed] = useState(0);
  const [probes, setProbes] = useState<DelayedProbe[] | null>(null);
  const [probeIdx, setProbeIdx] = useState(0);
  const [done, setDone] = useState(false);
  const sessionRef = useRef<SessionRecord | null>(null);
  // Plan slots whose minimum (time or blocks) was met, to decide whether the session really happened.
  const slotDone = useRef<boolean[]>([]);
  /** Set when an interrupted session is resumed: the slot it resumed in and the blocks already done there. */
  const [resumed, setResumed] = useState<{ slot: number; blocksDone: number; usedMs: number; at: number } | null>(null);
  const minutes = settings.sessionMinutes === 0 ? settings.customMinutes : settings.sessionMinutes;
  const completed = data.sessions.filter((s) => s.completed).length;
  // The session number is fixed when the session begins; data reloads after completion must not shift it.
  const [sessionNo, setSessionNo] = useState<number | null>(null);
  const day = programDay(sessionNo ?? completed + 1);
  // A started session keeps the protocol it was planned with (older sessions did not record it: use the setting).
  const protocol = session ? resumePoint(session, settings.protocol).protocol : settings.protocol;
  // Block-based when the plan has fixed blocks (COGITO/faithful with the study dose); a resumed plan decides itself.
  const blockBased = !!plan?.some((p) => p.blocks);
  const calibration = useCalibration();
  // A session left in progress in the last 24 h (page closed, phone locked…) can be resumed.
  const unfinished = data.sessions
    .filter((s) => !s.completed && !s.endedAt && s.plan?.length && Date.now() - s.startedAt < 86_400_000 && (s.slot ?? 0) < s.plan.length)
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  useEffect(() => {
    if (!data.loaded || plan) return;
    const s = dailySeed(data.sessions.length + 1);
    setSeed(s);
    setPlan(planFor(settings, data.trials, s));
  }, [data.loaded]);

  const save = async (patch: Partial<SessionRecord>) => {
    const next = { ...(sessionRef.current as SessionRecord), ...patch };
    sessionRef.current = next;
    setSession(next);
    await db.saveSession(next);
    bump();
  };

  // The plan and progress are saved with the session, so a session interrupted by closing the page (or the phone
  // locking) can be resumed on this device from the component it was in.
  const begin = async () => {
    if (unfinished) await db.saveSession({ ...unfinished, endedAt: Date.now(), partial: true });
    const stairStart = settings.protocol === 'adaptive' ? ((await db.kv<StairState>(STAIRCASE_KEY)) ?? {}) : undefined;
    const s: SessionRecord = {
      stairStart,
      id: uid('s_'),
      seed,
      startedAt: Date.now(),
      plannedMinutes: blockBased && plan ? planMinutes(plan) : minutes,
      programDay: completed + 1,
      trialIds: [],
      completed: false,
      plan: plan ?? undefined,
      slot: 0,
      slotDone: [],
      slotBlocks: [],
      slotUsedMs: [],
      protocol: settings.protocol,
    };
    setSessionNo(completed + 1);
    sessionRef.current = s;
    setSession(s);
    slotDone.current = [];
    await db.saveSession(s);
    startSlot(0);
  };

  const resume = async (rec: SessionRecord) => {
    const p = rec.plan as PlanSlot[];
    const s = rec.slot ?? 0;
    const { blocksDone, usedMs } = resumePoint(rec, settings.protocol);
    setResumed({ slot: s, blocksDone, usedMs, at: Date.now() });
    setPlan(p);
    setSeed(rec.seed);
    setSessionNo(rec.programDay ?? completed + 1);
    sessionRef.current = rec;
    setSession(rec);
    slotDone.current = rec.slotDone?.slice() ?? [];
    startSlot(s, p, usedMs);
  };

  const startSlot = async (i: number, p: PlanSlot[] | null = plan, usedMs = 0) => {
    if (!p) return;
    if (i >= p.length) {
      const c = sessionCompletion(p, slotDone.current);
      await save({ completed: c.counted, partial: !c.counted, endedAt: Date.now() });
      setDone(true);
      return;
    }
    setSlot(i);
    setDeadline(Date.now() + p[i].minutes * 60_000);
    setSlotUsed(usedMs);
    await save({ slot: i, slotDone: slotDone.current.slice() });
    if (p[i].kind === 'delayed') {
      const all = await db.probes();
      setProbes(all.filter((p) => p.sessionId === sessionRef.current?.id && !p.done).sort((a, b) => a.createdAt - b.createdAt));
      setProbeIdx(0);
    }
  };

  if (!plan || calibration === undefined) return <div className="text-dim">{t('common.loading')}</div>;
  // The faithful protocol needs the calibration pre-test first (fixed presentation times per person).
  if (protocol === 'faithful' && !calibration && !session) return <CalibrationNeeded />;

  if (done && session)
    return (
      <Stage title={session.completed ? t('session.complete') : t('session.partialTitle')} footer={<Button onClick={() => go({ name: 'dashboard' })}>{t('common.finish')}</Button>}>
        {!session.completed && (
          <p className="mb-4 rounded-xl border border-warn/50 bg-warn/10 p-3 text-center text-sm text-white">
            {t('session.partial', { done: sessionCompletion(plan, slotDone.current).done, total: sessionCompletion(plan, slotDone.current).total })}
          </p>
        )}
        <p className="text-center text-lg text-white">{t('session.summary', { n: session.trialIds.length, m: Math.max(1, Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 60000)) })}</p>
        {session.completed && day.cycleEnd && (
          <div className="mt-6 rounded-2xl border border-violet/50 bg-gradient-to-b from-violet/15 to-transparent p-5 text-center shadow-[0_0_30px_-10px_rgba(155,107,255,.8)]">
            <div className="font-display text-2xl font-semibold text-white">★ {t('session.cycleDone', { c: day.cycle })}</div>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink">{t('session.cycleDoneText', { n: day.day, next: day.cycle + 1 })}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={() => go({ name: 'dashboard' })}>{t('session.continueCycle', { next: day.cycle + 1 })}</Button>
            </div>
          </div>
        )}
        {session.completed && day.reassessAfter && (
          <div className="mt-5 text-center">
            <Button variant="ghost" onClick={() => go({ name: 'assessment' })}>{t('dashboard.runAssessment')}</Button>
          </div>
        )}
        {session.completed && (() => {
          const s = dayStreak([...data.sessions.filter((x) => x.id !== session.id), session]);
          return s.days > 0 ? <p className="mt-3 text-center text-lg font-semibold text-white">🔥 {t(s.days === 1 ? 'streak.day1' : 'streak.days', { n: s.days })}</p> : null;
        })()}
        <LevelSummary session={session} />
        <OvernightOffer sessionId={session.id} />
      </Stage>
    );

  if (!session)
    return (
      <div>
        <H1 sub={t('session.rotationNote')}>{t('session.title')}</H1>
        {unfinished && (
          <Card className="mx-auto mb-4 max-w-2xl border-volt/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-white">
                {t('session.resumeText', {
                  k: (unfinished.slot ?? 0) + 1,
                  n: unfinished.plan!.length,
                  when: new Date(unfinished.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
              <Button onClick={() => resume(unfinished)} autoFocus>
                {t('session.resume')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-dim">{t('session.resumeNote')}</p>
          </Card>
        )}
        <Card className="mx-auto max-w-2xl">
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="volt">{blockBased ? t('session.cogitoLength', { m: planMinutes(plan) }) : t('dashboard.sessionLength', { m: minutes })}</Badge>
            <Badge tone="dim">{t(`protocol.${protocol}`)}{protocol === 'hybrid' ? ` · ${t(`goal.${settings.goal}`)}` : ''}</Badge>
            <Badge>{sessionLabel(t, completed + 1)}</Badge>
          </div>
          <div className="mb-2 text-xs uppercase tracking-widest text-dim">{t('session.plan')}</div>
          <ol className="space-y-2">
            {plan.map((p, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl border border-line bg-panel2/50 px-4 py-3">
                <span className="text-sm text-white">
                  {t(`session.slot.${p.kind}`)}
                  {p.exerciseId && <span className="text-dim"> · {t(`ex.${p.exerciseId}.name`)}</span>}
                </span>
                <span className="font-mono text-xs text-dim">
                  {p.blocks ? `${t(p.blocks === 1 ? 'session.blockTarget1' : 'session.blocksTarget', { n: p.blocks })} · ≈ ` : ''}
                  {Number.isInteger(p.minutes * 2) ? p.minutes : p.minutes.toFixed(2)} {t('common.minutes')}
                </span>
              </li>
            ))}
          </ol>
            <p className="mt-4 rounded-xl border border-volt/30 bg-volt/5 p-3 text-sm text-volt">
            {t('dashboard.strategyTip')}: <b>{t(`strategies.${day.strategy}.name`)}</b> — {t(`strategies.${day.strategy}.prompt`)}
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => go({ name: 'dashboard' })}>{t('common.cancel')}</Button>
            <Button onClick={begin} autoFocus={!unfinished}>{unfinished ? t('session.beginNew') : t('session.begin')}</Button>
          </div>
        </Card>
      </div>
    );

  const cur = plan[slot];
  // Timed parts share the session's time: what earlier parts left over (or overran) moves to this one.
  const carry = cur.blocks || cur.kind === 'delayed' ? 0 : carryMs(plan, session.slotUsedMs ?? [], slot);
  return (
    <div>
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${focus ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-2 text-sm text-ink">
          <Badge tone="violet">
            {slot + 1} / {plan.length}
          </Badge>
          {t(`session.slot.${cur.kind}`)}
        </div>
        <div className="flex items-center gap-4">
          {cur.blocks ? <span className="font-mono text-xs text-dim">{t(cur.blocks === 1 ? 'session.blockTarget1' : 'session.blocksTarget', { n: cur.blocks })}</span> : cur.kind === 'delayed' ? <SlotClock key={slot} deadline={deadline} /> : <SlotLeft ms={cur.minutes * 60_000 + carry - slotUsed} />}
          <Button
            variant="danger"
            className="px-3 py-1 text-xs"
            onClick={async () => {
              await save({ endedAt: Date.now() });
              go({ name: 'dashboard' });
            }}
          >
            {t('session.abandon')}
          </Button>
        </div>
      </div>
      {cur.kind === 'delayed' ? (
        probes === null ? null : probeIdx < probes.length ? (
          <ProbeRunner
            key={probes[probeIdx].id}
            probe={probes[probeIdx]}
            onDone={async (tr) => {
              await save({ trialIds: [...(sessionRef.current?.trialIds ?? []), tr.id] });
              setProbeIdx(probeIdx + 1);
            }}
          />
        ) : (
          <Stage title={t('session.slot.delayed')} footer={<Button onClick={() => startSlot(slot + 1)} autoFocus>{t('common.continue')}</Button>}>
            <p className="text-center text-white">{probes.length ? t('session.reviewDone') : t('session.noProbes')}</p>
          </Stage>
        )
      ) : (
        <ExerciseRunner
          key={slot}
          exerciseId={cur.exerciseId as ExerciseId}
          mode="training"
          // after a resume, new block seeds so the blocks already done are not shown again
          seedBase={resumed?.slot === slot ? `${seed}:resume${resumed.at}` : seed}
          sessionId={session.id}
          variant={EXERCISES[cur.exerciseId as ExerciseId].variants ? createRng(seed + ':var').pick(EXERCISES[cur.exerciseId as ExerciseId].variants!).id : undefined}
          {...slotRemaining(cur, resumed?.slot === slot ? resumed : { blocksDone: 0, usedMs: 0 }, carry)}
          faithfulParams={protocol === 'faithful' && calibration ? faithfulParams(cur.exerciseId as ExerciseId, calibration) : undefined}
          staircase={protocol === 'adaptive'}
          autoStart={false}
          onTrial={(tr) => {
            // A retried save calls this again for the same block: it is counted once.
            const patch = sessionAfterBlock(sessionRef.current as SessionRecord, tr, slot);
            if (patch.slotUsedMs) setSlotUsed(patch.slotUsedMs[slot] ?? 0);
            return save(patch);
          }}
          onExit={(completed) => {
            slotDone.current[slot] = completed;
            startSlot(slot + 1);
          }}
        />
      )}
    </div>
  );
}

/** Strictly optional: offer to recall today's material tomorrow. Nothing is scheduled unless the user clicks. */
function OvernightOffer({ sessionId }: { sessionId: string }) {
  const { bump } = useApp();
  const { t } = useI18n();
  const [material, setMaterial] = useState<DelayedProbe[] | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  useEffect(() => {
    db.probes().then((all) => setMaterial(all.filter((p) => p.sessionId === sessionId && p.kind !== 'spaced')));
  }, [sessionId]);
  if (!material?.length) return null;
  return (
    <div className="mt-6 rounded-2xl border border-volt/40 bg-volt/5 p-4 text-center">
      <div className="text-sm font-semibold text-white">{t('overnight.title')}</div>
      <p className="mx-auto mt-1 max-w-md text-xs text-dim">{t('overnight.text', { n: material.length })}</p>
      {scheduled ? (
        <p className="mt-3 text-sm text-ok">✓ {t('overnight.scheduled', { time: new Date(scheduled).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
      ) : (
        <div className="mt-3 flex justify-center gap-2">
          <Button
            variant="ghost"
            onClick={async () => {
              const now = Date.now();
              for (const p of overnightCopies(material, () => uid('p_'), now)) await db.saveProbe(p);
              bump();
              setScheduled(overnightDueAt(now));
            }}
          >
            {t('overnight.schedule')}
          </Button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-dim">{t('overnight.optional')}</p>
    </div>
  );
}
