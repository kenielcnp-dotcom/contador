import { Archive, ArchiveRestore, History, Landmark, LogOut, Pencil, Plus, Tag, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Account, Category } from '@/data/models';
import { api, useAccountBalances, useActivity, useAppMutation, useGroup, useInvitations } from '@/data/queries';
import { formatBRL } from '@/domain/money';
import { Avatar } from '@/ui/Avatar';
import { useConfirm } from '@/ui/Confirm';
import { Segmented, TextField } from '@/ui/Field';
import { CategoryIcon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { ErrorState, LoadingCard, Notice, Spinner } from '@/ui/States';
import { InviteBox } from '../onboarding/InviteBox';
import { useLookups } from '../shared/lookups';
import { ACCOUNT_KIND_LABEL, AccountForm } from './AccountForm';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function WalletSettingsPage() {
  const { group, me, activeMembers, userId } = useGroup();
  const isOwner = me.role === 'owner';
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [name, setName] = useState(group.name);
  const [sharesOpen, setSharesOpen] = useState(false);

  const rename = useAppMutation(() => api.renameGroup(group.id, name.trim()), { success: 'Nome atualizado.' });
  const remove = useAppMutation((uid: string) => api.removeMember(uid), {
    success: (_r, uid) => (uid === userId ? 'Você saiu da carteira.' : 'Participante removido. O histórico foi mantido.'),
    onSuccess: (_r, uid) => {
      if (uid === userId) navigate('/configurar', { replace: true });
    },
  });

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Carteira</h1>
          <p>Participantes, contas, categorias e histórico.</p>
        </div>
      </header>

      <div className="grid grid-2 section">
        <section className="card" style={{ display: 'grid', gap: 14 }}>
          <h2>Dados da carteira</h2>
          <form
            className="form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (name.trim()) rename.mutate(undefined);
            }}
          >
            <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!isOwner} hint={isOwner ? undefined : 'Só quem administra pode renomear.'} />
            {isOwner && (
              <button type="submit" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={rename.isPending || !name.trim() || name.trim() === group.name}>
                {rename.isPending ? <Spinner label="Salvando" /> : 'Salvar nome'}
              </button>
            )}
          </form>
          <dl className="dl">
            <dt>Moeda</dt>
            <dd>Real (BRL)</dd>
            <dt>Criada em</dt>
            <dd>{dateTime.format(new Date(group.createdAt))}</dd>
            <dt>Participantes</dt>
            <dd>
              {activeMembers.length} de {group.maxMembers}
            </dd>
          </dl>
        </section>

        <section className="card" style={{ display: 'grid', gap: 14 }}>
          <div className="card-header" style={{ marginBottom: 0 }}>
            <h2>Participantes</h2>
            {isOwner && activeMembers.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSharesOpen(true)}>
                Divisão sugerida
              </button>
            )}
          </div>
          <ul className="list">
            {activeMembers.map((m) => (
              <li key={m.userId} className="list-item">
                <Avatar name={m.name} path={m.avatarPath} partner={m.userId !== userId} />
                <span className="list-main">
                  <span className="list-title" style={{ display: 'block' }}>
                    {m.name} {m.userId === userId && <span className="muted">(você)</span>}
                  </span>
                  <span className="list-sub">
                    {m.role === 'owner' ? 'Administra' : 'Participante'} · divisão sugerida {m.sharePercent.toLocaleString('pt-BR')}%
                  </span>
                </span>
                {isOwner && m.userId !== userId && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remover ${m.name}`}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Remover ${m.name}?`,
                          message: 'A pessoa perde o acesso na hora. Nenhuma movimentação é apagada: tudo que ela lançou continua no histórico.',
                          confirmLabel: 'Remover',
                          danger: true,
                        })
                      )
                        remove.mutate(m.userId);
                    }}
                  >
                    <UserMinus size={18} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {activeMembers.length < group.maxMembers && (isOwner ? <InviteSection /> : <Notice>Peça para quem administra a carteira gerar um convite.</Notice>)}
          {(!isOwner || activeMembers.length === 1) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ justifySelf: 'start', color: 'var(--red)' }}
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Sair da carteira?',
                    message: activeMembers.length === 1 ? 'Você é a única pessoa aqui: a carteira será arquivada. Os dados ficam guardados, mas sem acesso.' : 'Você perde o acesso aos dados compartilhados. Para voltar, precisará de um novo convite.',
                    confirmLabel: 'Sair',
                    danger: true,
                  })
                )
                  remove.mutate(userId);
              }}
            >
              <LogOut size={14} aria-hidden /> Sair da carteira
            </button>
          )}
        </section>
      </div>

      <AccountsSection />
      <CategoriesSection />
      <ActivitySection />

      {sharesOpen && <SharesForm onClose={() => setSharesOpen(false)} />}
    </>
  );
}

