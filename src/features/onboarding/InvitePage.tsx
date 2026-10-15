import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailQuestion, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { PENDING_INVITE_KEY, readPendingInvite } from '@/auth/guards';
import { errorMessage } from '@/data/errors';
import { api } from '@/data/queries';
import { AuthLayout } from '../auth/AuthLayout';
import { EmptyState, Notice, Spinner } from '@/ui/States';

function storeInvite(token: string | null) {
  try {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
    else sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* armazenamento indisponível: o convite segue só pela URL */
  }
}

const STATUS_TEXT: Record<string, string> = {
  invalid: 'Este convite não existe. Confira se o link foi copiado inteiro ou peça um novo.',
  expired: 'Este convite expirou. Peça um novo link.',
  used: 'Este convite já foi usado por outra pessoa.',
  revoked: 'Este convite foi cancelado. Peça um novo link.',
  full: 'Esta carteira já tem o número máximo de participantes.',
  other_group: 'Você já participa de outra carteira. Para entrar nesta, saia da atual em Carteira › Sair da carteira.',
};

export function InvitePage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [token] = useState(() => {
    const fromHash = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
    return /^[0-9a-f]{48}$/i.test(fromHash) ? fromHash : readPendingInvite();
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Guarda o token (e tira da barra de endereço) para sobreviver ao cadastro/login.
  useEffect(() => {
    if (token) storeInvite(token);
    if (location.hash) window.history.replaceState(null, '', '/convite');
  }, [token, location.hash]);

  const preview = useQuery({
    queryKey: ['invite-preview', token, user?.id],
    queryFn: () => api.previewInvitation(token!),
    enabled: !!token && !!user,
    retry: false,
  });

  if (loading) {
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  }

  if (!token) {
    return (
      <AuthLayout title="Convite" footer={<Link to="/">Ir para o início</Link>}>
        <EmptyState icon={MailQuestion} title="Nenhum convite encontrado">
          Abra o link completo que seu par enviou.
        </EmptyState>
      </AuthLayout>
    );
  }

  if (!user) {
    return (
      <AuthLayout title="Você foi convidado(a)" subtitle="Para entrar na carteira compartilhada, use a sua própria conta.">
        <div style={{ display: 'grid', gap: 12 }}>
          <Link to="/cadastro" className="btn btn-primary btn-block">
            Criar minha conta
          </Link>
          <Link to="/entrar" className="btn btn-secondary btn-block">
            Já tenho conta
          </Link>
          <p className="small muted">Depois de entrar, você volta para cá para aceitar o convite.</p>
        </div>
      </AuthLayout>
    );
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvitation(token!);
      storeInvite(null);
      await qc.invalidateQueries({ queryKey: ['ctx'] });
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    storeInvite(null);
    navigate('/', { replace: true });
  }

  const p = preview.data;
  return (
    <AuthLayout title="Convite para carteira compartilhada">
      {preview.isPending ? (
        <Spinner />
      ) : preview.isError ? (
        <Notice tone="danger">{errorMessage(preview.error)}</Notice>
      ) : p?.status === 'member' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Notice tone="success">Você já participa da carteira {p.groupName}.</Notice>
          <button type="button" className="btn btn-primary" onClick={discard}>
            Abrir a carteira
          </button>
        </div>
      ) : p?.status === 'valid' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <EmptyState icon={UsersRound} title={p.groupName ?? 'Carteira'}>
            <strong>{p.invitedBy}</strong> convidou você para dividir esta carteira. Vocês dois vão ver os mesmos saldos, contas e
            movimentações.
          </EmptyState>
          {error && <Notice tone="danger">{error}</Notice>}
          <button type="button" className="btn btn-primary btn-block" onClick={accept} disabled={busy}>
            {busy ? <Spinner label="Entrando" /> : 'Aceitar e entrar'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={discard} disabled={busy}>
            Agora não
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Notice tone="warning">{STATUS_TEXT[p?.status ?? 'invalid']}</Notice>
          <button type="button" className="btn btn-secondary" onClick={discard}>
            Continuar sem o convite
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
