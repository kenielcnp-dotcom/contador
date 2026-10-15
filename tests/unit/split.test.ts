import { allocateEqual, allocatePercent, computeSplits, SplitError, validateCustom } from '@/domain/split';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const C = 'cccccccc-0000-0000-0000-000000000003';
const sum = (xs: { shareCents: number }[]) => xs.reduce((s, x) => s + x.shareCents, 0);

describe('divisão igualitária', () => {
  it('R$ 600 entre duas pessoas = R$ 300 cada', () => {
    expect(allocateEqual(60000, [A, B])).toEqual([
      { userId: A, shareCents: 30000 },
      { userId: B, shareCents: 30000 },
    ]);
  });
  it('centavo que sobra vai para o primeiro user_id (determinístico)', () => {
    const r = allocateEqual(1001, [B, A]);
    expect(r).toEqual([
      { userId: A, shareCents: 501 },
      { userId: B, shareCents: 500 },
    ]);
    expect(allocateEqual(1001, [A, B])).toEqual(r);
  });
  it('R$ 100 entre três: 33,34 + 33,33 + 33,33', () => {
    const r = allocateEqual(10000, [C, B, A]);
    expect(r.map((x) => x.shareCents)).toEqual([3334, 3333, 3333]);
    expect(sum(r)).toBe(10000);
  });
  it('soma sempre fecha o valor original (varredura)', () => {
    for (let amount = 1; amount <= 2000; amount += 7) {
      for (const ids of [[A], [A, B], [A, B, C]]) {
        const r = allocateEqual(amount, ids);
        expect(sum(r)).toBe(amount);
        const shares = r.map((x) => x.shareCents);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('recusa lista vazia ou repetida', () => {
    expect(() => allocateEqual(100, [])).toThrow(SplitError);
    expect(() => allocateEqual(100, [A, A])).toThrow(SplitError);
  });
});

describe('divisão percentual', () => {
  it('60/40', () => {
    const r = allocatePercent(60000, [
      { userId: A, percent: 60 },
      { userId: B, percent: 40 },
    ]);
    expect(r.map((x) => x.shareCents)).toEqual([36000, 24000]);
  });
  it('33,33/66,67 de R$ 0,10 fecha em 10 centavos pelo maior resto', () => {
    const r = allocatePercent(10, [
      { userId: A, percent: 33.33 },
      { userId: B, percent: 66.67 },
    ]);
    expect(sum(r)).toBe(10);
    expect(r).toEqual([
      { userId: A, shareCents: 3, percent: 33.33 },
      { userId: B, shareCents: 7, percent: 66.67 },
    ]);
  });
  it('soma fecha em qualquer valor', () => {
    for (let amount = 1; amount <= 5000; amount += 13) {
      const r = allocatePercent(amount, [
        { userId: A, percent: 33.33 },
        { userId: B, percent: 33.33 },
        { userId: C, percent: 33.34 },
      ]);
      expect(sum(r)).toBe(amount);
    }
  });
  it('exige soma 100% e no máximo duas casas', () => {
    expect(() => allocatePercent(100, [{ userId: A, percent: 50 }, { userId: B, percent: 49 }])).toThrow(/100%/);
    expect(() => allocatePercent(100, [{ userId: A, percent: 50.001 }, { userId: B, percent: 49.999 }])).toThrow();
  });
});

describe('divisão personalizada e individual', () => {
  it('aceita valores que fecham o total', () => {
    expect(sum(validateCustom(60000, [{ userId: A, shareCents: 45000 }, { userId: B, shareCents: 15000 }]))).toBe(60000);
  });
  it('avisa quantos centavos faltam ou sobram', () => {
    expect(() => validateCustom(1000, [{ userId: A, shareCents: 999 }])).toThrow(/Faltam 1 centavo/);
    expect(() => validateCustom(1000, [{ userId: A, shareCents: 1001 }])).toThrow(/passou 1 centavo/);
  });
  it('recusa parte negativa ou fracionada', () => {
    expect(() => validateCustom(1000, [{ userId: A, shareCents: 1100 }, { userId: B, shareCents: -100 }])).toThrow();
    expect(() => validateCustom(1000, [{ userId: A, shareCents: 999.5 }, { userId: B, shareCents: 0.5 }])).toThrow();
  });
  it('individual atribui tudo a uma pessoa', () => {
    expect(computeSplits({ mode: 'individual', amountCents: 5000, userId: B })).toEqual([{ userId: B, shareCents: 5000 }]);
  });
  it('valor zero ou negativo é recusado', () => {
    expect(() => computeSplits({ mode: 'equal', amountCents: 0, userIds: [A] })).toThrow();
    expect(() => computeSplits({ mode: 'equal', amountCents: -1, userIds: [A] })).toThrow();
  });
});
