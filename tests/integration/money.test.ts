import { summarize } from '@/domain/ledger';
import { resolveDebts } from '@/domain/settlement';
import { computeSplits } from '@/domain/split';
import { todayISO } from '@/domain/period';
import { expectRejects, expense, month, setupCouple, type Couple } from './helpers';

async function balances(c: Couple) {
  const rows = await c.ana.api.memberBalances();
  return Object.fromEntries(rows.map((r) => [r.userId, r]));
}

describe('cenário obrigatório: mercado de R$ 600, pago pela Ana, 50/50', () => {
  it('registra 1 despesa de R$ 600, R$ 300 de responsabilidade cada e R$ 300 a acertar', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 60000, description: 'Mercado' }));

    const txs = await c.bruno.api.listTransactions(c.groupId, month());
    expect(txs).toHaveLength(1);
    const s = summarize(txs, month());
    expect(s.expenseCents).toBe(60000);
    expect(s.byMember.get(c.ana.userId)).toEqual({ paidCents: 60000, receivedCents: 0, shareCents: 30000 });
    expect(s.byMember.get(c.bruno.userId)).toEqual({ paidCents: 0, receivedCents: 0, shareCents: 30000 });

    const b = await balances(c);
    expect(b[c.ana.userId]!.netCents).toBe(30000);
    expect(b[c.bruno.userId]!.netCents).toBe(-30000);
    expect(resolveDebts(Object.values(b))).toEqual([{ fromUserId: c.bruno.userId, toUserId: c.ana.userId, amountCents: 30000 }]);
  });

  it('pagamento do acerto não duplica receita nem despesa', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 60000 }));
    const before = summarize(await c.ana.api.listTransactions(c.groupId, month()), month());

    await c.bruno.api.registerSettlementPayment({ clientRequestId: crypto.randomUUID(), fromUser: c.bruno.userId, toUser: c.ana.userId, amountCents: 10000, paidAt: todayISO(), paymentMethod: 'pix', notes: null });
    let b = await balances(c);
    expect(b[c.bruno.userId]!.netCents).toBe(-20000); // parcial
    await c.bruno.api.registerSettlementPayment({ clientRequestId: crypto.randomUUID(), fromUser: c.bruno.userId, toUser: c.ana.userId, amountCents: 20000, paidAt: todayISO(), paymentMethod: 'pix', notes: null });
    b = await balances(c);
    expect(b[c.bruno.userId]!.netCents).toBe(0); // quitado

    const txs = await c.ana.api.listTransactions(c.groupId, month());
    const after = summarize(txs, month());
    expect(txs).toHaveLength(1);
    expect(after.expenseCents).toBe(before.expenseCents);
    expect(after.incomeCents).toBe(0);
    const { settlements } = await c.ana.api.listSettlements(c.groupId);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ status: 'settled', amountCents: 30000, paidCents: 30000 });
  });

  it('pagar mais que o devido é recusado; dois pagamentos simultâneos não ultrapassam a dívida', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 60000 }));
    const pay = (amountCents: number) =>
      c.bruno.api.registerSettlementPayment({ clientRequestId: crypto.randomUUID(), fromUser: c.bruno.userId, toUser: c.ana.userId, amountCents, paidAt: todayISO(), paymentMethod: null, notes: null });
    await expectRejects(pay(30001), /maior que o pendente/);
    const results = await Promise.allSettled([pay(20000), pay(20000)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await balances(c))[c.bruno.userId]!.netCents).toBe(-10000);
  });

  it('reenviar o mesmo acerto (mesmo id de requisição) não paga duas vezes', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 60000 }));
    const input = { clientRequestId: crypto.randomUUID(), fromUser: c.bruno.userId, toUser: c.ana.userId, amountCents: 5000, paidAt: todayISO(), paymentMethod: null, notes: null };
    const [a, b] = [await c.bruno.api.registerSettlementPayment(input), await c.bruno.api.registerSettlementPayment(input)];
    expect(a).toBe(b);
    expect((await balances(c))[c.bruno.userId]!.netCents).toBe(-25000);
  });

  it('cancelar um pagamento de acerto devolve a dívida', async () => {
    const c = await setupCouple();
    await c.ana.api.saveTransaction(expense(c, { amountCents: 60000 }));
    const id = (await c.bruno.api.registerSettlementPayment({ clientRequestId: crypto.randomUUID(), fromUser: c.bruno.userId, toUser: c.ana.userId, amountCents: 30000, paidAt: todayISO(), paymentMethod: null, notes: null })) as string;
    await c.ana.api.cancelSettlementPayment(id);
    expect((await balances(c))[c.bruno.userId]!.netCents).toBe(-30000);
  });
});

