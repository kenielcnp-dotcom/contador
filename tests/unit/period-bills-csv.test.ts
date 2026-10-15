import { displayStatus, dueLabel, inWindow, remainingCents } from '@/domain/bills';
import { toCSV } from '@/domain/csv';
import {
  addMonths,
  endOfMonth,
  formatMonth,
  formatPeriod,
  isISODate,
  monthsBetween,
  precedingPeriod,
  previousMonthPeriod,
  resolvePreset,
  todayISO,
} from '@/domain/period';

describe('períodos', () => {
  it('fim de mês e soma de meses com dia limitado', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
  it('mês anterior, presets e período precedente', () => {
    expect(previousMonthPeriod('2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(resolvePreset('current', '2026-10-14')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(resolvePreset('custom', '2026-10-14', { start: '2026-10-05', end: '2026-10-10' })).toEqual({
      start: '2026-10-05',
      end: '2026-10-10',
    });
    expect(precedingPeriod({ start: '2026-10-05', end: '2026-10-10' })).toEqual({ start: '2026-09-29', end: '2026-10-04' });
    expect(monthsBetween({ start: '2026-08-20', end: '2026-10-02' })).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
  });
  it('hoje no fuso de Brasília', () => {
    // 02:00 UTC do dia 15 ainda é dia 14 em Brasília
    expect(todayISO(new Date('2026-10-15T02:00:00Z'))).toBe('2026-10-14');
  });
  it('formatação em português', () => {
    expect(formatMonth('2026-10-01')).toBe('Outubro de 2026');
    expect(formatPeriod({ start: '2026-10-05', end: '2026-10-10' })).toBe('05/10/2026 a 10/10/2026');
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
  });
});

describe('contas a pagar', () => {
  const occ = { status: 'pending' as const, dueDate: '2026-10-10', amountCents: 25000, paidCents: 0 };
  it('vencida é derivada da data', () => {
    expect(displayStatus(occ, '2026-10-11')).toBe('overdue');
    expect(displayStatus(occ, '2026-10-10')).toBe('pending');
    expect(displayStatus({ ...occ, status: 'paid' }, '2026-12-01')).toBe('paid');
  });
  it('restante e janelas', () => {
    expect(remainingCents({ ...occ, status: 'partial', paidCents: 10000 })).toBe(15000);
    expect(remainingCents({ ...occ, status: 'paid', paidCents: 25000 })).toBe(0);
    expect(inWindow(occ, '7d', '2026-10-05')).toBe(true);
    expect(inWindow({ ...occ, dueDate: '2026-10-20' }, '7d', '2026-10-05')).toBe(false);
    expect(inWindow({ ...occ, dueDate: '2026-10-20' }, '30d', '2026-10-05')).toBe(true);
    expect(inWindow(occ, 'overdue', '2026-10-11')).toBe(true);
  });
  it('rótulos de vencimento', () => {
    expect(dueLabel('2026-10-14', '2026-10-14')).toBe('Vence hoje');
    expect(dueLabel('2026-10-17', '2026-10-14')).toBe('Vence em 3 dias');
    expect(dueLabel('2026-10-12', '2026-10-14')).toBe('Venceu há 2 dias');
  });
});

describe('CSV', () => {
  it('separador ;, vírgula decimal, BOM e proteção contra fórmula', () => {
    const csv = toCSV(
      [
        { d: 'Mercado; feira', v: 60000 },
        { d: '=HYPERLINK("x")', v: -5 },
      ],
      [
        { header: 'Descrição', value: (r) => r.d },
        { header: 'Valor', value: (r) => r.v, money: true },
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Descrição;Valor');
    expect(csv).toContain('"Mercado; feira";600,00');
    expect(csv).toContain('"\'=HYPERLINK(""x"")";-0,05');
  });
});
