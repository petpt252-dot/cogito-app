import { useEffect, useState } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { db } from '../core/storage';
import { LAST_EXPORT_KEY, daysSince } from '../core/transfer-file';
import { Button, Card, cx } from './kit';

/** Dashboard shortcut to the transfer page; turns into a reminder when the last backup is old (or never made). */
export function TransferCard({ hasData }: { hasData: boolean }) {
  const { go, version } = useApp();
  const { t } = useI18n();
  const [last, setLast] = useState<number | undefined>();
  useEffect(() => {
    db.kv<number>(LAST_EXPORT_KEY).then(setLast);
  }, [version]);
  const d = daysSince(last);
  const stale = hasData && (d === null || d >= 7);
  const when = d === null ? t('transferPage.never') : d === 0 ? t('transferPage.today') : t('transferPage.daysAgo', { n: d });
  return (
    <Card className={cx('flex flex-wrap items-center justify-between gap-4', stale && 'border-warn/40')}>
      <div>
        <div className="text-sm font-semibold text-white">{t('transferPage.cardTitle')}</div>
        <div className={cx('text-xs', stale ? 'text-warn' : 'text-dim')}>{stale ? t('transferPage.cardReminder', { when }) : t('transferPage.cardText')}</div>
      </div>
      <Button variant="ghost" onClick={() => go({ name: 'transfer' })}>
        {t('transferPage.open')}
      </Button>
    </Card>
  );
}
