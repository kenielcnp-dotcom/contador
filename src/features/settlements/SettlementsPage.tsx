import { Handshake, History, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { PaymentMethod, SettlementPayment } from '@/data/models';
import { api, useAppMutation, useGroup, useMemberBalances, useRequestId, useSettlements } from '@/data/queries';
import { formatBRL } from '@/domain/money';
import { formatDate, todayISO } from '@/domain/period';
import { debtMessage, resolveDebts, validateSettlementAmount, type Debt } from '@/domain/settlement';
import { useConfirm } from '@/ui/Confirm';
import { MoneyField, SelectField, TextAreaField, TextField } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingCard, Notice, Spinner } from '@/ui/States';
import { Attachments } from '../shared/Attachments';
import { PAYMENT_METHOD_LABEL, useLookups } from '../shared/lookups';

export function SettlementsPage() {
  const { userId, members } = useGroup();
  const l = useLookups();
  const [forecast, setForecast] = useState(false);
  const balances = useMemberBalances(forecast);
  const history = useSettlements();
  const [form, setForm] = useState<Debt | null>(null);
  const [payment, setPayment] = useState<SettlementPayment | null>(null);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? 'Ex-participante';

  const debts = balances.data ? resolveDebts(balances.data) : [];
  const mainDebt = debts.find((d) => d.fromUserId === userId || d.toUserId === userId) ?? debts[0];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Acertos</h1>
          <p>Quem pagou mais do que a própria parte e quanto falta acertar. Acertos não entram em receitas nem despesas.</p>
        </div>
      </header>

      <section className="card section" style={{ display: 'grid', gap: 16 }}>
        <label className="check" style={{ minHeight: 32 }}>
          <input type="checkbox" checked={forecast} onChange={(e) => setForecast(e.target.checked)} />
          Simular incluindo despesas previstas (previsão)
        </label>
        {balances.isPending ? (
          <LoadingCard lines={3} />
        ) : balances.isError ? (
          <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />
        ) : (
          <>
            {forecast && <Notice tone="warning">Previsão: inclui despesas ainda não pagas. Para registrar um acerto, desmarque a simulação.</Notice>}
            <div className="hero">
              <span className="stat-label">
                <Handshake size={14} aria-hidden /> Situação {forecast ? 'prevista' : 'atual'}
              </span>
              <span className="hero-value" style={{ fontSize: 'clamp(1.4rem, 4.5vw, 2rem)' }}>
                {debtMessage(userId, debts, nameOf)}
              </span>
            </div>
            {mainDebt && !forecast && (
              <div>
                <button type="button" className="btn btn-primary" onClick={() => setForm(mainDebt)}>
                  Registrar acerto
                </button>
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th className="num">Pagou</th>
                    <th className="num">Deveria pagar</th>
                    <th className="num">Diferença</th>
                    <th className="num">Acertos pagos</th>
                    <th className="num">Acertos recebidos</th>
                    <th className="num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.data
                    .filter((b) => b.memberStatus === 'active' || b.netCents !== 0)
                    .map((b) => (
                      <tr key={b.userId}>
                        <td>
                          {b.userId === userId ? 'Você' : b.name}
                          {b.memberStatus === 'removed' && <span className="badge" style={{ marginLeft: 6 }}>saiu</span>}
                        </td>
                        <td className="num">{formatBRL(b.paidCents)}</td>
                        <td className="num">{formatBRL(b.shareCents)}</td>
                        <td className="num">{formatBRL(b.paidCents - b.shareCents, { signed: true })}</td>
                        <td className="num">{formatBRL(b.sentCents)}</td>
                        <td className="num">{formatBRL(b.receivedCents)}</td>
                        <td className={`num ${b.netCents > 0 ? 'income' : b.netCents < 0 ? 'expense' : ''}`}>
                          <strong>{b.netCents > 0 ? `a receber ${formatBRL(b.netCents)}` : b.netCents < 0 ? `deve ${formatBRL(-b.netCents)}` : 'quite'}</strong>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              Considera só despesas efetivas pagas por uma pessoa e divididas com a outra. Despesas pagas pela conta conjunta não geram dívida.
            </p>
          </>
        )}
      </section>

      <section className="card section">
        <div className="card-header">
          <h2>Histórico de acertos</h2>
        </div>
        {history.isPending ? (
          <LoadingCard lines={3} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.settlements.length === 0 ? (
          <EmptyState icon={History} title="Nenhum acerto registrado" />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {history.data.settlements.map((s) => {
              const pays = history.data.payments.filter((p) => p.settlementId === s.id);
              return (
                <div key={s.id} style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>
                      {l.memberName(s.fromUser, { you: true })} → {l.memberName(s.toUser, { you: true })}
                    </strong>
                    <span className={`badge ${s.status === 'settled' ? 'badge-success' : 'badge-warning'}`}>
                      {s.status === 'settled' ? 'Quitado' : s.status === 'open' ? 'Em aberto' : 'Cancelado'}
                    </span>
                  </div>
                  <span className="small muted">
                    Aberto em {formatDate(s.createdAt.slice(0, 10))} · {formatBRL(s.paidCents)} pagos de {formatBRL(s.amountCents)}
                  </span>
                  <ul className="list">
                    {pays.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="list-item clickable" onClick={() => setPayment(p)} style={{ opacity: p.cancelledAt ? 0.55 : 1 }}>
                          <span className="list-main">
                            <span className="list-title" style={{ display: 'block', textDecoration: p.cancelledAt ? 'line-through' : undefined }}>
                              {formatDate(p.paidAt)}
                              {p.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[p.paymentMethod]}` : ''}
                            </span>
                            <span className="list-sub">{p.cancelledAt ? 'Cancelado' : (p.notes ?? 'Pagamento')}</span>
                          </span>
                          <span className="list-end">{formatBRL(p.amountCents)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {form && <SettlementForm debt={form} onClose={() => setForm(null)} />}
      {payment && <PaymentSheet payment={payment} onClose={() => setPayment(null)} />}
    </>
  );
}

function SettlementForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { activeMembers, userId, members } = useGroup();
  const [requestId] = useRequestId();
  const [fromUser, setFrom] = useState(debt.fromUserId);
  const [toUser, setTo] = useState(debt.toUserId);
  const [amount, setAmount] = useState(debt.amountCents);
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod | ''>('pix');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = fromUser === debt.fromUserId && toUser === debt.toUserId ? debt.amountCents : 0;
  const people = members.filter((m) => m.status === 'active' || m.userId === debt.fromUserId || m.userId === debt.toUserId);

  const save = useAppMutation(
    () => api.registerSettlementPayment({ clientRequestId: requestId, fromUser, toUser, amountCents: amount, paidAt, paymentMethod: method || null, notes: notes.trim() || null }),
    { success: amount === pending ? 'Acerto quitado.' : 'Pagamento parcial registrado.', onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = fromUser === toUser ? 'Escolha duas pessoas diferentes.' : validateSettlementAmount(amount, pending);
    setError(p);
    if (!p) save.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!save.isPending}
      title="Registrar acerto"
      footer={
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="settle-form" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner label="Registrando" /> : amount === pending ? 'Quitar' : 'Registrar pagamento parcial'}
          </button>
        </div>
      }
    >
      <form id="settle-form" className="form" onSubmit={submit} noValidate>
        <Notice>
          O acerto só reduz a dívida entre vocês. Não cria receita, não lança a despesa de novo e não mexe nos saldos das contas.
        </Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="row">
          <SelectField label="Quem paga" value={fromUser} onChange={(e) => setFrom(e.target.value)}>
            {people.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === userId ? `${m.name} (você)` : m.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Quem recebe" value={toUser} onChange={(e) => setTo(e.target.value)}>
            {people.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === userId ? `${m.name} (você)` : m.name}
              </option>
            ))}
          </SelectField>
        </div>
        <MoneyField label="Valor" value={amount} onChange={setAmount} large hint={`Pendente: ${formatBRL(pending)}. Um valor menor fica como pagamento parcial.`} />
        <div className="row">
          <TextField label="Data" type="date" value={paidAt} max={todayISO()} onChange={(e) => setPaidAt(e.target.value)} />
          <SelectField label="Como foi pago" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">Não informar</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        {activeMembers.length < 2 && <Notice tone="warning">Só há um participante ativo na carteira.</Notice>}
      </form>
    </Sheet>
  );
}

function PaymentSheet({ payment: p, onClose }: { payment: SettlementPayment; onClose: () => void }) {
  const l = useLookups();
  const confirm = useConfirm();
  const cancel = useAppMutation(() => api.cancelSettlementPayment(p.id), { success: 'Pagamento de acerto cancelado.', onSuccess: onClose });
  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!cancel.isPending}
      title="Pagamento de acerto"
      footer={
        !p.cancelledAt && (
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--red)' }}
              disabled={cancel.isPending}
              onClick={async () => {
                if (await confirm({ title: 'Desfazer este pagamento?', message: 'A dívida volta a ficar pendente nesse valor. O registro fica no histórico como cancelado.', confirmLabel: 'Desfazer', danger: true }))
                  cancel.mutate(undefined);
              }}
            >
              <Undo2 size={16} aria-hidden /> Desfazer pagamento
            </button>
          </div>
        )
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="hero">
          <span className="hero-value">{formatBRL(p.amountCents)}</span>
          <span className="muted small">
            {l.memberName(p.fromUser, { you: true })} → {l.memberName(p.toUser, { you: true })}
          </span>
        </div>
        {p.cancelledAt && <Notice tone="danger">Cancelado — não reduz mais a dívida.</Notice>}
        <dl className="dl">
          <dt>Data</dt>
          <dd>{formatDate(p.paidAt)}</dd>
          <dt>Método</dt>
          <dd>{p.paymentMethod ? PAYMENT_METHOD_LABEL[p.paymentMethod] : '—'}</dd>
          <dt>Registrado por</dt>
          <dd>{l.memberName(p.createdBy, { you: true })}</dd>
          {p.notes && (
            <>
              <dt>Observações</dt>
              <dd>{p.notes}</dd>
            </>
          )}
        </dl>
        <Attachments entityType="settlement_payment" entityId={p.id} readOnly={!!p.cancelledAt} />
      </div>
    </Sheet>
  );
}
