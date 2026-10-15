import { CalendarClock, CalendarPlus, Pencil, Repeat } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Occurrence } from '@/data/models';
import { useQuery } from '@tanstack/react-query';
import { api, gk, useAppMutation, useBills, useGroup, useOccurrences } from '@/data/queries';
import { displayStatus, dueLabel, inWindow, remainingCents, STATUS_LABEL, type BillWindow, type DisplayStatus } from '@/domain/bills';
import { formatBRL } from '@/domain/money';
import { addDays, addMonths, formatDate, startOfMonth, todayISO } from '@/domain/period';
import { useConfirm } from '@/ui/Confirm';
import { MoneyField, Segmented, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingCard, Notice, Spinner } from '@/ui/States';
import { Attachments } from '../shared/Attachments';
import { useLookups } from '../shared/lookups';
import { BillForm, RECURRENCE_LABEL } from './BillForm';
import { PayOccurrenceForm } from './PayOccurrenceForm';

const BADGE: Record<DisplayStatus, string> = {
  pending: 'badge',
  partial: 'badge badge-info',
  paid: 'badge badge-success',
  overdue: 'badge badge-danger',
  cancelled: 'badge',
};

export function StatusBadge({ occurrence, today }: { occurrence: Occurrence; today: string }) {
  const s = displayStatus(occurrence, today);
  return <span className={BADGE[s]}>{STATUS_LABEL[s]}</span>;
}

