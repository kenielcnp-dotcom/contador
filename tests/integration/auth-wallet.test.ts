import { inject } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createApi } from '@/data/api';
import { toAppError } from '@/data/errors';
import { adminClient, expectRejects, expense, newClient, PASSWORD, setupCouple, signUp } from './helpers';

describe('cadastro, login e sessão', () => {
  it('cadastro cria o perfil com o nome informado', async () => {
    const u = await signUp('Carla');
    const { data } = await u.client.from('profiles').select('full_name').eq('id', u.userId).single();
    expect(data?.full_name).toBe('Carla');
  });

  it('login com senha errada dá mensagem em português', async () => {
    const u = await signUp('Davi');
    const other = createApi(newClient());
    await expectRejects(other.signIn(u.email, 'senha-errada-1'), /E-mail ou senha incorretos/);
  });

  it('dados persistem após logout e novo login', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 12345, description: 'Persistência' }));
    await c.ana.api.signOut();
    // Deslogado, o RLS não devolve nada.
    const { data: none } = await c.ana.client.from('transactions').select('id');
    expect(none ?? []).toHaveLength(0);
    await c.ana.api.signIn(c.ana.email, PASSWORD);
    const ctx = await c.ana.api.getGroupContext(c.ana.userId);
    expect(ctx?.group.id).toBe(c.groupId);
    const { data } = await c.ana.client.from('transactions').select('description, amount_cents');
    expect(data).toEqual([{ description: 'Persistência', amount_cents: 12345 }]);
  });

  it('sessão inválida/expirada é tratada como sessão expirada', async () => {
    const fake = createClient(inject('supabaseUrl'), inject('anonKey'), {
      auth: { persistSession: false },
      global: { headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid' } },
    });
    const { error } = await fake.from('transactions').select('id');
    expect(error).toBeTruthy();
    expect(toAppError(error).kind).toBe('session');
  });

  it('falha de rede vira mensagem "nada foi salvo"', async () => {
    const offline = createApi(createClient('http://127.0.0.1:9', 'qualquer', { auth: { persistSession: false } }));
    const msg = await expectRejects(
      offline.saveTransaction({
        clientRequestId: crypto.randomUUID(), kind: 'income', description: 'x', amountCents: 100, categoryId: null, competenceDate: '2026-10-01',
        paidAt: null, status: 'planned', accountId: null, toAccountId: null, paidBy: null, splitMode: null, splits: [], paymentMethod: null, notes: null,
      }),
    );
    expect(msg).toMatch(/Nada foi salvo/);
  });

  it('anônimo não lê nada nem chama RPC', async () => {
    const anon = newClient();
    const { data } = await anon.from('financial_groups').select('id');
    expect(data ?? []).toHaveLength(0);
    const { error } = await anon.rpc('get_member_balances', {});
    expect(error).toBeTruthy();
  });
});

