import { Goal as GoalIcon, Minus, Pencil, Plus, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Contribution, Goal, GoalKind } from '@/data/models';
import { api, useAppMutation, useGoals, useGroup, useRequestId } from '@/data/queries';
import { formatBRL, percentOf } from '@/domain/money';
import { daysBetween, formatDate, formatMonth, startOfMonth, todayISO } from '@/domain/period';
import { ProgressBar } from '@/ui/charts';
import { useConfirm } from '@/ui/Confirm';
import { MoneyField, SelectField, TextAreaField, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingCard, Notice, Spinner } from '@/ui/States';
import { useLookups } from '../shared/lookups';

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  emergency: 'Reserva de emergência',
  travel: 'Viagem',
  vehicle: 'Compra de veículo',
  home: 'Entrada de imóvel',
  purchase: 'Compra planejada',
  custom: 'Objetivo personalizado',
};

const savedOf = (contribs: Contribution[], goalId: string) =>
  contribs.filter((c) => c.goalId === goalId && !c.cancelledAt).reduce((s, c) => s + c.amountCents, 0);

/** Quanto guardar por mês para chegar no prazo (null se não há prazo ou já atingiu). */
export function monthlyNeeded(targetCents: number, savedCents: number, deadline: string | null, today: string): number | null {
  if (!deadline || savedCents >= targetCents) return null;
  const months = Math.max(1, Math.ceil(daysBetween(today, deadline) / 30.44));
  return Math.ceil((targetCents - savedCents) / months);
}

export default function GoalsPage() {
  const goals = useGoals();
  const [form, setForm] = useState<{ goal?: Goal } | null>(null);
  const [contrib, setContrib] = useState<{ goal: Goal; direction: 'deposit' | 'withdraw' } | null>(null);
  const [history, setHistory] = useState<Goal | null>(null);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Metas</h1>
          <p>O valor guardado é dinheiro de verdade reservado; o valor-alvo é só o objetivo.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
          <Plus size={16} aria-hidden /> Nova meta
        </button>
      </header>

      {goals.isPending ? (
        <LoadingCard lines={4} />
      ) : goals.isError ? (
        <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
      ) : goals.data.goals.length === 0 ? (
        <section className="card">
          <EmptyState icon={GoalIcon} title="Nenhuma meta ainda" action={<button type="button" className="btn btn-primary" onClick={() => setForm({})}>Criar a primeira meta</button>}>
            Reserva de emergência, viagem, carro, entrada do imóvel… Acompanhem juntos quanto falta.
          </EmptyState>
        </section>
      ) : (
        <div className="grid grid-2">
          {goals.data.goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              contributions={goals.data.contributions.filter((c) => c.goalId === g.id)}
              onEdit={() => setForm({ goal: g })}
              onDeposit={() => setContrib({ goal: g, direction: 'deposit' })}
              onWithdraw={() => setContrib({ goal: g, direction: 'withdraw' })}
              onHistory={() => setHistory(g)}
            />
          ))}
        </div>
      )}

      {form && <GoalForm goal={form.goal} onClose={() => setForm(null)} />}
      {contrib && (
        <ContributionForm goal={contrib.goal} direction={contrib.direction} saved={savedOf(goals.data?.contributions ?? [], contrib.goal.id)} onClose={() => setContrib(null)} />
      )}
      {history && <HistorySheet goal={history} contributions={(goals.data?.contributions ?? []).filter((c) => c.goalId === history.id)} onClose={() => setHistory(null)} />}
    </>
  );
}

