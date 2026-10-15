import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/data/errors';
import { api } from '@/data/queries';
import { TextField } from '@/ui/Field';
import { EmptyState, Notice, Spinner } from '@/ui/States';
import { AuthLayout, isEmail } from './AuthLayout';

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Misture letras e números.';
  return null;
}

export function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Como você quer ser chamado(a)?';
    if (!isEmail(email)) next.email = 'Informe um e-mail válido.';
    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    if (confirm !== password) next.confirm = 'As senhas não conferem.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setError(null);
    try {
      const res = await api.signUp(email.trim(), password, name.trim(), `${window.location.origin}/`);
      if (res.needsConfirmation) setSentTo(email.trim());
      // Sem confirmação de e-mail, a sessão chega e o app segue sozinho.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confirme seu e-mail" footer={<Link to="/entrar">Voltar para o login</Link>}>
        <EmptyState icon={MailCheck} title="Quase lá">
          Enviamos um link de confirmação para <strong>{sentTo}</strong>. Abra-o neste aparelho para ativar a conta. Não chegou?
          Confira o spam.
        </EmptyState>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Cada pessoa do casal tem a própria conta de acesso."
      footer={
        <span>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </span>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField label="Seu nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <TextField label="E-mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="Mínimo de 8 caracteres, com letras e números."
        />
        <TextField label="Confirme a senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner label="Criando conta" /> : 'Criar conta'}
        </button>
      </form>
    </AuthLayout>
  );
}
