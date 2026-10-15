// Acertos entre o casal. O saldo líquido de cada pessoa vem do banco
// (get_member_balances), calculado como:
//   líquido = pago − responsabilidade + acertos enviados − acertos recebidos
// Positivo: tem a receber. Negativo: deve. A soma dos líquidos é sempre zero.
// Este módulo transforma esses saldos em "quem paga quanto a quem".

import { formatBRL } from './money';

export interface MemberBalance {
  userId: string;
  name: string;
  paidCents: number;
  shareCents: number;
  sentCents: number;
  receivedCents: number;
  netCents: number;
}

export interface Debt {
  fromUserId: string; // quem deve
  toUserId: string; // quem recebe
  amountCents: number;
}

/** Saldos líquidos a partir de totais (usado nos testes e em previsões locais). */
export function netBalance(b: Pick<MemberBalance, 'paidCents' | 'shareCents' | 'sentCents' | 'receivedCents'>): number {
  return b.paidCents - b.shareCents + b.sentCents - b.receivedCents;
}

/**
 * Menor conjunto de pagamentos que zera as dívidas. Com duas pessoas é um
 * único pagamento; com mais, casa devedores e credores em ordem determinística.
 */
export function resolveDebts(balances: readonly Pick<MemberBalance, 'userId' | 'netCents'>[]): Debt[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.userId, left: -b.netCents }))
    .sort((a, b) => b.left - a.left || (a.id < b.id ? -1 : 1));
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.userId, left: b.netCents }))
    .sort((a, b) => b.left - a.left || (a.id < b.id ? -1 : 1));

  const debts: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.left, c.left);
    if (amount > 0) debts.push({ fromUserId: d.id, toUserId: c.id, amountCents: amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) i += 1;
    if (c.left === 0) j += 1;
  }
  return debts;
}

/** Mensagem do ponto de vista de quem está olhando a tela. */
export function debtMessage(
  viewerId: string,
  debts: readonly Debt[],
  nameOf: (userId: string) => string,
): string {
  if (debts.length === 0) return 'Vocês estão quites.';
  const mine = debts.find((d) => d.fromUserId === viewerId || d.toUserId === viewerId) ?? debts[0]!;
  const amount = formatBRL(mine.amountCents);
  if (mine.fromUserId === viewerId) return `Você tem ${amount} para acertar com ${nameOf(mine.toUserId)}.`;
  if (mine.toUserId === viewerId) return `${nameOf(mine.fromUserId)} tem ${amount} para acertar com você.`;
  return `${nameOf(mine.fromUserId)} tem ${amount} para acertar com ${nameOf(mine.toUserId)}.`;
}

/** Validação local antes de enviar (o banco valida de novo, com trava). */
export function validateSettlementAmount(amountCents: number, pendingCents: number): string | null {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return 'Informe um valor maior que zero.';
  if (pendingCents <= 0) return 'Não há valor pendente para acertar.';
  if (amountCents > pendingCents) return `O valor é maior que o pendente (${formatBRL(pendingCents)}).`;
  return null;
}
