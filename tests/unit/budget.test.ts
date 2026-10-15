import { alertTone, computeBudgetUsage, type Budget } from '@/domain/budget';
import { ANA, BRUNO, LAZER, MERCADO, mercado600, SALARIO, tx } from './fixtures';

const base: Budget = {
  id: 'b1',
  month: '2026-10-01',
  kind: 'category',
  categoryId: MERCADO,
  memberId: null,
  limitCents: 100000,
  alertThresholds: [70, 90, 100],
};

describe('orçamento por categoria', () => {
  it('despesa dividida conta uma vez só (R$ 600 de R$ 1.000 = 60%)', () => {
    const u = computeBudgetUsage(base, [mercado600()]);
    expect(u.spentCents).toBe(60000);
    expect(u.remainingCents).toBe(40000);
    expect(u.percentUsed).toBe(60);
    expect(u.alert).toBeNull();
  });
  it('alertas em 70%, 90% e 100%', () => {
    const at = (cents: number) =>
      computeBudgetUsage(base, [tx({ amountCents: cents, splits: [{ userId: ANA, shareCents: cents }] })]);
    expect(at(69000).alert).toBeNull();
    expect(at(70000).alert).toBe(70);
    expect(at(90000).alert).toBe(90);
    expect(at(100000).alert).toBe(100);
    expect(alertTone(at(100000))).toBe('danger');
    expect(alertTone(at(90000))).toBe('warning');
    expect(alertTone(at(70000))).toBe('notice');
  });
  it('outras categorias, transferências e outro mês ficam de fora', () => {
    const u = computeBudgetUsage(base, [
      tx({ amountCents: 5000, categoryId: LAZER }),
      tx({ kind: 'transfer', amountCents: 9000, categoryId: null }),
      tx({ amountCents: 7000, paidAt: '2026-09-30', competenceDate: '2026-09-30' }),
    ]);
    expect(u.spentCents).toBe(0);
  });
  it('previsto e contas pendentes entram no comprometido, não no gasto', () => {
    const u = computeBudgetUsage(
      base,
      [mercado600(), tx({ status: 'planned', paidAt: null, amountCents: 10000, competenceDate: '2026-10-25' })],
      [
        { remainingCents: 20000, dueDate: '2026-10-28', categoryId: MERCADO, kind: 'payable' },
        { remainingCents: 99999, dueDate: '2026-11-02', categoryId: MERCADO, kind: 'payable' },
      ],
    );
    expect(u.spentCents).toBe(60000);
    expect(u.plannedCents).toBe(30000);
    expect(u.committedCents).toBe(90000);
    expect(u.percentCommitted).toBe(90);
  });
  it('limites configuráveis', () => {
    expect(computeBudgetUsage({ ...base, alertThresholds: [50] }, [mercado600()]).alert).toBe(50);
  });
});

describe('orçamento geral, individual e meta de economia', () => {
  it('geral soma todas as categorias de despesa', () => {
    const u = computeBudgetUsage({ ...base, kind: 'overall', categoryId: null }, [
      mercado600(),
      tx({ amountCents: 1000, categoryId: LAZER }),
    ]);
    expect(u.spentCents).toBe(61000);
  });
  it('individual usa a parte da pessoa', () => {
    const u = computeBudgetUsage({ ...base, kind: 'overall', categoryId: null, memberId: BRUNO }, [mercado600()]);
    expect(u.spentCents).toBe(30000);
  });
  it('meta de economia = receitas − despesas', () => {
    const u = computeBudgetUsage({ ...base, kind: 'savings', categoryId: null, limitCents: 100000 }, [
      mercado600(),
      tx({ kind: 'income', amountCents: 200000, categoryId: SALARIO, splits: [] }),
    ]);
    expect(u.spentCents).toBe(140000);
    expect(u.percentUsed).toBe(140);
  });
});
