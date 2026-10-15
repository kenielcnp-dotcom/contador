import { changePercent, monthlySeries, rankCategories, summarize } from '@/domain/ledger';
import { netBalance, resolveDebts } from '@/domain/settlement';
import { ANA, BRUNO, CONJUNTA, CONTA_ANA, mercado600, RESERVA, SALARIO, tx } from './fixtures';

const OUT = { start: '2026-10-01', end: '2026-10-31' };

describe('cenário obrigatório: mercado de R$ 600 pago pela Ana, 50/50', () => {
  const s = summarize([mercado600()], OUT);

  it('a despesa total é R$ 600 (uma vez só)', () => {
    expect(s.expenseCents).toBe(60000);
    expect(s.effectiveCount).toBe(1);
  });
  it('Ana pagou R$ 600; cada um é responsável por R$ 300', () => {
    expect(s.byMember.get(ANA)).toEqual({ paidCents: 60000, receivedCents: 0, shareCents: 30000 });
    expect(s.byMember.get(BRUNO)).toEqual({ paidCents: 0, receivedCents: 0, shareCents: 30000 });
  });
  it('Bruno tem R$ 300 a acertar com a Ana', () => {
    const balances = [ANA, BRUNO].map((userId) => {
      const m = s.byMember.get(userId)!;
      return {
        userId,
        netCents: netBalance({ paidCents: m.paidCents, shareCents: m.shareCents, sentCents: 0, receivedCents: 0 }),
      };
    });
    expect(balances.reduce((a, b) => a + b.netCents, 0)).toBe(0);
    expect(resolveDebts(balances)).toEqual([{ fromUserId: BRUNO, toUserId: ANA, amountCents: 30000 }]);
  });
  it('as responsabilidades não aparecem como novas saídas', () => {
    const totalShares = [...s.byMember.values()].reduce((a, m) => a + m.shareCents, 0);
    expect(totalShares).toBe(s.expenseCents);
  });
});

describe('regras de contabilização', () => {
  it('transferência não é receita nem despesa', () => {
    const s = summarize(
      [tx({ kind: 'transfer', amountCents: 50000, categoryId: null, paidBy: null, accountId: CONTA_ANA, toAccountId: RESERVA })],
      OUT,
    );
    expect(s.incomeCents).toBe(0);
    expect(s.expenseCents).toBe(0);
    expect(s.transferCents).toBe(50000);
  });
  it('previstas ficam separadas das efetivas', () => {
    const s = summarize(
      [
        mercado600(),
        tx({ status: 'planned', paidAt: null, amountCents: 20000, competenceDate: '2026-10-20' }),
        tx({ kind: 'income', status: 'planned', paidAt: null, amountCents: 500000, categoryId: SALARIO, splits: [] }),
      ],
      OUT,
    );
    expect(s.expenseCents).toBe(60000);
    expect(s.plannedExpenseCents).toBe(20000);
    expect(s.incomeCents).toBe(0);
    expect(s.plannedIncomeCents).toBe(500000);
    expect(s.netCents).toBe(-60000);
  });
  it('canceladas não contam', () => {
    const s = summarize([{ ...mercado600(), status: 'cancelled' }], OUT);
    expect(s.expenseCents).toBe(0);
    expect(s.byMember.size).toBe(0);
  });
  it('efetiva conta na data de pagamento; prevista na de competência', () => {
    const paidInNovember = tx({ amountCents: 1000, competenceDate: '2026-10-30', paidAt: '2026-11-02' });
    expect(summarize([paidInNovember], OUT).expenseCents).toBe(0);
    expect(summarize([paidInNovember], { start: '2026-11-01', end: '2026-11-30' }).expenseCents).toBe(1000);
  });
  it('despesa paga pela conta conjunta não vira crédito de ninguém', () => {
    const s = summarize(
      [
        tx({
          amountCents: 10000,
          paidBy: null,
          accountId: CONJUNTA,
          splits: [
            { userId: ANA, shareCents: 5000 },
            { userId: BRUNO, shareCents: 5000 },
          ],
        }),
      ],
      OUT,
    );
    expect(s.jointPaidCents).toBe(10000);
    expect(s.byMember.get(ANA)?.paidCents).toBe(0);
  });
  it('receitas por quem recebeu e por categoria', () => {
    const s = summarize([tx({ kind: 'income', amountCents: 800000, categoryId: SALARIO, paidBy: BRUNO, splits: [] })], OUT);
    expect(s.incomeCents).toBe(800000);
    expect(s.byMember.get(BRUNO)?.receivedCents).toBe(800000);
    expect(s.incomeByCategory.get(SALARIO)).toBe(800000);
  });
});

describe('séries e rankings', () => {
  it('monthlySeries usa as mesmas regras do summarize', () => {
    const txs = [mercado600(), tx({ amountCents: 1000, paidAt: '2026-09-10', competenceDate: '2026-09-10' })];
    const series = monthlySeries(txs, ['2026-09-01', '2026-10-01']);
    expect(series.map((p) => p.expenseCents)).toEqual([1000, 60000]);
    expect(series[1]!.expenseCents).toBe(summarize(txs, OUT).expenseCents);
  });
  it('rankCategories ordena e calcula percentuais', () => {
    const r = rankCategories(
      new Map([
        ['a', 7500],
        ['b', 2500],
        ['c', 0],
      ]),
    );
    expect(r).toEqual([
      { categoryId: 'a', cents: 7500, percent: 75 },
      { categoryId: 'b', cents: 2500, percent: 25 },
    ]);
  });
  it('changePercent', () => {
    expect(changePercent(110, 100)).toBe(10);
    expect(changePercent(50, 100)).toBe(-50);
    expect(changePercent(10, 0)).toBeNull();
  });
});
