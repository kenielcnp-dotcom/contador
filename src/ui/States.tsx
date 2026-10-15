import { CircleAlert, Info, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/data/errors';

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden />;
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Carregando">
      <Skeleton height={14} width="40%" />
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} height={18} width={`${90 - i * 12}%`} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} aria-hidden />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="notice notice-danger" role="alert">
      <CircleAlert size={18} aria-hidden />
      <div style={{ flex: 1 }}>
        <strong>Não foi possível carregar.</strong> {errorMessage(error)}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  const Icon = tone === 'warning' || tone === 'danger' ? TriangleAlert : Info;
  return (
    <div className={`notice notice-${tone}`}>
      <Icon size={18} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
