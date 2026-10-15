import { Landmark, LogOut, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { readPendingInvite } from '@/auth/guards';
import { api, useAppMutation, useGroupContextQuery } from '@/data/queries';
import { formatBRL } from '@/domain/money';
import { Brand } from '@/layout/AppShell';
import { TextField } from '@/ui/Field';
import { Notice, Spinner } from '@/ui/States';
import { ACCOUNT_KIND_LABEL, AccountForm } from '../settings/AccountForm';
import { InviteBox } from './InviteBox';

type Step = 'group' | 'accounts' | 'invite';

export function OnboardingPage() {
  const ctx = useGroupContextQuery();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('group');
  const [name, setName] = useState('Nossa casa');
  const [error, setError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(false);

  // Recarregou no meio do assistente: a carteira já existe, segue dali.
  useEffect(() => {
    if (ctx.data && step === 'group') setStep('accounts');
  }, [ctx.data, step]);

  const groupId = ctx.data?.group.id;
  const accounts = useQuery({
    queryKey: ['g', groupId, 'accounts'],
    queryFn: () => api.listAccounts(groupId!),
    enabled: !!groupId,
  });

  const create = useAppMutation((n: string) => api.createGroup(n), { success: 'Carteira criada.', onSuccess: () => setStep('accounts') });

  if (readPendingInvite() && !ctx.data) return <Navigate to="/convite" replace />;
  if (ctx.isPending) {
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  }

  function submitGroup(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Dê um nome para a carteira.');
    setError(null);
    create.mutate(name.trim());
  }

  const stepIndex = step === 'group' ? 0 : step === 'accounts' ? 1 : 2;

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ width: 'min(520px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Brand />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden /> Sair
          </button>
        </div>
        <div className="card" style={{ display: 'grid', gap: 20 }}>
          <div className="wizard-steps" aria-label={`Passo ${stepIndex + 1} de 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i <= stepIndex ? 'done' : ''} />
            ))}
          </div>

          {step === 'group' && (
            <form className="form" onSubmit={submitGroup} noValidate>
              <div style={{ display: 'grid', gap: 4 }}>
                <h1>Olá{user?.user_metadata?.full_name ? `, ${String(user.user_metadata.full_name).split(' ')[0]}` : ''}!</h1>
                <p className="muted small">
                  Vamos criar a carteira que vocês dois vão compartilhar. Se seu par já criou uma, peça o link de convite a ele(a) e abra-o
                  neste aparelho.
                </p>
              </div>
              {error && <Notice tone="danger">{error}</Notice>}
              <TextField label="Nome da carteira" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
              <p className="field-hint">Moeda: Real (BRL). Você será quem administra a carteira.</p>
              <button type="submit" className="btn btn-primary btn-block" disabled={create.isPending}>
                {create.isPending ? <Spinner label="Criando" /> : 'Criar carteira'}
              </button>
            </form>
          )}

          {step === 'accounts' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h1>Onde está o dinheiro?</h1>
                <p className="muted small">
                  Cadastre as contas que vocês usam e o saldo de hoje. É a partir desse saldo inicial que o app calcula quanto vocês têm —
                  ele não inventa um valor. Se preferir, pule e faça depois em Carteira.
                </p>
              </div>
              {accounts.data && accounts.data.length > 0 ? (
                <ul className="list">
                  {accounts.data.map((a) => (
                    <li key={a.id} className="list-item">
                      <span className="list-icon">
                        <Landmark size={18} aria-hidden />
                      </span>
                      <div className="list-main">
                        <div className="list-title">{a.name}</div>
                        <div className="list-sub">{ACCOUNT_KIND_LABEL[a.kind]}</div>
                      </div>
                      <span className="list-end">
                        {a.openingBalanceCents === null ? <span className="badge badge-warning">Sem saldo inicial</span> : formatBRL(a.openingBalanceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Notice>Nenhuma conta ainda. Sugestão: uma conta conjunta e a conta pessoal de cada um.</Notice>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setAccountForm(true)}>
                <Plus size={16} aria-hidden /> Adicionar conta
              </button>
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={() => setStep('invite')}>
                  {accounts.data?.length ? 'Continuar' : 'Pular por enquanto'}
                </button>
              </div>
            </div>
          )}

          {step === 'invite' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h1>Convide seu par</h1>
                <p className="muted small">A carteira só fica completa quando a outra pessoa entra com a conta dela.</p>
              </div>
              <InviteBox />
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
                  Ir para o início
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {accountForm && ctx.data && <AccountForm onClose={() => setAccountForm(false)} />}
    </main>
  );
}
