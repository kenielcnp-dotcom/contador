// Toda a comunicação com o Supabase passa por aqui. As telas nunca montam
// consultas por conta própria — assim a regra de "de onde vem cada número"
// fica num lugar só. Recebe o cliente por parâmetro para os testes de
// integração usarem exatamente o mesmo código do app.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BudgetKind } from '@/domain/budget';
import type { OccurrenceStatus } from '@/domain/bills';
import type { Period } from '@/domain/period';
import type { SplitMode, SplitShare } from '@/domain/split';
import type { Database, Json } from './database.types';
import { AppError, toAppError } from './errors';
import type {
  Account,
  AccountBalance,
  AccountKind,
  ActivityLog,
  Attachment,
  AttachmentEntity,
  Bill,
  BudgetRow,
  Category,
  Contribution,
  Goal,
  GoalKind,
  GroupContext,
  Invitation,
  Member,
  MemberBalanceRow,
  Occurrence,
  PaymentMethod,
  Recurrence,
  Settlement,
  SettlementPayment,
  Transaction,
} from './models';

export type Client = SupabaseClient<Database>;

/** Leitura que sempre devolve dados (lista vazia, nunca null). */
type Res = { data: unknown; error: unknown };

function check<R extends Res>(result: R): NonNullable<R['data']> {
  if (result.error) throw toAppError(result.error);
  if (result.data === null || result.data === undefined) {
    throw new AppError('O servidor respondeu sem dados. Tente de novo.', 'unknown');
  }
  return result.data as NonNullable<R['data']>;
}

/** Leitura que pode legitimamente não encontrar nada. */
function maybe<R extends Res>(result: R): R['data'] | null {
  if (result.error) throw toAppError(result.error);
  return result.data ?? null;
}

/** Escrita: só interessa saber se deu erro. */
function ok(result: { error: unknown }): void {
  if (result.error) throw toAppError(result.error);
}

const PAGE = 1000;

/** Lê todas as páginas (o PostgREST limita cada resposta a 1000 linhas). */
async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const data = (maybe(await page(from, from + PAGE - 1)) ?? []) as T[];
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

// ---------------------------------------------------------------------------
// Mapeamentos linha → modelo
// ---------------------------------------------------------------------------
type TxRow = Database['public']['Tables']['transactions']['Row'] & {
  expense_splits: { user_id: string; share_cents: number; percent: number | null }[];
};

export function mapTransaction(r: TxRow): Transaction {
  const splitPercents: Record<string, number> = {};
  for (const s of r.expense_splits ?? []) if (s.percent !== null) splitPercents[s.user_id] = Number(s.percent);
  return {
    id: r.id,
    kind: r.kind as Transaction['kind'],
    status: r.status as Transaction['status'],
    amountCents: r.amount_cents,
    categoryId: r.category_id,
    competenceDate: r.competence_date,
    paidAt: r.paid_at,
    accountId: r.account_id,
    toAccountId: r.to_account_id,
    paidBy: r.paid_by,
    splits: (r.expense_splits ?? [])
      .map((s) => ({ userId: s.user_id, shareCents: s.share_cents }))
      .sort((a, b) => (a.userId < b.userId ? -1 : 1)),
    splitPercents,
    description: r.description,
    splitMode: r.split_mode as SplitMode | null,
    paymentMethod: r.payment_method as PaymentMethod | null,
    notes: r.notes,
    billOccurrenceId: r.bill_occurrence_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
    cancelledAt: r.cancelled_at,
    cancelledBy: r.cancelled_by,
    cancelReason: r.cancel_reason,
  };
}

type BillRow = Database['public']['Tables']['bills']['Row'];
const mapBill = (b: BillRow): Bill => ({
  id: b.id,
  kind: b.kind as Bill['kind'],
  description: b.description,
  amountCents: b.amount_cents,
  categoryId: b.category_id,
  accountId: b.account_id,
  responsibleId: b.responsible_id,
  recurrence: b.recurrence as Recurrence,
  startDate: b.start_date,
  endDate: b.end_date,
  splitMode: b.split_mode as Bill['splitMode'],
  notes: b.notes,
  active: b.active,
});

