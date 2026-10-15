import { useMemo } from 'react';
import type { Account, Category, PaymentMethod } from '@/data/models';
import { useAccounts, useCategories, useGroup } from '@/data/queries';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export const KIND_LABEL = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' } as const;

export const SPLIT_LABEL = {
  equal: 'Dividida igualmente',
  percent: 'Dividida por percentual',
  custom: 'Valores personalizados',
  individual: 'Individual',
} as const;

/** Mapas de nomes usados em listas, detalhes, relatórios e CSV. */
export function useLookups() {
  const { members, userId } = useGroup();
  const categories = useCategories();
  const accounts = useAccounts();

  return useMemo(() => {
    const categoryById = new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c]));
    const accountById = new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a]));
    const memberById = new Map(members.map((m) => [m.userId, m]));
    const memberName = (id: string | null | undefined, opts: { you?: boolean } = {}) => {
      if (!id) return 'Conta conjunta';
      if (opts.you && id === userId) return 'Você';
      return memberById.get(id)?.name ?? 'Ex-participante';
    };
    const categoryName = (id: string | null | undefined) =>
      id ? (categoryById.get(id)?.name ?? 'Categoria removida') : 'Sem categoria';
    const accountName = (id: string | null | undefined) => (id ? (accountById.get(id)?.name ?? 'Conta removida') : 'Fora das contas');
    return {
      categories: categories.data ?? [],
      accounts: accounts.data ?? [],
      categoryById,
      accountById,
      memberName,
      categoryName,
      accountName,
      ready: categories.isSuccess && accounts.isSuccess,
      error: categories.error ?? accounts.error,
    };
  }, [categories.data, categories.isSuccess, categories.error, accounts.data, accounts.isSuccess, accounts.error, members, userId]);
}
