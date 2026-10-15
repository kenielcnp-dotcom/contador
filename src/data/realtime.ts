import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const TABLES = [
  'transactions',
  'expense_splits',
  'accounts',
  'categories',
  'bills',
  'bill_occurrences',
  'settlements',
  'settlement_payments',
  'budgets',
  'savings_goals',
  'goal_contributions',
  'group_members',
  'attachments',
] as const;

export type RealtimeState = 'connecting' | 'live' | 'offline';

/**
 * Assina as mudanças da carteira. Não aplica os dados do evento na tela:
 * só invalida o cache, e a tela relê do banco (fonte da verdade, já com RLS).
 */
export function useRealtimeSync(groupId: string | undefined): RealtimeState {
  const qc = useQueryClient();
  const [state, setState] = useState<RealtimeState>('connecting');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!groupId) return;
    const refresh = () => {
      clearTimeout(timer.current);
      // Agrupa rajadas (uma despesa gera linhas em duas tabelas).
      timer.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['g', groupId] });
        void qc.invalidateQueries({ queryKey: ['ctx'] });
      }, 250);
    };

    let channel = supabase.channel(`carteira:${groupId}`);
    for (const table of TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, refresh);
    }
    channel = channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'financial_groups', filter: `id=eq.${groupId}` }, refresh);
    // A assinatura no Postgres é confirmada depois do SUBSCRIBED: relê de novo
    // nesse momento para não perder nada que mudou no intervalo.
    channel = channel.on('system', {}, (p: { extension?: string; status?: string }) => {
      if (p.extension === 'postgres_changes' && p.status === 'ok') refresh();
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setState('live');
        refresh(); // o que mudou enquanto estávamos desconectados
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setState('offline');
      }
    });

    return () => {
      clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [groupId, qc]);

  return state;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
