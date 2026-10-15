// Orçamento mensal. Usa o MESMO critério do ledger: despesa efetiva conta uma
// vez pelo valor total (ou pela parte da pessoa, num orçamento individual);
// transferências nunca são gasto.

import { referenceDate, type LedgerTx } from './ledger';
import { percentOf } from './money';
import { inPeriod, monthPeriod, type ISODate } from './period';

export type BudgetKind = 'overall' | 'category' | 'savings';

export interface Budget {
  id: string;
  month: ISODate;
  kind: BudgetKind;
  categoryId: string | null;
  memberId: string | null;
  limitCents: number;
  alertThresholds: number[];
}

export interface PendingBill {
  /** Valor ainda não pago da ocorrência. */
  remainingCents: number;
  dueDate: ISODate;
  categoryId: string | null;
  kind: 'payable' | 'receivable';
}

export interface BudgetUsage {
  budget: Budget;
  /** Despesas efetivas (ou receitas − despesas, para meta de economia). */
  spentCents: number;
  /** Previsto: despesas planejadas + contas a pagar pendentes do mês. */
  plannedCents: number;
  /** Comprometido = efetivo + previsto. */
  committedCents: number;
  /** Limite − efetivo (pode ser negativo). */
  remainingCents: number;
  percentUsed: number;
  percentCommitted: number;
  /** Maior limiar de alerta atingido pelo efetivo (ex.: 90), ou null. */
  alert: number | null;
}

function expenseValue(tx: LedgerTx, memberId: string | null): number {
  if (!memberId) return tx.amountCents;
  return tx.splits.find((s) => s.userId === memberId)?.shareCents ?? 0;
}

function matchesCategory(budget: Budget, categoryId: string | null) {
  return budget.kind !== 'category' || budget.categoryId === categoryId;
}

export function computeBudgetUsage(
  budget: Budget,
  txs: readonly LedgerTx[],
  pendingBills: readonly PendingBill[] = [],
): BudgetUsage {
  const period = monthPeriod(budget.month);
  let spent = 0;
  let planned = 0;

  if (budget.kind === 'savings') {
    // Meta de economia: quanto sobrou (receitas − despesas efetivas).
    for (const tx of txs) {
      if (tx.status !== 'effective' || !inPeriod(referenceDate(tx), period)) continue;
      if (tx.kind === 'income') spent += tx.amountCents;
      if (tx.kind === 'expense') spent -= tx.amountCents;
    }
    const pct = percentOf(Math.max(spent, 0), budget.limitCents);
    return {
      budget,
      spentCents: spent,
      plannedCents: 0,
      committedCents: spent,
      remainingCents: budget.limitCents - spent,
      percentUsed: pct,
      percentCommitted: pct,
      alert: null,
    };
  }

  for (const tx of txs) {
    if (tx.kind !== 'expense' || tx.status === 'cancelled') continue;
    if (!matchesCategory(budget, tx.categoryId)) continue;
    if (!inPeriod(referenceDate(tx), period)) continue;
    const value = expenseValue(tx, budget.memberId);
    if (tx.status === 'effective') spent += value;
    else planned += value;
  }
  // Contas pendentes entram como previstas (orçamento individual não as divide).
  if (!budget.memberId) {
    for (const bill of pendingBills) {
      if (bill.kind !== 'payable' || !matchesCategory(budget, bill.categoryId)) continue;
      if (inPeriod(bill.dueDate, period)) planned += bill.remainingCents;
    }
  }

  const percentUsed = percentOf(spent, budget.limitCents);
  const thresholds = [...budget.alertThresholds].sort((a, b) => b - a);
  const alert = thresholds.find((t) => percentUsed >= t) ?? null;
  return {
    budget,
    spentCents: spent,
    plannedCents: planned,
    committedCents: spent + planned,
    remainingCents: budget.limitCents - spent,
    percentUsed,
    percentCommitted: percentOf(spent + planned, budget.limitCents),
    alert,
  };
}

export type AlertTone = 'ok' | 'notice' | 'warning' | 'danger';

export function alertTone(usage: Pick<BudgetUsage, 'alert' | 'percentUsed'>): AlertTone {
  if (usage.percentUsed >= 100) return 'danger';
  if (usage.alert === null) return 'ok';
  if (usage.alert >= 90) return 'warning';
  return 'notice';
}
