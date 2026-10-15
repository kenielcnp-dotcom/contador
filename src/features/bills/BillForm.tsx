import { useState, type FormEvent } from 'react';
import type { Bill, Recurrence } from '@/data/models';
import { api, useAppMutation, useGroup } from '@/data/queries';
import { todayISO } from '@/domain/period';
import { MoneyField, Segmented, SelectField, TextAreaField, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { Notice, Spinner } from '@/ui/States';
import { useLookups } from '../shared/lookups';

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Não se repete',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
  yearly: 'Todo ano',
};

export function BillForm({ bill, onClose }: { bill?: Bill; onClose: () => void }) {
  const { activeMembers } = useGroup();
  const l = useLookups();
  const [kind, setKind] = useState<Bill['kind']>(bill?.kind ?? 'payable');
  const [description, setDescription] = useState(bill?.description ?? '');
  const [amount, setAmount] = useState(bill?.amountCents ?? 0);
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(bill?.recurrence ?? 'monthly');
  const [startDate, setStartDate] = useState(bill?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(bill?.endDate ?? '');
  const [accountId, setAccountId] = useState(bill?.accountId ?? '');
  const [responsibleId, setResponsibleId] = useState(bill?.responsibleId ?? '');
  const [splitMode, setSplitMode] = useState<Bill['splitMode']>(bill?.splitMode ?? (activeMembers.length > 1 ? 'equal' : 'individual'));
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [active, setActive] = useState(bill?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const categories = l.categories.filter((c) => c.kind === (kind === 'payable' ? 'expense' : 'income') && (!c.archivedAt || c.id === bill?.categoryId));

  const save = useAppMutation(
    () =>
      api.saveBill({
        id: bill?.id,
        kind,
        description: description.trim(),
        amountCents: amount,
        categoryId,
        accountId: accountId || null,
        responsibleId: responsibleId || null,
        recurrence,
        startDate,
        endDate: recurrence === 'none' ? null : endDate || null,
        splitMode,
        notes: notes.trim() || null,
        active,
      }),
    { success: bill ? 'Conta atualizada.' : 'Conta cadastrada.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    let p: string | null = null;
    if (!description.trim()) p = 'Informe uma descrição.';
    else if (amount <= 0) p = 'Informe o valor previsto.';
    else if (!categoryId) p = 'Escolha uma categoria.';
    else if (!startDate) p = 'Informe o vencimento.';
    else if (endDate && endDate < startDate) p = 'A data final não pode ser anterior ao primeiro vencimento.';
    setError(p);
    if (!p) save.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title={bill ? 'Editar conta' : 'Nova conta a pagar/receber'}
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="bill-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
          </button>
        </div>
      }
    >
      <form id="bill-form" className="form" onSubmit={submit} noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Segmented
          label="Tipo"
          hideLabel
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategoryId('');
          }}
          options={[
            { value: 'payable', label: 'A pagar' },
            { value: 'receivable', label: 'A receber' },
          ]}
        />
        <TextField label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder="Ex.: Aluguel" autoFocus />
        <div className="row">
          <MoneyField label="Valor previsto" value={amount} onChange={setAmount} />
          <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Escolha…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="row">
          <SelectField label="Recorrência" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            {Object.entries(RECURRENCE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextField label={recurrence === 'none' ? 'Vencimento' : 'Primeiro vencimento'} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        {recurrence !== 'none' && (
          <TextField
            label="Repetir até (opcional)"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            hint="Cada vencimento vira uma ocorrência com valor próprio. Nada é lançado como despesa até ser pago."
          />
        )}
        <div className="row">
          <SelectField label="Responsável" value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
            <option value="">O casal / conta conjunta</option>
            {activeMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Conta padrão" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Escolher ao pagar</option>
            {l.accounts
              .filter((a) => !a.archivedAt || a.id === bill?.accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </SelectField>
        </div>
        {kind === 'payable' && activeMembers.length > 1 && (
          <SelectField label="Divisão ao pagar" value={splitMode} onChange={(e) => setSplitMode(e.target.value as Bill['splitMode'])}>
            <option value="equal">Igual entre os dois</option>
            <option value="percent">Pela divisão sugerida da carteira (%)</option>
            <option value="individual">Só do responsável</option>
          </SelectField>
        )}
        <TextAreaField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        {bill && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Conta ativa (desmarque para parar de gerar novos vencimentos)
          </label>
        )}
        {bill && <p className="field-hint">Alterações valem para os vencimentos futuros ainda não pagos. O que já foi pago não muda.</p>}
      </form>
    </Sheet>
  );
}
