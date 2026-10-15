import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { Transaction } from '@/data/models';
import { api, useAppMutation } from '@/data/queries';
import { formatBRL } from '@/domain/money';
import { formatDate } from '@/domain/period';
import { useQuickActions } from '@/layout/AppShell';
import { useConfirm } from '@/ui/Confirm';
import { Sheet } from '@/ui/Sheet';
import { Notice } from '@/ui/States';
import { Attachments } from '../shared/Attachments';
import { KIND_LABEL, PAYMENT_METHOD_LABEL, SPLIT_LABEL, useLookups } from '../shared/lookups';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function statusLabel(tx: Pick<Transaction, 'status' | 'kind'>): string {
  if (tx.status === 'cancelled') return 'Cancelada';
  if (tx.status === 'planned') return 'Prevista';
  return tx.kind === 'income' ? 'Recebida' : tx.kind === 'transfer' ? 'Efetivada' : 'Paga';
}

export function TransactionDetails({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const l = useLookups();
  const confirm = useConfirm();
  const { openTransaction } = useQuickActions();
  const cancel = useAppMutation(() => api.cancelTransaction(tx.id), { success: 'Movimentação excluída.', onSuccess: onClose });
  const cancelled = tx.status === 'cancelled';

  async function onDelete() {
    const ok = await confirm({
      title: 'Excluir movimentação?',
      message: (
        <>
          <strong>{tx.description}</strong> ({formatBRL(tx.amountCents)}) deixa de contar em saldos, totais, rateios e orçamento. Ela fica no
          histórico como cancelada, para auditoria.
        </>
      ),
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) cancel.mutate(undefined);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dismissable={!cancel.isPending}
      title={KIND_LABEL[tx.kind]}
      footer={
        !cancelled && (
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={onDelete} disabled={cancel.isPending}>
              <Trash2 size={16} aria-hidden /> Excluir
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {!tx.billOccurrenceId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onClose();
                    openTransaction({ duplicate: tx });
                  }}
                >
                  <Copy size={16} aria-hidden /> Duplicar
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  openTransaction({ edit: tx });
                }}
              >
                <Pencil size={16} aria-hidden /> Editar
              </button>
            </div>
          </div>
        )
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="hero">
          <span className="muted small">{tx.description}</span>
          <span className={`hero-value ${tx.kind === 'income' ? 'income' : tx.kind === 'expense' ? 'expense' : ''}`}>
            {formatBRL(tx.amountCents)}
          </span>
          <span>
            <span className={`badge ${cancelled ? 'badge-danger' : tx.status === 'planned' ? 'badge-warning' : 'badge-success'}`}>{statusLabel(tx)}</span>
          </span>
        </div>
        {cancelled && (
          <Notice tone="danger">
            Cancelada em {tx.cancelledAt ? dateTime.format(new Date(tx.cancelledAt)) : '—'} por {l.memberName(tx.cancelledBy, { you: true })}
            {tx.cancelReason ? ` — ${tx.cancelReason}` : ''}. Não conta em nenhum total.
          </Notice>
        )}
        {tx.billOccurrenceId && <Notice>Pagamento de uma conta a pagar/receber.</Notice>}

        <dl className="dl">
          {tx.kind !== 'transfer' && (
            <>
              <dt>Categoria</dt>
              <dd>{l.categoryName(tx.categoryId)}</dd>
            </>
          )}
          <dt>Competência</dt>
          <dd>{formatDate(tx.competenceDate)}</dd>
          <dt>{tx.kind === 'income' ? 'Recebida em' : 'Paga em'}</dt>
          <dd>{tx.paidAt ? formatDate(tx.paidAt) : 'Ainda não'}</dd>
          {tx.kind === 'transfer' ? (
            <>
              <dt>De</dt>
              <dd>{l.accountName(tx.accountId)}</dd>
              <dt>Para</dt>
              <dd>{l.accountName(tx.toAccountId)}</dd>
            </>
          ) : (
            <>
              <dt>Conta</dt>
              <dd>{l.accountName(tx.accountId)}</dd>
              <dt>{tx.kind === 'income' ? 'Recebida por' : 'Paga por'}</dt>
              <dd>{l.memberName(tx.paidBy, { you: true })}</dd>
            </>
          )}
          {tx.paymentMethod && (
            <>
              <dt>Método</dt>
              <dd>{PAYMENT_METHOD_LABEL[tx.paymentMethod]}</dd>
            </>
          )}
          {tx.notes && (
            <>
              <dt>Observações</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{tx.notes}</dd>
            </>
          )}
        </dl>

        {tx.kind === 'expense' && tx.splitMode && (
          <div style={{ display: 'grid', gap: 8 }}>
            <h3>Responsabilidade · {SPLIT_LABEL[tx.splitMode]}</h3>
            <ul className="list">
              {tx.splits.map((s) => (
                <li key={s.userId} className="list-item">
                  <span className="list-main">{l.memberName(s.userId, { you: true })}</span>
                  <span className="list-end">
                    {formatBRL(s.shareCents)}
                    {tx.splitPercents[s.userId] !== undefined && <span className="muted small"> · {String(tx.splitPercents[s.userId]).replace('.', ',')}%</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="small muted">A divisão é só de responsabilidade: a despesa conta uma vez, pelo valor total.</p>
          </div>
        )}

        <Attachments entityType="transaction" entityId={tx.id} readOnly={cancelled} />

        <p className="small muted">
          Lançada por {l.memberName(tx.createdBy, { you: true })} em {dateTime.format(new Date(tx.createdAt))}
          {tx.updatedBy && tx.updatedAt !== tx.createdAt && ` · alterada por ${l.memberName(tx.updatedBy, { you: true })} em ${dateTime.format(new Date(tx.updatedAt))}`}
        </p>
      </div>
    </Sheet>
  );
}
