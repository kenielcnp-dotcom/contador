-- =============================================================================
-- 0200 · Tabelas financeiras
-- =============================================================================
-- Modelo de contabilização (resumo; detalhes em docs/TECNICO.md):
--   * transactions guarda receitas, despesas e transferências. Cada despesa
--     existe UMA vez, com o valor total. expense_splits guarda a
--     responsabilidade de cada pessoa — nunca é uma nova saída.
--   * status: 'planned' (prevista), 'effective' (efetivada: paga/recebida),
--     'cancelled' (cancelamento auditável; nada é apagado).
--   * Transferência só mexe no saldo das contas; não é receita nem despesa.
--   * bills são compromissos (recorrentes ou não); bill_occurrences são as
--     ocorrências. Só o pagamento de uma ocorrência gera transação efetiva.
--   * settlements / settlement_payments registram acertos entre o casal:
--     reduzem a dívida entre pessoas e não tocam em contas nem em totais.

-- -----------------------------------------------------------------------------
-- Contas financeiras
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  group_id              uuid not null references public.financial_groups (id),
  name                  text not null check (char_length(btrim(name)) between 1 and 60),
  kind                  text not null default 'checking'
                        check (kind in ('checking', 'savings', 'cash', 'investment', 'reserve')),
  -- null = conta conjunta do casal; preenchido = conta pessoal de um participante.
  owner_id              uuid,
  -- null = saldo inicial ainda não informado (o app avisa; não inventa dinheiro).
  opening_balance_cents bigint check (opening_balance_cents between -100000000000 and 100000000000),
  opening_balance_date  date,
  archived_at           timestamptz,
  created_by            uuid not null default auth.uid() references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, group_id),
  foreign key (group_id, owner_id) references public.group_members (group_id, user_id)
);

create index accounts_group on public.accounts (group_id);
create trigger accounts_touch before update on public.accounts
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Categorias
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.financial_groups (id),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  kind        text not null check (kind in ('income', 'expense')),
  icon        text check (icon is null or char_length(icon) <= 40),
  is_default  boolean not null default false,
  archived_at timestamptz,
  created_by  uuid default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, group_id)
);

create unique index categories_unique_name
  on public.categories (group_id, kind, lower(btrim(name)));
create trigger categories_touch before update on public.categories
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Contas a pagar / receber
-- -----------------------------------------------------------------------------
create table public.bills (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.financial_groups (id),
  kind           text not null default 'payable' check (kind in ('payable', 'receivable')),
  description    text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents   bigint not null check (amount_cents between 1 and 100000000000),
  category_id    uuid,
  account_id     uuid,
  responsible_id uuid,
  recurrence     text not null default 'none'
                 check (recurrence in ('none', 'weekly', 'monthly', 'yearly')),
  start_date     date not null,
  end_date       date,
  -- Como dividir a despesa quando a ocorrência for paga (só para 'payable').
  split_mode     text not null default 'equal' check (split_mode in ('equal', 'percent', 'individual')),
  notes          text check (notes is null or char_length(notes) <= 500),
  active         boolean not null default true,
  created_by     uuid not null default auth.uid() references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, group_id),
  check (end_date is null or end_date >= start_date),
  foreign key (category_id, group_id) references public.categories (id, group_id),
  foreign key (account_id, group_id) references public.accounts (id, group_id),
  foreign key (group_id, responsible_id) references public.group_members (group_id, user_id)
);

create index bills_group on public.bills (group_id);
create trigger bills_touch before update on public.bills
  for each row execute function private.touch_updated_at();

create table public.bill_occurrences (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.financial_groups (id),
  bill_id      uuid not null,
  -- Data gerada pela recorrência (fixa). due_date pode ser ajustada pelo usuário.
  scheduled_date date not null,
  due_date     date not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  -- Soma das transações efetivas ligadas a esta ocorrência (mantida pelas RPCs).
  paid_cents   bigint not null default 0 check (paid_cents >= 0),
  -- 'overdue' (vencida) não é gravado: é derivado de due_date < hoje.
  status       text not null default 'pending'
               check (status in ('pending', 'partial', 'paid', 'cancelled')),
  paid_at      date,
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, group_id),
  -- Garante que gerar ocorrências duas vezes nunca duplica um vencimento,
  -- mesmo que o usuário tenha mudado a data de vencimento de uma delas.
  unique (bill_id, scheduled_date),
  foreign key (bill_id, group_id) references public.bills (id, group_id)
);

