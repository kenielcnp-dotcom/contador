import { useState, type FormEvent } from 'react';
import type { Account, AccountKind } from '@/data/models';
import { api, useAppMutation, useGroup } from '@/data/queries';
import { todayISO } from '@/domain/period';
import { MoneyField, SelectField, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { Notice, Spinner } from '@/ui/States';

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro em espécie',
  investment: 'Investimento',
  reserve: 'Reserva / cofrinho',
};

export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { group, activeMembers } = useGroup();
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [owner, setOwner] = useState<string>(account?.ownerId ?? '');
  const [knowsBalance, setKnowsBalance] = useState(account ? account.openingBalanceCents !== null : true);
  const [opening, setOpening] = useState(Math.abs(account?.openingBalanceCents ?? 0));
  const [negative, setNegative] = useState((account?.openingBalanceCents ?? 0) < 0);
  const [openingDate, setOpeningDate] = useState(account?.openingBalanceDate ?? todayISO());
  const [error, setError] = useState<string | null>(null);

  const save = useAppMutation(
    async () => {
      const openingBalanceCents = knowsBalance ? (negative ? -opening : opening) : null;
      const payload = { name, kind, ownerId: owner || null, openingBalanceCents, openingBalanceDate: knowsBalance ? openingDate : null };
      if (account) await api.updateAccount(account.id, payload);
      else await api.createAccount(group.id, payload);
    },
    { success: account ? 'Conta atualizada.' : 'Conta criada.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Dê um nome para a conta.');
    if (knowsBalance && !openingDate) return setError('Informe a data do saldo inicial.');
    setError(null);
    save.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title={account ? 'Editar conta' : 'Nova conta'}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="account-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
          </button>
        </div>
      }
    >
      <form id="account-form" className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta conjunta Nubank" maxLength={60} autoFocus />
        <div className="row">
          <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {Object.entries(ACCOUNT_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField label="De quem é" value={owner} onChange={(e) => setOwner(e.target.value)} hint="Conjunta = dinheiro do casal.">
            <option value="">Conjunta (do casal)</option>
            {activeMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                Pessoal de {m.name}
              </option>
            ))}
          </SelectField>
        </div>

        <label className="check">
          <input type="checkbox" checked={knowsBalance} onChange={(e) => setKnowsBalance(e.target.checked)} />
          Sei o saldo desta conta
        </label>
        {knowsBalance ? (
          <>
            <div className="row">
              <MoneyField label="Saldo inicial" value={opening} onChange={setOpening} />
              <TextField label="Saldo em" type="date" value={openingDate} max={todayISO()} onChange={(e) => setOpeningDate(e.target.value)} />
            </div>
            <label className="check">
              <input type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
              O saldo está negativo (cheque especial)
            </label>
            <p className="field-hint">
              O saldo da conta será este valor mais as movimentações efetivas a partir desta data. Lançamentos anteriores a ela não alteram o saldo.
            </p>
          </>
        ) : (
          <Notice tone="warning">
            Sem saldo inicial, o app mostra só o que entrou e saiu pelo app — o saldo real da conta fica marcado como incompleto. Você pode
            informar depois.
          </Notice>
        )}
      </form>
    </Sheet>
  );
}
