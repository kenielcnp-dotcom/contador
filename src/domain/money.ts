// Dinheiro é sempre um inteiro de centavos. Nenhuma conta usa ponto flutuante;
// a divisão por 100 só acontece na hora de formatar para exibição.

export const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão — mesmo limite do banco

export function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertCents(value: number, label = 'valor'): number {
  if (!isCents(value)) throw new Error(`${label} precisa ser um inteiro de centavos`);
  return value;
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return assertCents(total, 'soma');
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 123456 → "R$ 1.234,56" (com espaço comum, não o NBSP do Intl). */
export function formatBRL(cents: number, options: { signed?: boolean; compact?: boolean } = {}): string {
  assertCents(cents);
  const formatter = options.compact ? brlCompact : brl;
  const text = formatter.format(Math.abs(cents) / 100).replace(/ /g, ' ');
  if (cents < 0) return `−${text}`;
  if (options.signed && cents > 0) return `+${text}`;
  return text;
}

/** 123456 → "1234,56" (para CSV e campos de edição). */
export function centsToDecimalString(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${reais},${centavos}`;
}

/**
 * Converte texto digitado em centavos, sem float.
 * Aceita "1.234,56", "1234,5", "R$ 10", "10.50" (ponto decimal quando não
 * parece separador de milhar). Devolve null se o texto não for um valor.
 */
export function parseBRL(input: string): number | null {
  let s = input.replace(/R\$/gi, '').replace(/[\s ]/g, '');
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }

  let intPart: string;
  let fracPart = '';
  if (s.includes(',')) {
    const [i, f, ...rest] = s.split(',');
    if (rest.length > 0) return null;
    intPart = (i ?? '').replace(/\./g, '');
    fracPart = f ?? '';
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(i ?? '') && i !== '') return null;
  } else if (s.includes('.')) {
    const groups = s.split('.');
    const last = groups[groups.length - 1] ?? '';
    if (groups.length === 2 && last.length !== 3) {
      intPart = groups[0] ?? '';
      fracPart = last;
    } else {
      if (!groups.slice(1).every((g) => g.length === 3)) return null;
      intPart = groups.join('');
    }
  } else {
    intPart = s;
  }

  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

/** Máscara de digitação: "123456" → 123456 centavos (R$ 1.234,56). */
export function centsFromDigits(digits: string): number {
  const only = digits.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
  return only === '' ? 0 : Number(only);
}

/** Percentual de a sobre b, arredondado para inteiro (para barras e alertas). */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0;
  return Math.round((part * 100) / whole);
}
