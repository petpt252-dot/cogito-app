import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { bundleErrors, db, mergeAll } from '../core/storage';
import { LAST_EXPORT_KEY, LAST_IMPORT_KEY, daysSince, sendBackup } from '../core/transfer-file';
import { Button, Card, H1, H2 } from '../ui/kit';

/** Move your data between devices without an account: send a backup from one, merge it on the other. */
export function TransferPage() {
  const { t } = useI18n();
  const { bump, updateSettings, version } = useApp();
  const [lastExport, setLastExport] = useState<number | undefined>();
  const [lastImport, setLastImport] = useState<number | undefined>();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    db.kv<number>(LAST_EXPORT_KEY).then(setLastExport);
    db.kv<number>(LAST_IMPORT_KEY).then(setLastImport);
  }, [version]);

  const when = (ts?: number) => {
    const d = daysSince(ts);
    return d === null ? t('transferPage.never') : d === 0 ? t('transferPage.today') : t('transferPage.daysAgo', { n: d });
  };

  const send = async () => {
    setBusy(true);
    const r = await sendBackup().catch(() => 'error' as const);
    setBusy(false);
    if (r === 'error') return setMsg({ tone: 'bad', text: t('transferPage.sendError') });
    if (r !== 'cancelled') setMsg({ tone: 'ok', text: r === 'shared' ? t('transferPage.shared') : t('transferPage.downloaded') });
    bump();
  };

  const receive = async (f: File) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await f.text());
      const problems = bundleErrors(parsed);
      if (problems.length) throw new Error(problems.slice(0, 3).join(', '));
      const r = await mergeAll(parsed);
      // settings are kept, but a first import on an empty device takes the other device's settings
      updateSettings(await db.settings());
      bump();
      setMsg({ tone: 'ok', text: t('transferPage.merged', { added: r.added, updated: r.updated }) });
    } catch {
      setMsg({ tone: 'bad', text: t('transferPage.importError') });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <H1 sub={t('transferPage.sub')}>{t('transferPage.title')}</H1>
      <Card>
        <ol className="space-y-1.5 text-sm text-ink">
          {(['step1', 'step2', 'step3'] as const).map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="font-mono text-violet">{i + 1}</span>
              {t(`transferPage.${k}`)}
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card glow="violet">
          <H2>{t('transferPage.sendTitle')}</H2>
          <p className="mb-4 text-sm text-dim">{t('transferPage.sendText')}</p>
          <Button onClick={send} disabled={busy} autoFocus>
            {t('transferPage.send')}
          </Button>
          <p className="mt-3 text-xs text-dim">{t('transferPage.lastBackup', { when: when(lastExport) })}</p>
        </Card>
        <Card>
          <H2>{t('transferPage.receiveTitle')}</H2>
          <p className="mb-4 text-sm text-dim">{t('transferPage.receiveText')}</p>
          <Button variant="ghost" onClick={() => file.current?.click()} disabled={busy}>
            {t('transferPage.receive')}
          </Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && receive(e.target.files[0])} />
          <p className="mt-3 text-xs text-dim">{t('transferPage.lastImport', { when: when(lastImport) })}</p>
        </Card>
      </div>
      {msg && <p className={msg.tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-bad'}>{msg.text}</p>}
      <p className="text-xs text-dim">{t('transferPage.note')}</p>
    </div>
  );
}
