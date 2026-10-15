import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useToast } from '@/ui/Toast';
import type { Period } from '@/domain/period';
import { createApi } from './api';
import { toAppError } from './errors';
import type { AttachmentEntity, GroupContext } from './models';
import { supabase } from './supabase';

export const api = createApi(supabase);

/** Todas as chaves da carteira começam com ['g', groupId] — invalidar o prefixo relê tudo. */
export const gk = (groupId: string, ...rest: unknown[]): QueryKey => ['g', groupId, ...rest];

export function useGroupContextQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ctx', user?.id],
    queryFn: () => api.getGroupContext(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
}

/** Contexto da carteira — só use dentro de rotas protegidas por RequireGroup. */
export function useGroup(): GroupContext {
  const { data } = useGroupContextQuery();
  if (!data) throw new Error('useGroup fora de uma carteira');
  return data;
}

export function useAccounts() {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'accounts'), queryFn: () => api.listAccounts(group.id) });
}

export function useAccountBalances() {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'account-balances'), queryFn: () => api.accountBalances() });
}

export function useBalanceSeries(period: Period) {
  const { group } = useGroup();
  return useQuery({
    queryKey: gk(group.id, 'balance-series', period.start, period.end),
    queryFn: () => api.balanceSeries(period),
  });
}

export function useCategories() {
  const { group } = useGroup();
  return useQuery({
    queryKey: gk(group.id, 'categories'),
    queryFn: () => api.listCategories(group.id),
    staleTime: 5 * 60_000,
  });
}

export function useTransactions(period: Period) {
  const { group } = useGroup();
  return useQuery({
    queryKey: gk(group.id, 'tx', period.start, period.end),
    queryFn: () => api.listTransactions(group.id, period),
  });
}

/** Gera as ocorrências recorrentes (idempotente) antes de listar contas. */
function useEnsureOccurrences() {
  const { group } = useGroup();
  return useQuery({
    queryKey: gk(group.id, 'occ-generated'),
    queryFn: async () => {
      await api.generateOccurrences();
      return true;
    },
    staleTime: 30 * 60_000,
  });
}

export function useOccurrences(period: Period) {
  const { group } = useGroup();
  const gen = useEnsureOccurrences();
  return useQuery({
    queryKey: gk(group.id, 'occ', period.start, period.end),
    queryFn: () => api.listOccurrences(group.id, period),
    enabled: gen.isSuccess || gen.isError,
  });
}

export function useBills() {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'bills'), queryFn: () => api.listBills(group.id) });
}

export function useMemberBalances(includePlanned = false) {
  const { group } = useGroup();
  return useQuery({
    queryKey: gk(group.id, 'member-balances', includePlanned),
    queryFn: () => api.memberBalances(includePlanned),
  });
}

export function useSettlements() {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'settlements'), queryFn: () => api.listSettlements(group.id) });
}

export function useBudgets(month: string) {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'budgets', month), queryFn: () => api.listBudgets(group.id, month) });
}

export function useGoals() {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'goals'), queryFn: () => api.listGoals(group.id) });
}

export function useAttachments(entityType: AttachmentEntity, entityId: string | null) {
  const { group } = useGroup();
  return useQuery({
    queryKey: gk(group.id, 'attachments', entityType, entityId),
    queryFn: () => api.listAttachments(entityType, entityId!),
    enabled: !!entityId,
  });
}

export function useActivity(limit = 50) {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'activity', limit), queryFn: () => api.listActivity(group.id, limit) });
}

export function useInvitations() {
  const { group } = useGroup();
  return useQuery({ queryKey: gk(group.id, 'invitations'), queryFn: () => api.listInvitations(group.id) });
}

/**
 * Mutação financeira padrão:
 *  - networkMode 'always': sem conexão, falha na hora (nada fica "na fila" fingindo que salvou);
 *  - só mostra sucesso depois da resposta do banco;
 *  - em seguida relê tudo da carteira (o banco é a fonte da verdade).
 */
export function useAppMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  options: { success?: string | ((r: TResult, v: TVars) => string); onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const { handleSessionExpired } = useAuth();
  return useMutation({
    mutationFn: fn,
    networkMode: 'always',
    retry: false,
    onSuccess: async (result, vars) => {
      await qc.invalidateQueries({ queryKey: ['g'] });
      await qc.invalidateQueries({ queryKey: ['ctx'] });
      const msg = typeof options.success === 'function' ? options.success(result, vars) : options.success;
      if (msg) toast.success(msg);
      options.onSuccess?.(result, vars);
    },
    onError: (error) => {
      const e = toAppError(error);
      toast.error(e.message);
      if (e.kind === 'session') handleSessionExpired();
    },
  });
}

/**
 * Identificador de requisição de um formulário. Fica fixo enquanto o
 * formulário está aberto: reenviar depois de uma falha de rede não duplica.
 */
export function useRequestId() {
  const [id, setId] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setId(crypto.randomUUID()), []);
  return [id, renew] as const;
}
