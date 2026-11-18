import { useMemo, useRef, useState } from 'react';
import type { ExProps } from './types';
import { useI18n } from '../i18n';
import { genGlyphSet, genPattern, genScene, genVisualSequence, SCENE_COLS, SCENE_ROWS, type Glyph, type SceneObject } from '../core/generate';
import { createRng } from '../core/rng';
import { scorePattern, scoreRecognition, type RecognitionResponse } from '../core/scoring';
import { mean, pairwiseOrderScore, round, serialPositionScore } from '../core/stats';
import { Fixation, Stage, Ticker } from './shared';
import { OldNew } from './verbal';
import { Button, cx } from '../ui/kit';
import { GlyphView, ShapeIcon } from '../ui/visuals';
import { realClock } from '../core/timer';

// ---------- C1 pattern ----------

function PatternGrid({ size, lit, onToggle, picked }: { size: number; lit?: number[]; picked?: number[]; onToggle?: (c: number) => void }) {
  return (
    <div className="mx-auto grid w-full max-w-sm gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
      {Array.from({ length: size * size }, (_, c) => {
        const on = lit?.includes(c) || picked?.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-label={`cell ${c + 1}`}
            aria-pressed={!!on}
            disabled={!onToggle}
            onClick={() => onToggle?.(c)}
            className={cx(
              'aspect-square rounded-md border transition',
              on ? 'border-violet bg-gradient-to-br from-violet to-volt shadow-neon' : 'border-line bg-panel2/70 enabled:hover:border-violet/60',
            )}
          />
        );
      })}
    </div>
  );
}

export const PATTERN_MS = 3000;
export const PATTERN_TRIALS = 3;

export function PatternMemory({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const size = (ctx.fixed?.size as number | undefined) ?? ctx.params.size;
  const ms = (ctx.fixed?.ms as number | undefined) ?? PATTERN_MS;
  const patterns = useMemo(
    () => (ctx.fixed?.patterns as number[][] | undefined) ?? Array.from({ length: PATTERN_TRIALS }, (_, i) => genPattern(`${ctx.seed}:${i}`, size, ctx.params.cells).cells),
    [ctx.seed],
  );
  const [trial, setTrial] = useState(0);
  const [phase, setPhase] = useState<'fix' | 'show' | 'answer'>('fix');
  const [picked, setPicked] = useState<number[]>([]);
  const results = useRef<ReturnType<typeof scorePattern>[]>([]);

  if (phase === 'fix') return <Fixation onDone={() => setPhase('show')} />;
  if (phase === 'show')
    return (
      <Stage title={`${t('common.memorize')} · ${t('common.trial')} ${trial + 1} / ${patterns.length}`}>
        <PatternGrid size={size} lit={patterns[trial]} />
        <Ticker ms={ms} onDone={() => setPhase('answer')} />
      </Stage>
    );
  const submit = () => {
    results.current.push(scorePattern(patterns[trial], picked));
    if (trial + 1 < patterns.length) {
      setTrial(trial + 1);
      setPicked([]);
      setPhase('fix');
      return;
    }
    const r = results.current;
    onDone({
      accuracy: mean(r.map((x) => x.accuracy)),
      metrics: {
        hits: r.reduce((a, x) => a + x.hits, 0),
        misses: r.reduce((a, x) => a + x.misses, 0),
        falseAlarms: r.reduce((a, x) => a + x.falseAlarms, 0),
        perfect: r.filter((x) => x.perfect).length,
      },
      conditionKey: `C1|size=${size}|cells=${patterns[0].length}|enc=${ms}`,
      encodingMs: ms * patterns.length,
      detail: { patterns },
    });
  };
  return (
    <Stage
      title={`${t('pattern.prompt')} · ${t('pattern.cells', { n: patterns[trial].length })} · ${picked.length}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setPicked([])}>{t('common.clear')}</Button>
          <Button onClick={submit}>{t('common.submit')}</Button>
        </>
      }
    >
      <PatternGrid size={size} picked={picked} onToggle={(c) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))} />
    </Stage>
  );
}

// ---------- C2 scene ----------

function SceneView({ objects, onCell }: { objects: SceneObject[]; onCell?: (c: number) => void }) {
  return (
    <div
      className="mx-auto grid max-w-xl gap-2 rounded-2xl border border-line bg-gradient-to-b from-panel2 to-void p-3"
      style={{ gridTemplateColumns: `repeat(${SCENE_COLS}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: SCENE_COLS * SCENE_ROWS }, (_, c) => {
        const o = objects.find((x) => x.cell === c);
        return (
          <button
            key={c}
            type="button"
            disabled={!onCell}
            onClick={() => onCell?.(c)}
            className="flex aspect-[4/3] items-center justify-center rounded-lg border border-line/40 enabled:hover:border-violet"
          >
            {o && <ShapeIcon shape={o.shape} color={o.color} size={60} />}
          </button>
        );
      })}
    </div>
  );
}