// ---------------------------------------------------------------------------
// Entradas das RPCs
// ---------------------------------------------------------------------------
export interface TransactionInput {
  id?: string;
  clientRequestId: string;
  kind: 'income' | 'expense' | 'transfer';
  description: string;
  amountCents: number;
  categoryId: string | null;
  competenceDate: string;
  paidAt: string | null;
  status: 'planned' | 'effective';
  accountId: string | null;
  toAccountId: string | null;
  paidBy: string | null;
  splitMode: SplitMode | null;
  splits: SplitShare[];
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

export interface BillInput {
  id?: string;
  kind: 'payable' | 'receivable';
  description: string;
  amountCents: number;
  categoryId: string;
  accountId: string | null;
  responsibleId: string | null;
  recurrence: Recurrence;
  startDate: string;
  endDate: string | null;
  splitMode: 'equal' | 'percent' | 'individual';
  notes: string | null;
  active: boolean;
}

export interface PayOccurrenceInput {
  occurrenceId: string;
  clientRequestId: string;
  amountCents: number;
  paidAt: string;
  accountId: string | null;
  paidBy: string | null;
  splitMode: SplitMode | null;
  splits: SplitShare[];
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

export interface SettlementPaymentInput {
  clientRequestId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  paidAt: string;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

export interface ContributionInput {
  clientRequestId: string;
  goalId: string;
  direction: 'deposit' | 'withdraw';
  amountCents: number;
  contributedAt: string;
  memberId: string | null;
  fromAccountId: string | null;
  notes: string | null;
}

export function createApi(db: Client) {
  async function rpc<R extends Res>(fn: PromiseLike<R>): Promise<NonNullable<R['data']>> {
    try {
      return maybe(await fn) as NonNullable<R['data']>;
    } catch (e) {
      throw toAppError(e);
    }
  }

  return {
    db,

    // ---------------------------------------------------------------- Auth
    async signUp(email: string, password: string, fullName: string, redirectTo?: string) {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: redirectTo },
      });
      if (error) throw toAppError(error);
      // Com confirmação de e-mail ligada, não há sessão até a pessoa confirmar.
      return { needsConfirmation: !data.session, user: data.user };
    },
    async signIn(email: string, password: string) {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw toAppError(error);
      return data;
    },
    async signOut() {
      const { error } = await db.auth.signOut();
      if (error) await db.auth.signOut({ scope: 'local' });
    },
    async requestPasswordReset(email: string, redirectTo: string) {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw toAppError(error);
    },
    async updatePassword(password: string) {
      const { error } = await db.auth.updateUser({ password });
      if (error) throw toAppError(error);
    },

