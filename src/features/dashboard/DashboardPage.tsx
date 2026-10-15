import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Goal as GoalIcon,
  Handshake,
  Landmark,
  PiggyBank,
  Plus,
  Scale,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Occurrence, Transaction } from '@/data/models';
import {
  useAccountBalances,
  useBudgets,
  useGoals,
  useGroup,
  useMemberBalances,
  useOccurrences,
  useTransactions,
} from '@/data/queries';
import { displayStatus, dueLabel, remainingCents } from '@/domain/bills';
import { alertTone, computeBudgetUsage } from '@/domain/budget';
import { toPendingBills } from '../shared/pending';
import { changePercent, monthlySeries, rankCategories, referenceDate, summarize } from '@/domain/ledger';
import { formatBRL, percentOf } from '@/domain/money';
import {
  addDays,
  addMonths,
  endOfMonth,
  inPeriod,
  isFullMonth,
  monthsBetween,
  precedingPeriod,
  startOfMonth,
  todayISO,
  type Period,
} from '@/domain/period';
import { debtMessage, resolveDebts } from '@/domain/settlement';
import { useQuickActions } from '@/layout/AppShell';
import { CategoryBars, IncomeExpenseChart, ProgressBar } from '@/ui/charts';
import { EmptyState, ErrorState, LoadingCard, Notice } from '@/ui/States';
import { PayOccurrenceForm } from '../bills/PayOccurrenceForm';
import { PeriodPicker, usePeriod } from '../shared/PeriodPicker';
import { useLookups } from '../shared/lookups';
import { TransactionDetails } from '../transactions/TransactionDetails';
import { TransactionRow } from '../transactions/TransactionsPage';

/** Intervalo de leitura que cobre o período, o período anterior e 6 meses de gráfico. */
export function overviewRange(period: Period): Period {
  const seriesStart = addMonths(startOfMonth(period.end), -5);
  const prev = precedingPeriod(period);
  return { start: [seriesStart, prev.start, period.start].sort()[0]!, end: period.end };
}


