// Exportação CSV no formato que o Excel brasileiro abre direto:
// separador ";", vírgula decimal e BOM UTF-8 para acentos.

import { centsToDecimalString } from './money';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Colunas de dinheiro recebem centavos e saem como "1234,56". */
  money?: boolean;
}

function escape(raw: string): string {
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escape(c.header)).join(';')];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(row);
          if (v === null || v === undefined) return '';
          if (c.money && typeof v === 'number') return centsToDecimalString(v);
          return escape(String(v));
        })
        .join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
