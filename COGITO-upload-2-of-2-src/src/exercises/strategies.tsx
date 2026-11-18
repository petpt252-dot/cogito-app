import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExOutcome } from './types';
import type { StrategyId, TrialResult } from '../core/types';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { db, uid } from '../core/storage';
import { genPairs, genWordList } from '../core/generate';
import { createRng, newSessionSeed } from '../core/rng';
import { LEXICON, wordItem, wordText } from '../content';
import { encodingEfficiency, scoreCuedRecall, scoreFreeRecall } from '../core/scoring';
import { createProbe, spacedSchedule } from '../core/scheduler';
import { round } from '../core/stats';
import { FreeRecall, Stage, useStopwatch } from './shared';
import { CuedRecall, PairStudy, type Pair } from './associative';
import { Feedback, IntroScreen } from './runner';
import { Button, Kbd, useKey } from '../ui/kit';

// Guided practice for strategies that need their own procedure (F2 elaboration, F4 loci, F5 retrieval).
// F1 imagery and F3 clustering reuse the B1 and A2 exercises with a strategy prompt (see StrategyPage).

async function saveStrategyTrial(strategy: StrategyId, seed: string, lang: 'en' | 'pt', startedAt: number, o: ExOutcome, exerciseId: 'A1' | 'B1') {
  const trial: TrialResult = {
    id: uid('t_'),
    exerciseId: 'F',
    domain: exerciseId === 'A1' ? 'verbal' : 'associative',
    mode: 'strategy',
    seed,
    lang,
    startedAt,
    endedAt: Date.now(),
    level: 0,
    params: { strategy, base: exerciseId },
    accuracy: o.accuracy,
    metrics: o.metrics,
    conditionKey: o.conditionKey,
    encodingMs: o.encodingMs,
    strategy,
    itemIds: o.itemIds,
    detail: o.detail,
  };
  await db.saveTrial(trial);
  return trial;
}

/** F2 Elaborative encoding: self-paced study, writing a personal link for each word, then free recall. */
export function ElaborationPractice({ onExit, recent = [] }: { onExit: () => void; recent?: string[] }) {
  const { settings, bump } = useApp();
  const { t, lang: uiLang } = useI18n();
  const [seed] = useState(() => 'F2:' + newSessionSeed());
  const lang = useRef(uiLang).current;
  const ids = useMemo(() => genWordList(seed, 8, recent).ids, [seed]);
  const [phase, setPhase] = useState<'intro' | 'study' | 'recall' | 'done'>('intro');
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState<string[]>(() => ids.map(() => ''));
  const [outcome, setOutcome] = useState<ExOutcome | null>(null);
  const sw = useStopwatch();
  const startedAt = useRef(Date.now());
  const encMs = useRef(0);

  if (phase === 'intro')
    return <IntroScreen title={t('strategies.elaboration.name')} instructions={t('strategies.elaboration.what')} strategyNote={t('strategies.elaboration.prompt')} onStart={() => (sw.reset(), setPhase('study'))} onExit={onExit} />;
  if (phase === 'study') {
    const next = () => {
      if (i + 1 < ids.length) setI(i + 1);
      else {
        encMs.current = sw.elapsed();
        setPhase('recall');
      }
    };
    return (
      <Stage title={`${t('common.memorize')} · ${i + 1} / ${ids.length}`} footer={<Button onClick={next}>{t('common.next')} <Kbd>Enter</Kbd></Button>}>
        <div className="mb-4 text-center text-4xl font-semibold text-white">{wordText(ids[i], lang)}</div>
        <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
          key={i}
          autoFocus
          value={notes[i]}
          onChange={(e) => setNotes(notes.map((n, j) => (j === i ? e.target.value : n)))}
          onKeyDown={(e) => e.key === 'Enter' && next()}
          placeholder={t('strategies.elaboration.prompt')}
          className="w-full rounded-xl border border-line bg-void/60 px-4 py-3 text-white focus:border-violet focus:outline-none"
        />
      </Stage>
    );
  }
  if (phase === 'recall')
    return (
      <FreeRecall
        onSubmit={async (entries) => {
          const s = scoreFreeRecall(ids.map(wordItem), entries, settings.typoTolerance, LEXICON);
          const eff = encodingEfficiency(s.correct, encMs.current);
          const o: ExOutcome = {
            accuracy: s.accuracy,
            metrics: { studied: s.studied, correct: s.correct, omissions: s.omissions, intrusions: s.intrusions, efficiency: eff === null ? null : round(eff) },
            conditionKey: `F2-elaboration|n=${ids.length}|selfpaced`,
            encodingMs: encMs.current,
            itemIds: ids,
            detail: { notes, entries },
          };
          await saveStrategyTrial('elaboration', seed, lang, startedAt.current, o, 'A1');
          bump();
          setOutcome(o);
          setPhase('done');
        }}
      />
    );
  return <Feedback outcome={outcome!} onFinish={onExit} />;
}