function InviteSection() {
  const invitations = useInvitations();
  const revoke = useAppMutation((id: string) => api.revokeInvitation(id), { success: 'Convite cancelado.' });
  const pending = (invitations.data ?? []).filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date());
  return (
    <div style={{ display: 'grid', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <h3>Convidar</h3>
      {pending.length > 0 && (
        <Notice>
          Há um convite válido até {dateTime.format(new Date(pending[0]!.expiresAt))}. Por segurança o link não pode ser exibido de novo; gere
          outro se precisar.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke.mutate(pending[0]!.id)} disabled={revoke.isPending}>
            Cancelar convite
          </button>
        </Notice>
      )}
      <InviteBox />
    </div>
  );
}

function SharesForm({ onClose }: { onClose: () => void }) {
  const { activeMembers } = useGroup();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(activeMembers.map((m) => [m.userId, String(m.sharePercent).replace('.', ',')])));
  const [error, setError] = useState<string | null>(null);
  const save = useAppMutation(
    () => api.updateMemberShares(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v.replace(',', '.'))]))),
    { success: 'Divisão sugerida atualizada.', onSuccess: onClose },
  );
  const total = Object.values(values).reduce((s, v) => s + (Number(v.replace(',', '.')) || 0), 0);
  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title="Divisão sugerida"
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending}
            onClick={() => {
              if (Math.round(total * 100) !== 10000) return setError('Os percentuais precisam somar 100%.');
              setError(null);
              save.mutate(undefined);
            }}
          >
            {save.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="form">
        <p className="small muted">
          Quanto cada pessoa deveria contribuir com as despesas (por exemplo, proporcional à renda). É usado no modo “%” do rateio e no
          resumo de contribuições. Não altera despesas já lançadas.
        </p>
        {error && <Notice tone="danger">{error}</Notice>}
        {activeMembers.map((m) => (
          <TextField key={m.userId} label={`${m.name} (%)`} inputMode="decimal" value={values[m.userId] ?? ''} onChange={(e) => setValues({ ...values, [m.userId]: e.target.value.replace(/[^\d,.]/g, '') })} />
        ))}
        <span className="small muted">Total: {total.toLocaleString('pt-BR')}%</span>
      </div>
    </Sheet>
  );
}

