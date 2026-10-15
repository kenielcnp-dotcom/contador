-- =============================================================================
-- 0300 · Row Level Security e privilégios
-- =============================================================================
-- Estratégia:
--   1. Nada é acessível por padrão: revoga tudo de anon/authenticated.
--   2. Leitura: só membros ATIVOS da carteira (private.is_member).
--   3. Escrita direta só onde não há invariante entre tabelas (contas,
--      categorias, orçamentos, metas, anexos, perfil), e só nas colunas
--      liberadas (privilégio por coluna impede trocar group_id, autoria etc.).
--   4. Movimentações, rateios, contas a pagar, acertos, contribuições,
--      membros e convites só mudam por RPC (migração 0400), que valida tudo
--      dentro de uma transação SQL.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Tabelas futuras também nascem fechadas.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

alter table public.profiles            enable row level security;
alter table public.financial_groups    enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_invitations   enable row level security;
alter table public.accounts            enable row level security;
alter table public.categories          enable row level security;
alter table public.bills               enable row level security;
alter table public.bill_occurrences    enable row level security;
alter table public.savings_goals       enable row level security;
alter table public.transactions        enable row level security;
alter table public.expense_splits      enable row level security;
alter table public.settlements         enable row level security;
alter table public.settlement_payments enable row level security;
alter table public.goal_contributions  enable row level security;
alter table public.budgets             enable row level security;
alter table public.attachments         enable row level security;
alter table public.activity_logs       enable row level security;

-- -----------------------------------------------------------------------------
-- Leitura (somente usuários autenticados; anon não recebe nenhum grant)
-- -----------------------------------------------------------------------------
grant select on
  public.profiles, public.financial_groups, public.group_members,
  public.accounts, public.categories, public.bills, public.bill_occurrences,
  public.savings_goals, public.transactions, public.expense_splits,
  public.settlements, public.settlement_payments, public.goal_contributions,
  public.budgets, public.attachments, public.activity_logs
to authenticated;

-- Convites: o hash do token nunca é legível pelo cliente.
grant select (id, group_id, created_by, expires_at, accepted_by, accepted_at, revoked_at, created_at)
  on public.group_invitations to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_group(id));

create policy groups_select on public.financial_groups for select to authenticated
  using (private.is_member(id));

create policy members_select on public.group_members for select to authenticated
  using (private.is_member(group_id));

create policy invitations_select on public.group_invitations for select to authenticated
  using (private.is_member(group_id));

create policy accounts_select on public.accounts for select to authenticated
  using (private.is_member(group_id));
create policy categories_select on public.categories for select to authenticated
  using (private.is_member(group_id));
create policy bills_select on public.bills for select to authenticated
  using (private.is_member(group_id));
create policy bill_occurrences_select on public.bill_occurrences for select to authenticated
  using (private.is_member(group_id));
create policy savings_goals_select on public.savings_goals for select to authenticated
  using (private.is_member(group_id));
create policy transactions_select on public.transactions for select to authenticated
  using (private.is_member(group_id));
create policy expense_splits_select on public.expense_splits for select to authenticated
  using (private.is_member(group_id));
create policy settlements_select on public.settlements for select to authenticated
  using (private.is_member(group_id));
create policy settlement_payments_select on public.settlement_payments for select to authenticated
  using (private.is_member(group_id));
create policy goal_contributions_select on public.goal_contributions for select to authenticated
  using (private.is_member(group_id));
create policy budgets_select on public.budgets for select to authenticated
  using (private.is_member(group_id));
create policy attachments_select on public.attachments for select to authenticated
  using (private.is_member(group_id) and deleted_at is null);
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (private.is_member(group_id));

-- -----------------------------------------------------------------------------
-- Escrita direta (colunas liberadas uma a uma)
-- -----------------------------------------------------------------------------

