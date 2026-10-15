import type { BudgetKind } from '@/domain/budget';
import type { OccurrenceStatus } from '@/domain/bills';
import type { LedgerTx } from '@/domain/ledger';
import type { SplitMode } from '@/domain/split';

export type MemberRole = 'owner' | 'member';
export type MemberStatus = 'active' | 'removed';

export interface Member {
  userId: string;
  name: string;
  avatarPath: string | null;
  role: MemberRole;
  status: MemberStatus;
  sharePercent: number;
}

export interface GroupInfo {
  id: string;
  name: string;
  ownerId: string;
  maxMembers: number;
  createdAt: string;
}

export interface GroupContext {
  userId: string;
  group: GroupInfo;
  me: Member;
  /** Todos os que já participaram (inclui removidos, para exibir o histórico). */
  members: Member[];
  activeMembers: Member[];
}

export type AccountKind = 'checking' | 'savings' | 'cash' | 'investment' | 'reserve';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  ownerId: string | null;
  openingBalanceCents: number | null;
  openingBalanceDate: string | null;
  archivedAt: string | null;
}

export interface AccountBalance {
  accountId: string;
  name: string;
  kind: AccountKind;
  ownerId: string | null;
  openingBalanceCents: number | null;
  openingMissing: boolean;
  archived: boolean;
  balanceCents: number;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  icon: string | null;
  isDefault: boolean;
  archivedAt: string | null;
}

export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'boleto' | 'transferencia' | 'outro';

export interface Transaction extends LedgerTx {
  description: string;
  splitMode: SplitMode | null;
  splitPercents: Record<string, number>;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  billOccurrenceId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
}

export type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface Bill {
  id: string;
  kind: 'payable' | 'receivable';
  description: string;
  amountCents: number;
  categoryId: string | null;
  accountId: string | null;
  responsibleId: string | null;
  recurrence: Recurrence;
  startDate: string;
  endDate: string | null;
  splitMode: 'equal' | 'percent' | 'individual';
  notes: string | null;
  active: boolean;
}

export interface Occurrence {
  id: string;
  billId: string;
  dueDate: string;
  scheduledDate: string;
  amountCents: number;
  paidCents: number;
  status: OccurrenceStatus;
  paidAt: string | null;
  notes: string | null;
  bill: Bill;
}

export interface BudgetRow {
  id: string;
  month: string;
  kind: BudgetKind;
  categoryId: string | null;
  memberId: string | null;
  limitCents: number;
  alertThresholds: number[];
}

export type GoalKind = 'emergency' | 'travel' | 'vehicle' | 'home' | 'purchase' | 'custom';

export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  targetCents: number;
  deadline: string | null;
  accountId: string | null;
  status: 'active' | 'cancelled';
  createdAt: string;
}

export interface Contribution {
  id: string;
  goalId: string;
  amountCents: number;
  contributedAt: string;
  memberId: string | null;
  fromAccountId: string | null;
  transactionId: string | null;
  notes: string | null;
  cancelledAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface MemberBalanceRow {
  userId: string;
  name: string;
  memberStatus: MemberStatus;
  paidCents: number;
  shareCents: number;
  sentCents: number;
  receivedCents: number;
  netCents: number;
}

export interface Settlement {
  id: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  paidCents: number;
  status: 'open' | 'settled' | 'cancelled';
  createdAt: string;
  settledAt: string | null;
}

export interface SettlementPayment {
  id: string;
  settlementId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  paidAt: string;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  cancelledAt: string | null;
}

export type AttachmentEntity = 'transaction' | 'settlement_payment' | 'bill_occurrence' | 'goal_contribution';

export interface Attachment {
  id: string;
  entityType: AttachmentEntity;
  entityId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  actorId: string | null;
  entity: string;
  entityId: string | null;
  action: 'create' | 'update' | 'cancel';
  details: { description?: string; kind?: string; amount_cents?: number; status?: string };
  createdAt: string;
}

export interface Invitation {
  id: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
