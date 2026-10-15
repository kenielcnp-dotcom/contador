import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { api, useAppMutation } from '@/data/queries';
import { useToast } from '@/ui/Toast';
import { Notice, Spinner } from '@/ui/States';

export function inviteLink(token: string): string {
  // O token vai no fragmento (#): navegadores não o enviam ao servidor nem ao log de acesso.
  return `${window.location.origin}/convite#${token}`;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Gera e mostra o link de convite (válido 72 h, uso único). */
export function InviteBox() {
  const toast = useToast();
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(null);
  const create = useAppMutation(() => api.createInvitation(72), {
    onSuccess: (r) => setInvite({ token: r.token, expiresAt: r.expiresAt }),
  });

  if (!invite) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="muted small">
          O link vale por 72 horas e só pode ser usado uma vez. Gerar um novo cancela o anterior. A outra pessoa precisa criar a própria conta
          antes de entrar.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => create.mutate(undefined)} disabled={create.isPending}>
          {create.isPending ? <Spinner label="Gerando" /> : 'Gerar link de convite'}
        </button>
      </div>
    );
  }

  const link = inviteLink(invite.token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não consegui copiar. Selecione o link e copie manualmente.');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Convite para nossa carteira', text: 'Entre na nossa carteira compartilhada:', url: link });
    } catch {
      /* compartilhamento cancelado */
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Notice tone="success">Convite gerado. Envie só para seu par — quem tiver o link pode entrar na carteira.</Notice>
      <div className="token-box">
        <span style={{ flex: 1 }}>{link}</span>
      </div>
      <p className="small muted">Válido até {dateTime.format(new Date(invite.expiresAt))}.</p>
      <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn btn-secondary" onClick={copy}>
          <Copy size={16} aria-hidden /> Copiar link
        </button>
        {'share' in navigator && (
          <button type="button" className="btn btn-secondary" onClick={share}>
            <Share2 size={16} aria-hidden /> Compartilhar
          </button>
        )}
      </div>
    </div>
  );
}
