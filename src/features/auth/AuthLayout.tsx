import type { ReactNode } from 'react';
import { APP_TAGLINE } from '@/app/config';
import { Brand } from '@/layout/AppShell';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div style={{ display: 'grid', gap: 6 }}>
          <Brand />
          <p className="muted small">{APP_TAGLINE}</p>
        </div>
        <div className="card">
          <div style={{ display: 'grid', gap: 4, marginBottom: 20 }}>
            <h1>{title}</h1>
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="auth-links">{footer}</div>}
      </div>
    </main>
  );
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
