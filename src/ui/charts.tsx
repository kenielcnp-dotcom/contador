// Gráficos em SVG puro (sem biblioteca): barras ≤ 24px com ponta arredondada
// a partir de uma linha de base, grade discreta, legenda sempre presente com
// 2+ séries, tooltip ao passar o mouse/tocar e tabela equivalente.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatBRL } from '@/domain/money';
import { formatMonth, formatMonthShort } from '@/domain/period';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Arredonda o topo da escala para um número "limpo" (1, 2, 2,5, 5 × 10^n). */
function niceMax(value: number): number {
  // Escala mínima de R$ 100: com tudo zerado, os rótulos não se repetem (0, 0, 1…).
  if (value < 10_000) return 10_000;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Barra com 4px de raio só na ponta de dado; quadrada na base. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function TableToggle({ children }: { children: ReactNode }) {
  return (
    <details className="details-toggle">
      <summary>Ver como tabela</summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        {children}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
export interface IncomeExpensePoint {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export function IncomeExpenseChart({ data, height = 220 }: { data: IncomeExpensePoint[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents])));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(4, Math.min(24, (band - 14) / 2));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));

  return (
    <div>
      <div className="chart-legend" aria-hidden>
        <span>
          <i className="swatch" style={{ background: 'var(--chart-income)' }} /> Receitas
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--chart-expense)' }} /> Despesas
        </span>
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        {width > 0 && (
          <svg className="chart" width={width} height={height} role="img" aria-label="Receitas e despesas por mês">
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
                  {formatBRL(t, { compact: true }).replace('R$ ', '')}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.left + band * i + band / 2;
              return (
                <g key={d.month}>
                  {hover === i && <rect x={cx - band / 2 + 2} y={pad.top} width={band - 4} height={innerH} fill="var(--surface-2)" rx={6} />}
                  <path d={barPath(cx - barW - 1, y(d.incomeCents), barW, pad.top + innerH - y(d.incomeCents))} fill="var(--chart-income)" />
                  <path d={barPath(cx + 1, y(d.expenseCents), barW, pad.top + innerH - y(d.expenseCents))} fill="var(--chart-expense)" />
                  <text x={cx} y={height - 8} textAnchor="middle">
                    {formatMonthShort(d.month)}
                  </text>
                  {/* Área de toque maior que as barras */}
                  <rect
                    x={cx - band / 2}
                    y={pad.top}
                    width={band}
                    height={innerH + pad.bottom}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
            <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="var(--border-strong)" />
          </svg>
        )}
        {hover !== null && data[hover] && (
          <div className="chart-tooltip" style={{ left: pad.left + band * hover + band / 2, top: pad.top + 4 }}>
            <strong>{formatMonth(data[hover]!.month)}</strong>
            <div className="tt-row">
              <span>
                <i className="swatch" style={{ background: 'var(--chart-income)' }} /> Receitas
              </span>
              <span>{formatBRL(data[hover]!.incomeCents)}</span>
            </div>
            <div className="tt-row">
              <span>
                <i className="swatch" style={{ background: 'var(--chart-expense)' }} /> Despesas
              </span>
              <span>{formatBRL(data[hover]!.expenseCents)}</span>
            </div>
            <div className="tt-row">
              <span>Saldo</span>
              <span>{formatBRL(data[hover]!.incomeCents - data[hover]!.expenseCents, { signed: true })}</span>
            </div>
          </div>
        )}
      </div>
      <TableToggle>
        <table className="table">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Receitas</th>
              <th className="num">Despesas</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{formatMonth(d.month)}</td>
                <td className="num">{formatBRL(d.incomeCents)}</td>
                <td className="num">{formatBRL(d.expenseCents)}</td>
                <td className="num">{formatBRL(d.incomeCents - d.expenseCents, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function BalanceLineChart({ data, height = 200 }: { data: { month: string; balanceCents: number }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 16, right: 16, bottom: 26, left: 56 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const values = data.map((d) => d.balanceCents);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(1, ...values);
  const max = niceMax(rawMax);
  const min = rawMin < 0 ? -niceMax(-rawMin) : 0;
  const x = (i: number) => pad.left + (data.length <= 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min)) * innerH;
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.balanceCents)}`).join(' ');
  const area = data.length ? `${line} L${x(data.length - 1)},${y(Math.max(min, 0))} L${x(0)},${y(Math.max(min, 0))} Z` : '';
  const ticks = [min, (min + max) / 2, max].map(Math.round);
  const last = data[data.length - 1];

  const onMove = (clientX: number, rect: DOMRect) => {
    if (data.length === 0) return;
    const rel = clientX - rect.left - pad.left;
    const i = data.length === 1 ? 0 : Math.round((rel / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div>
      <div ref={ref} style={{ position: 'relative' }}>
        {width > 0 && (
          <svg
            className="chart"
            width={width}
            height={height}
            role="img"
            aria-label="Evolução do saldo das contas no fim de cada mês"
            onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            onTouchMove={(e) => onMove(e.touches[0]!.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
                  {formatBRL(t, { compact: true }).replace('R$ ', '')}
                </text>
              </g>
            ))}
            <path d={area} fill="var(--chart-income)" opacity={0.1} />
            <path d={line} fill="none" stroke="var(--chart-income)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => (
              <text key={d.month} x={x(i)} y={height - 8} textAnchor="middle">
                {data.length > 8 && i % 2 === 1 ? '' : formatMonthShort(d.month)}
              </text>
            ))}
            {hover !== null && data[hover] && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--border-strong)" />
                <circle cx={x(hover)} cy={y(data[hover]!.balanceCents)} r={5} fill="var(--chart-income)" stroke="var(--card)" strokeWidth={2} />
              </g>
            )}
            {last && hover === null && (
              <circle cx={x(data.length - 1)} cy={y(last.balanceCents)} r={4.5} fill="var(--chart-income)" stroke="var(--card)" strokeWidth={2} />
            )}
          </svg>
        )}
        {hover !== null && data[hover] && (
          <div className="chart-tooltip" style={{ left: x(hover), top: y(data[hover]!.balanceCents) }}>
            <strong>{formatMonth(data[hover]!.month)}</strong>
            <div className="tt-row">
              <span>Saldo no fim do mês</span>
              <span>{formatBRL(data[hover]!.balanceCents)}</span>
            </div>
          </div>
        )}
      </div>
      <TableToggle>
        <table className="table">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Saldo no fim do mês</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{formatMonth(d.month)}</td>
                <td className="num">{formatBRL(d.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
}

// ---------------------------------------------------------------------------
/** Barras horizontais de uma só série (nome, barra, valor). Sem legenda: o título diz o que é. */
export function CategoryBars({
  rows,
  limit = 6,
}: {
  rows: { id: string; name: string; cents: number; percent: number }[];
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const restCents = rest.reduce((s, r) => s + r.cents, 0);
  const all = restCents > 0 ? [...shown, { id: 'outras', name: 'Demais categorias', cents: restCents, percent: rest.reduce((s, r) => s + r.percent, 0) }] : shown;
  const max = Math.max(1, ...all.map((r) => r.cents));
  return (
    <div className="hbar" role="list">
      {all.map((r) => (
        <div className="hbar-row" key={r.id} role="listitem" title={`${r.name}: ${formatBRL(r.cents)} (${r.percent.toLocaleString('pt-BR')}%)`}>
          <span className="hbar-name">{r.name}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(r.cents / max) * 100}%` }} />
          </span>
          <span className="hbar-value">
            {formatBRL(r.cents)} <span className="muted small">{Math.round(r.percent)}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  committed,
  tone,
  label,
}: {
  value: number;
  max: number;
  committed?: number;
  tone?: 'ok' | 'notice' | 'warning' | 'danger';
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, (Math.max(0, value) / max) * 100) : 0;
  const cpct = committed !== undefined && max > 0 ? Math.min(100, (Math.max(0, committed) / max) * 100) : 0;
  return (
    <div
      className="progress"
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      {committed !== undefined && <div className="progress-bar committed" style={{ width: `${cpct}%` }} />}
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
