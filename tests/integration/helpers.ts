import { createClient } from '@supabase/supabase-js';
import { inject } from 'vitest';
import { createApi, type Client, type TransactionInput } from '@/data/api';
import type { Database } from '@/data/database.types';
import { todayISO } from '@/domain/period';
import { computeSplits } from '@/domain/split';

export const PASSWORD = 'SenhaForte123';

export function newClient(): Client {
  return createClient<Database>(inject('supabaseUrl'), inject('anonKey'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Cliente administrativo SÓ para preparar cenários de teste (ignora RLS). */
export function adminClient(): Client {
  return createClient<Database>(inject('supabaseUrl'), inject('serviceKey'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  client: Client;
  api: ReturnType<typeof createApi>;
  userId: string;
  email: string;
  name: string;
}

let n = 0;
export async function signUp(name: string): Promise<TestUser> {
  const client = newClient();
  const api = createApi(client);
  n += 1;
  const email = `${name.toLowerCase()}-${Date.now()}-${n}-${Math.random().toString(36).slice(2, 7)}@teste.local`;
  const { needsConfirmation, user } = await api.signUp(email, PASSWORD, name);
  if (needsConfirmation || !user) throw new Error('Cadastro local deveria entrar direto (confirmação desligada no config.toml).');
  return { client, api, userId: user.id, email, name };
}

export interface Couple {
  ana: TestUser;
  bruno: TestUser;
  groupId: string;
  cat: Record<string, string>;
}

/** Ana cria a carteira e convida; Bruno aceita. */
export async function setupCouple(): Promise<Couple> {
  const ana = await signUp('Ana');
  const bruno = await signUp('Bruno');
  const groupId = (await ana.api.createGroup('Casa de teste')) as string;
  const invite = await ana.api.createInvitation(72);
  await bruno.api.acceptInvitation(invite.token);
  const cats = await ana.api.listCategories(groupId);
  return { ana, bruno, groupId, cat: Object.fromEntries(cats.map((c) => [c.name, c.id])) };
}

export function expense(c: Couple, partial: Partial<TransactionInput> & { amountCents: number }): TransactionInput {
  const amount = partial.amountCents;
  return {
    clientRequestId: crypto.randomUUID(),
    kind: 'expense',
    description: 'Despesa de teste',
    categoryId: c.cat['Mercado']!,
    competenceDate: todayISO(),
    paidAt: todayISO(),
    status: 'effective',
    accountId: null,
    toAccountId: null,
    paidBy: c.ana.userId,
    splitMode: 'equal',
    splits: computeSplits({ mode: 'equal', amountCents: amount, userIds: [c.ana.userId, c.bruno.userId] }),
    paymentMethod: null,
    notes: null,
    ...partial,
  };
}

export async function expectRejects(p: Promise<unknown>, pattern?: RegExp): Promise<string> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pattern && !pattern.test(msg)) throw new Error(`Erro inesperado: ${msg}`);
    return msg;
  }
  throw new Error('Era esperado que a operação fosse recusada, mas ela passou.');
}

export const month = () => ({ start: `${todayISO().slice(0, 7)}-01`, end: todayISO() });
