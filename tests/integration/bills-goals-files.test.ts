import { summarize } from '@/domain/ledger';
import { addDays, addMonths, todayISO } from '@/domain/period';
import { computeSplits } from '@/domain/split';
import { expectRejects, month, setupCouple, signUp, type Couple } from './helpers';

async function rentBill(c: Couple, amountCents = 150000) {
  const id = (await c.ana.api.saveBill({
    kind: 'payable',
    description: 'Aluguel',
    amountCents,
    categoryId: c.cat['Moradia']!,
    accountId: null,
    responsibleId: c.ana.userId,
    recurrence: 'monthly',
    startDate: addMonths(todayISO(), -1),
    endDate: null,
    splitMode: 'equal',
    notes: null,
    active: true,
  })) as string;
  const occs = (await c.ana.api.listOccurrences(c.groupId, { start: addMonths(todayISO(), -2), end: addDays(todayISO(), 62) })).filter((o) => o.billId === id);
  return { id, occs };
}

describe('contas a pagar', () => {
  it('conta recorrente gera ocorrências sem duplicar e sem criar despesa', async () => {
    const c = await setupCouple();
    const { occs } = await rentBill(c);
    expect(occs.length).toBeGreaterThanOrEqual(3);
    await c.bruno.api.generateOccurrences();
    await c.bruno.api.generateOccurrences();
    const again = await c.ana.api.listOccurrences(c.groupId, { start: addMonths(todayISO(), -2), end: addDays(todayISO(), 62) });
    expect(again).toHaveLength(occs.length);
    expect(await c.ana.api.listTransactions(c.groupId, { start: addMonths(todayISO(), -2), end: addDays(todayISO(), 62) })).toHaveLength(0);
  });

  it('pagamento parcial, depois total; repetir não duplica; pagar de novo é recusado', async () => {
    const c = await setupCouple();
    const { occs } = await rentBill(c, 150000);
    const occ = occs[0]!;
    const pay = (amountCents: number, clientRequestId = crypto.randomUUID()) =>
      c.bruno.api.payOccurrence({
        occurrenceId: occ.id,
        clientRequestId,
        amountCents,
        paidAt: todayISO(),
        accountId: null,
        paidBy: c.bruno.userId,
        splitMode: 'equal',
        splits: computeSplits({ mode: 'equal', amountCents, userIds: [c.ana.userId, c.bruno.userId] }),
        paymentMethod: 'pix',
        notes: null,
      });

    const req = crypto.randomUUID();
    const p1 = await pay(50000, req);
    expect(await pay(50000, req)).toBe(p1); // reenvio idempotente
    let o = (await c.ana.api.listOccurrences(c.groupId, month())).find((x) => x.id === occ.id) ?? (await c.ana.api.listOccurrences(c.groupId, { start: occ.dueDate, end: occ.dueDate }))[0]!;
    expect(o).toMatchObject({ status: 'partial', paidCents: 50000 });

    await expectRejects(pay(100001), /maior que o pendente/);
    await pay(100000);
    o = (await c.ana.api.listOccurrences(c.groupId, { start: occ.dueDate, end: occ.dueDate }))[0]!;
    expect(o).toMatchObject({ status: 'paid', paidCents: 150000 });
    await expectRejects(pay(1), /já está paga/);

    const payments = await c.ana.api.paymentsOfOccurrence(occ.id);
    expect(payments).toHaveLength(2);
    expect(payments.reduce((s, t) => s + t.amountCents, 0)).toBe(150000);

    // Cancelar um pagamento reabre a conta como parcial.
    await c.ana.api.cancelTransaction(payments[1]!.id);
    o = (await c.ana.api.listOccurrences(c.groupId, { start: occ.dueDate, end: occ.dueDate }))[0]!;
    expect(o).toMatchObject({ status: 'partial', paidCents: 50000 });
  });

  it('dois pagamentos simultâneos do valor total: só um passa', async () => {
    const c = await setupCouple();
    const { occs } = await rentBill(c, 20000);
    const occ = occs[1]!;
    const pay = () =>
      c.ana.api.payOccurrence({
        occurrenceId: occ.id, clientRequestId: crypto.randomUUID(), amountCents: 20000, paidAt: todayISO(), accountId: null, paidBy: c.ana.userId,
        splitMode: 'individual', splits: [{ userId: c.ana.userId, shareCents: 20000 }], paymentMethod: null, notes: null,
      });
    const r = await Promise.allSettled([pay(), pay()]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await c.ana.api.paymentsOfOccurrence(occ.id)).toHaveLength(1);
  });

  it('ocorrência com pagamento não pode ser cancelada; só pendente pode ser editada', async () => {
    const c = await setupCouple();
    const { occs } = await rentBill(c, 1000);
    const [a, b] = [occs[0]!, occs[1]!];
    await c.ana.api.updateOccurrence(b.id, { amountCents: 1200 });
    await c.ana.api.payOccurrence({ occurrenceId: a.id, clientRequestId: crypto.randomUUID(), amountCents: 500, paidAt: todayISO(), accountId: null, paidBy: c.ana.userId, splitMode: 'individual', splits: [{ userId: c.ana.userId, shareCents: 500 }], paymentMethod: null, notes: null });
    await expectRejects(c.ana.api.cancelOccurrence(a.id), /pagamentos registrados/);
    await expectRejects(c.ana.api.updateOccurrence(a.id, { amountCents: 1 }), /pendentes/);
  });
});

