import { CalendarRange } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatPeriod, isISODate, resolvePreset, todayISO, type Period, type PeriodPreset } from '@/domain/period';
import { TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';

/** Período escolhido fica na URL (?periodo=...&de=...&ate=...): voltar/compartilhar mantém o filtro. */
export function usePeriod(): { period: Period; preset: PeriodPreset; setPreset: (p: PeriodPreset, custom?: Period) => void } {
  const [params, setParams] = useSearchParams();
  const raw = params.get('periodo');
  const preset: PeriodPreset = raw === 'anterior' ? 'previous' : raw === 'personalizado' ? 'custom' : 'current';
  const de = params.get('de') ?? '';
  const ate = params.get('ate') ?? '';
  const period = useMemo(() => {
    const custom = isISODate(de) && isISODate(ate) && de <= ate ? { start: de, end: ate } : undefined;
    return resolvePreset(custom ? preset : preset === 'custom' ? 'current' : preset, todayISO(), custom);
  }, [preset, de, ate]);

  const setPreset = (p: PeriodPreset, custom?: Period) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('de');
        next.delete('ate');
        if (p === 'current') next.delete('periodo');
        else next.set('periodo', p === 'previous' ? 'anterior' : 'personalizado');
        if (p === 'custom' && custom) {
          next.set('de', custom.start);
          next.set('ate', custom.end);
        }
        return next;
      },
      { replace: true },
    );
  };
  return { period, preset, setPreset };
}

export function PeriodPicker({ value }: { value: ReturnType<typeof usePeriod> }) {
  const { period, preset, setPreset } = value;
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(period.start);
  const [end, setEnd] = useState(period.end);
  const invalid = !isISODate(start) || !isISODate(end) || start > end;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="segmented" role="radiogroup" aria-label="Período">
        <button type="button" role="radio" aria-checked={preset === 'current'} onClick={() => setPreset('current')}>
          Mês atual
        </button>
        <button type="button" role="radio" aria-checked={preset === 'previous'} onClick={() => setPreset('previous')}>
          Mês anterior
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={preset === 'custom'}
          onClick={() => {
            setStart(period.start);
            setEnd(period.end);
            setOpen(true);
          }}
        >
          <CalendarRange size={14} aria-hidden style={{ marginRight: 4, verticalAlign: '-2px' }} />
          Personalizado
        </button>
      </div>
      <span className="small muted" aria-live="polite">
        {formatPeriod(period)}
      </span>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Escolher período"
        footer={
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={invalid}
              onClick={() => {
                setPreset('custom', { start, end });
                setOpen(false);
              }}
            >
              Aplicar
            </button>
          </div>
        }
      >
        <div className="row">
          <TextField label="De" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField label="Até" type="date" value={end} onChange={(e) => setEnd(e.target.value)} error={start > end ? 'A data final vem antes da inicial.' : null} />
        </div>
      </Sheet>
    </div>
  );
}