const LOCI_KEY = 'loci';

/** F4 Method of loci: user-defined route, one word per locus, cued recall by locus. */
export function LociPractice({ onExit, recent = [] }: { onExit: () => void; recent?: string[] }) {
  const { settings, bump } = useApp();
  const { t, lang: uiLang } = useI18n();
  const [seed] = useState(() => 'F4:' + newSessionSeed());
  const lang = useRef(uiLang).current;
  const [loci, setLoci] = useState<string[]>(['', '', '', '', '', '']);
  const [phase, setPhase] = useState<'setup' | 'study' | 'recall' | 'done'>('setup');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<string[]>(['', '', '', '', '', '']);
  const [outcome, setOutcome] = useState<ExOutcome | null>(null);
  const ids = useMemo(() => genWordList(seed, 6, recent).ids, [seed]);
  const sw = useStopwatch();
  const encMs = useRef(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    db.kv<string[]>(LOCI_KEY).then((v) => v && setLoci(v));
  }, []);

  if (phase === 'setup')
    return (
      <Stage
        title={t('strategies.loci.name')}
        footer={
          <>
            <Button variant="ghost" onClick={onExit}>{t('app.back')}</Button>
            <Button
              disabled={loci.some((l) => !l.trim())}
              onClick={() => {
                db.setKv(LOCI_KEY, loci);
                sw.reset();
                setPhase('study');
              }}
            >
              {t('common.start')}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-center text-sm text-ink">{t('strategies.loci.what')}</p>
        <p className="mb-4 text-center text-xs text-dim">{t('strategies.loci.setup')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {loci.map((l, k) => (
            <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
              key={k}
              value={l}
              placeholder={t('strategies.loci.locus', { n: k + 1 })}
              onChange={(e) => setLoci(loci.map((x, j) => (j === k ? e.target.value : x)))}
              className="rounded-xl border border-line bg-void/60 px-4 py-2 text-white focus:border-violet focus:outline-none"
            />
          ))}
        </div>
      </Stage>
    );
  if (phase === 'study') {
    const next = () => {
      if (i + 1 < ids.length) setI(i + 1);
      else {
        encMs.current = sw.elapsed();
        setPhase('recall');
      }
    };
    return <LociStep key={i} text={t('strategies.loci.place', { word: wordText(ids[i], lang), locus: loci[i] })} progress={`${i + 1} / ${ids.length}`} onNext={next} />;
  }
  if (phase === 'recall') {
    const submit = async () => {
      const s = scoreCuedRecall(ids.map(wordItem), answers, settings.typoTolerance, LEXICON);
      const o: ExOutcome = {
        accuracy: s.accuracy,
        metrics: { studied: ids.length, correct: s.correct, omissions: s.omissions, intrusions: s.intrusions },
        conditionKey: `F4-loci|n=${ids.length}|selfpaced`,
        encodingMs: encMs.current,
        itemIds: ids,
        review: [{ label: t('feedback.missed'), tone: 'warn', items: ids.flatMap((id, k) => (s.perItem[k] ? [] : [`${loci[k]}: ${wordText(id, lang)}`])) }],
      };
      await saveStrategyTrial('loci', seed, lang, startedAt.current, o, 'A1');
      bump();
      setOutcome(o);
      setPhase('done');
    };
    return (
      <Stage title={t('strategies.loci.recallPrompt')} footer={<Button onClick={submit}>{t('common.submit')}</Button>}>
        <div className="grid gap-2">
          {loci.map((l, k) => (
            <label key={k} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm text-dim">{l}</span>
              <input autoCapitalize="off" autoCorrect="off" spellCheck={false}
                autoFocus={k === 0}
                value={answers[k]}
                onChange={(e) => setAnswers(answers.map((x, j) => (j === k ? e.target.value : x)))}
                className="flex-1 rounded-xl border border-line bg-void/60 px-4 py-2 text-white focus:border-violet focus:outline-none"
              />
            </label>
          ))}
        </div>
      </Stage>
    );
  }
  return <Feedback outcome={outcome!} onFinish={onExit} />;
}

function LociStep({ text, progress, onNext }: { text: string; progress: string; onNext: () => void }) {
  const { t } = useI18n();
  useKey(['Enter'], onNext);
  return (
    <Stage title={progress} footer={<Button onClick={onNext} autoFocus>{t('common.next')} <Kbd>Enter</Kbd></Button>}>
      <p className="py-8 text-center text-2xl text-white">{text}</p>
    </Stage>
  );
}

/** F5 Retrieval practice: study once, then retrieval rounds with feedback until all correct; optional spaced reviews. */
export function RetrievalPractice({ onExit, recent = [] }: { onExit: () => void; recent?: string[] }) {
  const { settings, bump } = useApp();
  const { t, lang: uiLang } = useI18n();
  const [seed] = useState(() => 'F5:' + newSessionSeed());
  const lang = useRef(uiLang).current;
  const pairs = useMemo(() => genPairs(seed, 6, recent).pairs, [seed]);
  const [phase, setPhase] = useState<'intro' | 'study' | 'round' | 'roundFb' | 'done'>('intro');
  const [round_, setRound] = useState(1);
  const [remaining, setRemaining] = useState<Pair[]>(pairs);
  const [lastWrong, setLastWrong] = useState<Pair[]>([]);
  const firstRound = useRef<number | null>(null);
  // Pairs correct by the end of the rounds: the reference for later spaced reviews (may be < all after 6 rounds).
  const learned = useRef(0);
  const [scheduled, setScheduled] = useState(false);
  const [outcome, setOutcome] = useState<ExOutcome | null>(null);
  const startedAt = useRef(Date.now());
  const trialId = useRef<string | null>(null);

  if (phase === 'intro')
    return <IntroScreen title={t('strategies.retrieval.name')} instructions={t('strategies.retrieval.what')} strategyNote={t('strategies.retrieval.prompt')} onStart={() => setPhase('study')} onExit={onExit} />;
  if (phase === 'study') return <PairStudy pairs={pairs} ms={settings.secondsPerWord * 2000} lang={lang} onDone={() => setPhase('round')} />;
  if (phase === 'round') {
    const order = createRng(`${seed}:${round_}`).shuffle(remaining);
    return (
      <CuedRecall
        key={round_}
        pairs={order}
        lang={lang}
        title={t('strategies.retrieval.round', { n: round_ })}
        onDone={async (responses) => {
          const s = scoreCuedRecall(order.map((p) => wordItem(p.target)), responses, settings.typoTolerance, LEXICON);
          if (firstRound.current === null) firstRound.current = s.correct;
          const wrong = order.filter((_, k) => !s.perItem[k]);
          setLastWrong(wrong);
          if (!wrong.length || round_ >= 6) {
            learned.current = pairs.length - wrong.length;
            const o: ExOutcome = {
              accuracy: (firstRound.current ?? 0) / pairs.length,
              metrics: { studied: pairs.length, correct: firstRound.current, rounds: round_, learned: learned.current },
              conditionKey: `F5-retrieval|n=${pairs.length}`,
              itemIds: pairs.flatMap((p) => [p.cue, p.target]),
            };
            const tr = await saveStrategyTrial('retrieval', seed, lang, startedAt.current, o, 'B1');
            trialId.current = tr.id;
            bump();
            setOutcome(o);
            setPhase('done');
          } else {
            setRemaining(wrong);
            setPhase('roundFb');
          }
        }}
      />
    );
  }
  if (phase === 'roundFb')
    return (
      <Stage title={t('feedback.missed')} footer={<Button autoFocus onClick={() => (setRound(round_ + 1), setPhase('round'))}>{t('common.continue')}</Button>}>
        <div className="flex flex-col items-center gap-2">
          {lastWrong.map((p) => (
            <div key={p.cue} className="text-2xl text-white">
              {wordText(p.cue, lang)} <span className="text-violet">—</span> {wordText(p.target, lang)}
            </div>
          ))}
        </div>
      </Stage>
    );
  return (
    <div className="space-y-4">
      <Feedback outcome={outcome!} onFinish={onExit} />
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-sm text-dim">{t('strategies.retrieval.spaced')}</p>
        <Button
          variant="ghost"
          disabled={scheduled}
          onClick={async () => {
            const now = Date.now();
            for (const due of spacedSchedule(now)) {
              await db.saveProbe({ ...createProbe({ id: uid('p_'), exerciseId: 'B1', kind: 'spaced', sourceTrialId: trialId.current ?? '', payload: { pairs, immediateCorrect: learned.current }, lang, delayMs: due - now, now }) });
            }
            bump();
            setScheduled(true);
          }}
        >
          {scheduled ? t('settings.saved') : t('strategies.retrieval.scheduleSpaced')}
        </Button>
      </div>
    </div>
  );
}

