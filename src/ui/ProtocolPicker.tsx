import { useState } from 'react';
import { useI18n } from '../i18n';
import type { Protocol } from '../core/types';
import { Segmented } from './kit';

/** The recommended protocol up front; the other four behind an "Advanced" toggle. */
export const ADVANCED_PROTOCOLS: Protocol[] = ['faithful', 'cogito', 'hybrid', 'memorylab'];

export function ProtocolPicker({ value, onChange }: { value: Protocol; onChange: (p: Protocol) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(value !== 'adaptive');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Protocol> value={value === 'adaptive' ? 'adaptive' : ('' as Protocol)} onChange={onChange} options={[{ value: 'adaptive', label: `★ ${t('protocol.adaptive')}` }]} />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-xs text-dim underline-offset-2 hover:text-white hover:underline">
          {t('protocol.advanced')} {open ? '▴' : '▾'}
        </button>
      </div>
      {open && <Segmented<Protocol> value={value} onChange={onChange} options={ADVANCED_PROTOCOLS.map((p) => ({ value: p, label: t(`protocol.${p}`) }))} />}
    </div>
  );
}