function AccountsSection() {
  const l = useLookups();
  const balances = useAccountBalances();
  const [form, setForm] = useState<{ account?: Account } | null>(null);
  const archive = useAppMutation((a: { id: string; archived: boolean }) => api.updateAccount(a.id, { archived: a.archived }), {
    success: (_r, a) => (a.archived ? 'Conta arquivada.' : 'Conta reativada.'),
  });
  const balanceOf = (id: string) => balances.data?.find((b) => b.accountId === id);

  return (
    <section className="card section">
      <div className="card-header">
        <h2>Contas financeiras</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({})}>
          <Plus size={14} aria-hidden /> Nova conta
        </button>
      </div>
      {!l.ready ? (
        <LoadingCard lines={3} />
      ) : l.accounts.length === 0 ? (
        <Notice tone="warning">Nenhuma conta cadastrada. Sem contas e saldo inicial, o app não consegue mostrar quanto vocês têm.</Notice>
      ) : (
        <ul className="list">
          {l.accounts.map((a) => {
            const b = balanceOf(a.id);
            return (
              <li key={a.id} className="list-item" style={{ opacity: a.archivedAt ? 0.55 : 1 }}>
                <span className="list-icon">
                  <Landmark size={18} aria-hidden />
                </span>
                <span className="list-main">
                  <span className="list-title" style={{ display: 'block' }}>
                    {a.name}
                  </span>
                  <span className="list-sub">
                    {ACCOUNT_KIND_LABEL[a.kind]} · {a.ownerId ? `pessoal de ${l.memberName(a.ownerId)}` : 'conjunta'}
                    {a.archivedAt && ' · arquivada'}
                  </span>
                </span>
                <span className="list-end">
                  {b ? formatBRL(b.balanceCents) : '—'}
                  {a.openingBalanceCents === null && (
                    <span style={{ display: 'block' }}>
                      <span className="badge badge-warning">Sem saldo inicial</span>
                    </span>
                  )}
                </span>
                <button type="button" className="icon-btn" aria-label={`Editar ${a.name}`} onClick={() => setForm({ account: a })}>
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={a.archivedAt ? `Reativar ${a.name}` : `Arquivar ${a.name}`}
                  onClick={() => archive.mutate({ id: a.id, archived: !a.archivedAt })}
                >
                  {a.archivedAt ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        Arquivar esconde a conta dos formulários sem apagar o histórico. O saldo continua sendo calculado.
      </p>
      {form && <AccountForm account={form.account} onClose={() => setForm(null)} />}
    </section>
  );
}

function CategoriesSection() {
  const { group } = useGroup();
  const l = useLookups();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const create = useAppMutation(() => api.createCategory(group.id, { name: newName, kind }), { success: 'Categoria criada.', onSuccess: () => setNewName('') });
  const update = useAppMutation((c: { id: string; name?: string; archived?: boolean }) => api.updateCategory(c.id, c), {
    success: 'Categoria atualizada.',
    onSuccess: () => setEditing(null),
  });
  const list = l.categories.filter((c) => c.kind === kind);

  return (
    <section className="card section">
      <div className="card-header">
        <h2>Categorias</h2>
      </div>
      <div className="form">
        <Segmented
          label="Tipo"
          hideLabel
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Despesas' },
            { value: 'income', label: 'Receitas' },
          ]}
        />
        <form
          style={{ display: 'flex', gap: 8, alignItems: 'end' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate(undefined);
          }}
        >
          <div style={{ flex: 1 }}>
            <TextField label="Nova categoria" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Ex.: Presentes" />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={!newName.trim() || create.isPending}>
            <Plus size={16} aria-hidden /> Criar
          </button>
        </form>
        <ul className="list">
          {list.map((c) => (
            <li key={c.id} className="list-item" style={{ opacity: c.archivedAt ? 0.55 : 1 }}>
              <span className="list-icon">
                <CategoryIcon name={c.icon} />
              </span>
              {editing?.id === c.id ? (
                <form
                  style={{ display: 'flex', gap: 8, flex: 1 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editName.trim()) update.mutate({ id: c.id, name: editName });
                  }}
                >
                  <input className="input" aria-label="Novo nome" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={40} autoFocus />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={update.isPending}>
                    Salvar
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <span className="list-main">
                    <span className="list-title" style={{ display: 'block' }}>
                      {c.name}
                    </span>
                    <span className="list-sub">{c.archivedAt ? 'Arquivada' : c.isDefault ? 'Padrão' : 'Personalizada'}</span>
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Renomear ${c.name}`}
                    onClick={() => {
                      setEditing(c);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" aria-label={c.archivedAt ? `Reativar ${c.name}` : `Arquivar ${c.name}`} onClick={() => update.mutate({ id: c.id, archived: !c.archivedAt })}>
                    {c.archivedAt ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {list.length === 0 && (
          <p className="small muted">
            <Tag size={14} aria-hidden /> Nenhuma categoria.
          </p>
        )}
      </div>
    </section>
  );
}

const ENTITY_LABEL: Record<string, string> = {
  transactions: 'movimentação',
  accounts: 'conta',
  categories: 'categoria',
  bills: 'conta a pagar',
  settlement_payments: 'acerto',
  budgets: 'orçamento',
  savings_goals: 'meta',
  goal_contributions: 'contribuição de meta',
  group_members: 'participante',
};
const ACTION_LABEL = { create: 'criou', update: 'alterou', cancel: 'cancelou' } as const;

function ActivitySection() {
  const activity = useActivity(40);
  const l = useLookups();
  return (
    <section className="card section">
      <div className="card-header">
        <h2>
          <History size={16} aria-hidden style={{ verticalAlign: '-2px' }} /> Histórico de atividades
        </h2>
      </div>
      {activity.isPending ? (
        <LoadingCard lines={4} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : activity.data.length === 0 ? (
        <p className="small muted">Nada registrado ainda.</p>
      ) : (
        <ul className="list">
          {activity.data.map((a) => (
            <li key={a.id} className="list-item">
              <span className="list-main">
                <span className="list-title" style={{ display: 'block', whiteSpace: 'normal' }}>
                  {a.actorId ? l.memberName(a.actorId, { you: true }) : 'Sistema'} {ACTION_LABEL[a.action] ?? a.action} {ENTITY_LABEL[a.entity] ?? a.entity}
                  {a.details.description ? ` “${a.details.description}”` : ''}
                </span>
                <span className="list-sub">{dateTime.format(new Date(a.createdAt))}</span>
              </span>
              {typeof a.details.amount_cents === 'number' && <span className="list-end">{formatBRL(a.details.amount_cents)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