export function BillsPage() {
  const today = todayISO();
  const [window, setWindow] = useState<BillWindow>('30d');
  const [kind, setKind] = useState<'all' | 'payable' | 'receivable'>('all');
  const occs = useOccurrences({ start: addMonths(startOfMonth(today), -1), end: addDays(today, 62) });
  const bills = useBills();
  const [formBill, setFormBill] = useState<{ id?: string } | null>(null);
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [paying, setPaying] = useState<Occurrence | null>(null);

  const list = useMemo(
    () =>
      (occs.data ?? [])
        .filter((o) => (kind === 'all' || o.bill.kind === kind) && (window === 'all' ? o.status !== 'cancelled' : inWindow(o, window, today)))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [occs.data, kind, window, today],
  );
  const totalOpen = list.filter((o) => o.bill.kind === 'payable').reduce((s, o) => s + remainingCents(o), 0);
  const totalReceive = list.filter((o) => o.bill.kind === 'receivable').reduce((s, o) => s + remainingCents(o), 0);
  const overdueCount = (occs.data ?? []).filter((o) => displayStatus(o, today) === 'overdue').length;
  const current = selected ? ((occs.data ?? []).find((o) => o.id === selected.id) ?? selected) : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Contas a pagar e receber</h1>
          <p>Compromissos previstos. Só viram despesa ou receita quando são pagos.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setFormBill({})}>
          <CalendarPlus size={16} aria-hidden /> Nova conta
        </button>
      </header>

      {overdueCount > 0 && (
        <div className="section">
          <Notice tone="danger">
            {overdueCount} conta(s) vencida(s) aguardando pagamento.{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWindow('overdue')}>
              Ver vencidas
            </button>
          </Notice>
        </div>
      )}

      <section className="card section">
        <Segmented
          label="Mostrar"
          value={window}
          onChange={setWindow}
          options={[
            { value: '7d', label: '7 dias' },
            { value: '30d', label: '30 dias' },
            { value: 'month', label: 'Mês atual' },
            { value: 'overdue', label: 'Vencidas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
        <Segmented
          label="Tipo"
          hideLabel
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'payable', label: 'A pagar' },
            { value: 'receivable', label: 'A receber' },
          ]}
        />
        <div className="grid grid-stats">
          <div className="stat">
            <span className="stat-label">Em aberto a pagar</span>
            <span className="stat-value expense">{formatBRL(totalOpen)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Em aberto a receber</span>
            <span className="stat-value income">{formatBRL(totalReceive)}</span>
          </div>
        </div>
      </section>

      <section className="card section">
        {occs.isPending ? (
          <LoadingCard lines={5} />
        ) : occs.isError ? (
          <ErrorState error={occs.error} onRetry={() => void occs.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={(bills.data ?? []).length ? 'Nada neste filtro' : 'Nenhuma conta cadastrada'}
            action={!(bills.data ?? []).length && <button type="button" className="btn btn-primary" onClick={() => setFormBill({})}>Cadastrar aluguel, luz, internet…</button>}
          >
            {(bills.data ?? []).length ? 'Tente outra janela de datas.' : 'Contas recorrentes geram os vencimentos sozinhas, todo mês.'}
          </EmptyState>
        ) : (
          <ul className="list">
            {list.map((o) => (
              <li key={o.id} className="list-item">
                <button type="button" className="list-main" onClick={() => setSelected(o)} style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                  <span className="list-title" style={{ display: 'block' }}>
                    {o.bill.description}
                  </span>
                  <span className="list-sub" style={{ display: 'block' }}>
                    {formatDate(o.dueDate)} · {o.status === 'paid' ? `paga em ${formatDate(o.paidAt)}` : dueLabel(o.dueDate, today)}
                  </span>
                </button>
                <span className="list-end">
                  <span className={o.bill.kind === 'payable' ? 'expense' : 'income'}>{formatBRL(o.status === 'paid' ? o.amountCents : remainingCents(o))}</span>
                  <span style={{ display: 'block' }}>
                    <StatusBadge occurrence={o} today={today} />
                  </span>
                </span>
                {(o.status === 'pending' || o.status === 'partial') && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPaying(o)}>
                    {o.bill.kind === 'payable' ? 'Pagar' : 'Receber'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card section">
        <div className="card-header">
          <h2>Contas cadastradas</h2>
        </div>
        {bills.isPending ? (
          <LoadingCard lines={3} />
        ) : bills.isError ? (
          <ErrorState error={bills.error} onRetry={() => void bills.refetch()} />
        ) : bills.data.length === 0 ? (
          <p className="small muted">Nenhuma ainda.</p>
        ) : (
          <ul className="list">
            {bills.data.map((b) => (
              <li key={b.id} className="list-item" style={{ opacity: b.active ? 1 : 0.6 }}>
                <span className="list-icon">
                  <Repeat size={18} aria-hidden />
                </span>
                <span className="list-main">
                  <span className="list-title" style={{ display: 'block' }}>
                    {b.description}
                  </span>
                  <span className="list-sub">
                    {RECURRENCE_LABEL[b.recurrence]} · {b.kind === 'payable' ? 'a pagar' : 'a receber'}
                    {!b.active && ' · inativa'}
                  </span>
                </span>
                <span className="list-end">{formatBRL(b.amountCents)}</span>
                <button type="button" className="icon-btn" aria-label={`Editar ${b.description}`} onClick={() => setFormBill({ id: b.id })}>
                  <Pencil size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formBill && <BillForm bill={bills.data?.find((b) => b.id === formBill.id)} onClose={() => setFormBill(null)} />}
      {current && <OccurrenceSheet occurrence={current} onClose={() => setSelected(null)} onPay={() => setPaying(current)} />}
      {paying && <PayOccurrenceForm occurrence={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

function OccurrenceSheet({ occurrence: o, onClose, onPay }: { occurrence: Occurrence; onClose: () => void; onPay: () => void }) {
  const today = todayISO();
  const l = useLookups();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(o.amountCents);
  const [dueDate, setDueDate] = useState(o.dueDate);
  const { group } = useGroup();
  const payments = useQuery({
    queryKey: gk(group.id, 'occ-payments', o.id),
    queryFn: () => api.paymentsOfOccurrence(o.id),
  });

  const update = useAppMutation(() => api.updateOccurrence(o.id, { amountCents: amount, dueDate }), {
    success: 'Conta atualizada.',
    onSuccess: () => setEditing(false),
  });
  const cancelOcc = useAppMutation(() => api.cancelOccurrence(o.id), { success: 'Vencimento cancelado.', onSuccess: onClose });
  const open = o.status === 'pending' || o.status === 'partial';
  const busy = update.isPending || cancelOcc.isPending;

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!busy}
      title={o.bill.description}
      footer={
        open && (
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            {o.paidCents === 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--red)' }}
                disabled={busy}
                onClick={async () => {
                  if (await confirm({ title: 'Cancelar este vencimento?', message: 'Ele deixa de aparecer como pendente. Os outros vencimentos da conta continuam.', confirmLabel: 'Cancelar vencimento', danger: true }))
                    cancelOcc.mutate(undefined);
                }}
              >
                Cancelar vencimento
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onPay();
              }}
              disabled={busy}
            >
              {o.bill.kind === 'payable' ? 'Pagar' : 'Receber'}
            </button>
          </div>
        )
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge occurrence={o} today={today} />
          <span className="small muted">{open ? dueLabel(o.dueDate, today) : ''}</span>
        </div>
        {editing ? (
          <div className="form">
            <div className="row">
              <MoneyField label="Valor desta ocorrência" value={amount} onChange={setAmount} />
              <TextField label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => amount > 0 && dueDate && update.mutate(undefined)} disabled={busy || amount <= 0 || !dueDate}>
                {update.isPending ? <Spinner label="Salvando" /> : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <dl className="dl">
            <dt>Valor</dt>
            <dd className="num">{formatBRL(o.amountCents)}</dd>
            <dt>Pago</dt>
            <dd className="num">{formatBRL(o.paidCents)}</dd>
            <dt>Pendente</dt>
            <dd className="num">{formatBRL(remainingCents(o))}</dd>
            <dt>Vencimento</dt>
            <dd>{formatDate(o.dueDate)}</dd>
            <dt>Categoria</dt>
            <dd>{l.categoryName(o.bill.categoryId)}</dd>
            <dt>Responsável</dt>
            <dd>{o.bill.responsibleId ? l.memberName(o.bill.responsibleId, { you: true }) : 'O casal'}</dd>
          </dl>
        )}
        {o.status === 'pending' && !editing && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden /> Ajustar valor ou vencimento
          </button>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          <h3>Pagamentos</h3>
          {payments.isPending ? (
            <Spinner />
          ) : payments.isError ? (
            <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
          ) : payments.data.length === 0 ? (
            <p className="small muted">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="list">
              {payments.data.map((t) => (
                <li key={t.id} className="list-item" style={{ opacity: t.status === 'cancelled' ? 0.55 : 1 }}>
                  <span className="list-main">
                    <span className="list-title" style={{ display: 'block' }}>
                      {formatDate(t.paidAt)} · {l.memberName(t.paidBy, { you: true })}
                    </span>
                    <span className="list-sub">{t.status === 'cancelled' ? 'Cancelado' : l.accountName(t.accountId)}</span>
                  </span>
                  <span className="list-end">{formatBRL(t.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">Para desfazer um pagamento, exclua a movimentação correspondente em Movimentações.</p>
        </div>

        <Attachments entityType="bill_occurrence" entityId={o.id} readOnly={o.status === 'cancelled'} />
      </div>
    </Sheet>
  );
}