function GoalCard({
  goal: g,
  contributions,
  onEdit,
  onDeposit,
  onWithdraw,
  onHistory,
}: {
  goal: Goal;
  contributions: Contribution[];
  onEdit: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onHistory: () => void;
}) {
  const l = useLookups();
  const today = todayISO();
  const saved = savedOf(contributions, g.id);
  const pct = percentOf(saved, g.targetCents);
  const need = monthlyNeeded(g.targetCents, saved, g.deadline, today);
  const cancelled = g.status === 'cancelled';

  // Evolução mensal: saldo da meta no fim de cada um dos últimos 6 meses com movimento.
  const byMonth = new Map<string, number>();
  for (const c of contributions.filter((x) => !x.cancelledAt)) {
    const m = startOfMonth(c.contributedAt);
    byMonth.set(m, (byMonth.get(m) ?? 0) + c.amountCents);
  }
  const months = [...byMonth.keys()].sort().slice(-6);

  return (
    <section className="card" style={{ display: 'grid', gap: 12, opacity: cancelled ? 0.6 : 1 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div>
          <h2>{g.name}</h2>
          <span className="small muted">{GOAL_KIND_LABEL[g.kind]}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={`Editar ${g.name}`} onClick={onEdit}>
          <Pencil size={16} aria-hidden />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="stat-value">{formatBRL(saved)}</span>
        <span className="num muted">{pct}%</span>
      </div>
      <ProgressBar value={saved} max={g.targetCents} label={`Progresso de ${g.name}: ${pct}%`} />
      <span className="small muted">
        Guardado de {formatBRL(g.targetCents)} · faltam {formatBRL(Math.max(0, g.targetCents - saved))}
        {g.deadline && ` · prazo ${formatDate(g.deadline)}`}
      </span>
      {saved >= g.targetCents && <Notice tone="success">Meta atingida!</Notice>}
      {need !== null && !cancelled && <span className="small">Para chegar no prazo: guardar {formatBRL(need)} por mês.</span>}
      <span className="small muted">
        {g.accountId ? `Reserva na conta ${l.accountName(g.accountId)} — guardar move dinheiro de verdade (transferência).` : 'Controle do valor separado; não mexe no saldo das contas.'}
      </span>
      {months.length > 0 && (
        <div className="hbar" aria-label="Guardado por mês">
          {months.map((m) => {
            const v = byMonth.get(m)!;
            const max = Math.max(...months.map((x) => Math.abs(byMonth.get(x)!)));
            return (
              <div key={m} className="hbar-row" style={{ gridTemplateColumns: '84px 1fr auto' }}>
                <span className="hbar-name small">{formatMonth(m).replace(' de ', '/').slice(0, 8)}</span>
                <span className="hbar-track">
                  <span className="hbar-fill" style={{ width: `${(Math.abs(v) / max) * 100}%`, background: v < 0 ? 'var(--chart-expense)' : undefined }} />
                </span>
                <span className="hbar-value small">{formatBRL(v, { signed: true })}</span>
              </div>
            );
          })}
        </div>
      )}
      {!cancelled && (
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onDeposit}>
            <Plus size={14} aria-hidden /> Guardar
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onWithdraw} disabled={saved <= 0}>
            <Minus size={14} aria-hidden /> Resgatar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onHistory}>
            Histórico
          </button>
        </div>
      )}
    </section>
  );
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { group } = useGroup();
  const l = useLookups();
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'emergency');
  const [target, setTarget] = useState(goal?.targetCents ?? 0);
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [active, setActive] = useState(goal ? goal.status === 'active' : true);
  const [error, setError] = useState<string | null>(null);

  const save = useAppMutation(
    () =>
      api.saveGoal(group.id, {
        id: goal?.id,
        name,
        kind,
        targetCents: target,
        deadline: deadline || null,
        accountId: accountId || null,
        status: goal ? (active ? 'active' : 'cancelled') : undefined,
      }),
    { success: goal ? 'Meta atualizada.' : 'Meta criada.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = !name.trim() ? 'Dê um nome para a meta.' : target <= 0 ? 'Informe o valor-alvo.' : null;
    setError(p);
    if (!p) save.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title={goal ? 'Editar meta' : 'Nova meta'}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="goal-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
          </button>
        </div>
      }
    >
      <form id="goal-form" className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
          {Object.entries(GOAL_KIND_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Viagem para o Nordeste" />
        <div className="row">
          <MoneyField label="Valor-alvo" value={target} onChange={setTarget} />
          <TextField label="Prazo (opcional)" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <SelectField
          label="Conta-reserva (opcional)"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          hint="Com conta-reserva, cada contribuição vira uma transferência real entre contas (nunca receita). Sem ela, a meta só controla o valor separado."
        >
          <option value="">Sem conta-reserva</option>
          {l.accounts
            .filter((a) => !a.archivedAt || a.id === goal?.accountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </SelectField>
        {goal && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Meta ativa (desmarque para encerrar sem apagar o histórico)
          </label>
        )}
      </form>
    </Sheet>
  );
}

function ContributionForm({ goal, direction, saved, onClose }: { goal: Goal; direction: 'deposit' | 'withdraw'; saved: number; onClose: () => void }) {
  const { activeMembers, userId } = useGroup();
  const l = useLookups();
  const [requestId] = useRequestId();
  const [amount, setAmount] = useState(direction === 'withdraw' ? saved : 0);
  const [date, setDate] = useState(todayISO());
  const [memberId, setMemberId] = useState(userId);
  const [fromAccountId, setFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deposit = direction === 'deposit';

  const save = useAppMutation(
    () =>
      api.contributeGoal({
        clientRequestId: requestId,
        goalId: goal.id,
        direction,
        amountCents: amount,
        contributedAt: date,
        memberId: memberId || null,
        fromAccountId: goal.accountId ? fromAccountId || null : null,
        notes: notes.trim() || null,
      }),
    { success: deposit ? 'Valor guardado na meta.' : 'Resgate registrado.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    let p: string | null = null;
    if (amount <= 0) p = 'Informe o valor.';
    else if (!deposit && amount > saved) p = `Só há ${formatBRL(saved)} guardados.`;
    else if (date > todayISO()) p = 'A data não pode estar no futuro.';
    setError(p);
    if (!p) save.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title={`${deposit ? 'Guardar em' : 'Resgatar de'} ${goal.name}`}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="contrib-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Salvando" /> : 'Confirmar'}
          </button>
        </div>
      }
    >
      <form id="contrib-form" className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <MoneyField label="Valor" value={amount} onChange={setAmount} large autoFocus />
        <div className="row">
          <TextField label="Data" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          <SelectField label="Quem" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">O casal</option>
            {activeMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </SelectField>
        </div>
        {goal.accountId ? (
          <SelectField
            label={deposit ? 'Sai da conta' : 'Volta para a conta'}
            value={fromAccountId}
            onChange={(e) => setFrom(e.target.value)}
            hint={`Com uma conta escolhida, o app registra uma transferência para/da reserva ${l.accountName(goal.accountId)}. Sem conta, só o controle da meta muda.`}
          >
            <option value="">Não mover dinheiro entre contas</option>
            {l.accounts
              .filter((a) => !a.archivedAt && a.id !== goal.accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </SelectField>
        ) : (
          <p className="field-hint">Esta meta não tem conta-reserva: o registro é só de controle e não altera saldos.</p>
        )}
        <TextAreaField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </form>
    </Sheet>
  );
}

function HistorySheet({ goal, contributions, onClose }: { goal: Goal; contributions: Contribution[]; onClose: () => void }) {
  const l = useLookups();
  const confirm = useConfirm();
  const cancel = useAppMutation((id: string) => api.cancelContribution(id), { success: 'Contribuição cancelada.' });
  return (
    <Sheet open onClose={onClose} title={`Histórico · ${goal.name}`}>
      {contributions.length === 0 ? (
        <p className="muted">Nenhuma contribuição ainda.</p>
      ) : (
        <ul className="list">
          {contributions.map((c) => (
            <li key={c.id} className="list-item" style={{ opacity: c.cancelledAt ? 0.55 : 1 }}>
              <span className="list-main">
                <span className="list-title" style={{ display: 'block', textDecoration: c.cancelledAt ? 'line-through' : undefined }}>
                  {formatDate(c.contributedAt)} · {c.memberId ? l.memberName(c.memberId, { you: true }) : 'O casal'}
                </span>
                <span className="list-sub">
                  {c.cancelledAt ? 'Cancelada' : c.transactionId ? `Transferência ${c.amountCents > 0 ? 'de' : 'para'} ${l.accountName(c.fromAccountId)}` : 'Controle (sem mover contas)'}
                  {c.notes ? ` · ${c.notes}` : ''}
                </span>
              </span>
              <span className={`list-end ${c.amountCents < 0 ? 'expense' : 'income'}`}>{formatBRL(c.amountCents, { signed: true })}</span>
              {!c.cancelledAt && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Cancelar contribuição"
                  disabled={cancel.isPending}
                  onClick={async () => {
                    if (await confirm({ title: 'Cancelar contribuição?', message: 'O valor sai do total guardado. Se houve transferência entre contas, ela também é cancelada.', confirmLabel: 'Cancelar contribuição', danger: true }))
                      cancel.mutate(c.id);
                  }}
                >
                  <Undo2 size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
