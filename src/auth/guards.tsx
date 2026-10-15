import { Navigate, Outlet, useLocation } from 'react-router';
import { useGroupContextQuery } from '@/data/queries';
import { ErrorState, Spinner } from '@/ui/States';
import { useAuth } from './AuthProvider';

export const PENDING_INVITE_KEY = 'convite-pendente';

export function readPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

function Splash() {
  return (
    <div className="center-page">
      <Spinner />
    </div>
  );
}

/** Rotas internas: sem sessão volta para o login, lembrando para onde ia. */
export function RequireAuth() {
  const { user, loading, recovering } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (recovering) return <Navigate to="/redefinir-senha" replace />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Login/cadastro: quem já está logado vai para o app. */
export function RequireGuest() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={readPendingInvite() ? '/convite' : from || '/'} replace />;
  }
  return <Outlet />;
}

/** Telas da carteira: sem carteira ativa, vai para o assistente (ou para o convite pendente). */
export function RequireGroup() {
  const ctx = useGroupContextQuery();
  if (ctx.isPending) return <Splash />;
  if (ctx.isError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />
        </div>
      </div>
    );
  }
  if (!ctx.data) return <Navigate to={readPendingInvite() ? '/convite' : '/configurar'} replace />;
  return <Outlet />;
}