-- Perfil: cada um edita só o próprio nome e foto.
grant update (full_name, avatar_path) on public.profiles to authenticated;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Carteira: só o administrador renomeia.
grant update (name) on public.financial_groups to authenticated;
create policy groups_update on public.financial_groups for update to authenticated
  using (private.is_owner(id))
  with check (private.is_owner(id));

-- Contas financeiras.
grant insert (group_id, name, kind, owner_id, opening_balance_cents, opening_balance_date)
  on public.accounts to authenticated;
grant update (name, kind, owner_id, opening_balance_cents, opening_balance_date, archived_at)
  on public.accounts to authenticated;
create policy accounts_insert on public.accounts for insert to authenticated
  with check (private.is_member(group_id) and created_by = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated
  using (private.is_member(group_id))
  with check (private.is_member(group_id));

-- Categorias (exclusão = arquivar, para preservar o histórico).
grant insert (group_id, name, kind, icon) on public.categories to authenticated;
grant update (name, icon, archived_at) on public.categories to authenticated;
create policy categories_insert on public.categories for insert to authenticated
  with check (private.is_member(group_id) and created_by = (select auth.uid()) and is_default = false);
create policy categories_update on public.categories for update to authenticated
  using (private.is_member(group_id))
  with check (private.is_member(group_id));

-- Orçamentos (planejamento; não são dados contábeis, podem ser apagados).
grant insert (group_id, month, kind, category_id, member_id, limit_cents, alert_thresholds)
  on public.budgets to authenticated;
grant update (limit_cents, alert_thresholds) on public.budgets to authenticated;
grant delete on public.budgets to authenticated;
create policy budgets_insert on public.budgets for insert to authenticated
  with check (private.is_member(group_id) and created_by = (select auth.uid()));
create policy budgets_update on public.budgets for update to authenticated
  using (private.is_member(group_id))
  with check (private.is_member(group_id));
create policy budgets_delete on public.budgets for delete to authenticated
  using (private.is_member(group_id));

-- Metas (o valor acumulado vem das contribuições, que só mudam por RPC).
grant insert (group_id, name, kind, target_cents, deadline, account_id) on public.savings_goals to authenticated;
grant update (name, kind, target_cents, deadline, account_id, status) on public.savings_goals to authenticated;
create policy savings_goals_insert on public.savings_goals for insert to authenticated
  with check (private.is_member(group_id) and created_by = (select auth.uid()));
create policy savings_goals_update on public.savings_goals for update to authenticated
  using (private.is_member(group_id))
  with check (private.is_member(group_id));

-- Ocorrências: só valor, vencimento e observação, e só enquanto pendentes.
grant update (amount_cents, due_date, notes) on public.bill_occurrences to authenticated;
create policy bill_occurrences_update on public.bill_occurrences for update to authenticated
  using (private.is_member(group_id) and status = 'pending')
  with check (private.is_member(group_id) and status = 'pending');

-- Anexos: o arquivo precisa estar na pasta da carteira e o alvo precisa existir nela.
create or replace function private.attachment_target_ok(p_type text, p_id uuid, p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'transaction' then exists (select 1 from public.transactions where id = p_id and group_id = p_group)
    when 'settlement_payment' then exists (select 1 from public.settlement_payments where id = p_id and group_id = p_group)
    when 'bill_occurrence' then exists (select 1 from public.bill_occurrences where id = p_id and group_id = p_group)
    when 'goal_contribution' then exists (select 1 from public.goal_contributions where id = p_id and group_id = p_group)
    else false
  end;
$$;
revoke all on function private.attachment_target_ok(text, uuid, uuid) from public;
grant execute on function private.attachment_target_ok(text, uuid, uuid) to authenticated;

grant insert (group_id, entity_type, entity_id, storage_path, file_name, mime_type, size_bytes)
  on public.attachments to authenticated;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    private.is_member(group_id)
    and uploaded_by = (select auth.uid())
    and private.attachment_target_ok(entity_type, entity_id, group_id)
  );
-- A remoção de anexo é lógica e passa pela RPC remove_attachment (0400).