describe('carteira compartilhada e convites', () => {
  it('cria carteira com categorias padrão e dono 100%; parceiro entra e divisão vira 50/50', async () => {
    const c = await setupCouple();
    expect(Object.keys(c.cat)).toEqual(expect.arrayContaining(['Mercado', 'Moradia', 'Salário', 'Rendimentos', 'Pets']));
    const ctx = await c.bruno.api.getGroupContext(c.bruno.userId);
    expect(ctx?.activeMembers.map((m) => m.sharePercent)).toEqual([50, 50]);
    expect(ctx?.me.role).toBe('member');
  });

  it('não permite criar uma segunda carteira', async () => {
    const c = await setupCouple();
    await expectRejects(c.bruno.api.createGroup('Outra'), /já participa/);
  });

  it('convite é de uso único e o token não é legível pelo cliente', async () => {
    const c = await setupCouple();
    const extra = await signUp('Intrusa');
    // Carteira cheia (2/2): não dá para gerar novo convite.
    await expectRejects(c.ana.api.createInvitation(), /número máximo/);
    // O token já usado não serve para ninguém.
    const { data: rows } = await c.ana.client.from('group_invitations').select('id, accepted_at');
    expect(rows?.[0]?.accepted_at).toBeTruthy();
    const { error } = await c.ana.client.from('group_invitations').select('token_hash');
    expect(error).toBeTruthy(); // privilégio por coluna
    void extra;
  });

  it('convite expirado, cancelado ou inválido é recusado', async () => {
    const ana = await signUp('Ana');
    await ana.api.createGroup('Casa');
    const inv = await ana.api.createInvitation(1);
    const bia = await signUp('Bia');
    await adminClient().from('group_invitations').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', inv.id);
    expect((await bia.api.previewInvitation(inv.token)).status).toBe('expired');
    await expectRejects(bia.api.acceptInvitation(inv.token), /expirou/);

    const inv2 = await ana.api.createInvitation(24);
    await ana.api.revokeInvitation(inv2.id);
    await expectRejects(bia.api.acceptInvitation(inv2.token), /cancelado/);

    expect((await bia.api.previewInvitation('0'.repeat(48))).status).toBe('invalid');
    await expectRejects(bia.api.acceptInvitation('0'.repeat(48)), /inválido/);
  });

  it('dois aceites simultâneos do mesmo convite: só um entra', async () => {
    const ana = await signUp('Ana');
    await ana.api.createGroup('Casa');
    const inv = await ana.api.createInvitation(24);
    const [x, y] = await Promise.all([signUp('X'), signUp('Y')]);
    const results = await Promise.allSettled([x.api.acceptInvitation(inv.token), y.api.acceptInvitation(inv.token)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('quem já tem carteira não entra em outra por acidente', async () => {
    const c = await setupCouple();
    const other = await signUp('Outra');
    await other.api.createGroup('Outra casa');
    const inv = await other.api.createInvitation(24);
    expect((await c.bruno.api.previewInvitation(inv.token)).status).toBe('other_group');
    await expectRejects(c.bruno.api.acceptInvitation(inv.token), /já participa/);
  });
});

describe('isolamento e RLS', () => {
  it('conhecer o id da carteira não dá acesso a nada', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 5000 }));
    await c.ana.api.createAccount(c.groupId, { name: 'Conjunta', kind: 'checking', ownerId: null, openingBalanceCents: 100000, openingBalanceDate: '2026-01-01' });
    const eve = await signUp('Eva');
    await eve.api.createGroup('Casa da Eva');

    for (const table of ['financial_groups', 'transactions', 'expense_splits', 'accounts', 'categories', 'group_members', 'activity_logs'] as const) {
      const column = table === 'financial_groups' ? 'id' : 'group_id';
      const { data } = await (eve.client.from(table) as unknown as { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: unknown[] | null }> } })
        .select('*')
        .eq(column, c.groupId);
      expect(data ?? [], table).toHaveLength(0);
    }
    // Escrever na carteira alheia também não.
    const { error: accErr } = await eve.client.from('accounts').insert({ group_id: c.groupId, name: 'Invasão' });
    expect(accErr).toBeTruthy();
    const { error: catErr } = await eve.client.from('categories').insert({ group_id: c.groupId, name: 'Invasão', kind: 'expense' });
    expect(catErr).toBeTruthy();
    // E perfis de quem não divide carteira com ela ficam invisíveis.
    const { data: profiles } = await eve.client.from('profiles').select('id').in('id', [c.ana.userId, c.bruno.userId]);
    expect(profiles ?? []).toHaveLength(0);
  });

  it('ninguém se adiciona a uma carteira arbitrária', async () => {
    const c = await setupCouple();
    const eve = await signUp('Eva');
    const { error } = await eve.client.from('group_members').insert({ group_id: c.groupId, user_id: eve.userId });
    expect(error).toBeTruthy();
  });

  it('movimentações não aceitam escrita direta (só pela RPC validada)', async () => {
    const c = await setupCouple();
    const id = (await c.ana.api.saveTransaction(expense(c, { amountCents: 1000 }))) as string;
    const ins = await c.ana.client.from('transactions').insert({
      group_id: c.groupId, kind: 'income', description: 'x', amount_cents: 1, competence_date: '2026-10-01', status: 'planned', client_request_id: crypto.randomUUID(), created_by: c.ana.userId,
    });
    expect(ins.error).toBeTruthy();
    const upd = await c.ana.client.from('transactions').update({ amount_cents: 1 }).eq('id', id).select();
    expect(upd.error ?? (upd.data?.length === 0 ? 'nada alterado' : null)).toBeTruthy();
    const del = await c.ana.client.from('transactions').delete().eq('id', id).select();
    expect(del.error ?? (del.data?.length === 0 ? 'nada apagado' : null)).toBeTruthy();
    const split = await c.ana.client.from('expense_splits').update({ share_cents: 1 }).eq('transaction_id', id).select();
    expect(split.error ?? (split.data?.length === 0 ? 'nada alterado' : null)).toBeTruthy();
  });

  it('participante removido perde o acesso, mas as movimentações dele ficam', async () => {
    const c = await setupCouple();
    await c.bruno.api.saveTransaction(expense(c, { amountCents: 7000, paidBy: c.bruno.userId, description: 'Do Bruno' }));
    await c.ana.api.removeMember(c.bruno.userId);
    const { data: seen } = await c.bruno.client.from('transactions').select('id');
    expect(seen ?? []).toHaveLength(0);
    await expectRejects(c.bruno.api.saveTransaction(expense(c, { amountCents: 100 })), /não participa/);
    const { data: kept } = await c.ana.client.from('transactions').select('description, created_by');
    expect(kept).toEqual([{ description: 'Do Bruno', created_by: c.bruno.userId }]);
  });

  it('só quem administra convida, renomeia ou remove', async () => {
    const c = await setupCouple();
    await expectRejects(c.bruno.api.createInvitation(), /administra/);
    await expectRejects(c.bruno.api.removeMember(c.ana.userId), /administra/);
    await c.bruno.api.renameGroup(c.groupId, 'Hackeado');
    const { data } = await c.ana.client.from('financial_groups').select('name').eq('id', c.groupId).single();
    expect(data?.name).toBe('Casa de teste');
  });
});
