import type { Member } from '@/data/models';
import { formatBRL } from '@/domain/money';
import { computeSplits, SplitError, type SplitMode, type SplitShare } from '@/domain/split';
import { MoneyField, Segmented, TextField } from '@/ui/Field';

export interface SplitState {
  mode: SplitMode;
  /** Participantes da divisão igualitária. */
  userIds: string[];
  /** Percentuais digitados ("33,33"). */
  percents: Record<string, string>;
  custom: Record<string, number>;
  individualId: string;
}

export function defaultSplitState(members: Member[], meId: string, sharePercents = true): SplitState {
  const ids = members.map((m) => m.userId);
  const percents: Record<string, string> = {};
  for (const m of members) percents[m.userId] = sharePercents ? String(m.sharePercent).replace('.', ',') : '';
  return {
    mode: members.length > 1 ? 'equal' : 'individual',
    userIds: ids,
    percents,
    custom: {},
    individualId: meId,
  };
}

/** Recria o estado do editor a partir de um rateio salvo (edição/duplicação). */
export function splitStateFrom(
  mode: SplitMode,
  splits: { userId: string; shareCents: number }[],
  percents: Record<string, number>,
  members: Member[],
  meId: string,
): SplitState {
  const base = defaultSplitState(members, meId);
  const p: Record<string, string> = { ...base.percents };
  for (const [id, v] of Object.entries(percents)) p[id] = String(v).replace('.', ',');
  return {
    mode,
    userIds: mode === 'equal' ? splits.map((s) => s.userId) : base.userIds,
    percents: p,
    custom: Object.fromEntries(splits.map((s) => [s.userId, s.shareCents])),
    individualId: mode === 'individual' ? (splits[0]?.userId ?? meId) : meId,
  };
}

function parsePercent(text: string | undefined): number {
  if (!text?.trim()) return 0;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function buildSplits(state: SplitState, amountCents: number, members: Member[]): { splits: SplitShare[] | null; error: string | null } {
  if (amountCents <= 0) return { splits: null, error: null };
  try {
    switch (state.mode) {
      case 'equal':
        return { splits: computeSplits({ mode: 'equal', amountCents, userIds: state.userIds }), error: null };
      case 'percent':
        return {
          splits: computeSplits({
            mode: 'percent',
            amountCents,
            percents: members.map((m) => ({ userId: m.userId, percent: parsePercent(state.percents[m.userId]) })),
          }),
          error: null,
        };
      case 'custom':
        return {
          splits: computeSplits({
            mode: 'custom',
            amountCents,
            shares: members.map((m) => ({ userId: m.userId, shareCents: state.custom[m.userId] ?? 0 })),
          }),
          error: null,
        };
      case 'individual':
        return { splits: computeSplits({ mode: 'individual', amountCents, userId: state.individualId }), error: null };
    }
  } catch (e) {
    return { splits: null, error: e instanceof SplitError ? e.message : 'Rateio inválido.' };
  }
}

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Igual' },
  { value: 'percent', label: '%' },
  { value: 'custom', label: 'Valores' },
  { value: 'individual', label: 'Só de um' },
];

export function SplitEditor({
  members,
  amountCents,
  value,
  onChange,
  meId,
  allowedModes,
}: {
  members: Member[];
  amountCents: number;
  value: SplitState;
  onChange: (s: SplitState) => void;
  meId: string;
  allowedModes?: SplitMode[];
}) {
  const { splits, error } = buildSplits(value, amountCents, members);
  const shareOf = (id: string) => splits?.find((s) => s.userId === id)?.shareCents ?? 0;
  const label = (m: Member) => (m.userId === meId ? `${m.name} (você)` : m.name);

  return (
    <fieldset className="form" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label" style={{ marginBottom: 6 }}>
        Quem é responsável pela despesa
      </legend>
      <Segmented
        label="Modo de divisão"
        hideLabel
        value={value.mode}
        options={MODES.filter((m) => !allowedModes || allowedModes.includes(m.value))}
        onChange={(mode) => onChange({ ...value, mode })}
      />

      {value.mode === 'equal' &&
        members.map((m) => (
          <label key={m.userId} className="check" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={value.userIds.includes(m.userId)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    userIds: e.target.checked ? [...value.userIds, m.userId] : value.userIds.filter((id) => id !== m.userId),
                  })
                }
              />
              {label(m)}
            </span>
            <span className="num muted">{formatBRL(shareOf(m.userId))}</span>
          </label>
        ))}

      {value.mode === 'percent' &&
        members.map((m) => (
          <div key={m.userId} className="row" style={{ alignItems: 'end' }}>
            <TextField
              label={`${label(m)} — %`}
              inputMode="decimal"
              value={value.percents[m.userId] ?? ''}
              onChange={(e) => onChange({ ...value, percents: { ...value.percents, [m.userId]: e.target.value.replace(/[^\d,.]/g, '') } })}
            />
            <span className="num muted" style={{ paddingBottom: 12 }}>
              {formatBRL(shareOf(m.userId))}
            </span>
          </div>
        ))}

      {value.mode === 'custom' &&
        members.map((m) => (
          <MoneyField
            key={m.userId}
            label={label(m)}
            value={value.custom[m.userId] ?? 0}
            onChange={(c) => onChange({ ...value, custom: { ...value.custom, [m.userId]: c } })}
          />
        ))}

      {value.mode === 'individual' && (
        <div className="chips" role="radiogroup" aria-label="Responsável">
          {members.map((m) => (
            <button
              key={m.userId}
              type="button"
              className="chip"
              role="radio"
              aria-checked={value.individualId === m.userId}
              aria-pressed={value.individualId === m.userId}
              onClick={() => onChange({ ...value, individualId: m.userId })}
            >
              {label(m)}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        amountCents > 0 &&
        value.mode !== 'equal' && (
          <span className="field-hint">
            {members.map((m) => `${m.name}: ${formatBRL(shareOf(m.userId))}`).join(' · ')} — total {formatBRL(amountCents)}
          </span>
        )
      )}
    </fieldset>
  );
}