describe('movimentações', () => {
  it('editar a despesa recalcula rateio, saldos e dívida', async () => {
    const c = await setupCouple();
    const id = (await c.ana.api.saveTransaction(expense(c, { amountCents: 60000 }))) as string;
    await c.bruno.api.saveTransaction({
      ...expense(c, { amountCents: 80000 }),
      id,
      splitMode: 'percent',
      splits: computeSplits({ mode: 'percent', amountCents: 80000, percents: [{ userId: c.ana.userId, percent: 25 }, { userId: c.bruno.userId, percent: 75 }] }),
    });
    const tx = await c.ana.api.getTransaction(id);
    expect(tx?.amountCents).toBe(80000);
    expect(tx?.updatedBy).toBe(c.bruno.userId);
    expect(tx?.splitPercents[c.bruno.userId]).toBe(75);
    expect((await balances(c))[c.bruno.userId]!.netCents).toBe(-60000);
    expect(summarize(await c.ana.api.listTransactions(c.groupId, month()), month()).expenseCents).toBe(80000);
  });

  it('reenvio do mesmo formulário não duplica a despesa', async () => {
    const c = await setupCouple();
    const input = expense(c, { amountCents: 1500 });
    const results = await Promise.all([c.ana.api.saveTransaction(input), c.ana.api.saveTransaction(input)].map((p) => p.catch((e) => e)));
    const ids = new Set(results.filter((r) => typeof r === 'string'));
    expect(ids.size).toBe(1);
    expect(await c.ana.api.listTransactions(c.groupId, month())).toHaveLength(1);
  });

  it('valores inválidos são recusados pelo banco', async () => {
    const c = await setupCouple();
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 1000 }), amountCents: 0 }), /maior que zero/);
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 1000 }), amountCents: 10.5 }), /Valor inválido/);
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 1000 }), splits: [{ userId: c.ana.userId, shareCents: 999 }], splitMode: 'custom' }), /soma do rateio/);
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 1000 }), categoryId: c.cat['Salário']! }), /Categoria inválida/);
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 1000 }), paidAt: '2999-01-01' }), /futuro/);
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 1000 }), paidBy: null }), /quem pagou/);
  });

  it('cancelar tira a despesa dos totais e da dívida, mas mantém o registro', async () => {
    const c = await setupCouple();
    const id = (await c.ana.api.saveTransaction(expense(c, { amountCents: 60000 }))) as string;
    await c.bruno.api.cancelTransaction(id, 'lançada errado');
    await c.bruno.api.cancelTransaction(id); // repetir é inofensivo
    const txs = await c.ana.api.listTransactions(c.groupId, month());
    expect(txs[0]).toMatchObject({ status: 'cancelled', cancelReason: 'lançada errado', cancelledBy: c.bruno.userId });
    expect(summarize(txs, month()).expenseCents).toBe(0);
    expect((await balances(c))[c.bruno.userId]!.netCents).toBe(0);
    await expectRejects(c.ana.api.saveTransaction({ ...expense(c, { amountCents: 100 }), id }), /cancelada/);
  });

  it('saldo das contas: inicial + efetivas; transferência move saldo sem virar receita/despesa', async () => {
    const c = await setupCouple();
    await c.ana.api.createAccount(c.groupId, { name: 'Conjunta', kind: 'checking', ownerId: null, openingBalanceCents: 100000, openingBalanceDate: '2026-01-01' });
    await c.ana.api.createAccount(c.groupId, { name: 'Reserva', kind: 'reserve', ownerId: null, openingBalanceCents: 0, openingBalanceDate: '2026-01-01' });
    await c.ana.api.createAccount(c.groupId, { name: 'Sem saldo', kind: 'cash', ownerId: null, openingBalanceCents: null, openingBalanceDate: null });
    const accs = Object.fromEntries((await c.ana.api.listAccounts(c.groupId)).map((a) => [a.name, a.id]));

    await c.ana.api.saveTransaction(expense(c, { amountCents: 30000, accountId: accs['Conjunta']!, paidBy: null }));
    await c.ana.api.saveTransaction({ ...expense(c, { amountCents: 500000 }), kind: 'income', categoryId: c.cat['Salário']!, accountId: accs['Conjunta']!, paidBy: c.bruno.userId, splitMode: null, splits: [] });
    await c.ana.api.saveTransaction({ ...expense(c, { amountCents: 200000 }), kind: 'transfer', categoryId: null, accountId: accs['Conjunta']!, toAccountId: accs['Reserva']!, paidBy: null, splitMode: null, splits: [] });
    await c.ana.api.saveTransaction({ ...expense(c, { amountCents: 99999 }), status: 'planned', paidAt: null, accountId: accs['Conjunta']! });

    const bal = Object.fromEntries((await c.bruno.api.accountBalances()).map((b) => [b.name, b]));
    expect(bal['Conjunta']!.balanceCents).toBe(100000 - 30000 + 500000 - 200000);
    expect(bal['Reserva']!.balanceCents).toBe(200000);
    expect(bal['Sem saldo']!.openingMissing).toBe(true);

    const s = summarize(await c.ana.api.listTransactions(c.groupId, month()), month());
    expect(s.incomeCents).toBe(500000);
    expect(s.expenseCents).toBe(30000);
    expect(s.transferCents).toBe(200000);
    expect(s.plannedExpenseCents).toBe(99999);
    // Despesa pela conta conjunta não gera dívida entre as pessoas.
    expect((await balances(c))[c.bruno.userId]!.netCents).toBe(0);
  });
});