create index bill_occurrences_due on public.bill_occurrences (group_id, due_date);
create trigger bill_occurrences_touch before update on public.bill_occurrences
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Metas
-- -----------------------------------------------------------------------------
create table public.savings_goals (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.financial_groups (id),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  kind         text not null default 'custom'
               check (kind in ('emergency', 'travel', 'vehicle', 'home', 'purchase', 'custom')),
  target_cents bigint not null check (target_cents between 1 and 100000000000),
  deadline     date,
  -- Conta-reserva opcional. Quando existe, contribuições viram transferências reais.
  account_id   uuid,
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, group_id),
  foreign key (account_id, group_id) references public.accounts (id, group_id)
);

create index savings_goals_group on public.savings_goals (group_id);
create trigger savings_goals_touch before update on public.savings_goals
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Movimentações
-- -----------------------------------------------------------------------------
create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.financial_groups (id),
  kind               text not null check (kind in ('income', 'expense', 'transfer')),
  description        text not null check (char_length(btrim(description)) between 1 and 120),
  amount_cents       bigint not null check (amount_cents between 1 and 100000000000),
  category_id        uuid,
  competence_date    date not null,
  paid_at            date,
  status             text not null check (status in ('planned', 'effective', 'cancelled')),
  -- Despesa/transferência: conta de origem. Receita: conta de destino.
  account_id         uuid,
  to_account_id      uuid,
  -- Quem pagou (despesa) ou recebeu (receita). null = saiu/entrou pela conta conjunta.
  paid_by            uuid,
  split_mode         text check (split_mode in ('equal', 'percent', 'custom', 'individual')),
  payment_method     text check (payment_method in
                       ('pix', 'debito', 'credito', 'dinheiro', 'boleto', 'transferencia', 'outro')),
  notes              text check (notes is null or char_length(notes) <= 500),
  bill_occurrence_id uuid,
  -- Idempotência: reenviar o mesmo formulário devolve a mesma transação.
  client_request_id  uuid not null,
  created_by         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id),
  updated_at         timestamptz not null default now(),
  cancelled_by       uuid references public.profiles (id),
  cancelled_at       timestamptz,
  cancel_reason      text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  unique (id, group_id),
  unique (group_id, client_request_id),
  foreign key (category_id, group_id) references public.categories (id, group_id),
  foreign key (account_id, group_id) references public.accounts (id, group_id),
  foreign key (to_account_id, group_id) references public.accounts (id, group_id),
  foreign key (group_id, paid_by) references public.group_members (group_id, user_id),
  foreign key (bill_occurrence_id, group_id) references public.bill_occurrences (id, group_id),
  -- Efetivada sempre tem data efetiva; prevista nunca tem.
  check (status = 'cancelled' or (status = 'effective') = (paid_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  -- Transferência: duas contas diferentes, sem categoria e sem rateio.
  check (kind <> 'transfer' or (account_id is not null and to_account_id is not null
                                and account_id <> to_account_id
                                and category_id is null and split_mode is null and paid_by is null)),
  check (kind = 'transfer' or to_account_id is null),
  -- Só despesa tem rateio.
  check ((kind = 'expense') = (split_mode is not null))
);

create index transactions_group_paid on public.transactions (group_id, paid_at);
create index transactions_group_competence on public.transactions (group_id, competence_date);
create index transactions_occurrence on public.transactions (bill_occurrence_id)
  where bill_occurrence_id is not null;
create index transactions_account on public.transactions (account_id);
create index transactions_to_account on public.transactions (to_account_id);

create table public.expense_splits (
  transaction_id uuid not null,
  group_id       uuid not null,
  user_id        uuid not null,
  share_cents    bigint not null check (share_cents >= 0),
  -- Percentual informado no modo 'percent' (apenas para exibição/auditoria).
  percent        numeric(7, 4) check (percent is null or percent between 0 and 100),
  primary key (transaction_id, user_id),
  foreign key (transaction_id, group_id) references public.transactions (id, group_id) on delete cascade,
  foreign key (group_id, user_id) references public.group_members (group_id, user_id)
);

create index expense_splits_group on public.expense_splits (group_id);
create index expense_splits_user on public.expense_splits (user_id);

-- Invariante: a soma das responsabilidades é EXATAMENTE o valor da despesa.
-- Checada no fim da transação SQL (constraint trigger adiada), para que a RPC
-- possa inserir a despesa e depois os rateios.
create or replace function private.check_split_sum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx     uuid;
  v_kind   text;
  v_status text;
  v_amount bigint;
  v_sum    bigint;
  v_count  integer;
begin
  if tg_table_name = 'transactions' then
    v_tx := new.id;
  else
    v_tx := coalesce(new.transaction_id, old.transaction_id);
  end if;

  select t.kind, t.status, t.amount_cents into v_kind, v_status, v_amount
  from public.transactions t where t.id = v_tx;
  if not found then
    return null;
  end if;

  select coalesce(sum(s.share_cents), 0), count(*) into v_sum, v_count
  from public.expense_splits s where s.transaction_id = v_tx;

  if v_kind = 'expense' and v_status <> 'cancelled' then
    if v_count = 0 or v_sum <> v_amount then
      raise exception using
        message = format('A soma do rateio (%s centavos) difere do valor da despesa (%s centavos).', v_sum, v_amount),
        errcode = '23514';
    end if;
  elsif v_kind <> 'expense' and v_count > 0 then
    raise exception using message = 'Só despesas podem ter rateio.', errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger expense_splits_sum
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function private.check_split_sum();

create constraint trigger transactions_split_sum
  after insert or update of amount_cents, kind, status on public.transactions
  deferrable initially deferred
  for each row execute function private.check_split_sum();

-- -----------------------------------------------------------------------------
-- Acertos entre participantes
-- -----------------------------------------------------------------------------
create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.financial_groups (id),
  from_user    uuid not null,  -- quem deve
  to_user      uuid not null,  -- quem recebe
  -- Dívida pendente no momento em que o acerto foi aberto (histórico).
  amount_cents bigint not null check (amount_cents > 0),
  paid_cents   bigint not null default 0 check (paid_cents >= 0),
  status       text not null default 'open' check (status in ('open', 'settled', 'cancelled')),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  settled_at   timestamptz,
  updated_at   timestamptz not null default now(),
  unique (id, group_id),
  check (from_user <> to_user),
  foreign key (group_id, from_user) references public.group_members (group_id, user_id),
  foreign key (group_id, to_user) references public.group_members (group_id, user_id)
);

