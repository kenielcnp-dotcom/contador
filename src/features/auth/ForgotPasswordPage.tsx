import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/data/errors';
import { api } from '@/data/queries';
import { TextField } from '@/ui/Field';
import { EmptyState, Notice, Spinner } from '@/ui/States';
import { AuthLayout, isEmail } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setError('Informe um e-mail válido.');
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email.trim(), `${window.location.origin}/redefinir-senha`);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Recuperar senha" footer={<Link to="/entrar">Voltar para o login</Link>}>
      {sent ? (
        <EmptyState icon={MailCheck} title="Verifique seu e-mail">
          Se existir uma conta com <strong>{email.trim()}</strong>, você vai receber um link para criar uma nova senha.
        </EmptyState>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          {error && <Notice tone="danger">{error}</Notice>}
          <TextField label="E-mail da conta" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <Spinner label="Enviando" /> : 'Enviar link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