    // ---------------------------------------------------------------- Carteira
    async getGroupContext(userId: string): Promise<GroupContext | null> {
      const mine = maybe(
        await db.from('group_members').select('group_id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      );
      if (!mine) return null;
      const [group, members] = await Promise.all([
        db.from('financial_groups').select('id, name, owner_id, max_members, created_at').eq('id', mine.group_id).single(),
        db
          .from('group_members')
          .select('user_id, role, status, share_percent, profiles(full_name, avatar_path)')
          .eq('group_id', mine.group_id)
          .order('joined_at'),
      ]);
      const g = check(group);
      const all: Member[] = check(members).map((m) => ({
        userId: m.user_id,
        name: m.profiles?.full_name?.trim() || 'Sem nome',
        avatarPath: m.profiles?.avatar_path ?? null,
        role: m.role as Member['role'],
        status: m.status as Member['status'],
        sharePercent: Number(m.share_percent),
      }));
      const me = all.find((m) => m.userId === userId);
      if (!me) return null;
      return {
        userId,
        group: { id: g.id, name: g.name, ownerId: g.owner_id, maxMembers: g.max_members, createdAt: g.created_at },
        me,
        members: all,
        activeMembers: all.filter((m) => m.status === 'active'),
      };
    },
    createGroup: (name: string) => rpc(db.rpc('create_group', { p_name: name })),
    renameGroup: async (groupId: string, name: string) => {
      ok(await db.from('financial_groups').update({ name }).eq('id', groupId));
    },
    async createInvitation(validHours = 72) {
      const rows = await rpc(db.rpc('create_invitation', { p_valid_hours: validHours }));
      const row = rows[0];
      if (!row) throw new AppError('Não foi possível gerar o convite.', 'unknown');
      return { id: row.invitation_id, token: row.token, expiresAt: row.expires_at };
    },
    async listInvitations(groupId: string): Promise<Invitation[]> {
      const rows = check(
        await db
          .from('group_invitations')
          .select('id, expires_at, accepted_at, revoked_at, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(10),
      );
      return rows.map((r) => ({
        id: r.id,
        expiresAt: r.expires_at,
        acceptedAt: r.accepted_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
      }));
    },
    async previewInvitation(token: string) {
      const rows = await rpc(db.rpc('preview_invitation', { p_token: token }));
      const r = rows[0];
      return {
        status: (r?.status ?? 'invalid') as
          | 'valid'
          | 'invalid'
          | 'expired'
          | 'used'
          | 'revoked'
          | 'full'
          | 'member'
          | 'other_group',
        groupName: r?.group_name ?? null,
        invitedBy: r?.invited_by ?? null,
        expiresAt: r?.expires_at ?? null,
      };
    },
    acceptInvitation: (token: string) => rpc(db.rpc('accept_invitation', { p_token: token })),
    revokeInvitation: (id: string) => rpc(db.rpc('revoke_invitation', { p_invitation: id })),
    removeMember: (userId: string) => rpc(db.rpc('remove_member', { p_user: userId })),
    updateMemberShares: (shares: Record<string, number>) =>
      rpc(db.rpc('update_member_shares', { p_shares: shares as Json })),

    // ---------------------------------------------------------------- Perfil
    async updateProfile(userId: string, patch: { fullName?: string; avatarPath?: string | null }) {
      const update: { full_name?: string; avatar_path?: string | null } = {};
      if (patch.fullName !== undefined) update.full_name = patch.fullName.trim().slice(0, 80);
      if (patch.avatarPath !== undefined) update.avatar_path = patch.avatarPath;
      ok(await db.from('profiles').update(update).eq('id', userId));
    },
    async uploadAvatar(userId: string, file: File) {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await db.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw toAppError(error);
      return path;
    },
    async signedUrl(bucket: 'avatars' | 'comprovantes', path: string, seconds = 300) {
      const { data, error } = await db.storage.from(bucket).createSignedUrl(path, seconds);
      if (error) throw toAppError(error);
      return data.signedUrl;
    },

    // ---------------------------------------------------------------- Contas
    async listAccounts(groupId: string): Promise<Account[]> {
      const rows = check(await db.from('accounts').select('*').eq('group_id', groupId).order('created_at'));
      return rows.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind as AccountKind,
        ownerId: a.owner_id,
        openingBalanceCents: a.opening_balance_cents,
        openingBalanceDate: a.opening_balance_date,
        archivedAt: a.archived_at,
      }));
    },
    async createAccount(
      groupId: string,
      a: { name: string; kind: AccountKind; ownerId: string | null; openingBalanceCents: number | null; openingBalanceDate: string | null },
    ) {
      ok(
        await db.from('accounts').insert({
          group_id: groupId,
          name: a.name.trim(),
          kind: a.kind,
          owner_id: a.ownerId,
          opening_balance_cents: a.openingBalanceCents,
          opening_balance_date: a.openingBalanceCents === null ? null : a.openingBalanceDate,
        }),
      );
    },
    async updateAccount(
      id: string,
      a: Partial<{ name: string; kind: AccountKind; ownerId: string | null; openingBalanceCents: number | null; openingBalanceDate: string | null; archived: boolean }>,
    ) {
      const patch: Database['public']['Tables']['accounts']['Update'] = {};
      if (a.name !== undefined) patch.name = a.name.trim();
      if (a.kind !== undefined) patch.kind = a.kind;
      if (a.ownerId !== undefined) patch.owner_id = a.ownerId;
      if (a.openingBalanceCents !== undefined) patch.opening_balance_cents = a.openingBalanceCents;
      if (a.openingBalanceDate !== undefined) patch.opening_balance_date = a.openingBalanceDate;
      if (a.archived !== undefined) patch.archived_at = a.archived ? new Date().toISOString() : null;
      ok(await db.from('accounts').update(patch).eq('id', id));
    },
    async accountBalances(): Promise<AccountBalance[]> {
      const rows = await rpc(db.rpc('get_account_balances'));
      return rows.map((r) => ({
        accountId: r.account_id,
        name: r.name,
        kind: r.kind as AccountKind,
        ownerId: r.owner_id,
        openingBalanceCents: r.opening_balance_cents as number | null,
        openingMissing: r.opening_missing,
        archived: r.archived,
        balanceCents: r.balance_cents,
      }));
    },
    async balanceSeries(period: Period) {
      const rows = await rpc(db.rpc('get_balance_series', { p_from: period.start, p_to: period.end }));
      return rows.map((r) => ({ month: r.month, balanceCents: r.balance_cents }));
    },

