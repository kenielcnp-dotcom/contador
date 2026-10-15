import { centsFromDigits, centsToDecimalString, formatBRL, parseBRL, percentOf, sumCents } from '@/domain/money';

describe('formatBRL', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(-12000)).toBe('−R$ 120,00');
    expect(formatBRL(100, { signed: true })).toBe('+R$ 1,00');
  });
  it('recusa valores que não são centavos inteiros', () => {
    expect(() => formatBRL(10.5)).toThrow();
  });
});

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['1234,5', 123450],
    ['10', 1000],
    ['0,01', 1],
    ['10.50', 1050],
    ['1.000', 100000],
    ['1.000.000,00', 100000000],
    [',99', 99],
    ['-5,00', -500],
  ])('%s → %i centavos', (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });
  it.each(['', 'abc', '1,2,3', '10,123', '1.23.4'])('rejeita "%s"', (input) => {
    expect(parseBRL(input)).toBeNull();
  });
  it('não sofre com float: 0,1 + 0,2 = 0,30 exatos', () => {
    expect(sumCents([parseBRL('0,1')!, parseBRL('0,2')!])).toBe(30);
  });
});

describe('utilitários', () => {
  it('centsToDecimalString', () => {
    expect(centsToDecimalString(123456)).toBe('1234,56');
    expect(centsToDecimalString(-7)).toBe('-0,07');
  });
  it('centsFromDigits (máscara do campo de valor)', () => {
    expect(centsFromDigits('60000')).toBe(60000);
    expect(centsFromDigits('R$ 6,00')).toBe(600);
    expect(centsFromDigits('')).toBe(0);
  });
  it('sumCents recusa não inteiros', () => {
    expect(() => sumCents([1, 0.5])).toThrow();
  });
  it('percentOf', () => {
    expect(percentOf(700, 1000)).toBe(70);
    expect(percentOf(1, 0)).toBe(100);
    expect(percentOf(0, 0)).toBe(0);
  });
});
