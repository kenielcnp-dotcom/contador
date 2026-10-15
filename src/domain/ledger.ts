// Contabilização por período — FONTE ÚNICA para dashboard e relatórios.
// Nenhuma tela soma movimentações por conta própria: todas chamam estas funções.
//
// Regras:
//  * Canceladas nunca contam.
//  * Efetivadas contam na data efetiva (paid_at); previstas, na data de
//    competência. Efetivado e previsto ficam SEMPRE em campos separados.
//  * Transferências não são receita nem despesa (só movem saldo entre contas).
//  * Uma despesa conta uma vez, pelo valor total. O rateio só distribui a
//    responsabilidade entre as pessoas.

import { inPeriod, type ISODate, type Period } from './period';

export type TxKind = 'income' | 'expense' | 'transfer';
export type TxStatus = 'planned' | 'effective' | 'cancelled';

export interface LedgerSplit {
  userId: string;
  shareCents: number;
}

export interface LedgerTx {
  id: string;
  kind: TxKind;
  status: TxStatus;
  amountCents: number;
  categoryId: string | null;
  competenceDate: ISODate;
  paidAt: ISODate | null;
  accountId: string | null;
  toAccountId: string | null;
  paidBy: string | null;
  splits: LedgerSplit[];
}

export interface MemberTotals {
  /** Despesas efetivas pagas por esta pessoa (valor total de cada uma). */
  paidCents: number;
  /** Receitas efetivas recebidas por esta pessoa. */
  receivedCents: number;
  /** Responsabilidade desta pessoa nas despesas efetivas (soma das partes). */
  shareCents: number;
}

export interface PeriodSummary {
  incomeCents: number;
  expenseCents: number;
  /** Receitas − despesas efetivas. */
  netCents: number;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
  transferCents: number;
  /** Despesas efetivas pagas pela conta conjunta (sem pagador individual). */
  jointPaidCents: number;
  expenseByCategory: Map<string, number>;
  incomeByCategory: Map<string, number>;
  byMember: Map<string, MemberTotals>;
  effectiveCount: number;
  plannedCount: number;
}

export function referenceDate(tx: Pick<LedgerTx, 'status' | 'paidAt' | 'competenceDate'>): ISODate {
  return tx.status === 'effective' && tx.paidAt ? tx.paidAt : tx.competenceDate;
}

function member(map: Map<string, MemberTotals>, userId: string): MemberTotals {
  let m = map.get(userId);
  if (!m) {
    m = { paidCents: 0, receivedCents: 0, shareCents: 0 };
    map.set(userId, m);
  }
  return m;
}

function add(map: Map<string, number>, key: string | null, cents: number) {
  const k = key ?? 'sem-categoria';
  map.set(k, (map.get(k) ?? 0) + cents);
}

export function summarize(txs: readonly LedgerTx[], period: Period): PeriodSummary {
  const s: PeriodSummary = {
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    plannedIncomeCents: 0,
    plannedExpenseCents: 0,
    transferCents: 0,
    jointPaidCents: 0,
    expenseByCategory: new Map(),
    incomeByCategory: new Map(),
    byMember: new Map(),
    effectiveCount: 0,
    plannedCount: 0,
  };

  for (const tx of txs) {
    if (tx.status === 'cancelled') continue;
    if (!inPeriod(referenceDate(tx), period)) continue;

    if (tx.status === 'planned') {
      s.plannedCount += 1;
      if (tx.kind === 'income') s.plannedIncomeCents += tx.amountCents;
      else if (tx.kind === 'expense') s.plannedExpenseCents += tx.amountCents;
      continue;
    }

    s.effectiveCount += 1;
    switch (tx.kind) {
      case 'transfer':
        s.transferCents += tx.amountCents;
        break;
      case 'income':
        s.incomeCents += tx.amountCents;
        add(s.incomeByCategory, tx.categoryId, tx.amountCents);
        if (tx.paidBy) member(s.byMember, tx.paidBy).receivedCents += tx.amountCents;
        break;
      case 'expense':
        s.expenseCents += tx.amountCents;
        add(s.expenseByCategory, tx.categoryId, tx.amountCents);
        if (tx.paidBy) member(s.byMember, tx.paidBy).paidCents += tx.amountCents;
        else s.jointPaidCents += tx.amountCents;
        for (const split of tx.splits) member(s.byMember, split.userId).shareCents += split.shareCents;
        break;
    }
  }
  s.netCents = s.incomeCents - s.expenseCents;
  return s;
}

export interface MonthPoint {
  month: ISODate;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

/** Receitas × despesas efetivas por mês (mesmas regras de summarize). */
export function monthlySeries(txs: readonly LedgerTx[], months: readonly ISODate[]): MonthPoint[] {
  return months.map((month) => {
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10);
    const s = summarize(txs, { start: month, end });
    return { month, incomeCents: s.incomeCents, expenseCents: s.expenseCents, netCents: s.netCents };
  });
}

export interface CategoryShare {
  categoryId: string;
  cents: number;
  percent: number;
}

/** Categorias ordenadas por valor, com percentual do total (soma 100 após arredondar). */
export function rankCategories(byCategory: Map<string, number>): CategoryShare[] {
  const total = [...byCategory.values()].reduce((a, b) => a + b, 0);
  const rows = [...byCategory.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([categoryId, cents]) => ({ categoryId, cents, percent: total ? (cents * 100) / total : 0 }));
  return rows.map((r) => ({ ...r, percent: Math.round(r.percent * 10) / 10 }));
}

/** Diferença percentual entre dois valores (null se não há base de comparação). */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 1000) / Math.abs(previous)) / 10;
}