export const SCENE_MS = 6000;

export function SceneMemory({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const spec = useMemo(() => genScene(ctx.seed, ctx.params.objects), [ctx.seed]);
  const [phase, setPhase] = useState<'fix' | 'study' | 'q'>('fix');
  const [qi, setQi] = useState(0);
  const correct = useRef<Record<string, boolean>>({});

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study')
    return (
      <Stage title={`${t('common.memorize')} · ${spec.objects.length}`} wide>
        <SceneView objects={spec.objects} />
        <Ticker ms={SCENE_MS} onDone={() => setPhase('q')} />
      </Stage>
    );

  const q = spec.questions[qi];
  const answer = (ok: boolean) => {
    correct.current[q.kind] = ok;
    if (qi + 1 < spec.questions.length) return setQi(qi + 1);
    const vals = Object.values(correct.current);
    const m = correct.current;
    onDone({
      accuracy: vals.filter(Boolean).length / vals.length,
      metrics: { identity: +m.identity, position: +m.position, color: +m.color, relation: +m.relation, change: +m.change, correct: vals.filter(Boolean).length },
      conditionKey: `C2|n=${spec.objects.length}|enc=${SCENE_MS}`,
      encodingMs: SCENE_MS,
      detail: { answers: m },
    });
  };
  const sh = (s: string) => t(`shape.${s}`);
  const progress = `${qi + 1} / ${spec.questions.length}`;

  if (q.kind === 'identity')
    return (
      <Stage title={`${t('scene.identity')} · ${progress}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {q.options.map((s) => (
            <Button key={s} variant="ghost" onClick={() => answer(s === q.answer)} className="flex flex-col items-center gap-2 py-4">
              <ShapeIcon shape={s} color="neutral" />
              {sh(s)}
            </Button>
          ))}
        </div>
      </Stage>
    );
  if (q.kind === 'position')
    return (
      <Stage title={`${t('scene.position', { shape: sh(q.shape) })} · ${progress}`} wide>
        <div className="mb-3 flex justify-center">
          <ShapeIcon shape={q.shape} color="neutral" size={44} />
        </div>
        <SceneView objects={[]} onCell={(c) => answer(c === q.answer)} />
      </Stage>
    );
  if (q.kind === 'color')
    return (
      <Stage title={`${t('scene.color', { shape: sh(q.shape) })} · ${progress}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {q.options.map((c) => (
            <Button key={c} variant="ghost" onClick={() => answer(c === q.answer)} className="flex flex-col items-center gap-2 py-4">
              <ShapeIcon shape={q.shape} color={c} size={44} />
              {t(`color.${c}`)}
            </Button>
          ))}
        </div>
      </Stage>
    );
  if (q.kind === 'relation')
    return (
      <Stage title={`${t(q.relation === 'left' ? 'scene.relationLeft' : 'scene.relationAbove', { a: sh(q.a), b: sh(q.b) })} · ${progress}`}>
        <div className="flex justify-center gap-4">
          <Button onClick={() => answer(q.answer === true)} className="min-w-[120px]">{t('common.yes')}</Button>
          <Button variant="ghost" onClick={() => answer(q.answer === false)} className="min-w-[120px]">{t('common.no')}</Button>
        </div>
      </Stage>
    );
  const opts = [
    ['color', 'scene.changeColor'],
    ['position', 'scene.changePosition'],
    ['shape', 'scene.changeShape'],
    ['none', 'scene.changeNone'],
  ] as const;
  return (
    <Stage title={`${t('scene.change')} · ${progress}`} wide>
      <SceneView objects={q.changed} />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {opts.map(([k, label]) => (
          <Button key={k} variant="ghost" onClick={() => answer(k === q.answer)}>
            {t(label)}
          </Button>
        ))}
      </div>
    </Stage>
  );
}

// ---------- C3 visual sequence ----------

export function GlyphSequence({ glyphs, ms, onDone }: { glyphs: Glyph[]; ms: number; onDone: () => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [blank, setBlank] = useState(false);
  return (
    <Stage title={`${t('common.memorize')} · ${i + 1} / ${glyphs.length}`}>
      <div className="flex min-h-[200px] items-center justify-center">{!blank && <GlyphView g={glyphs[i]} size={170} />}</div>
      <Ticker
        key={`${i}-${blank}`}
        ms={blank ? 300 : ms}
        onDone={() => {
          if (!blank) setBlank(true);
          else if (i + 1 < glyphs.length) {
            setBlank(false);
            setI(i + 1);
          } else onDone();
        }}
      />
    </Stage>
  );
}

export const SEQ_MS = 1200;

export function VisualSequence({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const condition = ctx.variant === 'order' ? 'order' : 'item';
  const spec = useMemo(() => genVisualSequence(ctx.seed, ctx.params.length), [ctx.seed]);
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  const [picked, setPicked] = useState<string[]>([]);
  const n = spec.studied.length;

  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study') return <GlyphSequence glyphs={spec.studied} ms={SEQ_MS} onDone={() => setPhase('test')} />;

  const options = condition === 'item' ? spec.itemTest : spec.orderTest;
  const submit = () => {
    const truth = spec.studied.map((g) => g.id);
    if (condition === 'item') {
      const hits = picked.filter((id) => truth.includes(id)).length;
      const fa = picked.length - hits;
      onDone({
        accuracy: Math.max(0, (hits - fa) / n),
        metrics: { hits, falseAlarms: fa, misses: n - hits, itemAccuracy: round(Math.max(0, (hits - fa) / n)) },
        conditionKey: `C3-item|len=${n}|enc=${SEQ_MS}`,
        encodingMs: SEQ_MS * n,
        params: { condition },
      });
    } else {
      const exact = serialPositionScore(truth, picked);
      onDone({
        accuracy: exact,
        metrics: { exact: round(exact), pairwise: round(pairwiseOrderScore(truth, picked)), orderAccuracy: round(exact) },
        conditionKey: `C3-order|len=${n}|enc=${SEQ_MS}`,
        encodingMs: SEQ_MS * n,
        params: { condition },
      });
    }
  };
  return (
    <Stage
      title={condition === 'item' ? t('seq.itemPrompt', { n }) : t('seq.orderPrompt')}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => setPicked([])}>{t('common.clear')}</Button>
          <Button onClick={submit} disabled={condition === 'order' ? picked.length !== n : picked.length === 0}>{t('common.submit')}</Button>
        </>
      }
    >
      <div className="flex flex-wrap justify-center gap-3">
        {options.map((g) => {
          const idx = picked.indexOf(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={idx >= 0}
              onClick={() => setPicked((p) => (p.includes(g.id) ? p.filter((x) => x !== g.id) : condition === 'order' && p.length >= n ? p : [...p, g.id]))}
              className="relative"
            >
              <GlyphView g={g} selected={idx >= 0} />
              {condition === 'order' && idx >= 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-volt font-mono text-xs text-void">{idx + 1}</span>
              )}
            </button>
          );
        })}
      </div>
    </Stage>
  );
}

// ---------- assessment: visual recognition (glyphs, old/new) ----------

export function GlyphRecognition({ ctx, onDone }: ExProps) {
  const { t } = useI18n();
  const nStudy = (ctx.fixed?.study as number) ?? 10;
  const ms = (ctx.fixed?.ms as number) ?? 2000;
  const spec = useMemo(() => {
    const studied = genGlyphSet(ctx.seed + ':s', nStudy, 's');
    const lures = genGlyphSet(ctx.seed + ':l', nStudy, 'l');
    const test = createRng(ctx.seed + ':t').shuffle([...studied.map((g) => ({ g, old: true })), ...lures.map((g) => ({ g, old: false }))]);
    return { studied, test };
  }, [ctx.seed]);
  const [phase, setPhase] = useState<'fix' | 'study' | 'test'>('fix');
  const [i, setI] = useState(0);
  const responses = useRef<RecognitionResponse[]>([]);
  const shown = useRef(0);
  if (phase === 'fix') return <Fixation onDone={() => setPhase('study')} />;
  if (phase === 'study')
    return (
      <GlyphSequence
        glyphs={spec.studied}
        ms={ms}
        onDone={() => {
          shown.current = realClock.now();
          setPhase('test');
        }}
      />
    );
  const item = spec.test[i];
  return (
    <OldNew
      key={i}
      prompt={t('recog.promptFigure')}
      progress={`${i + 1} / ${spec.test.length}`}
      onAnswer={(saidOld) => {
        responses.current.push({ id: item.g.id, old: item.old, saidOld, rtMs: Math.round(realClock.now() - shown.current) });
        shown.current = realClock.now();
        if (i + 1 < spec.test.length) return setI(i + 1);
        const s = scoreRecognition(responses.current);
        onDone({
          accuracy: s.accuracy,
          metrics: {
            hits: s.hits,
            falseAlarms: s.falseAlarms,
            hitRate: round(s.hitRate),
            falseAlarmRate: round(s.falseAlarmRate),
            dPrime: s.dPrime === null ? null : round(s.dPrime),
            dPrimeCorrected: round(s.dPrimeCorrected),
            meanRtMs: s.meanRtMs === null ? null : Math.round(s.meanRtMs),
          },
          conditionKey: `visrec|n=${nStudy}|enc=${ms}`,
          encodingMs: ms * nStudy,
        });
      }}
    >
      <GlyphView g={item.g} size={150} />
    </OldNew>
  );
}
