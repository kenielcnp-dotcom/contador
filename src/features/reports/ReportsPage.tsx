import { Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Transaction } from '@/data/models';
import { useBalanceSeries, useGoals, useGroup, useOccurrences, useSettlements, useTransactions } from '@/data/queries';
import { remainingCents, STATUS_LABEL, displayStatus } from '@/domain/bills';
import { downloadCSV, toCSV, type CsvColumn } from '@/domain/csv';
import { monthlySeries, rankCategories, referenceDate, summarize } from '@/domain/ledger';
import { formatBRL, percentOf } from '@/domain/money';
import { addMonths, formatDate, formatPeriod, inPeriod, monthsBetween, startOfMonth, todayISO, type Period } from '@/domain/period';
import { BalanceLineChart, CategoryBars, IncomeExpenseChart, ProgressBar } from '@/ui/charts';
import { SelectField } from '@/ui/Field';
import { ErrorState, LoadingCard } from '@/ui/States';
import { PeriodPicker, usePeriod } from '../shared/PeriodPicker';
import { KIND_LABEL, PAYMENT_METHOD_LABEL, SPLIT_LABEL, useLookups } from '../shared/lookups';
import { statusLabel } from '../transactions/TransactionDetails';

type StatusFilter = 'all' | 'effective' | 'planned';

/** Pelo menos 6 meses no comparativo, terminando no fim do período. */
function chartRange(period: Period): Period {
  const sixBack = addMonths(startOfMonth(period.end), -5);
  return { start: period.start < sixBack ? startOfMonth(period.start) : sixBack, end: period.end };
}

