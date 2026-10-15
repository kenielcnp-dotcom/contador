import type { LedgerTx } from '@/domain/ledger';

export const ANA = 'aaaaaaaa-0000-0000-0000-000000000001';
export const BRUNO = 'bbbbbbbb-0000-0000-0000-000000000002';
export const MERCADO = 'cat-mercado';
export const SALARIO = 'cat-salario';
export const LAZER = 'cat-lazer';
export const CONTA_ANA = 'acc-ana';
export const CONJUNTA = 'acc-conjunta';
export const RESERVA = 'acc-reserva';

let seq = 0;
export function tx(partial: Partial<LedgerTx>): LedgerTx {
  seq += 1;
  return {
    id: `tx-${seq}`,
    kind: 'expense',
    status: 'effective',
    amountCents: 0,
    categoryId: MERCADO,
    competenceDate: '2026-10-05',
    paidAt: '2026-10-05',
    accountId: null,
    toAccountId: null,
    paidBy: ANA,
    splits: [],
    ...partial,
  };
}

/** Mercado de R$ 600 pago integralmente pela Ana, dividido 50/50. */
export const mercado600 = () =>
  tx({
    amountCents: 60000,
    accountId: CONTA_ANA,
    splits: [
      { userId: ANA, shareCents: 30000 },
      { userId: BRUNO, shareCents: 30000 },
    ],
  });
