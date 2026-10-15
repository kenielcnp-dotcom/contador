import { Camera, LogOut } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { AVATAR_MAX_BYTES } from '@/app/config';
import { useAuth } from '@/auth/AuthProvider';
import { api, useAppMutation, useGroup } from '@/data/queries';
import { Avatar } from '@/ui/Avatar';
import { TextField } from '@/ui/Field';
import { Notice, Spinner } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { passwordProblem } from '../auth/SignupPage';

export default function ProfilePage() {
  const { me, userId } = useGroup();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);

  const saveName = useAppMutation(() => api.updateProfile(userId, { fullName: name }), { success: 'Nome atualizado.' });
  const saveAvatar = useAppMutation(
    async (file: File) => {
      const path = await api.uploadAvatar(userId, file);
      await api.updateProfile(userId, { avatarPath: path });
    },
    { success: 'Foto atualizada.' },
  );
  const removeAvatar = useAppMutation(() => api.updateProfile(userId, { avatarPath: null }), { success: 'Foto removida.' });
  const savePassword = useAppMutation(() => api.updatePassword(password), {
    success: 'Senha alterada.',
    onSuccess: () => {
      setPassword('');
      setConfirm('');
    },
  });

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password) ?? (password !== confirm ? 'As senhas não conferem.' : null);
    setPwError(p);
    if (!p) savePassword.mutate(undefined);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Perfil</h1>
          <p>{user?.email}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          <LogOut size={16} aria-hidden /> Sair
        </button>
      </header>

      <div className="grid grid-2">
        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2>Seus dados</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar name={me.name} path={me.avatarPath} size="lg" />
            <div style={{ display: 'grid', gap: 6 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={saveAvatar.isPending}>
                {saveAvatar.isPending ? <Spinner label="Enviando" /> : <Camera size={14} aria-hidden />} {me.avatarPath ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              {me.avatarPath && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAvatar.mutate(undefined)} disabled={removeAvatar.isPending}>
                  Remover foto
                </button>
              )}
              <span className="small muted">JPG, PNG ou WEBP até 2 MB. Só vocês dois veem.</span>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast.error('Use uma imagem JPG, PNG ou WEBP.');
                if (f.size > AVATAR_MAX_BYTES) return toast.error('Imagem grande demais (máximo 2 MB).');
                saveAvatar.mutate(f);
              }}
            />
          </div>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) saveName.mutate(undefined);
            }}
          >
            <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button type="submit" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={saveName.isPending || !name.trim() || name.trim() === me.name}>
              {saveName.isPending ? <Spinner label="Salvando" /> : 'Salvar nome'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 16 }}>Trocar senha</h2>
          <form className="form" onSubmit={submitPassword} noValidate>
            {pwError && <Notice tone="danger">{pwError}</Notice>}
            <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 8 caracteres, com letras e números." />
            <TextField label="Confirme a nova senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={savePassword.isPending}>
              {savePassword.isPending ? <Spinner label="Salvando" /> : 'Alterar senha'}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
