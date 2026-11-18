import { useRef, useState } from 'react';
import { useApp } from '../state';
import { useI18n, LANG_NAMES } from '../i18n';
import { Button, Card, Field, H1, H2, NumberInput, Segmented, Toggle } from '../ui/kit';
import { exportAll, importAll, mergeAll, wipeAll, db, bundleErrors } from '../core/storage';
import { download, trialsCsv } from '../core/csv';
import { isFixedDose, SESSION_LENGTHS, usesStudyDose } from '../core/protocol';
import { ProtocolPicker } from '../ui/ProtocolPicker';
import { StaircasePanel } from '../ui/StaircasePanel';
import { isAnswerKey } from '../ui/answerKeys';
import { DEFAULT_SETTINGS, type Lang, type TrainingGoal } from '../core/types';

export function SettingsPage() {
  const { settings: s, updateSettings: set, bump, go } = useApp();
  const { t } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const exportJson = async (prefix = 'cogito-backup') => {
    const b = await exportAll();
    download(`${prefix}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), 'application/json');
  };
  const onImport = async (f: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      setMsg(t('settings.importError'));
      return;
    }
    // Validate everything before touching the database.
    const problems = bundleErrors(parsed);
    if (problems.length) {
      setMsg(`${t('settings.importError')} ${t('settings.importErrorDetail', { list: problems.slice(0, 5).join(', ') + (problems.length > 5 ? ' …' : '') })}`);
      return;
    }
    try {
      if (replace) await exportJson('cogito-backup-before-import');
      if (replace) {
        const n = await importAll(parsed, true);
        setMsg(`${t('settings.imported', { n })} ${t('settings.backupBeforeReplace')}`);
      } else {
        const r = await mergeAll(parsed);
        setMsg(t('transferPage.merged', { added: r.added, updated: r.updated }));
      }
      set(await db.settings());
      bump();
    } catch {
      setMsg(t('settings.importError'));
    }
  };

  // COGITO modes have their own rules: settings they ignore are kept apart (they still apply to Training Modules).
  const cogitoMode = s.protocol === 'cogito' || s.protocol === 'faithful' || s.protocol === 'adaptive';
  const fixedRules = s.protocol === 'faithful' || s.protocol === 'adaptive';

  return (
    <div className="space-y-5">
      <H1>{t('settings.title')}</H1>
      <Card>
        <H2>{t('settings.language')}</H2>
        <Segmented<Lang> value={s.lang} onChange={(lang) => set({ lang })} options={(['en', 'pt'] as Lang[]).map((l) => ({ value: l, label: LANG_NAMES[l] }))} />
        <p className="mt-2 text-xs text-dim">{t('settings.languageHint')}</p>
      </Card>

      <Card>
        <H2>{t('settings.protocol')}</H2>
        <ProtocolPicker value={s.protocol} onChange={(protocol) => set({ protocol })} />
        <p className="mt-2 text-xs text-dim">{t(`protocol.${s.protocol}Hint`)}</p>
        {s.protocol === 'faithful' && (
          <Button variant="ghost" className="mt-3" onClick={() => go({ name: 'calibration' })}>
            {t('faithful.calibTitle')}
          </Button>
        )}
        {s.protocol === 'hybrid' && (
          <div className="mt-4">
            <Field label={t('settings.goal')} hint={t(`goal.${s.goal}Hint`)}>
              <Segmented<TrainingGoal> value={s.goal} onChange={(goal) => set({ goal })} options={(['episodic', 'broad'] as TrainingGoal[]).map((g) => ({ value: g, label: t(`goal.${g}`) }))} />
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <H2>{t('settings.session')}</H2>
        {isFixedDose(s.protocol) && (
          <Field label={t('settings.doseMode')} hint={t(s.studyDose === false ? 'settings.dose.timeHint' : 'settings.dose.studyHint')}>
            <Segmented<'study' | 'time'> value={s.studyDose === false ? 'time' : 'study'} onChange={(v) => set({ studyDose: v === 'study' })} options={[{ value: 'study', label: t('settings.dose.study') }, { value: 'time', label: t('settings.dose.time') }]} />
          </Field>
        )}
        <Field label={t('settings.sessionLength')} hint={usesStudyDose(s) ? t('today.cogitoFixed') : s.protocol === 'adaptive' || isFixedDose(s.protocol) ? t('settings.adaptiveLengthHint') : undefined}>
          <Segmented<number>
            value={s.sessionMinutes}
            onChange={(sessionMinutes) => set({ sessionMinutes })}
            options={[...SESSION_LENGTHS.map((m) => ({ value: m as number, label: `${m}` })), { value: 0, label: t('settings.custom') }]}
          />
        </Field>
        {s.sessionMinutes === 0 && (
          <Field label={t('settings.customMinutes')}>
            <NumberInput value={s.customMinutes} onChange={(customMinutes) => set({ customMinutes })} min={5} max={90} />
          </Field>
        )}
        <Field label={t('settings.daysPerWeek')}>
          <Segmented<number> value={s.daysPerWeek} onChange={(daysPerWeek) => set({ daysPerWeek })} options={[5, 6, 7].map((d) => ({ value: d, label: String(d) }))} />
        </Field>
        {s.protocol === 'memorylab' && <Field label={t('settings.includeWM')}>
          <Toggle checked={s.includeWorkingMemory} onChange={(includeWorkingMemory) => set({ includeWorkingMemory })} label={t('settings.includeWM')} />
        </Field>}
        {!cogitoMode && (
          <>
            <Field label={t('settings.delayed')}>
              <Toggle checked={s.delayedRecall} onChange={(delayedRecall) => set({ delayedRecall })} label={t('settings.delayed')} />
            </Field>
            <Field label={t('settings.minDelay')}>
              <NumberInput value={s.minDelayMinutes} onChange={(minDelayMinutes) => set({ minDelayMinutes })} min={1} max={240} />
            </Field>
          </>
        )}
      </Card>

      {!fixedRules && (
        <Card>
          <H2>{t('settings.adaptive')}</H2>
          <p className="mb-2 text-xs text-dim">{t('settings.adaptiveNote')}</p>
          <Field label={`${t('settings.up')} (%)`}>
            <NumberInput value={Math.round(s.thresholds.up * 100)} onChange={(v) => set({ thresholds: { ...s.thresholds, up: Math.max(v / 100, s.thresholds.down + 0.05) } })} min={50} max={100} />
          </Field>
          <Field label={`${t('settings.down')} (%)`}>
            <NumberInput value={Math.round(s.thresholds.down * 100)} onChange={(v) => set({ thresholds: { ...s.thresholds, down: Math.min(v / 100, s.thresholds.up - 0.05) } })} min={10} max={90} />
          </Field>
          <Field label={t('settings.blocks')}>
            <NumberInput value={s.thresholds.blocks} onChange={(blocks) => set({ thresholds: { ...s.thresholds, blocks } })} min={1} max={5} />
          </Field>
          <Button variant="subtle" className="mt-2" onClick={() => set({ thresholds: DEFAULT_SETTINGS.thresholds })}>{t('common.reset')}</Button>
        </Card>
      )}

      <Card>
        <H2>{t('settings.encoding')}</H2>
        {!fixedRules && (
            <Field label={t('settings.secondsPerWord')}>
              <NumberInput value={s.secondsPerWord} onChange={(secondsPerWord) => set({ secondsPerWord })} min={0.5} max={6} step={0.5} />
            </Field>
        )}
        <Field label={t('settings.typo')}>
          <Toggle checked={s.typoTolerance} onChange={(typoTolerance) => set({ typoTolerance })} label={t('settings.typo')} />
        </Field>
      </Card>

      {!cogitoMode && (
        <Card>
          <H2>{t('settings.nback')}</H2>
          <Field label={t('settings.stimMs')}>
            <NumberInput value={s.nbackStimMs} onChange={(nbackStimMs) => set({ nbackStimMs })} min={200} max={3000} step={100} />
          </Field>
          <Field label={t('settings.isiMs')}>
            <NumberInput value={s.nbackIsiMs} onChange={(nbackIsiMs) => set({ nbackIsiMs })} min={500} max={5000} step={100} />
          </Field>
          <Field label={t('settings.audio')}>
            <Toggle checked={s.audio} onChange={(audio) => set({ audio })} label={t('settings.audio')} />
          </Field>
        </Card>
      )}

      <Card>
        <H2>{t('settings.display')}</H2>
        <Field label={t('settings.reducedMotion')}>
          <Toggle checked={s.reducedMotion} onChange={(reducedMotion) => set({ reducedMotion })} label={t('settings.reducedMotion')} />
        </Field>
      </Card>

      <Card>
        <H2>{t('settings.responses')}</H2>
        <Field label={t('settings.answerKeys')} hint={t('settings.answerKeysHint')}>
          <span className="flex gap-2">
            {(['left', 'right'] as const).map((side) => (
              <input
                key={side}
                aria-label={t(`settings.key.${side}`)}
                value={(s.answerKeys?.[side] ?? DEFAULT_SETTINGS.answerKeys[side]).toUpperCase()}
                readOnly
                onKeyDown={(e) => {
                  if (e.key === 'Tab') return;
                  e.preventDefault();
                  const k = e.key.toLowerCase();
                  const other = side === 'left' ? s.answerKeys?.right : s.answerKeys?.left;
                  if (isAnswerKey(k) && k !== other) set({ answerKeys: { ...DEFAULT_SETTINGS.answerKeys, ...s.answerKeys, [side]: k } });
                }}
                className="w-14 rounded-lg border border-line bg-void/60 px-2 py-1.5 text-center font-mono text-white focus:border-violet focus:outline-none"
              />
            ))}
          </span>
        </Field>
        <Field label={t('settings.errorSound')}>
          <Toggle checked={!!s.errorSound} onChange={(errorSound) => set({ errorSound })} label={t('settings.errorSound')} />
        </Field>
      </Card>

      {cogitoMode && (
        <details className="rounded-2xl border border-line bg-panel/60 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white">{t('settings.otherModes')}</summary>
          <p className="mb-4 mt-2 text-xs text-dim">{t('settings.otherModesNote')}</p>
          <div className="space-y-5">
            <Card>
              <H2>{t('settings.delayed')}</H2>
              <Field label={t('settings.delayed')}>
                <Toggle checked={s.delayedRecall} onChange={(delayedRecall) => set({ delayedRecall })} label={t('settings.delayed')} />
              </Field>
              <Field label={t('settings.minDelay')}>
                <NumberInput value={s.minDelayMinutes} onChange={(minDelayMinutes) => set({ minDelayMinutes })} min={1} max={240} />
              </Field>
            </Card>
            {fixedRules && (
              <>
                <Card>
                  <H2>{t('settings.adaptive')}</H2>
                  <p className="mb-2 text-xs text-dim">{t('settings.adaptiveNote')}</p>
                  <Field label={`${t('settings.up')} (%)`}>
                    <NumberInput value={Math.round(s.thresholds.up * 100)} onChange={(v) => set({ thresholds: { ...s.thresholds, up: Math.max(v / 100, s.thresholds.down + 0.05) } })} min={50} max={100} />
                  </Field>
                  <Field label={`${t('settings.down')} (%)`}>
                    <NumberInput value={Math.round(s.thresholds.down * 100)} onChange={(v) => set({ thresholds: { ...s.thresholds, down: Math.min(v / 100, s.thresholds.up - 0.05) } })} min={10} max={90} />
                  </Field>
                  <Field label={t('settings.blocks')}>
                    <NumberInput value={s.thresholds.blocks} onChange={(blocks) => set({ thresholds: { ...s.thresholds, blocks } })} min={1} max={5} />
                  </Field>
                  <Button variant="subtle" className="mt-2" onClick={() => set({ thresholds: DEFAULT_SETTINGS.thresholds })}>{t('common.reset')}</Button>
                </Card>
                <Card>
                  <H2>{t('settings.encoding')}</H2>
                  <Field label={t('settings.secondsPerWord')}>
                    <NumberInput value={s.secondsPerWord} onChange={(secondsPerWord) => set({ secondsPerWord })} min={0.5} max={6} step={0.5} />
                  </Field>
                </Card>
              </>
            )}
            <Card>
              <H2>{t('settings.nback')}</H2>
              <Field label={t('settings.stimMs')}>
                <NumberInput value={s.nbackStimMs} onChange={(nbackStimMs) => set({ nbackStimMs })} min={200} max={3000} step={100} />
              </Field>
              <Field label={t('settings.isiMs')}>
                <NumberInput value={s.nbackIsiMs} onChange={(nbackIsiMs) => set({ nbackIsiMs })} min={500} max={5000} step={100} />
              </Field>
              <Field label={t('settings.audio')}>
                <Toggle checked={s.audio} onChange={(audio) => set({ audio })} label={t('settings.audio')} />
              </Field>
            </Card>
          </div>
        </details>
      )}

      <Card>
        <H2>{t('adaptive.panelTitle')}</H2>
        <StaircasePanel />
      </Card>

      <Card>
        <H2>{t('settings.data')}</H2>
        <p className="mb-4 text-xs text-dim">{t('settings.dataNote')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => exportJson()}>{t('settings.exportJson')}</Button>
          <Button variant="ghost" onClick={async () => download(`cogito-report-${new Date().toISOString().slice(0, 10)}.csv`, trialsCsv(await db.trials()))}>
            {t('settings.exportCsv')}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Segmented value={replace ? 'r' : 'm'} onChange={(v) => setReplace(v === 'r')} options={[{ value: 'm', label: t('settings.importMerge') }, { value: 'r', label: t('settings.importReplace') }]} />
          <Button variant="ghost" onClick={() => file.current?.click()}>{t('settings.importJson')}</Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        {msg && <p className="mt-3 text-sm text-volt">{msg}</p>}
        <div className="mt-6 border-t border-line pt-4">
          <Button
            variant="danger"
            onClick={async () => {
              if (window.prompt(t('settings.wipeConfirm')) === 'DELETE') {
                await wipeAll();
                set(DEFAULT_SETTINGS);
                bump();
              }
            }}
          >
            {t('settings.wipe')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
