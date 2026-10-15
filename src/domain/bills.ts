// Situação das contas a pagar/receber. "Vencida" não é gravada no banco:
// deriva da data, para nunca ficar desatualizada.

import { addDays, daysBetween, endOfMonth, startOfMonth, type ISODate } from './period';

export type OccurrenceStatus = 'pending' | 'partial' | 'paid' | 'cancelled';
export type DisplayStatus = OccurrenceStatus | 'overdue';

export interface OccurrenceLike {
  status: OccurrenceStatus;
  dueDate: ISODate;
  amountCents: number;
  paidCents: number;
}

export function remainingCents(o: Pick<OccurrenceLike, 'amountCents' | 'paidCents' | 'status'>): number {
  if (o.status === 'cancelled' || o.status === 'paid') return 0;
  return Math.max(0, o.amountCents - o.paidCents);
}

export function displayStatus(o: OccurrenceLike, today: ISODate): DisplayStatus {
  if ((o.status === 'pending' || o.status === 'partial') && o.dueDate < today) return 'overdue';
  return o.status;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: 'Pendente',
  partial: 'Parcialmente paga',
  paid: 'Paga',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
};

export type BillWindow = '7d' | '30d' | 'month' | 'overdue' | 'all';

/** Filtra ocorrências abertas (pendentes/parciais) por janela de vencimento. */
export function inWindow(o: OccurrenceLike, window: BillWindow, today: ISODate): boolean {
  const open = o.status === 'pending' || o.status === 'partial';
  switch (window) {
    case 'overdue':
      return open && o.dueDate < today;
    case '7d':
      return open && o.dueDate <= addDays(today, 7);
    case '30d':
      return open && o.dueDate <= addDays(today, 30);
    case 'month':
      return o.dueDate >= startOfMonth(today) && o.dueDate <= endOfMonth(today);
    case 'all':
      return true;
  }
}

export function dueLabel(dueDate: ISODate, today: ISODate): string {
  const d = daysBetween(today, dueDate);
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  if (d > 1) return `Vence em ${d} dias`;
  if (d === -1) return 'Venceu ontem';
  return `Venceu há ${-d} dias`;
}