create unique index settlements_one_open_per_pair
  on public.settlements (group_id, from_user, to_user) where status = 'open';
create trigger settlements_touch before update on public.settlements
  for each row execute function private.touch_updated_at();

create table public.settlement_payments (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.financial_groups (id),
  settlement_id     uuid not null,
  from_user         uuid not null,
  to_user           uuid not null,
  amount_cents      bigint not null check (amount_cents between 1 and 100000000000),
  paid_at           date not null,
  payment_method    text check (payment_method in
                      ('pix', 'debito', 'credito', 'dinheiro', 'boleto', 'transferencia', 'outro')),
  notes             text check (notes is null or char_length(notes) <= 500),
  client_request_id uuid not null,
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  cancelled_by      uuid references public.profiles (id),
  cancelled_at      timestamptz,
  unique (id, group_id),
  unique (group_id, client_request_id),
  check (from_user <> to_user),
  foreign key (settlement_id, group_id) references public.settlements (id, group_id),
  foreign key (group_id, from_user) references public.group_members (group_id, user_id),
  foreign key (group_id, to_user) references public.group_members (group_id, user_id)
);

create index settlement_payments_settlement on public.settlement_payments (settlement_id);

-- -----------------------------------------------------------------------------
-- Contribuições para metas
-- -----------------------------------------------------------------------------
create table public.goal_contributions (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.financial_groups (id),
  goal_id           uuid not null,
  -- Positivo = depósito na reserva; negativo = resgate.
  amount_cents      bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000000),
  contributed_at    date not null,
  member_id         uuid,
  from_account_id   uuid,
  -- Transferência real gerada quando a meta tem conta-reserva.
  transaction_id    uuid,
  notes             text check (notes is null or char_length(notes) <= 500),
  client_request_id uuid not null,
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  unique (id, group_id),
  unique (group_id, client_request_id),
  foreign key (goal_id, group_id) references public.savings_goals (id, group_id),
  foreign key (group_id, member_id) references public.group_members (group_id, user_id),
  foreign key (from_account_id, group_id) references public.accounts (id, group_id),
  foreign key (transaction_id, group_id) references public.transactions (id, group_id)
);

