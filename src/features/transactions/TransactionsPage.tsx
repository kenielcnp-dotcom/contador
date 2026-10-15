import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Download, Plus, Search, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Transaction } from '@/data/models';
import { useGroup, useTransactions } from '@/data/queries';
import { toCSV, downloadCSV } from '@/domain/csv';
import { referenceDate, summarize } from '@/domain/ledger';
import { formatBRL } from '@/domain/money';
import { formatDate, formatDayMonth } from '@/domain/period';
import { useQuickActions } from '@/layout/AppShell';
import { SelectField } from '@/ui/Field';
import { CategoryIcon } from '@/ui/icons';
import { EmptyState, ErrorState, LoadingCard } from '@/ui/States';
import { PeriodPicker, usePeriod } from '../shared/PeriodPicker';
import { KIND_LABEL, PAYMENT_METHOD_LABEL, SPLIT_LABEL, useLookups } from '../shared/lookups';
import { statusLabel, TransactionDetails } from './TransactionDetails';

type KindFilter = 'all' | 'income' | 'expense' | 'transfer';
type StatusFilter = 'active' | 'effective' | 'planned' | 'cancelled';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function TransactionRow({ tx, onOpen }: { tx: Transaction; onOpen: () => void }) {
  const l = useLookups();
  const cat = tx.categoryId ? l.categoryById.get(tx.categoryId) : undefined;
  const sign = tx.kind === 'income' ? '+' : tx.kind === 'expense' ? '−' : '';
  const raw = l.memberName(tx.paidBy, { you: true });
  const who = raw === 'Você' ? 'você' : raw === 'Conta conjunta' ? 'conta conjunta' : raw;
  const subtitle =
    tx.kind === 'transfer'
      ? `${l.accountName(tx.accountId)} → ${l.accountName(tx.toAccountId)}`
      : [
          cat?.name ?? 'Sem categoria',
          tx.kind === 'expense' ? `pago por ${who}` : `recebido por ${who}`,
          tx.kind === 'expense' && tx.splitMode && tx.splitMode !== 'individual' ? 'dividida' : null,
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <li>
      <button type="button" className="list-item clickable" onClick={onOpen} style={{ opacity: tx.status === 'cancelled' ? 0.55 : 1 }}>
        <span className={`list-icon ${tx.kind === 'income' ? 'income' : tx.kind === 'expense' ? 'expense' : ''}`}>
          {tx.kind === 'transfer' ? <ArrowLeftRight size={18} aria-hidden /> : <CategoryIcon name={cat?.icon} />}
        </span>
        <span className="list-main">
          <span className="list-title" style={{ display: 'block', textDecoration: tx.status === 'cancelled' ? 'line-through' : undefined }}>
            {tx.description}
          </span>
          <span className="list-sub" style={{ display: 'block' }}>
            {subtitle}
          </span>
        </span>
        <span className="list-end">
          <span className={tx.kind === 'income' ? 'income' : tx.kind === 'expense' ? 'expense' : ''}>
            {sign}
            {formatBRL(tx.amountCents)}
          </span>
          {tx.status !== 'effective' && (
            <span style={{ display: 'block' }}>
              <span className={`badge ${tx.status === 'planned' ? 'badge-warning' : 'badge-danger'}`}>{statusLabel(tx)}</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function TransactionsPage() {
  const periodState = usePeriod();
  const { period } = periodState;
  const { activeMembers, members, group } = useGroup();
  const l = useLookups();
  const txs = useTransactions(period);
  const { openTransaction } = useQuickActions();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [categoryId, setCategoryId] = useState('');
  const [person, setPerson] = useState('');
  const [accountId, setAccountId] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return (txs.data ?? [])
      .filter((t) => {
        const ref = referenceDate(t);
        if (ref < period.start || ref > period.end) return false;
        if (kind !== 'all' && t.kind !== kind) return false;
        if (status === 'active' && t.status === 'cancelled') return false;
        if (status !== 'active' && t.status !== status) return false;
        if (categoryId && t.categoryId !== categoryId) return false;
        if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
        if (person && t.paidBy !== person && !t.splits.some((s) => s.userId === person)) return false;
        if (q && !normalize(`${t.description} ${t.notes ?? ''} ${l.categoryName(t.categoryId)}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => (referenceDate(a) < referenceDate(b) ? 1 : referenceDate(a) > referenceDate(b) ? -1 : b.createdAt.localeCompare(a.createdAt)));
  }, [txs.data, period, kind, status, categoryId, accountId, person, search, l]);

  // Totais do que está filtrado, com a mesma regra do dashboard.
  const totals = useMemo(() => summarize(filtered, period), [filtered, period]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const d = referenceDate(t);
      map.set(d, [...(map.get(d) ?? []), t]);
    }
    return [...map.entries()];
  }, [filtered]);

  function exportCsv() {
    const csv = toCSV(filtered, [
      { header: 'Data de referência', value: (t) => formatDate(referenceDate(t)) },
      { header: 'Competência', value: (t) => formatDate(t.competenceDate) },
      { header: 'Pagamento/recebimento', value: (t) => (t.paidAt ? formatDate(t.paidAt) : '') },
      { header: 'Tipo', value: (t) => KIND_LABEL[t.kind] },
      { header: 'Situação', value: (t) => statusLabel(t) },
      { header: 'Descrição', value: (t) => t.description },
      { header: 'Categoria', value: (t) => (t.kind === 'transfer' ? '' : l.categoryName(t.categoryId)) },
      { header: 'Valor', value: (t) => t.amountCents, money: true },
      { header: 'Conta', value: (t) => l.accountName(t.accountId) },
      { header: 'Conta destino', value: (t) => (t.toAccountId ? l.accountName(t.toAccountId) : '') },
      { header: 'Responsável', value: (t) => (t.kind === 'transfer' ? '' : l.memberName(t.paidBy)) },
      { header: 'Divisão', value: (t) => (t.splitMode ? SPLIT_LABEL[t.splitMode] : '') },
      ...members.map((m) => ({
        header: `Parte de ${m.name}`,
        value: (t: Transaction) => t.splits.find((s) => s.userId === m.userId)?.shareCents ?? null,
        money: true,
      })),
      { header: 'Método', value: (t) => (t.paymentMethod ? PAYMENT_METHOD_LABEL[t.paymentMethod] : '') },
      { header: 'Observações', value: (t) => t.notes ?? '' },
    ]);
    downloadCSV(`movimentacoes-${group.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${period.start}-a-${period.end}.csv`, csv);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Movimentações</h1>
          <p>Receitas, despesas e transferências da carteira.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!filtered.length}>
            <Download size={16} aria-hidden /> Exportar CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openTransaction()}>
            <Plus size={16} aria-hidden /> Nova
          </button>
        </div>
      </header>

      <section className="card section" aria-label="Filtros">
        <PeriodPicker value={periodState} />
        <div className="field">
          <label className="sr-only" htmlFor="busca">
            Buscar
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={16} aria-hidden style={{ position: 'absolute', left: 12, top: 14, color: 'var(--muted)' }} />
            <input
              id="busca"
              className="input"
              type="search"
              placeholder="Buscar por descrição, categoria ou observação"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>
        <div className="row">
          <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)}>
            <option value="all">Todos</option>
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
            <option value="transfer">Transferências</option>
          </SelectField>
          <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="active">Efetivadas e previstas</option>
            <option value="effective">Só efetivadas</option>
            <option value="planned">Só previstas</option>
            <option value="cancelled">Canceladas</option>
          </SelectField>
          <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {l.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind === 'income' ? 'receita' : 'despesa'})
              </option>
            ))}
          </SelectField>
          <SelectField label="Pessoa" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Todos</option>
            {activeMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas</option>
            {l.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>
      </section>

      {txs.isPending ? (
        <LoadingCard lines={6} />
      ) : txs.isError ? (
        <ErrorState error={txs.error} onRetry={() => void txs.refetch()} />
      ) : (
        <>
          <div className="grid grid-stats section">
            <div className="card stat">
              <span className="stat-label">
                <ArrowDownLeft size={14} aria-hidden /> Receitas efetivas
              </span>
              <span className="stat-value income">{formatBRL(totals.incomeCents)}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">
                <ArrowUpRight size={14} aria-hidden /> Despesas efetivas
              </span>
              <span className="stat-value expense">{formatBRL(totals.expenseCents)}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Previstas (fora dos totais)</span>
              <span className="stat-value">{formatBRL(totals.plannedExpenseCents + totals.plannedIncomeCents)}</span>
              <span className="stat-sub">
                {formatBRL(totals.plannedIncomeCents)} a receber · {formatBRL(totals.plannedExpenseCents)} a pagar
              </span>
            </div>
          </div>

          <section className="card">
            {filtered.length === 0 ? (
              (txs.data ?? []).length === 0 ? (
                <EmptyState icon={ArrowLeftRight} title="Nenhuma movimentação no período" action={<button type="button" className="btn btn-primary" onClick={() => openTransaction()}><Plus size={16} aria-hidden /> Lançar a primeira</button>}>
                  Registre receitas, despesas e transferências. Leva poucos segundos.
                </EmptyState>
              ) : (
                <EmptyState icon={SearchX} title="Nada encontrado">
                  Nenhuma movimentação combina com os filtros escolhidos.
                </EmptyState>
              )
            ) : (
              groups.map(([day, items]) => (
                <div key={day} style={{ marginBottom: 8 }}>
                  <h2 className="small muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 0 2px' }}>
                    {formatDayMonth(day)}
                  </h2>
                  <ul className="list">
                    {items.map((t) => (
                      <TransactionRow key={t.id} tx={t} onOpen={() => setSelected(t)} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {selected && <TransactionDetails tx={(txs.data ?? []).find((t) => t.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </>
  );
}
