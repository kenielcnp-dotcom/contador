// Rateio de despesas. A responsabilidade de cada pessoa é uma divisão do valor
// total — nunca uma nova despesa. A soma das partes é SEMPRE igual ao total.
//
// Regra de arredondamento (determinística): calcula-se a parte inteira de cada
// pessoa; os centavos que sobram vão um a um para quem teve a maior fração
// descartada, desempatando pela ordem crescente do user_id. Assim, o mesmo
// lançamento produz sempre o mesmo rateio, em qualquer aparelho.

import { assertCents, sumCents } from './money';

export type SplitMode = 'equal' | 'percent' | 'custom' | 'individual';

export interface SplitShare {
  userId: string;
  shareCents: number;
  /** Preenchido só no modo percentual. */
  percent?: number;
}

export type SplitInput =
  | { mode: 'equal'; amountCents: number; userIds: string[] }
  | { mode: 'percent'; amountCents: number; percents: { userId: string; percent: number }[] }
  | { mode: 'custom'; amountCents: number; shares: { userId: string; shareCents: number }[] }
  | { mode: 'individual'; amountCents: number; userId: string };

export class SplitError extends Error {}

const byUserId = (a: { userId: string }, b: { userId: string }) =>
  a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;

function assertUnique(ids: string[]) {
  if (ids.length === 0) throw new SplitError('Indique quem participa da despesa.');
  if (new Set(ids).size !== ids.length) throw new SplitError('Participante repetido no rateio.');
}

function assertAmount(amountCents: number) {
  assertCents(amountCents);
  if (amountCents <= 0) throw new SplitError('O valor precisa ser maior que zero.');
}

/** Converte percentual (até 2 casas) em pontos-base inteiros: 33,33% → 3333. */
export function percentToBasisPoints(percent: number): number {
  const bp = Math.round(percent * 100);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || Math.abs(bp - percent * 100) > 1e-6) {
    throw new SplitError('Use percentuais entre 0 e 100, com até duas casas decimais.');
  }
  return bp;
}

export function allocateEqual(amountCents: number, userIds: string[]): SplitShare[] {
  assertAmount(amountCents);
  assertUnique(userIds);
  const ordered = [...userIds].sort();
  const base = Math.floor(amountCents / ordered.length);
  const remainder = amountCents - base * ordered.length;
  return ordered.map((userId, i) => ({ userId, shareCents: base + (i < remainder ? 1 : 0) }));
}

export function allocatePercent(
  amountCents: number,
  percents: { userId: string; percent: number }[],
): SplitShare[] {
  assertAmount(amountCents);
  assertUnique(percents.map((p) => p.userId));
  const entries = percents
    .map((p) => ({ userId: p.userId, percent: p.percent, bp: percentToBasisPoints(p.percent) }))
    .sort(byUserId);
  const totalBp = entries.reduce((s, e) => s + e.bp, 0);
  if (totalBp !== 10_000) throw new SplitError('Os percentuais precisam somar 100%.');

  // amount × bp cabe com folga em inteiro seguro (máx. 1e11 × 1e4 = 1e15).
  const raw = entries.map((e) => {
    const product = amountCents * e.bp;
    return { ...e, floor: Math.floor(product / 10_000), frac: product % 10_000 };
  });
  let leftover = amountCents - raw.reduce((s, r) => s + r.floor, 0);
  const order = [...raw].sort((a, b) => b.frac - a.frac || byUserId(a, b));
  const bonus = new Set<string>();
  for (const r of order) {
    if (leftover <= 0) break;
    bonus.add(r.userId);
    leftover -= 1;
  }
  return raw.map((r) => ({
    userId: r.userId,
    shareCents: r.floor + (bonus.has(r.userId) ? 1 : 0),
    percent: r.percent,
  }));
}

export function validateCustom(
  amountCents: number,
  shares: { userId: string; shareCents: number }[],
): SplitShare[] {
  assertAmount(amountCents);
  assertUnique(shares.map((s) => s.userId));
  for (const s of shares) {
    assertCents(s.shareCents);
    if (s.shareCents < 0) throw new SplitError('Nenhuma parte pode ser negativa.');
  }
  const total = sumCents(shares.map((s) => s.shareCents));
  if (total !== amountCents) {
    const diff = amountCents - total;
    throw new SplitError(
      diff > 0
        ? `Faltam ${diff} centavo(s) para fechar o valor da despesa.`
        : `O rateio passou ${-diff} centavo(s) do valor da despesa.`,
    );
  }
  return [...shares].sort(byUserId).map((s) => ({ userId: s.userId, shareCents: s.shareCents }));
}

export function computeSplits(input: SplitInput): SplitShare[] {
  switch (input.mode) {
    case 'equal':
      return allocateEqual(input.amountCents, input.userIds);
    case 'percent':
      return allocatePercent(input.amountCents, input.percents);
    case 'custom':
      return validateCustom(input.amountCents, input.shares);
    case 'individual':
      assertAmount(input.amountCents);
      if (!input.userId) throw new SplitError('Escolha o responsável pela despesa.');
      return [{ userId: input.userId, shareCents: input.amountCents }];
  }
}