    // ---------------------------------------------------------------- Categorias
    async listCategories(groupId: string): Promise<Category[]> {
      const rows = check(await db.from('categories').select('*').eq('group_id', groupId).order('name'));
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind as Category['kind'],
        icon: c.icon,
        isDefault: c.is_default,
        archivedAt: c.archived_at,
      }));
    },
    async createCategory(groupId: string, c: { name: string; kind: 'income' | 'expense'; icon?: string | null }) {
      ok(await db.from('categories').insert({ group_id: groupId, name: c.name.trim(), kind: c.kind, icon: c.icon ?? null }));
    },
    async updateCategory(id: string, c: { name?: string; archived?: boolean }) {
      const patch: Database['public']['Tables']['categories']['Update'] = {};
      if (c.name !== undefined) patch.name = c.name.trim();
      if (c.archived !== undefined) patch.archived_at = c.archived ? new Date().toISOString() : null;
      ok(await db.from('categories').update(patch).eq('id', id));
    },

    // ---------------------------------------------------------------- Movimentações
    /** Movimentações cuja data efetiva OU de competência cai no período (o ledger decide). */
    async listTransactions(groupId: string, period: Period): Promise<Transaction[]> {
      const { start, end } = period;
      const rows = await fetchAllPages<TxRow>((from, to) =>
        db
          .from('transactions')
          .select('*, expense_splits(user_id, share_cents, percent)')
          .eq('group_id', groupId)
          .or(`and(paid_at.gte.${start},paid_at.lte.${end}),and(competence_date.gte.${start},competence_date.lte.${end})`)
          .order('competence_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to) as unknown as PromiseLike<{ data: TxRow[] | null; error: unknown }>,
      );
      return rows.map(mapTransaction);
    },
    async getTransaction(id: string): Promise<Transaction | null> {
      const row = maybe(
        await db.from('transactions').select('*, expense_splits(user_id, share_cents, percent)').eq('id', id).maybeSingle(),
      );
      return row ? mapTransaction(row as unknown as TxRow) : null;
    },
    saveTransaction: (t: TransactionInput) =>
      rpc(
        db.rpc('save_transaction', {
          p: {
            id: t.id ?? null,
            client_request_id: t.clientRequestId,
            kind: t.kind,
            description: t.description,
            amount_cents: t.amountCents,
            category_id: t.categoryId,
            competence_date: t.competenceDate,
            paid_at: t.paidAt,
            status: t.status,
            account_id: t.accountId,
            to_account_id: t.toAccountId,
            paid_by: t.paidBy,
            split_mode: t.splitMode,
            splits: t.splits.map((s) => ({ user_id: s.userId, share_cents: s.shareCents, percent: s.percent ?? null })),
            payment_method: t.paymentMethod,
            notes: t.notes,
          },
        }),
      ),
    cancelTransaction: (id: string, reason?: string) =>
      rpc(db.rpc('cancel_transaction', { p_id: id, p_reason: reason ?? undefined })),

    // ---------------------------------------------------------------- Contas a pagar
    async listBills(groupId: string): Promise<Bill[]> {
      const rows = check(await db.from('bills').select('*').eq('group_id', groupId).order('description'));
      return rows.map(mapBill);
    },
    saveBill: (b: BillInput) =>
      rpc(
        db.rpc('save_bill', {
          p: {
            id: b.id ?? null,
            kind: b.kind,
            description: b.description,
            amount_cents: b.amountCents,
            category_id: b.categoryId,
            account_id: b.accountId,
            responsible_id: b.responsibleId,
            recurrence: b.recurrence,
            start_date: b.startDate,
            end_date: b.endDate,
            split_mode: b.splitMode,
            notes: b.notes,
            active: b.active,
          },
        }),
      ),
    generateOccurrences: (until?: string) => rpc(db.rpc('generate_bill_occurrences', { p_until: until })),
    /** Ocorrências que vencem no intervalo, mais todas as abertas vencidas antes dele. */
    async listOccurrences(groupId: string, period: Period): Promise<Occurrence[]> {
      const rows = check(
        await db
          .from('bill_occurrences')
          .select('*, bills(*)')
          .eq('group_id', groupId)
          .or(`and(due_date.gte.${period.start},due_date.lte.${period.end}),and(due_date.lt.${period.start},status.in.(pending,partial))`)
          .order('due_date')
          .limit(1000),
      );
      return rows
        .filter((o) => o.bills)
        .map((o) => ({
          id: o.id,
          billId: o.bill_id,
          dueDate: o.due_date,
          scheduledDate: o.scheduled_date,
          amountCents: o.amount_cents,
          paidCents: o.paid_cents,
          status: o.status as OccurrenceStatus,
          paidAt: o.paid_at,
          notes: o.notes,
          bill: mapBill(o.bills as BillRow),
        }));
    },
    async updateOccurrence(id: string, patch: { amountCents?: number; dueDate?: string; notes?: string | null }) {
      const u: Database['public']['Tables']['bill_occurrences']['Update'] = {};
      if (patch.amountCents !== undefined) u.amount_cents = patch.amountCents;
      if (patch.dueDate !== undefined) u.due_date = patch.dueDate;
      if (patch.notes !== undefined) u.notes = patch.notes;
      const rows = check(await db.from('bill_occurrences').update(u).eq('id', id).select('id'));
      if (rows.length === 0) throw new AppError('Só é possível editar contas pendentes.', 'validation');
    },
    payOccurrence: (p: PayOccurrenceInput) =>
      rpc(
        db.rpc('pay_bill_occurrence', {
          p: {
            occurrence_id: p.occurrenceId,
            client_request_id: p.clientRequestId,
            amount_cents: p.amountCents,
            paid_at: p.paidAt,
            account_id: p.accountId,
            paid_by: p.paidBy,
            split_mode: p.splitMode,
            splits: p.splits.map((s) => ({ user_id: s.userId, share_cents: s.shareCents, percent: s.percent ?? null })),
            payment_method: p.paymentMethod,
            notes: p.notes,
          },
        }),
      ),
    cancelOccurrence: (id: string) => rpc(db.rpc('cancel_bill_occurrence', { p_id: id })),
    async paymentsOfOccurrence(occurrenceId: string): Promise<Transaction[]> {
      const rows = check(
        await db
          .from('transactions')
          .select('*, expense_splits(user_id, share_cents, percent)')
          .eq('bill_occurrence_id', occurrenceId)
          .order('paid_at'),
      );
      return (rows as unknown as TxRow[]).map(mapTransaction);
    },

    // ---------------------------------------------------------------- Acertos
    async memberBalances(includePlanned = false): Promise<MemberBalanceRow[]> {
      const rows = await rpc(db.rpc('get_member_balances', { p_include_planned: includePlanned }));
      return rows.map((r) => ({
        userId: r.user_id,
        name: r.full_name?.trim() || 'Sem nome',
        memberStatus: r.member_status as MemberBalanceRow['memberStatus'],
        paidCents: r.paid_cents,
        shareCents: r.share_cents,
        sentCents: r.sent_cents,
        receivedCents: r.received_cents,
        netCents: r.net_cents,
      }));
    },
    async listSettlements(groupId: string): Promise<{ settlements: Settlement[]; payments: SettlementPayment[] }> {
      const [s, p] = await Promise.all([
        db.from('settlements').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(200),
        db.from('settlement_payments').select('*').eq('group_id', groupId).order('paid_at', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      ]);
      return {
        settlements: check(s).map((r) => ({
          id: r.id,
          fromUser: r.from_user,
          toUser: r.to_user,
          amountCents: r.amount_cents,
          paidCents: r.paid_cents,
          status: r.status as Settlement['status'],
          createdAt: r.created_at,
          settledAt: r.settled_at,
        })),
        payments: check(p).map((r) => ({
          id: r.id,
          settlementId: r.settlement_id,
          fromUser: r.from_user,
          toUser: r.to_user,
          amountCents: r.amount_cents,
          paidAt: r.paid_at,
          paymentMethod: r.payment_method as PaymentMethod | null,
          notes: r.notes,
          createdBy: r.created_by,
          createdAt: r.created_at,
          cancelledAt: r.cancelled_at,
        })),
      };
    },
    registerSettlementPayment: (p: SettlementPaymentInput) =>
      rpc(
        db.rpc('register_settlement_payment', {
          p: {
            client_request_id: p.clientRequestId,
            from_user: p.fromUser,
            to_user: p.toUser,
            amount_cents: p.amountCents,
            paid_at: p.paidAt,
            payment_method: p.paymentMethod,
            notes: p.notes,
          },
        }),
      ),
    cancelSettlementPayment: (id: string) => rpc(db.rpc('cancel_settlement_payment', { p_id: id })),

    // ---------------------------------------------------------------- Orçamentos
    async listBudgets(groupId: string, month: string): Promise<BudgetRow[]> {
      const rows = check(await db.from('budgets').select('*').eq('group_id', groupId).eq('month', month));
      return rows.map((b) => ({
        id: b.id,
        month: b.month,
        kind: b.kind as BudgetKind,
        categoryId: b.category_id,
        memberId: b.member_id,
        limitCents: b.limit_cents,
        alertThresholds: b.alert_thresholds,
      }));
    },
    async saveBudget(
      groupId: string,
      b: { id?: string; month: string; kind: BudgetKind; categoryId: string | null; memberId: string | null; limitCents: number; alertThresholds: number[] },
    ) {
      if (b.id) {
        ok(await db.from('budgets').update({ limit_cents: b.limitCents, alert_thresholds: b.alertThresholds }).eq('id', b.id));
      } else {
        ok(
          await db.from('budgets').insert({
            group_id: groupId,
            month: b.month,
            kind: b.kind,
            category_id: b.categoryId,
            member_id: b.memberId,
            limit_cents: b.limitCents,
            alert_thresholds: b.alertThresholds,
          }),
        );
      }
    },
    async deleteBudget(id: string) {
      ok(await db.from('budgets').delete().eq('id', id));
    },
    async copyBudgets(groupId: string, fromMonth: string, toMonth: string) {
      const source = check(await db.from('budgets').select('*').eq('group_id', groupId).eq('month', fromMonth));
      const existing = check(await db.from('budgets').select('kind, category_id, member_id').eq('group_id', groupId).eq('month', toMonth));
      const key = (b: { kind: string; category_id: string | null; member_id: string | null }) => `${b.kind}|${b.category_id}|${b.member_id}`;
      const have = new Set(existing.map(key));
      const rows = source
        .filter((b) => !have.has(key(b)))
        .map((b) => ({
          group_id: groupId,
          month: toMonth,
          kind: b.kind,
          category_id: b.category_id,
          member_id: b.member_id,
          limit_cents: b.limit_cents,
          alert_thresholds: b.alert_thresholds,
        }));
      if (rows.length) ok(await db.from('budgets').insert(rows));
      return rows.length;
    },

    // ---------------------------------------------------------------- Metas
    async listGoals(groupId: string): Promise<{ goals: Goal[]; contributions: Contribution[] }> {
      const [g, c] = await Promise.all([
        db.from('savings_goals').select('*').eq('group_id', groupId).order('created_at'),
        db.from('goal_contributions').select('*').eq('group_id', groupId).order('contributed_at', { ascending: false }).limit(2000),
      ]);
      return {
        goals: check(g).map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind as GoalKind,
          targetCents: r.target_cents,
          deadline: r.deadline,
          accountId: r.account_id,
          status: r.status as Goal['status'],
          createdAt: r.created_at,
        })),
        contributions: check(c).map((r) => ({
          id: r.id,
          goalId: r.goal_id,
          amountCents: r.amount_cents,
          contributedAt: r.contributed_at,
          memberId: r.member_id,
          fromAccountId: r.from_account_id,
          transactionId: r.transaction_id,
          notes: r.notes,
          cancelledAt: r.cancelled_at,
          createdBy: r.created_by,
          createdAt: r.created_at,
        })),
      };
    },
    async saveGoal(
      groupId: string,
      g: { id?: string; name: string; kind: GoalKind; targetCents: number; deadline: string | null; accountId: string | null; status?: Goal['status'] },
    ) {
      if (g.id) {
        ok(
          await db
            .from('savings_goals')
            .update({ name: g.name.trim(), kind: g.kind, target_cents: g.targetCents, deadline: g.deadline, account_id: g.accountId, status: g.status })
            .eq('id', g.id),
        );
      } else {
        ok(
          await db.from('savings_goals').insert({
            group_id: groupId,
            name: g.name.trim(),
            kind: g.kind,
            target_cents: g.targetCents,
            deadline: g.deadline,
            account_id: g.accountId,
          }),
        );
      }
    },
    contributeGoal: (c: ContributionInput) =>
      rpc(
        db.rpc('contribute_goal', {
          p: {
            client_request_id: c.clientRequestId,
            goal_id: c.goalId,
            direction: c.direction,
            amount_cents: c.amountCents,
            contributed_at: c.contributedAt,
            member_id: c.memberId,
            from_account_id: c.fromAccountId,
            notes: c.notes,
          },
        }),
      ),
    cancelContribution: (id: string) => rpc(db.rpc('cancel_goal_contribution', { p_id: id })),

    // ---------------------------------------------------------------- Anexos
    async listAttachments(entityType: AttachmentEntity, entityId: string): Promise<Attachment[]> {
      const rows = check(
        await db.from('attachments').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at'),
      );
      return rows.map((a) => ({
        id: a.id,
        entityType: a.entity_type as AttachmentEntity,
        entityId: a.entity_id,
        storagePath: a.storage_path,
        fileName: a.file_name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        uploadedBy: a.uploaded_by,
        createdAt: a.created_at,
      }));
    },
    async uploadAttachment(groupId: string, entityType: AttachmentEntity, entityId: string, file: File) {
      const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
      const path = `${groupId}/${entityType}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from('comprovantes').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw toAppError(up.error);
      const { error } = await db.from('attachments').insert({
        group_id: groupId,
        entity_type: entityType,
        entity_id: entityId,
        storage_path: path,
        file_name: file.name.slice(0, 200) || 'arquivo',
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (error) {
        // Sem metadado o arquivo ficaria órfão: remove antes de reportar o erro.
        await db.storage.from('comprovantes').remove([path]);
        throw toAppError(error);
      }
    },
    async removeAttachment(id: string) {
      const path = await rpc(db.rpc('remove_attachment', { p_id: id }));
      if (path) await db.storage.from('comprovantes').remove([path]);
    },

    // ---------------------------------------------------------------- Histórico
    async listActivity(groupId: string, limit = 50): Promise<ActivityLog[]> {
      const rows = check(
        await db.from('activity_logs').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(limit),
      );
      return rows.map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        entity: r.entity,
        entityId: r.entity_id,
        action: r.action as ActivityLog['action'],
        details: (r.details ?? {}) as ActivityLog['details'],
        createdAt: r.created_at,
      }));
    },
  };
}

export type Api = ReturnType<typeof createApi>;
