import { useEffect, useState } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { db } from '../core/storage';
import { normalizeStair, STAIRCASE_AT_KEY, STAIRCASE_BEST_KEY, STAIRCASE_KEY, STAIRS, stairValue, type StairState } from '../core/staircase';
import type { ExerciseId } from '../core/types';
import { Button, NumberInput } from './kit';

/**
 * COGITO adaptive: the value each task has reached, the hardest value ever reached, and a manual starting point
 * (editing the current value sets where the next block starts).
 */
export function StaircasePanel() {
  const { t } = useI18n();
  const { version, bump } = useApp();
  const [cur, setCur] = useState<StairState>({});
  const [best, setBest] = useState<StairState>({});
  useEffect(() => {
    db.kv<StairState>(STAIRCASE_KEY).then((s) => setCur(s ?? {}));
    db.kv<StairState>(STAIRCASE_BEST_KEY).then((s) => setBest(s ?? {}));
  }, [version]);
  const ids = Object.keys(STAIRS) as ExerciseId[];
  const setValue = async (id: ExerciseId, v: number) => {
    const next = { ...cur, [id]: v };
    setCur(next);
    await db.setKv(STAIRCASE_KEY, next);
    const at = (await db.kv<StairState>(STAIRCASE_AT_KEY)) ?? {};
    await db.setKv(STAIRCASE_AT_KEY, { ...at, [id]: Date.now() });
    bump();
  };
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-dim">
            <tr>
              <th className="py-2 pr-4">{t('adaptive.task')}</th>
              <th className="pr-4">{t('adaptive.current')}</th>
              <th className="pr-4">{t('adaptive.best')}</th>
              <th>{t('adaptive.unitCol')}</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const s = STAIRS[id]!;
              return (
                <tr key={id} className="border-t border-line">
                  <td className="py-1.5 pr-4 text-white">{t(`ex.${id}.name`)}</td>
                  <td className="pr-4">
                    <NumberInput value={stairValue(id, cur)} onChange={(v) => setValue(id, v)} min={s.min} max={s.max} />
                  </td>
                  <td className="pr-4 font-mono text-ink">{best[id] === undefined ? '—' : normalizeStair(id, best[id]!)}</td>
                  <td className="text-xs text-dim">{t(`adaptive.unit.${s.unit}`)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-dim">{t('adaptive.panelNote')}</p>
      <Button
        variant="ghost"
        className="mt-3"
        onClick={async () => {
          if (!window.confirm(t('adaptive.resetConfirm'))) return;
          await db.setKv(STAIRCASE_KEY, {});
          await db.setKv(STAIRCASE_AT_KEY, Object.fromEntries(Object.keys(STAIRS).map((k) => [k, Date.now()])));
          setCur({});
          bump();
        }}
      >
        {t('adaptive.reset')}
      </Button>
    </div>
  );
}
