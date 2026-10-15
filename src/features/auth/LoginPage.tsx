import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/data/errors';
import { api } from '@/data/queries';
import { TextField } from '@/ui/Field';
import { Notice, Spinner } from '@/ui/States';
import { AuthLayout, isEmail } from './AuthLayout';

export function LoginPage() {
  const { signedOutReason } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setError('Informe um e-mail válido.');
    if (!password) return setError('Informe a senha.');
    setBusy(true);
    setError(null);
    try {
      await api.signIn(email.trim(), password);
      // O redirecionamento acontece quando a sessão chega (RequireGuest).
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse a carteira que você divide com seu par."
      footer={
        <>
          <Link to="/cadastro">Criar conta</Link>
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        {signedOutReason && !error && <Notice tone="warning">{signedOutReason}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField label="E-mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner label="Entrando" /> : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