create index goal_contributions_goal on public.goal_contributions (goal_id);

-- -----------------------------------------------------------------------------
-- Orçamentos
-- -----------------------------------------------------------------------------
create table public.budgets (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.financial_groups (id),
  month            date not null check (extract(day from month) = 1),
  -- overall = limite geral de despesas; category = limite da categoria;
  -- savings = meta de economia do mês (receitas − despesas).
  kind             text not null check (kind in ('overall', 'category', 'savings')),
  category_id      uuid,
  -- null = o casal; preenchido = orçamento só das responsabilidades dessa pessoa.
  member_id        uuid,
  limit_cents      bigint not null check (limit_cents between 1 and 100000000000),
  alert_thresholds smallint[] not null default '{70,90,100}'
                   check (alert_thresholds <@ '{10,20,30,40,50,60,70,75,80,85,90,95,100}'::smallint[]),
  created_by       uuid not null default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((kind = 'category') = (category_id is not null)),
  foreign key (category_id, group_id) references public.categories (id, group_id),
  foreign key (group_id, member_id) references public.group_members (group_id, user_id)
);

create unique index budgets_unique
  on public.budgets (group_id, month, kind, category_id, member_id) nulls not distinct;
create trigger budgets_touch before update on public.budgets
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Anexos (metadados; o arquivo fica no bucket privado "comprovantes")
-- -----------------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.financial_groups (id),
  entity_type  text not null check (entity_type in
                 ('transaction', 'settlement_payment', 'bill_occurrence', 'goal_contribution')),
  entity_id    uuid not null,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 200),
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes   integer not null check (size_bytes between 1 and 5242880),
  uploaded_by  uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (split_part(storage_path, '/', 1) = group_id::text)
);

create index attachments_entity on public.attachments (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Histórico de atividades
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.financial_groups (id),
  actor_id   uuid references public.profiles (id),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_group on public.activity_logs (group_id, created_at desc);

-- Gatilho genérico: registra criação, alteração e cancelamento.
create or replace function private.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb := to_jsonb(new);
  v_old    jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_action text;
  v_id     uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
  elsif (v_row ->> 'status') is distinct from (v_old ->> 'status')
        and (v_row ->> 'status') in ('cancelled', 'removed') then
    v_action := 'cancel';
  elsif (v_row ? 'cancelled_at') and (v_old ->> 'cancelled_at') is null and (v_row ->> 'cancelled_at') is not null then
    v_action := 'cancel';
  else
    v_action := 'update';
  end if;

  v_id := case when v_row ? 'id' then (v_row ->> 'id')::uuid
               when v_row ? 'user_id' then (v_row ->> 'user_id')::uuid end;

  insert into public.activity_logs (group_id, actor_id, entity, entity_id, action, details)
  values (
    (v_row ->> 'group_id')::uuid,
    (select auth.uid()),
    tg_table_name,
    v_id,
    v_action,
    jsonb_strip_nulls(jsonb_build_object(
      'description', coalesce(v_row ->> 'description', v_row ->> 'name'),
      'kind', v_row ->> 'kind',
      'amount_cents', coalesce(v_row -> 'amount_cents', v_row -> 'limit_cents', v_row -> 'target_cents'),
      'status', v_row ->> 'status'
    ))
  );
  return null;
end;
$$;

create trigger log_transactions after insert or update on public.transactions
  for each row execute function private.log_activity();
create trigger log_accounts after insert or update on public.accounts
  for each row execute function private.log_activity();
create trigger log_categories after insert or update on public.categories
  for each row execute function private.log_activity();
create trigger log_bills after insert or update on public.bills
  for each row execute function private.log_activity();
create trigger log_settlement_payments after insert or update on public.settlement_payments
  for each row execute function private.log_activity();
create trigger log_budgets after insert or update on public.budgets
  for each row execute function private.log_activity();
create trigger log_savings_goals after insert or update on public.savings_goals
  for each row execute function private.log_activity();
create trigger log_goal_contributions after insert or update on public.goal_contributions
  for each row execute function private.log_activity();
create trigger log_group_members after insert or update on public.group_members
  for each row execute function private.log_activity();
