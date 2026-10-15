// Datas são strings ISO "AAAA-MM-DD" (sem fuso), como o Postgres devolve
// colunas date. Comparação lexicográfica = comparação cronológica.

export type ISODate = string;

export interface Period {
  start: ISODate;
  end: ISODate; // inclusivo
}

export type PeriodPreset = 'current' | 'previous' | 'custom';

const TZ = 'America/Sao_Paulo';
const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data de hoje no fuso de Brasília (a mesma regra do banco). */
export function todayISO(now: Date = new Date()): ISODate {
  return isoFormatter.format(now);
}

function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromUTC(toUTC(value)) === value;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 = 28/02). */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d!, lastDay));
  return fromUTC(target);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

export function monthPeriod(date: ISODate): Period {
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

export function previousMonthPeriod(date: ISODate): Period {
  return monthPeriod(addMonths(startOfMonth(date), -1));
}

export function inPeriod(date: ISODate | null | undefined, period: Period): boolean {
  return !!date && date >= period.start && date <= period.end;
}

export function isFullMonth(period: Period): boolean {
  return period.start === startOfMonth(period.start) && period.end === endOfMonth(period.start);
}

/** Lista de meses (primeiro dia) que tocam o período, em ordem. */
export function monthsBetween(period: Period): ISODate[] {
  const months: ISODate[] = [];
  let cursor = startOfMonth(period.start);
  while (cursor <= period.end && months.length < 120) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** O período de mesma duração imediatamente anterior (para comparativos). */
export function precedingPeriod(period: Period): Period {
  if (isFullMonth(period)) return previousMonthPeriod(period.start);
  const length = Math.round((toUTC(period.end).getTime() - toUTC(period.start).getTime()) / 86_400_000);
  const end = addDays(period.start, -1);
  return { start: addDays(end, -length), end };
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

const monthLong = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "outubro de 2026" → "Outubro de 2026" */
export function formatMonth(date: ISODate): string {
  return capitalize(monthLong.format(toUTC(date)));
}

/** "out" */
export function formatMonthShort(date: ISODate): string {
  return monthShort.format(toUTC(date)).replace('.', '');
}

/** "14 de out." */
export function formatDayMonth(date: ISODate): string {
  return dayMonth.format(toUTC(date));
}

/** "14/10/2026" */
export function formatDate(date: ISODate | null | undefined): string {
  return date ? fullDate.format(toUTC(date)) : '—';
}

export function formatPeriod(period: Period): string {
  if (isFullMonth(period)) return formatMonth(period.start);
  return `${formatDate(period.start)} a ${formatDate(period.end)}`;
}

export function resolvePreset(preset: PeriodPreset, today: ISODate, custom?: Period): Period {
  if (preset === 'previous') return previousMonthPeriod(today);
  if (preset === 'custom' && custom && custom.start <= custom.end) return custom;
  return monthPeriod(today);
}