export function DashboardPage() {
  const periodState = usePeriod();
  const { period } = periodState;
  const today = todayISO();
  const { me, activeMembers, group } = useGroup();
  const { openTransaction } = useQuickActions();
  const range = overviewRange(period);
  const txs = useTransactions(range);
  const balances = useAccountBalances();
  const occs = useOccurrences({ start: period.start, end: [period.end, addDays(today, 30)].sort().reverse()[0]! });
  const budgetMonth = startOfMonth(period.start);
  const budgets = useBudgets(budgetMonth);
  const goals = useGoals();
  const memberBalances = useMemberBalances();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [paying, setPaying] = useState<Occurrence | null>(null);

  const data = useMemo(() => {
    if (!txs.data) return null;
    const current = summarize(txs.data, period);
    const previous = summarize(txs.data, precedingPeriod(period));
    const months = monthsBetween({ start: addMonths(startOfMonth(period.end), -5), end: period.end });
    return { current, previous, series: monthlySeries(txs.data, months) };
  }, [txs.data, period]);

  const firstName = me.name.split(' ')[0];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Olá, {firstName}</h1>
          <p>{group.name}</p>
        </div>
        <div style={{ minWidth: 'min(100%, 380px)' }}>
          <PeriodPicker value={periodState} />
        </div>
      </header>

      {activeMembers.length < 2 && (
        <div className="section">
          <Notice tone="info">
            <strong>Falta seu par.</strong> Enquanto só você participa, divisões e acertos ficam sem efeito.{' '}
            <Link to="/carteira">
              <UserPlus size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Convidar agora
            </Link>
          </Notice>
        </div>
      )}

      {txs.isError ? (
        <ErrorState error={txs.error} onRetry={() => void txs.refetch()} />
      ) : (
        <>
          <div className="grid grid-2 section">
            <BalanceCard balances={balances} occs={occs.data} txs={txs.data} period={period} today={today} />
            {data ? (
              <PeriodCard data={data} occs={occs.data ?? []} period={period} today={today} />
            ) : (
              <LoadingCard lines={4} />
            )}
          </div>

          <div className="grid grid-2 section">
            <BudgetCard budgets={budgets} txs={txs.data} occs={occs.data} />
            <ContributionsCard data={data} memberBalances={memberBalances} />
          </div>

          <div className="grid grid-2 section">
            <section className="card">
              <div className="card-header">
                <h2>Receitas × despesas (6 meses)</h2>
              </div>
              {data ? <IncomeExpenseChart data={data.series} /> : <LoadingCard lines={4} />}
            </section>
            <CategoriesCard data={data} />
          </div>

          <div className="grid grid-2 section">
            <UpcomingBillsCard occs={occs} today={today} onPay={setPaying} />
            <section className="card">
              <div className="card-header">
                <h2>Últimas movimentações</h2>
                <Link className="card-link" to="/movimentacoes">
                  Ver todas
                </Link>
              </div>
              {!txs.data ? (
                <LoadingCard lines={4} />
              ) : (
                <LatestList
                  txs={txs.data.filter((t) => t.status !== 'cancelled' && inPeriod(referenceDate(t), period))}
                  onOpen={setSelected}
                  onNew={() => openTransaction()}
                />
              )}
            </section>
          </div>

          <GoalsCard goals={goals} />
        </>
      )}

      {selected && <TransactionDetails tx={selected} onClose={() => setSelected(null)} />}
      {paying && <PayOccurrenceForm occurrence={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
function BalanceCard({
  balances,
  occs,
  txs,
  period,
  today,
}: {
  balances: ReturnType<typeof useAccountBalances>;
  occs: Occurrence[] | undefined;
  txs: Transaction[] | undefined;
  period: Period;
  today: string;
}) {
  if (balances.isPending) return <LoadingCard lines={3} />;
  if (balances.isError) return <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />;

  const active = balances.data.filter((a) => !a.archived);
  if (active.length === 0) {
    return (
      <section className="card">
        <EmptyState icon={Landmark} title="Cadastre suas contas" action={<Link className="btn btn-primary" to="/carteira">Cadastrar contas</Link>}>
          Para mostrar quanto vocês têm, o app precisa das contas e do saldo inicial de cada uma. Ele não inventa um saldo.
        </EmptyState>
      </section>
    );
  }
  const total = active.reduce((s, a) => s + a.balanceCents, 0);
  const missing = active.filter((a) => a.openingMissing);

  // Projeção: só faz sentido olhando o mês corrente.
  const showProjection = isFullMonth(period) && period.start === startOfMonth(today);
  let projection: number | null = null;
  if (showProjection && occs && txs) {
    const monthEnd = endOfMonth(today);
    const open = occs.filter((o) => (o.status === 'pending' || o.status === 'partial') && o.dueDate <= monthEnd);
    const toPay = open.filter((o) => o.bill.kind === 'payable').reduce((s, o) => s + remainingCents(o), 0);
    const toReceive = open.filter((o) => o.bill.kind === 'receivable').reduce((s, o) => s + remainingCents(o), 0);
    const planned = summarize(txs, { start: startOfMonth(today), end: monthEnd });
    projection = total - toPay + toReceive - planned.plannedExpenseCents + planned.plannedIncomeCents;
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 16 }}>
      <div className="hero">
        <span className="stat-label">
          <Wallet size={14} aria-hidden /> Saldo atual nas contas
        </span>
        <span className={`hero-value ${total < 0 ? 'expense' : ''}`}>{formatBRL(total)}</span>
        <span className="stat-sub">Saldo inicial + movimentações efetivas. Previstas não entram.</span>
      </div>
      {missing.length > 0 && (
        <Notice tone="warning">
          Saldo incompleto: {missing.map((a) => a.name).join(', ')} {missing.length > 1 ? 'estão' : 'está'} sem saldo inicial, então só
          o que passou pelo app é considerado. <Link to="/carteira">Informar saldo inicial</Link>
        </Notice>
      )}
      <ul className="list">
        {active.map((a) => (
          <li key={a.accountId} className="list-item">
            <span className="list-main">
              <span className="list-title" style={{ display: 'block' }}>
                {a.name}
              </span>
              <span className="list-sub">{a.ownerId ? 'Pessoal' : 'Conjunta'}</span>
            </span>
            <span className={`list-end ${a.balanceCents < 0 ? 'expense' : ''}`}>{formatBRL(a.balanceCents)}</span>
          </li>
        ))}
      </ul>
      {projection !== null && (
        <div className="stat" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <span className="stat-label">Projeção para o fim do mês</span>
          <span className={`stat-value ${projection < 0 ? 'expense' : ''}`}>{formatBRL(projection)}</span>
          <span className="stat-sub">Saldo atual − contas e despesas previstas até o fim do mês + receitas previstas.</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
type Data = { current: ReturnType<typeof summarize>; previous: ReturnType<typeof summarize>; series: ReturnType<typeof monthlySeries> };

function Change({ current, previous, inverse }: { current: number; previous: number; inverse?: boolean }) {
  const pct = changePercent(current, previous);
  if (pct === null) return <span className="stat-sub">Sem base no período anterior</span>;
  const worse = inverse ? pct > 0 : pct < 0;
  return (
    <span className="stat-sub" style={{ color: pct === 0 ? undefined : worse ? 'var(--red)' : 'var(--green-700)' }}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct).toLocaleString('pt-BR')}% vs. período anterior
    </span>
  );
}

function PeriodCard({ data, occs, period, today }: { data: Data; occs: Occurrence[]; period: Period; today: string }) {
  const { current, previous } = data;
  const due = occs.filter((o) => (o.status === 'pending' || o.status === 'partial') && o.dueDate <= period.end);
  const payable = due.filter((o) => o.bill.kind === 'payable');
  const receivable = due.filter((o) => o.bill.kind === 'receivable');
  const toPay = payable.reduce((s, o) => s + remainingCents(o), 0) + current.plannedExpenseCents;
  const toReceive = receivable.reduce((s, o) => s + remainingCents(o), 0) + current.plannedIncomeCents;
  const overdue = payable.filter((o) => displayStatus(o, today) === 'overdue').length;

  return (
    <section className="card" style={{ display: 'grid', gap: 16 }}>
      <div className="grid grid-stats" style={{ gap: 16 }}>
        <div className="stat">
          <span className="stat-label">
            <ArrowDownLeft size={14} aria-hidden /> Receitas recebidas
          </span>
          <span className="stat-value income">{formatBRL(current.incomeCents)}</span>
          <Change current={current.incomeCents} previous={previous.incomeCents} />
        </div>
        <div className="stat">
          <span className="stat-label">
            <ArrowUpRight size={14} aria-hidden /> Despesas pagas
          </span>
          <span className="stat-value expense">{formatBRL(current.expenseCents)}</span>
          <Change current={current.expenseCents} previous={previous.expenseCents} inverse />
        </div>
        <div className="stat">
          <span className="stat-label">
            <Scale size={14} aria-hidden /> Saldo do período
          </span>
          <span className={`stat-value ${current.netCents < 0 ? 'expense' : 'income'}`}>{formatBRL(current.netCents, { signed: true })}</span>
          <span className="stat-sub">{current.netCents >= 0 ? 'Vocês estão economizando.' : 'Gastaram mais do que receberam.'}</span>
        </div>
      </div>
      <div className="grid grid-stats" style={{ gap: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div className="stat">
          <span className="stat-label">
            <CalendarClock size={14} aria-hidden /> A pagar (previsto)
          </span>
          <span className="stat-value">{formatBRL(toPay)}</span>
          <span className="stat-sub">
            {payable.length} conta(s){overdue ? ` · ${overdue} vencida(s)` : ''} + despesas previstas
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">A receber (previsto)</span>
          <span className="stat-value">{formatBRL(toReceive)}</span>
          <span className="stat-sub">Não conta no saldo até ser recebido</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
function BudgetCard({
  budgets,
  txs,
  occs,
}: {
  budgets: ReturnType<typeof useBudgets>;
  txs: Transaction[] | undefined;
  occs: Occurrence[] | undefined;
}) {
  if (budgets.isPending || !txs) return <LoadingCard lines={3} />;
  if (budgets.isError) return <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />;
  const overall = budgets.data.find((b) => b.kind === 'overall' && !b.memberId);
  const pending = toPendingBills(occs ?? []);

  if (!overall) {
    return (
      <section className="card">
        <EmptyState icon={PiggyBank} title="Sem orçamento para este mês" action={<Link className="btn btn-secondary" to="/orcamento">Planejar o mês</Link>}>
          Defina um limite geral de gastos para saber quanto ainda dá para gastar até o fim do mês.
        </EmptyState>
      </section>
    );
  }
  const u = computeBudgetUsage(overall, txs, pending);
  const free = overall.limitCents - u.committedCents;
  const tone = alertTone(u);
  const categoryAlerts = budgets.data
    .filter((b) => b.kind === 'category')
    .map((b) => computeBudgetUsage(b, txs, pending))
    .filter((x) => x.alert !== null);

  return (
    <section className="card" style={{ display: 'grid', gap: 14 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <h2>Orçamento do mês</h2>
        <Link className="card-link" to="/orcamento">
          Detalhes
        </Link>
      </div>
      <div className="stat">
        <span className="stat-label">Ainda dá para gastar</span>
        <span className={`stat-value ${free < 0 ? 'expense' : ''}`}>{formatBRL(free)}</span>
        <span className="stat-sub">Limite − pago − previsto até o fim do mês</span>
      </div>
      <ProgressBar value={u.spentCents} committed={u.committedCents} max={overall.limitCents} tone={tone} label="Orçamento consumido" />
      <dl className="dl">
        <dt>Planejado</dt>
        <dd className="num">{formatBRL(overall.limitCents)}</dd>
        <dt>Pago</dt>
        <dd className="num">
          {formatBRL(u.spentCents)} ({u.percentUsed}%)
        </dd>
        <dt>Comprometido</dt>
        <dd className="num">
          {formatBRL(u.committedCents)} ({u.percentCommitted}%)
        </dd>
      </dl>
      {u.alert !== null && <Notice tone={tone === 'danger' ? 'danger' : 'warning'}>Vocês já usaram {u.percentUsed}% do orçamento do mês.</Notice>}
      {categoryAlerts.length > 0 && (
        <p className="small muted">
          {categoryAlerts.length} categoria(s) passaram de um limite de alerta. <Link to="/orcamento">Ver orçamento</Link>
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function ContributionsCard({ data, memberBalances }: { data: Data | null; memberBalances: ReturnType<typeof useMemberBalances> }) {
  const { activeMembers, userId, members } = useGroup();
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? 'Ex-participante';
  const expense = data?.current.expenseCents ?? 0;

  return (
    <section className="card" style={{ display: 'grid', gap: 14 }}>
      <div className="card-header" style={{ marginBottom: 0 }}>
        <h2>Quem contribuiu</h2>
        <Link className="card-link" to="/acertos">
          Acertos
        </Link>
      </div>
      {memberBalances.isPending ? (
        <LoadingCard lines={2} />
      ) : memberBalances.isError ? (
        <ErrorState error={memberBalances.error} onRetry={() => void memberBalances.refetch()} />
      ) : (
        <div className="notice notice-info" role="status">
          <Handshake size={18} aria-hidden />
          <span>
            <strong>{debtMessage(userId, resolveDebts(memberBalances.data), nameOf)}</strong>
          </span>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>No período</th>
              <th className="num">Recebeu</th>
              <th className="num">Pagou</th>
              <th className="num">Responsável</th>
              <th className="num">Deveria</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m) => {
              const t = data?.current.byMember.get(m.userId);
              return (
                <tr key={m.userId}>
                  <td>{m.userId === userId ? 'Você' : m.name}</td>
                  <td className="num">{formatBRL(t?.receivedCents ?? 0)}</td>
                  <td className="num">{formatBRL(t?.paidCents ?? 0)}</td>
                  <td className="num">{formatBRL(t?.shareCents ?? 0)}</td>
                  <td className="num">{formatBRL(Math.round((expense * m.sharePercent) / 100))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        “Deveria” = despesas do período × divisão sugerida ({activeMembers.map((m) => `${m.name.split(' ')[0]} ${m.sharePercent.toLocaleString('pt-BR')}%`).join(' / ')}).
        {data && data.current.jointPaidCents > 0 && ` ${formatBRL(data.current.jointPaidCents)} saíram da conta conjunta.`}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
function CategoriesCard({ data }: { data: Data | null }) {
  const l = useLookups();
  return (
    <section className="card">
      <div className="card-header">
        <h2>Gastos por categoria</h2>
      </div>
      {!data ? (
        <LoadingCard lines={4} />
      ) : data.current.expenseCents === 0 ? (
        <EmptyState icon={PiggyBank} title="Sem despesas no período" />
      ) : (
        <CategoryBars
          rows={rankCategories(data.current.expenseByCategory).map((r) => ({ id: r.categoryId, name: l.categoryName(r.categoryId), cents: r.cents, percent: r.percent }))}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function UpcomingBillsCard({ occs, today, onPay }: { occs: ReturnType<typeof useOccurrences>; today: string; onPay: (o: Occurrence) => void }) {
  const upcoming = (occs.data ?? [])
    .filter((o) => (o.status === 'pending' || o.status === 'partial') && o.dueDate <= addDays(today, 15))
    .slice(0, 6);
  return (
    <section className="card">
      <div className="card-header">
        <h2>Próximas contas</h2>
        <Link className="card-link" to="/contas">
          Ver todas
        </Link>
      </div>
      {occs.isPending ? (
        <LoadingCard lines={3} />
      ) : occs.isError ? (
        <ErrorState error={occs.error} onRetry={() => void occs.refetch()} />
      ) : upcoming.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nada vencendo nos próximos 15 dias" action={<Link className="btn btn-secondary btn-sm" to="/contas">Cadastrar conta</Link>} />
      ) : (
        <ul className="list">
          {upcoming.map((o) => {
            const overdue = displayStatus(o, today) === 'overdue';
            return (
              <li key={o.id} className="list-item">
                <span className="list-main">
                  <span className="list-title" style={{ display: 'block' }}>
                    {o.bill.description}
                  </span>
                  <span className="list-sub" style={{ color: overdue ? 'var(--red)' : undefined }}>
                    {dueLabel(o.dueDate, today)}
                    {o.status === 'partial' ? ' · parcialmente paga' : ''}
                  </span>
                </span>
                <span className="list-end">{formatBRL(remainingCents(o))}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPay(o)}>
                  {o.bill.kind === 'payable' ? 'Pagar' : 'Receber'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LatestList({ txs, onOpen, onNew }: { txs: Transaction[]; onOpen: (t: Transaction) => void; onNew: () => void }) {
  const latest = [...txs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  if (latest.length === 0) {
    return (
      <EmptyState icon={Plus} title="Nenhuma movimentação no período" action={<button type="button" className="btn btn-primary btn-sm" onClick={onNew}>Lançar agora</button>} />
    );
  }
  return (
    <ul className="list">
      {latest.map((t) => (
        <TransactionRow key={t.id} tx={t} onOpen={() => onOpen(t)} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
function GoalsCard({ goals }: { goals: ReturnType<typeof useGoals> }) {
  if (goals.isPending) return <LoadingCard lines={2} />;
  if (goals.isError) return <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />;
  const active = goals.data.goals.filter((g) => g.status === 'active');
  const saved = (id: string) => goals.data.contributions.filter((c) => c.goalId === id && !c.cancelledAt).reduce((s, c) => s + c.amountCents, 0);
  return (
    <section className="card section">
      <div className="card-header">
        <h2>Metas em andamento</h2>
        <Link className="card-link" to="/metas">
          Ver metas
        </Link>
      </div>
      {active.length === 0 ? (
        <EmptyState icon={GoalIcon} title="Nenhuma meta ainda" action={<Link className="btn btn-secondary btn-sm" to="/metas">Criar meta</Link>}>
          Reserva de emergência, viagem, entrada do imóvel…
        </EmptyState>
      ) : (
        <div className="grid grid-2">
          {active.slice(0, 4).map((g) => {
            const s = saved(g.id);
            return (
              <div key={g.id} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{g.name}</strong>
                  <span className="num small">{percentOf(s, g.targetCents)}%</span>
                </div>
                <ProgressBar value={s} max={g.targetCents} label={`Progresso de ${g.name}`} />
                <span className="small muted">
                  {formatBRL(s)} guardados de {formatBRL(g.targetCents)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
