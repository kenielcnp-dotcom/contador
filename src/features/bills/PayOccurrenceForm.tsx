import { useMemo, useState, type FormEvent } from 'react';
import { remainingCents } from '@/domain/bills';
import type { Occurrence, PaymentMethod } from '@/data/models';
import { api, useAppMutation, useGroup, useRequestId } from '@/data/queries';
import { formatBRL } from '@/domain/money';
import { formatDate, todayISO } from '@/domain/period';
import type { SplitMode } from '@/domain/split';
import { MoneyField, SelectField, TextAreaField, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { Notice, Spinner } from '@/ui/States';
import { PAYMENT_METHOD_LABEL, useLookups } from '../shared/lookups';
import { buildSplits, defaultSplitState, SplitEditor, type SplitState } from '../transactions/SplitEditor';

/**
 * Efetiva uma ocorrência. O banco trava a ocorrência, recusa valor acima do
 * pendente e, se o mesmo envio chegar duas vezes, devolve o mesmo pagamento.
 */
export function PayOccurrenceForm({ occurrence, onClose }: { occurrence: Occurrence; onClose: () => void }) {
  const { activeMembers, userId } = useGroup();
  const l = useLookups();
  const [requestId] = useRequestId();
  const bill = occurrence.bill;
  const payable = bill.kind === 'payable';
  const left = remainingCents(occurrence);
  const today = todayISO();

  const [amount, setAmount] = useState(left);
  const [paidAt, setPaidAt] = useState(today);
  const [accountId, setAccountId] = useState(bill.accountId ?? '');
  const [paidBy, setPaidBy] = useState(bill.responsibleId ?? userId);
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [split, setSplit] = useState<SplitState>(() => {
    const s = defaultSplitState(activeMembers, userId);
    const mode: SplitMode = activeMembers.length < 2 ? 'individual' : bill.splitMode;
    return { ...s, mode, individualId: bill.responsibleId ?? userId };
  });

  const account = accountId ? l.accountById.get(accountId) : undefined;
  const joint = !!account && account.ownerId === null;
  const accounts = useMemo(() => l.accounts.filter((a) => !a.archivedAt), [l.accounts]);

  const pay = useAppMutation(
    () =>
      api.payOccurrence({
        occurrenceId: occurrence.id,
        clientRequestId: requestId,
        amountCents: amount,
        paidAt,
        accountId: accountId || null,
        paidBy: paidBy || null,
        splitMode: payable ? split.mode : null,
        splits: payable ? (buildSplits(split, amount, activeMembers).splits ?? []) : [],
        paymentMethod: method || null,
        notes: notes.trim() || null,
      }),
    { success: amount === left ? (payable ? 'Conta paga.' : 'Recebimento registrado.') : 'Pagamento parcial registrado.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    let problem: string | null = null;
    if (amount <= 0) problem = 'Informe o valor.';
    else if (amount > left) problem = `O valor passa do pendente (${formatBRL(left)}).`;
    else if (!paidAt || paidAt > today) problem = 'A data do pagamento não pode estar no futuro.';
    else if (!paidBy && !joint) problem = payable ? 'Informe quem pagou.' : 'Informe quem recebeu.';
    else if (payable) problem = buildSplits(split, amount, activeMembers).error;
    setError(problem);
    if (!problem) pay.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!pay.isPending}
      title={payable ? 'Pagar conta' : 'Registrar recebimento'}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pay.isPending}>
            Cancelar
          </button>
          <button type="submit" form="pay-form" className="btn btn-primary" disabled={pay.isPending}>
            {pay.isPending ? <Spinner label="Registrando" /> : amount < left && amount > 0 ? 'Registrar pagamento parcial' : 'Confirmar'}
          </button>
        </div>
      }
    >
      <form id="pay-form" className="form" onSubmit={submit} noValidate>
        <div>
          <strong>{bill.description}</strong>
          <p className="small muted">
            Vencimento {formatDate(occurrence.dueDate)} · total {formatBRL(occurrence.amountCents)}
            {occurrence.paidCents > 0 && ` · já pago ${formatBRL(occurrence.paidCents)}`}
          </p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <MoneyField label="Valor pago agora" value={amount} onChange={setAmount} large hint={`Pendente: ${formatBRL(left)}. Um valor menor fica como pagamento parcial.`} />
        <div className="row">
          <TextField label="Data do pagamento" type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} />
          <SelectField label={payable ? 'Saiu da conta' : 'Entrou na conta'} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Fora das contas cadastradas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField label={payable ? 'Quem pagou' : 'Quem recebeu'} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {joint && <option value="">Conta conjunta (dinheiro do casal)</option>}
          {!joint && !paidBy && <option value="">Escolha…</option>}
          {activeMembers.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === userId ? `${m.name} (você)` : m.name}
            </option>
          ))}
        </SelectField>
        {payable && <SplitEditor members={activeMembers} amountCents={amount} value={split} onChange={setSplit} meId={userId} />}
        <SelectField label="Método de pagamento" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
          <option value="">Não informar</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextAreaField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </form>
    </Sheet>
  );
}