export default function ReportsPage() {
  const periodState = usePeriod();
  const { period } = periodState;
  const { members, activeMembers, group } = useGroup();
  const l = useLookups();
  const range = chartRange(period);
  const txs = useTransactions(range);
  const series = useBalanceSeries(range);
  const occs = useOccurrences(period);
  const settlements = useSettlements();
  const goals = useGoals();
  const [categoryId, setCategoryId] = useState('');
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  // Mesmo filtro para tela e CSV; mesma função de soma do dashboard.
  const filtered = useMemo(
    () =>
      (txs.data ?? []).filter(
        (t) =>
          t.status !== 'cancelled' &&
          (!categoryId || t.categoryId === categoryId) &&
          (!person || t.paidBy === person || t.splits.some((s) => s.userId === person)) &&
          (status === 'all' || t.status === status),
      ),
    [txs.data, categoryId, person, status],
  );
  const summary = useMemo(() => summarize(filtered, period), [filtered, period]);
  const monthly = useMemo(() => monthlySeries(filtered, monthsBetween(range)), [filtered, range]);
  const inRange = filtered.filter((t) => inPeriod(referenceDate(t), period));
  const filterLabel = [
    categoryId && `categoria ${l.categoryName(categoryId)}`,
    person && `participante ${l.memberName(person)}`,
    status !== 'all' && (status === 'effective' ? 'só efetivadas' : 'só previstas'),
  ]
    .filter(Boolean)
    .join(', ');

  const slug = group.name.replace(/[^\w-]+/g, '-').toLowerCase();
  const download = <T,>(name: string, rows: T[], cols: CsvColumn<T>[]) => downloadCSV(`${name}-${slug}-${period.start}-a-${period.end}.csv`, toCSV(rows, cols));

  const exportMovements = () =>
    download<Transaction>('relatorio-movimentacoes', inRange, [
      { header: 'Data de referência', value: (t) => formatDate(referenceDate(t)) },
      { header: 'Tipo', value: (t) => KIND_LABEL[t.kind] },
      { header: 'Situação', value: (t) => statusLabel(t) },
      { header: 'Descrição', value: (t) => t.description },
      { header: 'Categoria', value: (t) => (t.kind === 'transfer' ? '' : l.categoryName(t.categoryId)) },
      { header: 'Valor', value: (t) => t.amountCents, money: true },
      { header: 'Conta', value: (t) => l.accountName(t.accountId) },
      { header: 'Responsável', value: (t) => (t.kind === 'transfer' ? '' : l.memberName(t.paidBy)) },
      { header: 'Divisão', value: (t) => (t.splitMode ? SPLIT_LABEL[t.splitMode] : '') },
      ...members.map((m) => ({ header: `Parte de ${m.name}`, value: (t: Transaction) => t.splits.find((s) => s.userId === m.userId)?.shareCents ?? null, money: true })),
      { header: 'Método', value: (t) => (t.paymentMethod ? PAYMENT_METHOD_LABEL[t.paymentMethod] : '') },
    ]);

  const categoryRows = rankCategories(summary.expenseByCategory).map((r) => ({ id: r.categoryId, name: l.categoryName(r.categoryId), cents: r.cents, percent: r.percent }));
  const incomeRows = rankCategories(summary.incomeByCategory).map((r) => ({ id: r.categoryId, name: l.categoryName(r.categoryId), cents: r.cents, percent: r.percent }));

  const occInPeriod = (occs.data ?? []).filter((o) => o.status !== 'cancelled' && inPeriod(o.dueDate, period));
  const today = todayISO();
  const paidOcc = occInPeriod.filter((o) => o.status === 'paid');
  const openOcc = occInPeriod.filter((o) => o.status !== 'paid');
  const payments = (settlements.data?.payments ?? []).filter((p) => !p.cancelledAt && inPeriod(p.paidAt, period));

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Mesmas regras de cálculo do Início: os totais batem.</p>
        </div>
        <div className="page-actions no-print">
          <button type="button" className="btn btn-secondary" onClick={exportMovements} disabled={!inRange.length}>
            <Download size={16} aria-hidden /> CSV das movimentações
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> Imprimir / PDF
          </button>
        </div>
      </header>

      <div className="print-only" style={{ marginBottom: 16 }}>
        <h2>
          {group.name} — {formatPeriod(period)}
        </h2>
        <p className="small">
          Gerado em {formatDate(today)}
          {filterLabel ? ` · filtros: ${filterLabel}` : ''}
        </p>
      </div>

      <section className="card section no-print" aria-label="Filtros">
        <PeriodPicker value={periodState} />
        <div className="row">
          <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {l.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Participante" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Todos</option>
            {activeMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">Efetivadas e previstas</option>
            <option value="effective">Só efetivadas</option>
            <option value="planned">Só previstas</option>
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
              <span className="stat-label">Receitas efetivas</span>
              <span className="stat-value income">{formatBRL(summary.incomeCents)}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Despesas efetivas</span>
              <span className="stat-value expense">{formatBRL(summary.expenseCents)}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Saldo do período</span>
              <span className={`stat-value ${summary.netCents < 0 ? 'expense' : 'income'}`}>{formatBRL(summary.netCents, { signed: true })}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Transferências entre contas</span>
              <span className="stat-value">{formatBRL(summary.transferCents)}</span>
              <span className="stat-sub">Não são receita nem despesa</span>
            </div>
          </div>

          <div className="grid grid-2 section">
            <section className="card">
              <div className="card-header">
                <h2>Comparativo mensal</h2>
              </div>
              <IncomeExpenseChart data={monthly} />
            </section>
            <section className="card">
              <div className="card-header">
                <h2>Evolução do saldo das contas</h2>
              </div>
              {series.isPending ? (
                <LoadingCard lines={3} />
              ) : series.isError ? (
                <ErrorState error={series.error} onRetry={() => void series.refetch()} />
              ) : (
                <BalanceLineChart data={series.data} />
              )}
              <p className="small muted">Saldo de todas as contas no fim de cada mês (não muda com os filtros).</p>
            </section>
          </div>

          <div className="grid grid-2 section">
            <section className="card">
              <div className="card-header">
                <h2>Despesas por categoria</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm no-print"
                  disabled={!categoryRows.length}
                  onClick={() => download('despesas-por-categoria', categoryRows, [{ header: 'Categoria', value: (r) => r.name }, { header: 'Valor', value: (r) => r.cents, money: true }, { header: '%', value: (r) => String(r.percent).replace('.', ',') }])}
                >
                  CSV
                </button>
              </div>
              {categoryRows.length ? <CategoryBars rows={categoryRows} limit={12} /> : <p className="small muted">Sem despesas efetivas.</p>}
            </section>
            <section className="card">
              <div className="card-header">
                <h2>Receitas por categoria</h2>
              </div>
              {incomeRows.length ? <CategoryBars rows={incomeRows} limit={12} /> : <p className="small muted">Sem receitas efetivas.</p>}
            </section>
          </div>

          <div className="grid grid-2 section">
            <section className="card">
              <div className="card-header">
                <h2>Por participante</h2>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th className="num">Recebeu</th>
                      <th className="num">Pagou</th>
                      <th className="num">Responsabilidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members
                      .filter((m) => m.status === 'active' || summary.byMember.has(m.userId))
                      .map((m) => {
                        const t = summary.byMember.get(m.userId);
                        return (
                          <tr key={m.userId}>
                            <td>{m.name}</td>
                            <td className="num">{formatBRL(t?.receivedCents ?? 0)}</td>
                            <td className="num">{formatBRL(t?.paidCents ?? 0)}</td>
                            <td className="num">{formatBRL(t?.shareCents ?? 0)}</td>
                          </tr>
                        );
                      })}
                    {summary.jointPaidCents > 0 && (
                      <tr>
                        <td>Conta conjunta</td>
                        <td className="num">—</td>
                        <td className="num">{formatBRL(summary.jointPaidCents)}</td>
                        <td className="num">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card">
              <div className="card-header">
                <h2>Previsto × efetivo</h2>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th className="num">Efetivo</th>
                      <th className="num">Previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Receitas</td>
                      <td className="num">{formatBRL(summary.incomeCents)}</td>
                      <td className="num">{formatBRL(summary.plannedIncomeCents + openOcc.filter((o) => o.bill.kind === 'receivable').reduce((s, o) => s + remainingCents(o), 0))}</td>
                    </tr>
                    <tr>
                      <td>Despesas</td>
                      <td className="num">{formatBRL(summary.expenseCents)}</td>
                      <td className="num">{formatBRL(summary.plannedExpenseCents + openOcc.filter((o) => o.bill.kind === 'payable').reduce((s, o) => s + remainingCents(o), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="small muted">Previsto = movimentações previstas + o que falta pagar/receber das contas que vencem no período.</p>
            </section>
          </div>

          <div className="grid grid-2 section">
            <section className="card">
              <div className="card-header">
                <h2>Contas do período</h2>
                <span className="small muted">
                  {paidOcc.length} paga(s) · {openOcc.length} pendente(s)
                </span>
              </div>
              {occs.isPending ? (
                <LoadingCard lines={3} />
              ) : occInPeriod.length === 0 ? (
                <p className="small muted">Nenhuma conta vence no período.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Vencimento</th>
                        <th>Conta</th>
                        <th>Situação</th>
                        <th className="num">Valor</th>
                        <th className="num">Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {occInPeriod.map((o) => (
                        <tr key={o.id}>
                          <td>{formatDate(o.dueDate)}</td>
                          <td>{o.bill.description}</td>
                          <td>{STATUS_LABEL[displayStatus(o, today)]}</td>
                          <td className="num">{formatBRL(o.amountCents)}</td>
                          <td className="num">{formatBRL(o.paidCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card">
              <div className="card-header">
                <h2>Acertos no período</h2>
              </div>
              {payments.length === 0 ? (
                <p className="small muted">Nenhum acerto no período.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>De → para</th>
                        <th className="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.paidAt)}</td>
                          <td>
                            {l.memberName(p.fromUser)} → {l.memberName(p.toUser)}
                          </td>
                          <td className="num">{formatBRL(p.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="small muted">Acertos não entram nas receitas nem nas despesas acima.</p>
            </section>
          </div>

          <section className="card section">
            <div className="card-header">
              <h2>Progresso das metas</h2>
            </div>
            {(goals.data?.goals ?? []).length === 0 ? (
              <p className="small muted">Nenhuma meta.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {goals.data!.goals.map((g) => {
                  const saved = goals.data!.contributions.filter((c) => c.goalId === g.id && !c.cancelledAt).reduce((s, c) => s + c.amountCents, 0);
                  const inPer = goals.data!.contributions.filter((c) => c.goalId === g.id && !c.cancelledAt && inPeriod(c.contributedAt, period)).reduce((s, c) => s + c.amountCents, 0);
                  return (
                    <div key={g.id} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{g.name}</strong>
                        <span className="small num">
                          {formatBRL(saved)} de {formatBRL(g.targetCents)} ({percentOf(saved, g.targetCents)}%) · no período {formatBRL(inPer, { signed: true })}
                        </span>
                      </div>
                      <ProgressBar value={saved} max={g.targetCents} label={`Progresso de ${g.name}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
