import type { Occurrence } from '@/data/models';
import { remainingCents } from '@/domain/bills';
import type { PendingBill } from '@/domain/budget';

/** Ocorrências em aberto no formato que o orçamento usa como "previsto". */
export function toPendingBills(occs: Occurrence[]): PendingBill[] {
  return occs
    .filter((o) => o.status === 'pending' || o.status === 'partial')
    .map((o) => ({ remainingCents: remainingCents(o), dueDate: o.dueDate, categoryId: o.bill.categoryId, kind: o.bill.kind }));
}
