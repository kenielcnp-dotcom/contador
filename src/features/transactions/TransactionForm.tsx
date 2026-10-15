import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ATTACHMENT_TYPES } from '@/app/config';
import type { Member, PaymentMethod, Transaction } from '@/data/models';
import { api, useAppMutation, useGroup, useRequestId } from '@/data/queries';
import { toAppError } from '@/data/errors';
import { todayISO } from '@/domain/period';
import { MoneyField, Segmented, SelectField, TextAreaField, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { Notice, Spinner } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { validateAttachment } from '../shared/Attachments';
import { PAYMENT_METHOD_LABEL, useLookups } from '../shared/lookups';
import { buildSplits, defaultSplitState, SplitEditor, splitStateFrom, type SplitState } from './SplitEditor';

type Kind = 'expense' | 'income' | 'transfer';

export interface TransactionFormInitial {
  kind?: Kind;
  /** Editar esta movimentação. */
  edit?: Transaction;
  /** Nova movimentação copiando os dados desta. */
  duplicate?: Transaction;
}

const LAST_ACCOUNT_KEY = 'ultima-conta';
function lastAccount(): string {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function TransactionForm({ initial, onClose }: { initial?: TransactionFormInitial; onClose: () => void }) {
  const { group, activeMembers, members, me, userId } = useGroup();
  const lookups = useLookups();
  const toast = useToast();
  const [requestId] = useRequestId();
  const source = initial?.edit ?? initial?.duplicate;
  const isEdit = !!initial?.edit;
  const today = todayISO();

  const [kind, setKind] = useState<Kind>(source?.kind ?? initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(source?.amountCents ?? 0);
  const [description, setDescription] = useState(source?.description ?? '');
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? '');
  const [status, setStatus] = useState<'effective' | 'planned'>(
    initial?.edit ? (initial.edit.status === 'planned' ? 'planned' : 'effective') : 'effective',
  );
  const [date, setDate] = useState(isEdit ? source!.competenceDate : today);
  const [paidAt, setPaidAt] = useState(isEdit ? (source!.paidAt ?? '') : '');
  const [accountId, setAccountId] = useState(source?.accountId ?? (source ? '' : lastAccount()));
  const [toAccountId, setToAccountId] = useState(source?.toAccountId ?? '');
  const [paidBy, setPaidBy] = useState<string>(source ? (source.paidBy ?? '') : userId);
  const [method, setMethod] = useState<PaymentMethod | ''>(source?.paymentMethod ?? '');
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [showMore, setShowMore] = useState(isEdit && !!(source?.notes || source?.paymentMethod || source?.paidAt !== source?.competenceDate));
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Quem pode aparecer no rateio: ativos + quem já estava no rateio original.
  const splitMembers: Member[] = useMemo(() => {
    const ids = new Set(activeMembers.map((m) => m.userId));
    const extra = (source?.splits ?? []).map((s) => members.find((m) => m.userId === s.userId)).filter((m): m is Member => !!m && !ids.has(m.userId));
    return [...activeMembers, ...extra];
  }, [activeMembers, members, source]);

  const [split, setSplit] = useState<SplitState>(() =>
    source?.kind === 'expense' && source.splitMode
      ? splitStateFrom(source.splitMode, source.splits, source.splitPercents, splitMembers, userId)
      : defaultSplitState(splitMembers, userId),
  );

  const account = accountId ? lookups.accountById.get(accountId) : undefined;
  const jointAccount = !!account && account.ownerId === null;
  const usableAccounts = lookups.accounts.filter((a) => !a.archivedAt || a.id === source?.accountId || a.id === source?.toAccountId);
  const categories = lookups.categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense') && (!c.archivedAt || c.id === source?.categoryId));

  const save = useAppMutation(
    async () => {
      const splits = kind === 'expense' ? buildSplits(split, amount, splitMembers).splits ?? [] : [];
      const id = await api.saveTransaction({
        id: initial?.edit?.id,
        clientRequestId: isEdit ? crypto.randomUUID() : requestId,
        kind,
        description: description.trim(),
        amountCents: amount,
        categoryId: kind === 'transfer' ? null : categoryId,
        competenceDate: date,
        paidAt: status === 'effective' ? paidAt || date : null,
        status,
        accountId: accountId || null,
        toAccountId: kind === 'transfer' ? toAccountId || null : null,
        paidBy: kind === 'transfer' ? null : paidBy || null,
        splitMode: kind === 'expense' ? split.mode : null,
        splits,
        paymentMethod: method || null,
        notes: notes.trim() || null,
      });
      try {
        if (accountId) localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* sem armazenamento local: só não lembra a conta */
      }
      // O lançamento já está salvo; se o anexo falhar, avisamos sem desfazer.
      if (file) {
        try {
          await api.uploadAttachment(group.id, 'transaction', id, file);
        } catch (e) {
          toast.error(`Movimentação salva, mas o comprovante não foi enviado: ${toAppError(e).message}`);
        }
      }
      return id;
    },
    { success: isEdit ? 'Alterações salvas.' : 'Movimentação salva.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (!problem) save.mutate(undefined);
  }

  function validate(): string | null {
    if (amount <= 0) return 'Informe o valor.';
    if (!description.trim()) return 'Informe uma descrição.';
    if (!date) return 'Informe a data.';
    if (status === 'effective' && (paidAt || date) > today) return 'Movimentação efetivada não pode ter data futura. Marque como "Prevista".';
    if (kind === 'transfer') {
      if (!accountId || !toAccountId) return 'Escolha a conta de origem e a de destino.';
      if (accountId === toAccountId) return 'As contas de origem e destino precisam ser diferentes.';
      return null;
    }
    if (!categoryId) return 'Escolha uma categoria.';
    if (!paidBy && !jointAccount) return kind === 'expense' ? 'Informe quem pagou.' : 'Informe quem recebeu.';
    if (kind === 'expense') {
      const r = buildSplits(split, amount, splitMembers);
      if (r.error) return r.error;
    }
    return null;
  }

  const title = isEdit ? 'Editar movimentação' : initial?.duplicate ? 'Duplicar movimentação' : 'Nova movimentação';
  const payerLabel = kind === 'income' ? 'Quem recebeu' : 'Quem pagou';

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title={title}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="tx-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
          </button>
        </div>
      }
    >
      <form id="tx-form" className="form" onSubmit={submit} noValidate>
        {source?.billOccurrenceId && <Notice>Este é o pagamento de uma conta a pagar. Alterar o valor atualiza a situação da conta.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}

        <Segmented
          label="Tipo"
          hideLabel
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategoryId('');
          }}
          options={
            source?.billOccurrenceId
              ? [{ value: source.kind as Kind, label: source.kind === 'income' ? 'Receita' : 'Despesa' }]
              : [
                  { value: 'expense', label: 'Despesa' },
                  { value: 'income', label: 'Receita' },
                  { value: 'transfer', label: 'Transferência' },
                ]
          }
        />

        <MoneyField label="Valor" value={amount} onChange={setAmount} large autoFocus={!isEdit} />
        <TextField
          label="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={120}
          placeholder={kind === 'income' ? 'Ex.: Salário' : kind === 'transfer' ? 'Ex.: Reserva do mês' : 'Ex.: Mercado da semana'}
        />

        {kind !== 'transfer' && (
          <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Escolha…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        )}

        <div className="row">
          <TextField label={kind === 'income' ? 'Data' : 'Data / vencimento'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Segmented
            label="Situação"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'effective', label: kind === 'income' ? 'Recebida' : kind === 'transfer' ? 'Feita' : 'Paga' },
              { value: 'planned', label: 'Prevista' },
            ]}
          />
        </div>

        {kind === 'transfer' ? (
          <div className="row">
            <SelectField label="De (origem)" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Escolha…</option>
              {usableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Para (destino)" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Escolha…</option>
              {usableAccounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </SelectField>
          </div>
        ) : (
          <div className="row">
            <SelectField
              label={kind === 'income' ? 'Entrou na conta' : 'Saiu da conta'}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              hint={!accountId ? 'Sem conta: conta nos totais, mas não mexe em nenhum saldo.' : undefined}
            >
              <option value="">Fora das contas cadastradas</option>
              {usableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
            <SelectField label={payerLabel} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {jointAccount && <option value="">Conta conjunta (dinheiro do casal)</option>}
              {!jointAccount && !paidBy && <option value="">Escolha…</option>}
              {splitMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userId === me.userId ? `${m.name} (você)` : m.name}
                </option>
              ))}
            </SelectField>
          </div>
        )}

        {kind === 'expense' && (
          <SplitEditor members={splitMembers} amountCents={amount} value={split} onChange={setSplit} meId={userId} />
        )}

        {!showMore ? (
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setShowMore(true)}>
            + Mais detalhes (data de pagamento, método, observações, comprovante)
          </button>
        ) : (
          <>
            {status === 'effective' && (
              <TextField
                label={kind === 'income' ? 'Data do recebimento' : 'Data do pagamento'}
                type="date"
                value={paidAt}
                max={today}
                onChange={(e) => setPaidAt(e.target.value)}
                hint="Deixe vazio se foi na mesma data acima. É esta data que define o mês nos totais."
              />
            )}
            <SelectField label="Método de pagamento" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
              <option value="">Não informar</option>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            <TextAreaField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            {!isEdit && (
              <div className="field">
                <span className="field-label">Comprovante (opcional)</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}>
                    Escolher arquivo
                  </button>
                  <span className="small muted">{file ? file.name : 'JPG, PNG, WEBP ou PDF até 5 MB'}</span>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept={ATTACHMENT_TYPES.join(',')}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    if (f) {
                      const p = validateAttachment(f);
                      if (p) return setError(p);
                    }
                    setFile(f);
                  }}
                />
              </div>
            )}
          </>
        )}
      </form>
    </Sheet>
  );
}
