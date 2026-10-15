import { ChevronLeft, ChevronRight, Copy, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { BudgetRow } from '@/data/models';
import { api, useAppMutation, useBudgets, useGroup, useOccurrences, useTransactions } from '@/data/queries';
import { alertTone, computeBudgetUsage, type BudgetKind, type BudgetUsage } from '@/domain/budget';
import { formatBRL } from '@/domain/money';
import { addMonths, formatMonth, monthPeriod, startOfMonth, todayISO } from '@/domain/period';
import { ProgressBar } from '@/ui/charts';
import { useConfirm } from '@/ui/Confirm';
import { MoneyField, Segmented, SelectField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingCard, Notice, Spinner } from '@/ui/States';
import { useLookups } from '../shared/lookups';
import { toPendingBills } from '../shared/pending';

const THRESHOLD_CHOICES = [50, 70, 80, 90, 100];

export default function BudgetsPage() {
  const { group, activeMembers, members } = useGroup();
  const l = useLookups();
  const confirm = useConfirm();
  const [month, setMonth] = useState(startOfMonth(todayISO()));
  const period = monthPeriod(month);
  const budgets = useBudgets(month);
  const txs = useTransactions(period);
  const occs = useOccurrences(period);
  const [form, setForm] = useState<{ budget?: BudgetRow; kind?: BudgetKind } | null>(null);

  const copy = useAppMutation(() => api.copyBudgets(group.id, addMonths(month, -1), month), {
    success: (n) => (n ? `${n} item(ns) copiado(s) do mês anterior.` : 'Nada novo para copiar do mês anterior.'),
  });
  const remove = useAppMutation((id: string) => api.deleteBudget(id), { success: 'Item do orçamento removido.' });

  const usages = useMemo(() => {
    if (!budgets.data || !txs.data) return null;
    const pending = toPendingBills(occs.data ?? []);
    return budgets.data.map((b) => computeBudgetUsage(b, txs.data!, pending));
  }, [budgets.data, txs.data, occs.data]);

  const overall = usages?.filter((u) => u.budget.kind === 'overall') ?? [];
  const savings = usages?.find((u) => u.budget.kind === 'savings');
  const byCategory = (usages?.filter((u) => u.budget.kind === 'category') ?? []).sort((a, b) => b.percentUsed - a.percentUsed);
  const memberName = (id: string | null) => (id ? (members.find((m) => m.userId === id)?.name ?? 'Ex-participante') : 'O casal');

  async function del(u: BudgetUsage) {
    if (await confirm({ title: 'Remover do orçamento?', message: 'Só o planejamento é removido; as movimentações não mudam.', confirmLabel: 'Remover', danger: true }))
      remove.mutate(u.budget.id);
  }

  const loading = budgets.isPending || txs.isPending;
  const error = budgets.error ?? txs.error;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Orçamento</h1>
          <p>Planejado × gasto. Despesas divididas contam uma vez; transferências não contam.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => copy.mutate(undefined)} disabled={copy.isPending}>
            {copy.isPending ? <Spinner label="Copiando" /> : <Copy size={16} aria-hidden />} Copiar do mês anterior
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
            <Plus size={16} aria-hidden /> Adicionar
          </button>
        </div>
      </header>

      <div className="card section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8 }}>
        <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={20} aria-hidden />
        </button>
        <strong aria-live="polite">{formatMonth(month)}</strong>
        <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {loading ? (
        <LoadingCard lines={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void budgets.refetch()} />
      ) : (usages ?? []).length === 0 ? (
        <section className="card">
          <EmptyState icon={PiggyBank} title="Nenhum orçamento neste mês" action={<button type="button" className="btn btn-primary" onClick={() => setForm({ kind: 'overall' })}>Definir limite geral</button>}>
            Comece com um limite geral de gastos e, se quiser, limites para Mercado, Lazer, Transporte…
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="grid grid-2 section">
            {overall.map((u) => (
              <UsageCard key={u.budget.id} title={`Limite geral · ${memberName(u.budget.memberId)}`} usage={u} onEdit={() => setForm({ budget: u.budget })} onDelete={() => del(u)} />
            ))}
            {overall.length === 0 && (
              <section className="card">
                <EmptyState icon={PiggyBank} title="Sem limite geral" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ kind: 'overall' })}>Definir</button>} />
              </section>
            )}
            {savings ? (
              <section className="card" style={{ display: 'grid', gap: 10 }}>
                <div className="card-header" style={{ marginBottom: 0 }}>
                  <h2>Meta de economia</h2>
                  <div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ budget: savings.budget })}>
                      Editar
                    </button>
                    <button type="button" className="icon-btn" aria-label="Remover meta de economia" onClick={() => del(savings)}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
                <span className={`stat-value ${savings.spentCents < 0 ? 'expense' : ''}`}>{formatBRL(savings.spentCents)}</span>
                <span className="small muted">economizados (receitas − despesas efetivas) de {formatBRL(savings.budget.limitCents)}</span>
                <ProgressBar value={savings.spentCents} max={savings.budget.limitCents} label="Meta de economia" />
                {savings.spentCents >= savings.budget.limitCents ? (
                  <Notice tone="success">Meta de economia do mês atingida.</Notice>
                ) : (
                  <span className="small muted">Faltam {formatBRL(savings.budget.limitCents - savings.spentCents)}.</span>
                )}
              </section>
            ) : (
              <section className="card">
                <EmptyState icon={PiggyBank} title="Sem meta de economia" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ kind: 'savings' })}>Definir</button>}>
                  Quanto vocês querem que sobre no fim do mês?
                </EmptyState>
              </section>
            )}
          </div>

          <section className="card section">
            <div className="card-header">
              <h2>Por categoria</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ kind: 'category' })}>
                <Plus size={14} aria-hidden /> Categoria
              </button>
            </div>
            {byCategory.length === 0 ? (
              <p className="small muted">Nenhum limite por categoria.</p>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                {byCategory.map((u) => (
                  <UsageRow key={u.budget.id} name={`${l.categoryName(u.budget.categoryId)}${u.budget.memberId ? ` · ${memberName(u.budget.memberId)}` : ''}`} usage={u} onEdit={() => setForm({ budget: u.budget })} onDelete={() => del(u)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {form && <BudgetForm month={month} budget={form.budget} kind={form.kind} existing={budgets.data ?? []} members={activeMembers} onClose={() => setForm(null)} />}
    </>
  );
}

function AlertNotice({ u }: { u: BudgetUsage }) {
  const tone = alertTone(u);
  if (tone === 'ok') return null;
  const text = u.percentUsed >= 100 ? `Limite estourado em ${formatBRL(-u.remainingCents)}.` : `Atenção: ${u.percentUsed}% do limite já foi usado.`;
  return <Notice tone={tone === 'danger' ? 'danger' : 'warning'}>{text}</Notice>;
}

function UsageCard({ title, usage: u, onEdit, onDelete }: { title: string; usage: BudgetUsage; onEdit: () => void; onDelete: () => void }) {
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <h2>{title}</h2>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
            Editar
          </button>
          <button type="button" className="icon-btn" aria-label="Remover" onClick={onDelete}>
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>
      <span className="stat-value">
        {formatBRL(u.spentCents)} <span className="muted small">de {formatBRL(u.budget.limitCents)}</span>
      </span>
      <ProgressBar value={u.spentCents} committed={u.committedCents} max={u.budget.limitCents} tone={alertTone(u)} label={`${title}: ${u.percentUsed}% usado`} />
      <dl className="dl">
        <dt>Pago</dt>
        <dd className="num">
          {formatBRL(u.spentCents)} ({u.percentUsed}%)
        </dd>
        <dt>Previsto</dt>
        <dd className="num">{formatBRL(u.plannedCents)}</dd>
        <dt>Comprometido</dt>
        <dd className="num">
          {formatBRL(u.committedCents)} ({u.percentCommitted}%)
        </dd>
        <dt>Disponível</dt>
        <dd className={`num ${u.budget.limitCents - u.committedCents < 0 ? 'expense' : ''}`}>{formatBRL(u.budget.limitCents - u.committedCents)}</dd>
      </dl>
      <AlertNotice u={u} />
    </section>
  );
}

function UsageRow({ name, usage: u, onEdit, onDelete }: { name: string; usage: BudgetUsage; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 560, textAlign: 'left' }}>
          {name}
        </button>
        <span className="num small">
          {formatBRL(u.spentCents)} / {formatBRL(u.budget.limitCents)}
          <button type="button" className="icon-btn" aria-label={`Remover ${name}`} onClick={onDelete} style={{ width: 32, height: 32 }}>
            <Trash2 size={14} aria-hidden />
          </button>
        </span>
      </div>
      <ProgressBar value={u.spentCents} committed={u.committedCents} max={u.budget.limitCents} tone={alertTone(u)} label={`${name}: ${u.percentUsed}% usado`} />
      <span className="small muted">
        {u.percentUsed}% usado · restam {formatBRL(u.remainingCents)}
        {u.plannedCents > 0 && ` · ${formatBRL(u.plannedCents)} previsto`}
      </span>
      {u.alert !== null && <AlertNotice u={u} />}
    </div>
  );
}

function BudgetForm({
  month,
  budget,
  kind: initialKind,
  existing,
  members,
  onClose,
}: {
  month: string;
  budget?: BudgetRow;
  kind?: BudgetKind;
  existing: BudgetRow[];
  members: { userId: string; name: string }[];
  onClose: () => void;
}) {
  const { group } = useGroup();
  const l = useLookups();
  const [kind, setKind] = useState<BudgetKind>(budget?.kind ?? initialKind ?? 'category');
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? '');
  const [memberId, setMemberId] = useState(budget?.memberId ?? '');
  const [limit, setLimit] = useState(budget?.limitCents ?? 0);
  const [thresholds, setThresholds] = useState<number[]>(budget?.alertThresholds ?? [70, 90, 100]);
  const [error, setError] = useState<string | null>(null);

  const save = useAppMutation(
    () =>
      api.saveBudget(group.id, {
        id: budget?.id,
        month,
        kind,
        categoryId: kind === 'category' ? categoryId : null,
        memberId: kind === 'savings' ? null : memberId || null,
        limitCents: limit,
        alertThresholds: [...thresholds].sort((a, b) => a - b),
      }),
    { success: 'Orçamento salvo.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    let p: string | null = null;
    if (limit <= 0) p = 'Informe o valor.';
    else if (kind === 'category' && !categoryId) p = 'Escolha a categoria.';
    else if (
      !budget &&
      existing.some((b) => b.kind === kind && (b.categoryId ?? '') === (kind === 'category' ? categoryId : '') && (b.memberId ?? '') === (kind === 'savings' ? '' : memberId))
    )
      p = 'Já existe um item igual neste mês. Edite o existente.';
    setError(p);
    if (!p) save.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title={budget ? 'Editar orçamento' : `Orçamento de ${formatMonth(month)}`}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="budget-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
          </button>
        </div>
      }
    >
      <form id="budget-form" className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        {!budget && (
          <Segmented
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'category', label: 'Por categoria' },
              { value: 'overall', label: 'Limite geral' },
              { value: 'savings', label: 'Economia' },
            ]}
          />
        )}
        {kind === 'category' && !budget && (
          <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Escolha…</option>
            {l.categories
              .filter((c) => c.kind === 'expense' && !c.archivedAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectField>
        )}
        {kind !== 'savings' && !budget && members.length > 1 && (
          <SelectField label="Contempla" value={memberId} onChange={(e) => setMemberId(e.target.value)} hint="Orçamento individual soma só a parte da pessoa em cada despesa.">
            <option value="">O casal (valor total das despesas)</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                Só a parte de {m.name}
              </option>
            ))}
          </SelectField>
        )}
        <MoneyField label={kind === 'savings' ? 'Quanto economizar no mês' : 'Limite de gastos no mês'} value={limit} onChange={setLimit} large />
        {kind !== 'savings' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label" style={{ marginBottom: 6 }}>
              Avisar quando atingir
            </legend>
            <div className="chips">
              {THRESHOLD_CHOICES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  aria-pressed={thresholds.includes(t)}
                  onClick={() => setThresholds((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
                >
                  {t}%
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Sheet>
  );
}
