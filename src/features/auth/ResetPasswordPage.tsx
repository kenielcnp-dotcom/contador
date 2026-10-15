import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/data/errors';
import { api } from '@/data/queries';
import { TextField } from '@/ui/Field';
import { useToast } from '@/ui/Toast';
import { Notice, Spinner } from '@/ui/States';
import { AuthLayout } from './AuthLayout';
import { passwordProblem } from './SignupPage';

export function ResetPasswordPage() {
  const { user, loading, clearRecovering } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthLayout title="Link inválido ou expirado" footer={<Link to="/entrar">Voltar para o login</Link>}>
        <p className="muted">
          Este link de redefinição não vale mais. <Link to="/recuperar-senha">Peça um novo</Link>.
        </p>
      </AuthLayout>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pw = passwordProblem(password);
    if (pw) return setError(pw);
    if (confirm !== password) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    try {
      await api.updatePassword(password);
      clearRecovering();
      toast.success('Senha alterada.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Nova senha" subtitle={`Conta: ${user.email ?? ''}`}>
      <form className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 8 caracteres, com letras e números." />
        <TextField label="Confirme a nova senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner label="Salvando" /> : 'Salvar nova senha'}
        </button>
      </form>
    </AuthLayout>
  );
}