describe('metas e orçamento', () => {
  it('contribuição com conta-reserva vira transferência (sem receita); resgate acima do guardado é recusado', async () => {
    const c = await setupCouple();
    await c.ana.api.createAccount(c.groupId, { name: 'Corrente', kind: 'checking', ownerId: null, openingBalanceCents: 100000, openingBalanceDate: '2026-01-01' });
    await c.ana.api.createAccount(c.groupId, { name: 'Cofrinho', kind: 'reserve', ownerId: null, openingBalanceCents: 0, openingBalanceDate: '2026-01-01' });
    const accs = Object.fromEntries((await c.ana.api.listAccounts(c.groupId)).map((a) => [a.name, a.id]));
    await c.ana.api.saveGoal(c.groupId, { name: 'Viagem', kind: 'travel', targetCents: 500000, deadline: null, accountId: accs['Cofrinho']! });
    const goal = (await c.ana.api.listGoals(c.groupId)).goals[0]!;

    await c.bruno.api.contributeGoal({ clientRequestId: crypto.randomUUID(), goalId: goal.id, direction: 'deposit', amountCents: 30000, contributedAt: todayISO(), memberId: c.bruno.userId, fromAccountId: accs['Corrente']!, notes: null });
    await expectRejects(
      c.bruno.api.contributeGoal({ clientRequestId: crypto.randomUUID(), goalId: goal.id, direction: 'withdraw', amountCents: 30001, contributedAt: todayISO(), memberId: null, fromAccountId: null, notes: null }),
      /Só há/,
    );
    const s = summarize(await c.ana.api.listTransactions(c.groupId, month()), month());
    expect(s.incomeCents).toBe(0);
    expect(s.expenseCents).toBe(0);
    expect(s.transferCents).toBe(30000);
    const bal = Object.fromEntries((await c.ana.api.accountBalances()).map((b) => [b.name, b.balanceCents]));
    expect(bal).toMatchObject({ Corrente: 70000, Cofrinho: 30000 });

    // A transferência da meta não pode ser cancelada por fora da meta.
    const tx = (await c.ana.api.listTransactions(c.groupId, month()))[0]!;
    await expectRejects(c.ana.api.cancelTransaction(tx.id), /pertence a uma meta/);
    const contrib = (await c.ana.api.listGoals(c.groupId)).contributions[0]!;
    await c.ana.api.cancelContribution(contrib.id);
    expect(Object.fromEntries((await c.ana.api.accountBalances()).map((b) => [b.name, b.balanceCents]))).toMatchObject({ Corrente: 100000, Cofrinho: 0 });
  });

  it('orçamento é da carteira: parceiro vê, estranho não', async () => {
    const c = await setupCouple();
    const monthStart = `${todayISO().slice(0, 7)}-01`;
    await c.ana.api.saveBudget(c.groupId, { month: monthStart, kind: 'category', categoryId: c.cat['Mercado']!, memberId: null, limitCents: 100000, alertThresholds: [70, 90, 100] });
    expect(await c.bruno.api.listBudgets(c.groupId, monthStart)).toHaveLength(1);
    const eve = await signUp('Eva');
    expect(await eve.api.listBudgets(c.groupId, monthStart)).toHaveLength(0);
    await expectRejects(c.ana.api.saveBudget(c.groupId, { month: monthStart, kind: 'category', categoryId: c.cat['Mercado']!, memberId: null, limitCents: 5, alertThresholds: [70] }));
  });
});

describe('comprovantes (Storage privado)', () => {
  const pdf = () => new File([new TextEncoder().encode('%PDF-1.4 teste')], 'recibo.pdf', { type: 'application/pdf' });

  it('parceiro abre, estranho não; tipo e tamanho são validados', async () => {
    const c = await setupCouple();
    const txId = (await c.ana.api.saveTransaction({
      clientRequestId: crypto.randomUUID(), kind: 'expense', description: 'Com recibo', amountCents: 1000, categoryId: c.cat['Mercado']!, competenceDate: todayISO(), paidAt: todayISO(),
      status: 'effective', accountId: null, toAccountId: null, paidBy: c.ana.userId, splitMode: 'individual', splits: [{ userId: c.ana.userId, shareCents: 1000 }], paymentMethod: null, notes: null,
    })) as string;
    await c.ana.api.uploadAttachment(c.groupId, 'transaction', txId, pdf());
    const [att] = await c.bruno.api.listAttachments('transaction', txId);
    expect(att?.fileName).toBe('recibo.pdf');

    const url = await c.bruno.api.signedUrl('comprovantes', att!.storagePath, 60);
    expect((await fetch(url)).ok).toBe(true);

    const eve = await signUp('Eva');
    const { data, error } = await eve.client.storage.from('comprovantes').download(att!.storagePath);
    expect(data && !error).toBeFalsy();
    const up = await eve.client.storage.from('comprovantes').upload(`${c.groupId}/intruso.pdf`, pdf(), { contentType: 'application/pdf' });
    expect(up.error).toBeTruthy();

    // Bucket não aceita executável nem arquivo acima de 5 MB.
    const exe = await c.ana.client.storage.from('comprovantes').upload(`${c.groupId}/x.html`, new File(['<script>'], 'x.html', { type: 'text/html' }), { contentType: 'text/html' });
    expect(exe.error).toBeTruthy();
    const big = await c.ana.client.storage.from('comprovantes').upload(`${c.groupId}/big.pdf`, new File([new Uint8Array(5 * 1024 * 1024 + 10)], 'big.pdf', { type: 'application/pdf' }), { contentType: 'application/pdf' });
    expect(big.error).toBeTruthy();

    await c.bruno.api.removeAttachment(att!.id);
    expect(await c.ana.api.listAttachments('transaction', txId)).toHaveLength(0);
  });
});
