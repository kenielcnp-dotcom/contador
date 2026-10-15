-- =============================================================================
-- 0400 · Funções RPC (operações atômicas e validadas no banco)
-- =============================================================================
-- Todas as RPCs públicas:
--   * são SECURITY DEFINER com search_path vazio (tudo qualificado);
--   * descobrem a carteira pelo usuário logado (private.require_group) — nunca
--     confiam em um group_id vindo do cliente;
--   * aceitam client_request_id para que reenvios não dupliquem nada;
--   * levantam mensagens em português (errcode P0001) que o app mostra direto.

-- -----------------------------------------------------------------------------
-- Utilitários internos
-- -----------------------------------------------------------------------------
create or replace function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Lê um valor em centavos de um JSON. Aceita só inteiros positivos
-- (número ou texto). "12.5" é rejeitado: o cliente sempre envia centavos.
create or replace function private.cents(p_value jsonb, p_allow_zero boolean default false)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
  v_cents bigint;
begin
  if p_value is null or jsonb_typeof(p_value) not in ('number', 'string') then
    perform private.raise_error('Informe o valor.');
  end if;
  v_text := p_value #>> '{}';
  if v_text !~ '^[0-9]{1,12}$' then
    perform private.raise_error('Valor inválido.');
  end if;
  v_cents := v_text::bigint;
  if v_cents > 100000000000 then
    perform private.raise_error('Valor acima do limite permitido.');
  end if;
  if v_cents = 0 and not p_allow_zero then
    perform private.raise_error('O valor precisa ser maior que zero.');
  end if;
  return v_cents;
end;
$$;

create or replace function private.brl(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || translate(to_char(p_cents / 100.0, 'FM999,999,999,990.00'), ',.', '.,');
$$;

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform private.raise_error('Sessão expirada. Entre novamente.', '42501');
  end if;
  return v_uid;
end;
$$;

create or replace function private.seed_categories(p_group uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (group_id, name, kind, icon, is_default, created_by)
  select p_group, c.name, c.kind, c.icon, true, null
  from (values
    ('Moradia', 'expense', 'home'),
    ('Mercado', 'expense', 'shopping-cart'),
    ('Alimentação', 'expense', 'utensils'),
    ('Água', 'expense', 'droplet'),
    ('Energia', 'expense', 'zap'),
    ('Internet', 'expense', 'wifi'),
    ('Transporte', 'expense', 'bus'),
    ('Combustível', 'expense', 'fuel'),
    ('Saúde', 'expense', 'heart-pulse'),
    ('Educação', 'expense', 'graduation-cap'),
    ('Lazer', 'expense', 'party-popper'),
    ('Assinaturas', 'expense', 'repeat'),
    ('Compras', 'expense', 'shopping-bag'),
    ('Dívidas', 'expense', 'landmark'),
    ('Pets', 'expense', 'paw-print'),
    ('Outros', 'expense', 'ellipsis'),
    ('Salário', 'income', 'briefcase'),
    ('Trabalho autônomo', 'income', 'laptop'),
    ('Comissões', 'income', 'percent'),
    ('Vendas', 'income', 'tag'),
    ('Rendimentos', 'income', 'trending-up'),
    ('Outras receitas', 'income', 'plus-circle')
  ) as c (name, kind, icon)
  on conflict do nothing;
$$;

-- -----------------------------------------------------------------------------
-- Carteira, convites e membros
-- -----------------------------------------------------------------------------
create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_group uuid;
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 60 then
    perform private.raise_error('Dê um nome de 1 a 60 caracteres para a carteira.');
  end if;
  if exists (select 1 from public.group_members where user_id = v_uid and status = 'active') then
    perform private.raise_error('Você já participa de uma carteira.');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into public.financial_groups (name, owner_id) values (v_name, v_uid)
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role, share_percent)
  values (v_group, v_uid, 'owner', 100);

  perform private.seed_categories(v_group);
  return v_group;
end;
$$;

create or replace function public.create_invitation(p_valid_hours integer default 72)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group  uuid := private.require_group();
  v_uid    uuid := private.require_uid();
  v_token  text;
  v_max    smallint;
  v_active integer;
  v_id     uuid;
  v_exp    timestamptz;
begin
  if not private.is_owner(v_group) then
    perform private.raise_error('Só quem administra a carteira pode convidar.', '42501');
  end if;
  if p_valid_hours is null or p_valid_hours not between 1 and 168 then
    perform private.raise_error('A validade do convite deve ser de 1 a 168 horas.');
  end if;

  select g.max_members into v_max from public.financial_groups g where g.id = v_group for update;
  select count(*) into v_active from public.group_members m
  where m.group_id = v_group and m.status = 'active';
  if v_active >= v_max then
    perform private.raise_error('A carteira já tem o número máximo de participantes.');
  end if;

  -- Um convite pendente por vez: os anteriores deixam de valer.
  update public.group_invitations i set revoked_at = now()
  where i.group_id = v_group and i.accepted_at is null and i.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_exp := now() + make_interval(hours => p_valid_hours);

  insert into public.group_invitations (group_id, token_hash, created_by, expires_at)
  values (v_group, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid, v_exp)
  returning id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

-- Mostra para quem recebeu o link de qual carteira é o convite, sem aceitar.
create or replace function public.preview_invitation(p_token text)
returns table (status text, group_name text, invited_by text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_inv public.group_invitations;
  v_group public.financial_groups;
  v_active integer;
  v_inviter text;
begin
  select * into v_inv from public.group_invitations i
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return query select 'invalid'::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_group from public.financial_groups g where g.id = v_inv.group_id;
  select coalesce(nullif(p.full_name, ''), 'Seu parceiro(a)') into v_inviter
  from public.profiles p where p.id = v_inv.created_by;

  if v_inv.revoked_at is not null or v_group.status <> 'active' then
    return query select 'revoked'::text, null::text, null::text, null::timestamptz;
  elsif v_inv.accepted_at is not null then
    return query select (case when v_inv.accepted_by = v_uid then 'member' else 'used' end)::text,
      v_group.name, v_inviter, v_inv.expires_at;
  elsif v_inv.expires_at <= now() then
    return query select 'expired'::text, null::text, null::text, v_inv.expires_at;
  elsif exists (select 1 from public.group_members m
                where m.group_id = v_group.id and m.user_id = v_uid and m.status = 'active') then
    return query select 'member'::text, v_group.name, v_inviter, v_inv.expires_at;
  elsif exists (select 1 from public.group_members m where m.user_id = v_uid and m.status = 'active') then
    return query select 'other_group'::text, v_group.name, v_inviter, v_inv.expires_at;
  else
    select count(*) into v_active from public.group_members m
    where m.group_id = v_group.id and m.status = 'active';
    if v_active >= v_group.max_members then
      return query select 'full'::text, v_group.name, v_inviter, v_inv.expires_at;
    else
      return query select 'valid'::text, v_group.name, v_inviter, v_inv.expires_at;
    end if;
  end if;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_inv    public.group_invitations;
  v_group  public.financial_groups;
  v_active integer;
  v_share  numeric(5, 2);
begin
  -- Trava o convite: dois aceites simultâneos não passam juntos.
  select * into v_inv from public.group_invitations i
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found then
    perform private.raise_error('Convite inválido. Peça um novo link.');
  end if;
  if v_inv.revoked_at is not null then
    perform private.raise_error('Este convite foi cancelado. Peça um novo link.');
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_uid then
      return v_inv.group_id;  -- aceitar de novo é inofensivo
    end if;
    perform private.raise_error('Este convite já foi usado.');
  end if;
  if v_inv.expires_at <= now() then
    perform private.raise_error('Este convite expirou. Peça um novo link.');
  end if;

  select * into v_group from public.financial_groups g where g.id = v_inv.group_id for update;
  if v_group.status <> 'active' then
    perform private.raise_error('Esta carteira não está mais ativa.');
  end if;
  if exists (select 1 from public.group_members m where m.user_id = v_uid and m.status = 'active') then
    perform private.raise_error('Você já participa de uma carteira. Saia dela antes de aceitar outro convite.');
  end if;

  select count(*) into v_active from public.group_members m
  where m.group_id = v_group.id and m.status = 'active';
  if v_active >= v_group.max_members then
    perform private.raise_error('A carteira já tem o número máximo de participantes.');
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  -- Quem já foi membro e saiu volta pela mesma linha (o histórico é preservado).
  insert into public.group_members (group_id, user_id, role, status, share_percent)
  values (v_group.id, v_uid, 'member', 'active', 0)
  on conflict (group_id, user_id) do update
    set status = 'active', removed_at = null, role = 'member', joined_at = now();

  -- Divisão sugerida passa a ser igual entre os membros ativos.
  v_active := v_active + 1;
  v_share := round(100.0 / v_active, 2);
  update public.group_members m set share_percent = v_share
  where m.group_id = v_group.id and m.status = 'active';
  update public.group_members m set share_percent = 100 - v_share * (v_active - 1)
  where m.group_id = v_group.id and m.status = 'active' and m.role = 'owner';

  update public.group_invitations i set accepted_by = v_uid, accepted_at = now()
  where i.id = v_inv.id;

  return v_group.id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
begin
  if not private.is_owner(v_group) then
    perform private.raise_error('Só quem administra a carteira pode cancelar convites.', '42501');
  end if;
  update public.group_invitations i set revoked_at = now()
  where i.id = p_invitation and i.group_id = v_group
    and i.accepted_at is null and i.revoked_at is null;
end;
$$;

-- Remove um participante (administrador) ou sai da carteira (o próprio usuário).
-- Nada financeiro é apagado: a pessoa só perde o acesso.
create or replace function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group  uuid := private.require_group();
  v_uid    uuid := private.require_uid();
  v_target public.group_members;
  v_others integer;
begin
  select * into v_target from public.group_members m
  where m.group_id = v_group and m.user_id = p_user and m.status = 'active'
  for update;
  if not found then
    perform private.raise_error('Participante não encontrado.');
  end if;

  select count(*) into v_others from public.group_members m
  where m.group_id = v_group and m.status = 'active' and m.user_id <> p_user;

  if p_user = v_uid then
    if v_target.role = 'owner' and v_others > 0 then
      perform private.raise_error('Você administra a carteira. Remova o outro participante antes de sair.');
    end if;
  elsif not private.is_owner(v_group) then
    perform private.raise_error('Só quem administra a carteira pode remover participantes.', '42501');
  end if;

  update public.group_members m set status = 'removed', removed_at = now()
  where m.group_id = v_group and m.user_id = p_user;

  if v_others = 0 then
    update public.financial_groups g set status = 'archived' where g.id = v_group;
  else
    -- Quem fica passa a responder por 100% da divisão sugerida.
    update public.group_members m set share_percent = round(100.0 / v_others, 2)
    where m.group_id = v_group and m.status = 'active';
  end if;

  update public.group_invitations i set revoked_at = now()
  where i.group_id = v_group and i.accepted_at is null and i.revoked_at is null;
end;
$$;

-- Percentual sugerido de cada pessoa ({"<user_id>": 60, ...}); soma 100.
create or replace function public.update_member_shares(p_shares jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_sum   numeric := 0;
  v_count integer := 0;
  v_m     record;
  v_val   numeric;
begin
  if not private.is_owner(v_group) then
    perform private.raise_error('Só quem administra a carteira pode mudar a divisão.', '42501');
  end if;
  for v_m in select user_id from public.group_members where group_id = v_group and status = 'active' loop
    if not (p_shares ? v_m.user_id::text) then
      perform private.raise_error('Informe o percentual de todos os participantes.');
    end if;
    v_val := (p_shares ->> v_m.user_id::text)::numeric;
    if v_val < 0 or v_val > 100 or v_val <> round(v_val, 2) then
      perform private.raise_error('Percentual inválido.');
    end if;
    v_sum := v_sum + v_val;
    v_count := v_count + 1;
  end loop;
  if v_sum <> 100 then
    perform private.raise_error('Os percentuais precisam somar 100%.');
  end if;
  update public.group_members m set share_percent = (p_shares ->> m.user_id::text)::numeric
  where m.group_id = v_group and m.status = 'active';
end;
$$;

-- -----------------------------------------------------------------------------
-- Movimentações
-- -----------------------------------------------------------------------------
create or replace function private.refresh_occurrence(p_occurrence uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bill_occurrences o set
    paid_cents = s.total,
    status = case
      when o.status = 'cancelled' then 'cancelled'
      when s.total >= o.amount_cents then 'paid'
      when s.total > 0 then 'partial'
      else 'pending' end,
    paid_at = case when s.total >= o.amount_cents then s.last_paid else null end
  from (
    select coalesce(sum(t.amount_cents), 0)::bigint as total, max(t.paid_at) as last_paid
    from public.transactions t
    where t.bill_occurrence_id = p_occurrence and t.status = 'effective'
  ) s
  where o.id = p_occurrence;
end;
$$;

-- Núcleo de criação/edição de movimentação. Chamado por save_transaction e
-- pelas RPCs de pagamento de conta e contribuição de meta.
create or replace function private.upsert_transaction(
  p jsonb, p_group uuid, p_uid uuid, p_internal boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id         uuid := nullif(p ->> 'id', '')::uuid;
  v_req        uuid := nullif(p ->> 'client_request_id', '')::uuid;
  v_kind       text := p ->> 'kind';
  v_desc       text := btrim(coalesce(p ->> 'description', ''));
  v_amount     bigint;
  v_category   uuid := nullif(p ->> 'category_id', '')::uuid;
  v_competence date := nullif(p ->> 'competence_date', '')::date;
  v_paid_at    date := nullif(p ->> 'paid_at', '')::date;
  v_status     text := coalesce(nullif(p ->> 'status', ''), 'effective');
  v_account    uuid := nullif(p ->> 'account_id', '')::uuid;
  v_to_account uuid := nullif(p ->> 'to_account_id', '')::uuid;
  v_paid_by    uuid := nullif(p ->> 'paid_by', '')::uuid;
  v_split_mode text := nullif(p ->> 'split_mode', '');
  v_method     text := nullif(p ->> 'payment_method', '');
  v_notes      text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_occurrence uuid := case when p_internal then nullif(p ->> 'bill_occurrence_id', '')::uuid end;
  v_splits     jsonb := coalesce(p -> 'splits', '[]'::jsonb);
  v_old        public.transactions;
  v_cat        public.categories;
  v_acc        public.accounts;
  v_split      jsonb;
  v_user       uuid;
  v_share      bigint;
  v_sum        bigint := 0;
  v_pct_sum    numeric := 0;
  v_count      integer := 0;
  v_min        bigint;
  v_max        bigint;
  v_seen       uuid[] := '{}';
begin
  if v_req is null then
    perform private.raise_error('Requisição sem identificador. Recarregue a página.');
  end if;

  if v_id is null then
    -- Reenvio do mesmo formulário: devolve o que já foi gravado.
    select t.id into v_id from public.transactions t
    where t.group_id = p_group and t.client_request_id = v_req;
    if found then
      return v_id;
    end if;
  else
    select * into v_old from public.transactions t
    where t.id = v_id and t.group_id = p_group
    for update;
    if not found then
      perform private.raise_error('Movimentação não encontrada.');
    end if;
    if v_old.status = 'cancelled' then
      perform private.raise_error('Movimentação cancelada não pode ser editada.');
    end if;
    if not p_internal and exists (
      select 1 from public.goal_contributions c
      where c.transaction_id = v_id and c.cancelled_at is null) then
      perform private.raise_error('Esta transferência pertence a uma meta. Altere pela tela de Metas.');
    end if;
    v_occurrence := v_old.bill_occurrence_id;
    if v_occurrence is not null and v_kind is distinct from v_old.kind then
      perform private.raise_error('Não é possível mudar o tipo de um pagamento de conta.');
    end if;
    if v_occurrence is not null and v_status <> 'effective' then
      perform private.raise_error('Pagamento de conta não pode voltar a ser previsto. Cancele-o, se for o caso.');
    end if;
  end if;

  -- Tipo, descrição, valor e datas --------------------------------------------
  if v_kind is null or v_kind not in ('income', 'expense', 'transfer') then
    perform private.raise_error('Escolha receita, despesa ou transferência.');
  end if;
  if char_length(v_desc) not between 1 and 120 then
    perform private.raise_error('Informe uma descrição de até 120 caracteres.');
  end if;
  v_amount := private.cents(p -> 'amount_cents');
  if v_competence is null then
    perform private.raise_error('Informe a data.');
  end if;
  if v_status not in ('planned', 'effective') then
    perform private.raise_error('Situação inválida.');
  end if;
  if v_status = 'effective' then
    v_paid_at := coalesce(v_paid_at, v_competence);
    if v_paid_at > private.today() then
      perform private.raise_error('A data de pagamento não pode estar no futuro. Use a situação "Prevista".');
    end if;
  else
    v_paid_at := null;
  end if;
  if v_method is not null and v_method not in
     ('pix', 'debito', 'credito', 'dinheiro', 'boleto', 'transferencia', 'outro') then
    perform private.raise_error('Método de pagamento inválido.');
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    perform private.raise_error('As observações podem ter até 500 caracteres.');
  end if;

  -- Contas --------------------------------------------------------------------
  if v_account is not null then
    select * into v_acc from public.accounts a where a.id = v_account and a.group_id = p_group;
    if not found then
      perform private.raise_error('Conta não encontrada.');
    end if;
    if v_acc.archived_at is not null and v_account is distinct from v_old.account_id then
      perform private.raise_error('Esta conta está arquivada.');
    end if;
  end if;

  if v_kind = 'transfer' then
    if v_account is null or v_to_account is null then
      perform private.raise_error('Escolha a conta de origem e a de destino.');
    end if;
    if v_account = v_to_account then
      perform private.raise_error('A conta de origem e a de destino precisam ser diferentes.');
    end if;
    if not exists (select 1 from public.accounts a where a.id = v_to_account and a.group_id = p_group
                   and (a.archived_at is null or v_to_account = v_old.to_account_id)) then
      perform private.raise_error('Conta de destino não encontrada.');
    end if;
    v_category := null;
    v_paid_by := null;
    v_split_mode := null;
    v_splits := '[]'::jsonb;
  else
    v_to_account := null;

    -- Categoria do mesmo tipo e da mesma carteira.
    if v_category is null then
      perform private.raise_error('Escolha uma categoria.');
    end if;
    select * into v_cat from public.categories c where c.id = v_category and c.group_id = p_group;
    if not found or v_cat.kind <> v_kind then
      perform private.raise_error('Categoria inválida para este tipo de movimentação.');
    end if;
    if v_cat.archived_at is not null and v_category is distinct from v_old.category_id then
      perform private.raise_error('Esta categoria está arquivada.');
    end if;

    -- Responsável: participante da carteira, ou a conta conjunta.
    if v_paid_by is not null then
      if not exists (select 1 from public.group_members m
                     where m.group_id = p_group and m.user_id = v_paid_by
                       and (m.status = 'active' or v_paid_by = v_old.paid_by)) then
        perform private.raise_error('O responsável precisa ser participante da carteira.');
      end if;
    elsif v_account is null or v_acc.owner_id is not null then
      perform private.raise_error(case when v_kind = 'expense'
        then 'Informe quem pagou (ou escolha uma conta conjunta).'
        else 'Informe quem recebeu (ou escolha uma conta conjunta).' end);
    end if;

    if v_kind = 'income' then
      v_split_mode := null;
      v_splits := '[]'::jsonb;
    else
      -- Rateio ---------------------------------------------------------------
      if v_split_mode is null or v_split_mode not in ('equal', 'percent', 'custom', 'individual') then
        perform private.raise_error('Escolha como dividir a despesa.');
      end if;
      if jsonb_typeof(v_splits) <> 'array' or jsonb_array_length(v_splits) = 0 then
        perform private.raise_error('Indique quem participa da despesa.');
      end if;
      for v_split in select * from jsonb_array_elements(v_splits) loop
        v_user := nullif(v_split ->> 'user_id', '')::uuid;
        if v_user is null or v_user = any (v_seen) then
          perform private.raise_error('Participante repetido ou ausente no rateio.');
        end if;
        if not exists (select 1 from public.group_members m
                       where m.group_id = p_group and m.user_id = v_user
                         and (m.status = 'active' or exists (
                           select 1 from public.expense_splits s
                           where s.transaction_id = v_id and s.user_id = v_user))) then
          perform private.raise_error('Todos do rateio precisam ser participantes da carteira.');
        end if;
        v_share := private.cents(v_split -> 'share_cents', true);
        v_seen := v_seen || v_user;
        v_sum := v_sum + v_share;
        v_count := v_count + 1;
        v_min := least(coalesce(v_min, v_share), v_share);
        v_max := greatest(coalesce(v_max, v_share), v_share);
        if v_split_mode = 'percent' then
          if (v_split ->> 'percent') is null then
            perform private.raise_error('Informe o percentual de cada participante.');
          end if;
          v_pct_sum := v_pct_sum + (v_split ->> 'percent')::numeric;
        end if;
      end loop;

      if v_sum <> v_amount then
        perform private.raise_error(format('A soma do rateio (%s) precisa ser igual ao valor (%s).',
          private.brl(v_sum), private.brl(v_amount)));
      end if;
      if v_split_mode = 'individual' and v_count <> 1 then
        perform private.raise_error('Despesa individual tem exatamente um responsável.');
      end if;
      if v_split_mode = 'equal' and v_max - v_min > 1 then
        perform private.raise_error('Na divisão igualitária as partes diferem no máximo em 1 centavo.');
      end if;
      if v_split_mode = 'percent' and v_pct_sum <> 100 then
        perform private.raise_error('Os percentuais do rateio precisam somar 100%.');
      end if;
    end if;
  end if;

  -- Gravação ------------------------------------------------------------------
  if v_old.id is null then
    insert into public.transactions (
      group_id, kind, description, amount_cents, category_id, competence_date, paid_at,
      status, account_id, to_account_id, paid_by, split_mode, payment_method, notes,
      bill_occurrence_id, client_request_id, created_by)
    values (
      p_group, v_kind, v_desc, v_amount, v_category, v_competence, v_paid_at,
      v_status, v_account, v_to_account, v_paid_by, v_split_mode, v_method, v_notes,
      v_occurrence, v_req, p_uid)
    returning id into v_id;
  else
    update public.transactions t set
      kind = v_kind, description = v_desc, amount_cents = v_amount, category_id = v_category,
      competence_date = v_competence, paid_at = v_paid_at, status = v_status,
      account_id = v_account, to_account_id = v_to_account, paid_by = v_paid_by,
      split_mode = v_split_mode, payment_method = v_method, notes = v_notes,
      updated_by = p_uid, updated_at = now()
    where t.id = v_id;
    delete from public.expense_splits s where s.transaction_id = v_id;
  end if;

  insert into public.expense_splits (transaction_id, group_id, user_id, share_cents, percent)
  select v_id, p_group, (e ->> 'user_id')::uuid, (e ->> 'share_cents')::bigint,
         case when v_split_mode = 'percent' then (e ->> 'percent')::numeric end
  from jsonb_array_elements(v_splits) e;

  if v_occurrence is not null then
    perform private.refresh_occurrence(v_occurrence);
  end if;
  return v_id;
end;
$$;

create or replace function public.save_transaction(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- O vínculo com conta a pagar só é criado por pay_bill_occurrence.
  return private.upsert_transaction(p - 'bill_occurrence_id', private.require_group(), private.require_uid(), false);
end;
$$;

create or replace function public.cancel_transaction(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_uid   uuid := private.require_uid();
  v_tx    public.transactions;
begin
  select * into v_tx from public.transactions t
  where t.id = p_id and t.group_id = v_group
  for update;
  if not found then
    perform private.raise_error('Movimentação não encontrada.');
  end if;
  if v_tx.status = 'cancelled' then
    return;  -- repetir o cancelamento não muda nada
  end if;
  if exists (select 1 from public.goal_contributions c
             where c.transaction_id = p_id and c.cancelled_at is null) then
    perform private.raise_error('Esta transferência pertence a uma meta. Cancele a contribuição pela tela de Metas.');
  end if;

  update public.transactions t set
    status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
    cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 200),
    updated_by = v_uid, updated_at = now()
  where t.id = p_id;

  if v_tx.bill_occurrence_id is not null then
    perform private.refresh_occurrence(v_tx.bill_occurrence_id);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contas a pagar e a receber
-- -----------------------------------------------------------------------------
create or replace function private.generate_occurrences(p_bill public.bills, p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_i    integer := 0;
  v_rows integer;
  v_new  integer := 0;
begin
  if not p_bill.active then
    return 0;
  end if;
  loop
    v_date := case p_bill.recurrence
      when 'none' then p_bill.start_date
      when 'weekly' then p_bill.start_date + 7 * v_i
      -- Soma a partir da data inicial (não encadeada): 31/01 → 28/02 → 31/03.
      when 'monthly' then (p_bill.start_date + make_interval(months => v_i))::date
      when 'yearly' then (p_bill.start_date + make_interval(years => v_i))::date
    end;
    exit when v_i > 0 and p_bill.recurrence = 'none';
    exit when v_date > p_until and v_i > 0;
    exit when p_bill.end_date is not null and v_date > p_bill.end_date;
    exit when v_i >= 400;

    insert into public.bill_occurrences (group_id, bill_id, scheduled_date, due_date, amount_cents)
    values (p_bill.group_id, p_bill.id, v_date, v_date, p_bill.amount_cents)
    on conflict (bill_id, scheduled_date) do nothing;
    get diagnostics v_rows = row_count;
    v_new := v_new + v_rows;
    v_i := v_i + 1;
  end loop;
  return v_new;
end;
$$;

create or replace function public.save_bill(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group      uuid := private.require_group();
  v_id         uuid := nullif(p ->> 'id', '')::uuid;
  v_kind       text := coalesce(nullif(p ->> 'kind', ''), 'payable');
  v_desc       text := btrim(coalesce(p ->> 'description', ''));
  v_amount     bigint := private.cents(p -> 'amount_cents');
  v_category   uuid := nullif(p ->> 'category_id', '')::uuid;
  v_account    uuid := nullif(p ->> 'account_id', '')::uuid;
  v_resp       uuid := nullif(p ->> 'responsible_id', '')::uuid;
  v_recurrence text := coalesce(nullif(p ->> 'recurrence', ''), 'none');
  v_start      date := nullif(p ->> 'start_date', '')::date;
  v_end        date := nullif(p ->> 'end_date', '')::date;
  v_split      text := coalesce(nullif(p ->> 'split_mode', ''), 'equal');
  v_notes      text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_active     boolean := coalesce((p ->> 'active')::boolean, true);
  v_bill       public.bills;
  v_today      date := private.today();
begin
  if v_kind not in ('payable', 'receivable') then
    perform private.raise_error('Tipo de conta inválido.');
  end if;
  if char_length(v_desc) not between 1 and 120 then
    perform private.raise_error('Informe uma descrição de até 120 caracteres.');
  end if;
  if v_start is null then
    perform private.raise_error('Informe o vencimento.');
  end if;
  if v_end is not null and v_end < v_start then
    perform private.raise_error('A data final não pode ser anterior ao primeiro vencimento.');
  end if;
  if v_recurrence not in ('none', 'weekly', 'monthly', 'yearly') then
    perform private.raise_error('Recorrência inválida.');
  end if;
  if v_split not in ('equal', 'percent', 'individual') then
    perform private.raise_error('Divisão inválida.');
  end if;
  if v_category is null or not exists (
    select 1 from public.categories c where c.id = v_category and c.group_id = v_group
      and c.kind = case when v_kind = 'payable' then 'expense' else 'income' end) then
    perform private.raise_error('Escolha uma categoria válida.');
  end if;
  if v_account is not null and not exists (
    select 1 from public.accounts a where a.id = v_account and a.group_id = v_group) then
    perform private.raise_error('Conta não encontrada.');
  end if;
  if v_resp is not null and not exists (
    select 1 from public.group_members m where m.group_id = v_group and m.user_id = v_resp) then
    perform private.raise_error('O responsável precisa ser participante da carteira.');
  end if;

  if v_id is null then
    insert into public.bills (group_id, kind, description, amount_cents, category_id, account_id,
      responsible_id, recurrence, start_date, end_date, split_mode, notes, active, created_by)
    values (v_group, v_kind, v_desc, v_amount, v_category, v_account,
      v_resp, v_recurrence, v_start, v_end, v_split, v_notes, v_active, private.require_uid())
    returning * into v_bill;
  else
    update public.bills b set kind = v_kind, description = v_desc, amount_cents = v_amount,
      category_id = v_category, account_id = v_account, responsible_id = v_resp,
      recurrence = v_recurrence, start_date = v_start, end_date = v_end, split_mode = v_split,
      notes = v_notes, active = v_active
    where b.id = v_id and b.group_id = v_group
    returning * into v_bill;
    if not found then
      perform private.raise_error('Conta não encontrada.');
    end if;
    -- Ocorrências futuras ainda não pagas seguem a nova definição; o passado e o
    -- que já tem pagamento ficam como estão.
    delete from public.bill_occurrences o
    where o.bill_id = v_bill.id and o.status = 'pending' and o.paid_cents = 0
      and o.due_date >= v_today
      and not exists (select 1 from public.transactions t where t.bill_occurrence_id = o.id)
      and not exists (select 1 from public.attachments at
                      where at.entity_type = 'bill_occurrence' and at.entity_id = o.id);
  end if;

  perform private.generate_occurrences(v_bill, greatest(v_today, v_start) + 62);
  return v_bill.id;
end;
$$;

create or replace function public.generate_bill_occurrences(p_until date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_until date := coalesce(p_until, private.today() + 62);
  v_bill  public.bills;
  v_total integer := 0;
begin
  if v_until > private.today() + 400 then
    perform private.raise_error('Período muito longo para gerar ocorrências.');
  end if;
  for v_bill in select * from public.bills b where b.group_id = v_group and b.active loop
    v_total := v_total + private.generate_occurrences(v_bill, v_until);
  end loop;
  return v_total;
end;
$$;

-- Efetiva (total ou parcialmente) uma ocorrência. Atômico e idempotente:
-- trava a ocorrência, recusa valor acima do pendente e devolve a mesma
-- transação se o client_request_id se repetir.
create or replace function public.pay_bill_occurrence(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group  uuid := private.require_group();
  v_uid    uuid := private.require_uid();
  v_req    uuid := nullif(p ->> 'client_request_id', '')::uuid;
  v_occ    public.bill_occurrences;
  v_bill   public.bills;
  v_amount bigint;
  v_left   bigint;
  v_id     uuid;
begin
  if v_req is null then
    perform private.raise_error('Requisição sem identificador. Recarregue a página.');
  end if;

  select * into v_occ from public.bill_occurrences o
  where o.id = nullif(p ->> 'occurrence_id', '')::uuid and o.group_id = v_group
  for update;
  if not found then
    perform private.raise_error('Conta não encontrada.');
  end if;

  select t.id into v_id from public.transactions t
  where t.group_id = v_group and t.client_request_id = v_req;
  if found then
    return v_id;
  end if;

  if v_occ.status = 'cancelled' then
    perform private.raise_error('Esta conta foi cancelada.');
  end if;
  if v_occ.status = 'paid' then
    perform private.raise_error('Esta conta já está paga.');
  end if;

  select * into v_bill from public.bills b where b.id = v_occ.bill_id;
  v_left := v_occ.amount_cents - v_occ.paid_cents;
  v_amount := case when p ? 'amount_cents' then private.cents(p -> 'amount_cents') else v_left end;
  if v_amount > v_left then
    perform private.raise_error(format('O valor é maior que o pendente desta conta (%s).', private.brl(v_left)));
  end if;

  return private.upsert_transaction(jsonb_build_object(
    'client_request_id', v_req,
    'kind', case when v_bill.kind = 'payable' then 'expense' else 'income' end,
    'description', v_bill.description,
    'amount_cents', v_amount,
    'category_id', v_bill.category_id,
    'competence_date', v_occ.due_date,
    'paid_at', coalesce(nullif(p ->> 'paid_at', ''), private.today()::text),
    'status', 'effective',
    'account_id', coalesce(nullif(p ->> 'account_id', ''), v_bill.account_id::text),
    'paid_by', case when p ? 'paid_by' then p -> 'paid_by' else to_jsonb(v_bill.responsible_id) end,
    'split_mode', case when v_bill.kind = 'payable'
                       then coalesce(nullif(p ->> 'split_mode', ''), v_bill.split_mode) end,
    'splits', coalesce(p -> 'splits', '[]'::jsonb),
    'payment_method', p -> 'payment_method',
    'notes', p -> 'notes',
    'bill_occurrence_id', v_occ.id
  ), v_group, v_uid, true);
end;
$$;

create or replace function public.cancel_bill_occurrence(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_occ   public.bill_occurrences;
begin
  select * into v_occ from public.bill_occurrences o
  where o.id = p_id and o.group_id = v_group
  for update;
  if not found then
    perform private.raise_error('Conta não encontrada.');
  end if;
  if v_occ.paid_cents > 0 then
    perform private.raise_error('Há pagamentos registrados nesta conta. Cancele-os antes.');
  end if;
  update public.bill_occurrences o set status = 'cancelled' where o.id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Saldos (fonte única: o app inteiro lê saldos destas funções)
-- -----------------------------------------------------------------------------
-- Saldo de uma conta = saldo inicial confirmado + movimentações EFETIVAS a
-- partir da data do saldo inicial. Previstas e canceladas não entram.
create or replace function private.account_balances(p_group uuid, p_as_of date)
returns table (
  account_id uuid, name text, kind text, owner_id uuid,
  opening_balance_cents bigint, opening_missing boolean, archived boolean, balance_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id, a.name, a.kind, a.owner_id, a.opening_balance_cents,
    a.opening_balance_cents is null,
    a.archived_at is not null,
    (coalesce(a.opening_balance_cents, 0) + coalesce(sum(
      case
        when t.kind = 'income' and t.account_id = a.id then t.amount_cents
        when t.kind = 'expense' and t.account_id = a.id then -t.amount_cents
        when t.kind = 'transfer' and t.account_id = a.id then -t.amount_cents
        when t.kind = 'transfer' and t.to_account_id = a.id then t.amount_cents
        else 0
      end), 0))::bigint
  from public.accounts a
  left join public.transactions t
    on t.group_id = a.group_id
   and t.status = 'effective'
   and (t.account_id = a.id or t.to_account_id = a.id)
   and (a.opening_balance_date is null or t.paid_at >= a.opening_balance_date)
   and (p_as_of is null or t.paid_at <= p_as_of)
  where a.group_id = p_group
    and (p_as_of is null or a.opening_balance_date is null or a.opening_balance_date <= p_as_of)
  group by a.id;
$$;

create or replace function public.get_account_balances()
returns table (
  account_id uuid, name text, kind text, owner_id uuid,
  opening_balance_cents bigint, opening_missing boolean, archived boolean, balance_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.account_balances(private.require_group(), null);
$$;

-- Saldo total das contas no fim de cada mês do intervalo (gráfico de evolução).
create or replace function public.get_balance_series(p_from date, p_to date)
returns table (month date, balance_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    perform private.raise_error('Período inválido.');
  end if;
  return query
  select m::date, coalesce((
      select sum(b.balance_cents)
      from private.account_balances(v_group, least((m + interval '1 month' - interval '1 day')::date, private.today())) b
      where not b.archived), 0)::bigint
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m;
end;
$$;

-- Dívida entre pessoas. Para cada pessoa:
--   pago     = despesas efetivas pagas por ela (pagas pela conta conjunta ficam de fora)
--   parte    = soma das responsabilidades dela nessas mesmas despesas
--   enviado  = acertos que ela pagou;  recebido = acertos que ela recebeu
--   líquido  = pago − parte + enviado − recebido   (>0: tem a receber; <0: deve)
-- p_include_planned = true soma também as despesas previstas (modo "previsão").
create or replace function private.member_nets(p_group uuid, p_include_planned boolean)
returns table (
  user_id uuid, paid_cents bigint, share_cents bigint,
  sent_cents bigint, received_cents bigint, net_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with tx as (
    select t.id, t.paid_by, t.amount_cents
    from public.transactions t
    where t.group_id = p_group and t.kind = 'expense' and t.paid_by is not null
      and (t.status = 'effective' or (p_include_planned and t.status = 'planned'))
  ),
  paid as (select tx.paid_by as uid, sum(tx.amount_cents) as v from tx group by tx.paid_by),
  share as (
    select s.user_id as uid, sum(s.share_cents) as v
    from public.expense_splits s join tx on tx.id = s.transaction_id
    group by s.user_id
  ),
  sent as (
    select sp.from_user as uid, sum(sp.amount_cents) as v from public.settlement_payments sp
    where sp.group_id = p_group and sp.cancelled_at is null group by sp.from_user
  ),
  recv as (
    select sp.to_user as uid, sum(sp.amount_cents) as v from public.settlement_payments sp
    where sp.group_id = p_group and sp.cancelled_at is null group by sp.to_user
  )
  select m.user_id,
    coalesce(paid.v, 0)::bigint, coalesce(share.v, 0)::bigint,
    coalesce(sent.v, 0)::bigint, coalesce(recv.v, 0)::bigint,
    (coalesce(paid.v, 0) - coalesce(share.v, 0) + coalesce(sent.v, 0) - coalesce(recv.v, 0))::bigint
  from public.group_members m
  left join paid on paid.uid = m.user_id
  left join share on share.uid = m.user_id
  left join sent on sent.uid = m.user_id
  left join recv on recv.uid = m.user_id
  where m.group_id = p_group;
$$;

create or replace function public.get_member_balances(p_include_planned boolean default false)
returns table (
  user_id uuid, full_name text, member_status text,
  paid_cents bigint, share_cents bigint, sent_cents bigint, received_cents bigint, net_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select n.user_id, p.full_name, m.status,
         n.paid_cents, n.share_cents, n.sent_cents, n.received_cents, n.net_cents
  from private.member_nets(private.require_group(), coalesce(p_include_planned, false)) n
  join public.group_members m on m.group_id = private.my_group() and m.user_id = n.user_id
  join public.profiles p on p.id = n.user_id;
$$;

-- -----------------------------------------------------------------------------
-- Acertos entre o casal
-- -----------------------------------------------------------------------------
create or replace function public.register_settlement_payment(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group   uuid := private.require_group();
  v_uid     uuid := private.require_uid();
  v_req     uuid := nullif(p ->> 'client_request_id', '')::uuid;
  v_from    uuid := nullif(p ->> 'from_user', '')::uuid;
  v_to      uuid := nullif(p ->> 'to_user', '')::uuid;
  v_amount  bigint;
  v_paid_at date := coalesce(nullif(p ->> 'paid_at', '')::date, private.today());
  v_method  text := nullif(p ->> 'payment_method', '');
  v_notes   text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_net_from bigint;
  v_net_to  bigint;
  v_debt    bigint;
  v_set     public.settlements;
  v_id      uuid;
begin
  if v_req is null then
    perform private.raise_error('Requisição sem identificador. Recarregue a página.');
  end if;

  -- Serializa os acertos da carteira: dois pagamentos simultâneos não podem
  -- ambos passar na checagem de saldo devido.
  perform 1 from public.financial_groups g where g.id = v_group for update;

  select sp.id into v_id from public.settlement_payments sp
  where sp.group_id = v_group and sp.client_request_id = v_req;
  if found then
    return v_id;
  end if;

  if v_from is null or v_to is null or v_from = v_to then
    perform private.raise_error('Escolha quem paga e quem recebe.');
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = v_group and m.user_id = v_from)
     or not exists (select 1 from public.group_members m where m.group_id = v_group and m.user_id = v_to) then
    perform private.raise_error('Os dois precisam ser participantes da carteira.');
  end if;
  v_amount := private.cents(p -> 'amount_cents');
  if v_paid_at > private.today() then
    perform private.raise_error('A data do acerto não pode estar no futuro.');
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    perform private.raise_error('As observações podem ter até 500 caracteres.');
  end if;

  select n.net_cents into v_net_from from private.member_nets(v_group, false) n where n.user_id = v_from;
  select n.net_cents into v_net_to from private.member_nets(v_group, false) n where n.user_id = v_to;
  v_debt := greatest(0, least(-v_net_from, v_net_to));

  if v_debt = 0 then
    perform private.raise_error('Não há valor pendente nesse sentido.');
  end if;
  if v_amount > v_debt then
    perform private.raise_error(format('O valor é maior que o pendente (%s).', private.brl(v_debt)));
  end if;

  -- Acerto aberto no sentido contrário sem dívida correspondente fica encerrado.
  update public.settlements s set status = 'settled', settled_at = now()
  where s.group_id = v_group and s.from_user = v_to and s.to_user = v_from and s.status = 'open';

  select * into v_set from public.settlements s
  where s.group_id = v_group and s.from_user = v_from and s.to_user = v_to and s.status = 'open'
  for update;
  if not found then
    insert into public.settlements (group_id, from_user, to_user, amount_cents, created_by)
    values (v_group, v_from, v_to, v_debt, v_uid)
    returning * into v_set;
  elsif v_set.amount_cents <> v_set.paid_cents + v_debt then
    -- A dívida mudou desde a abertura (novas despesas): o acerto acompanha.
    update public.settlements s set amount_cents = v_set.paid_cents + v_debt
    where s.id = v_set.id;
  end if;

  insert into public.settlement_payments (group_id, settlement_id, from_user, to_user, amount_cents,
    paid_at, payment_method, notes, client_request_id, created_by)
  values (v_group, v_set.id, v_from, v_to, v_amount, v_paid_at, v_method, v_notes, v_req, v_uid)
  returning id into v_id;

  update public.settlements s set
    paid_cents = s.paid_cents + v_amount,
    status = case when v_amount = v_debt then 'settled' else 'open' end,
    settled_at = case when v_amount = v_debt then now() end
  where s.id = v_set.id;

  return v_id;
end;
$$;

create or replace function public.cancel_settlement_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_uid   uuid := private.require_uid();
  v_pay   public.settlement_payments;
  v_set   public.settlements;
begin
  perform 1 from public.financial_groups g where g.id = v_group for update;
  select * into v_pay from public.settlement_payments sp
  where sp.id = p_id and sp.group_id = v_group for update;
  if not found then
    perform private.raise_error('Pagamento não encontrado.');
  end if;
  if v_pay.cancelled_at is not null then
    return;
  end if;

  update public.settlement_payments sp set cancelled_at = now(), cancelled_by = v_uid where sp.id = p_id;

  select * into v_set from public.settlements s where s.id = v_pay.settlement_id for update;
  update public.settlements s set
    paid_cents = greatest(0, s.paid_cents - v_pay.amount_cents),
    status = case
      when s.status = 'settled' and not exists (
        select 1 from public.settlements o
        where o.group_id = s.group_id and o.from_user = s.from_user and o.to_user = s.to_user
          and o.status = 'open' and o.id <> s.id)
      then 'open' else s.status end,
    settled_at = null
  where s.id = v_set.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Metas
-- -----------------------------------------------------------------------------
create or replace function public.contribute_goal(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group   uuid := private.require_group();
  v_uid     uuid := private.require_uid();
  v_req     uuid := nullif(p ->> 'client_request_id', '')::uuid;
  v_dir     text := coalesce(nullif(p ->> 'direction', ''), 'deposit');
  v_amount  bigint;
  v_date    date := coalesce(nullif(p ->> 'contributed_at', '')::date, private.today());
  v_member  uuid := nullif(p ->> 'member_id', '')::uuid;
  v_from    uuid := nullif(p ->> 'from_account_id', '')::uuid;
  v_notes   text := nullif(btrim(coalesce(p ->> 'notes', '')), '');
  v_goal    public.savings_goals;
  v_saved   bigint;
  v_tx      uuid;
  v_id      uuid;
begin
  if v_req is null then
    perform private.raise_error('Requisição sem identificador. Recarregue a página.');
  end if;
  select * into v_goal from public.savings_goals g
  where g.id = nullif(p ->> 'goal_id', '')::uuid and g.group_id = v_group
  for update;
  if not found then
    perform private.raise_error('Meta não encontrada.');
  end if;

  select c.id into v_id from public.goal_contributions c
  where c.group_id = v_group and c.client_request_id = v_req;
  if found then
    return v_id;
  end if;

  if v_goal.status <> 'active' then
    perform private.raise_error('Esta meta foi cancelada.');
  end if;
  if v_dir not in ('deposit', 'withdraw') then
    perform private.raise_error('Escolha guardar ou resgatar.');
  end if;
  v_amount := private.cents(p -> 'amount_cents');
  if v_date > private.today() then
    perform private.raise_error('A data não pode estar no futuro.');
  end if;
  if v_member is not null and not exists (
    select 1 from public.group_members m where m.group_id = v_group and m.user_id = v_member and m.status = 'active') then
    perform private.raise_error('Participante inválido.');
  end if;

  select coalesce(sum(c.amount_cents), 0) into v_saved from public.goal_contributions c
  where c.goal_id = v_goal.id and c.cancelled_at is null;
  if v_dir = 'withdraw' and v_amount > v_saved then
    perform private.raise_error(format('Só há %s guardados nesta meta.', private.brl(v_saved)));
  end if;

  -- Com conta-reserva e conta de origem, o dinheiro se move de verdade:
  -- uma transferência (nunca receita/despesa).
  if v_goal.account_id is not null and v_from is not null then
    if v_from = v_goal.account_id then
      perform private.raise_error('A conta de origem é a própria conta-reserva da meta.');
    end if;
    v_tx := private.upsert_transaction(jsonb_build_object(
      'client_request_id', v_req,
      'kind', 'transfer',
      'description', left(case when v_dir = 'deposit' then 'Meta: ' else 'Resgate da meta: ' end || v_goal.name, 120),
      'amount_cents', v_amount,
      'competence_date', v_date,
      'paid_at', v_date,
      'status', 'effective',
      'account_id', case when v_dir = 'deposit' then v_from else v_goal.account_id end,
      'to_account_id', case when v_dir = 'deposit' then v_goal.account_id else v_from end,
      'notes', v_notes
    ), v_group, v_uid, true);
  end if;

  insert into public.goal_contributions (group_id, goal_id, amount_cents, contributed_at, member_id,
    from_account_id, transaction_id, notes, client_request_id, created_by)
  values (v_group, v_goal.id, case when v_dir = 'deposit' then v_amount else -v_amount end, v_date,
    v_member, v_from, v_tx, v_notes, v_req, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_goal_contribution(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_uid   uuid := private.require_uid();
  v_c     public.goal_contributions;
  v_saved bigint;
begin
  select * into v_c from public.goal_contributions c where c.id = p_id and c.group_id = v_group for update;
  if not found then
    perform private.raise_error('Contribuição não encontrada.');
  end if;
  if v_c.cancelled_at is not null then
    return;
  end if;
  perform 1 from public.savings_goals g where g.id = v_c.goal_id for update;
  -- Cancelar um depósito não pode deixar a meta com saldo negativo.
  select coalesce(sum(c.amount_cents), 0) into v_saved from public.goal_contributions c
  where c.goal_id = v_c.goal_id and c.cancelled_at is null and c.id <> p_id;
  if v_saved < 0 then
    perform private.raise_error('Cancele antes os resgates feitos depois deste depósito.');
  end if;

  update public.goal_contributions c set cancelled_at = now() where c.id = p_id;
  if v_c.transaction_id is not null then
    update public.transactions t set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancel_reason = 'Contribuição de meta cancelada', updated_by = v_uid, updated_at = now()
    where t.id = v_c.transaction_id and t.status <> 'cancelled';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anexos
-- -----------------------------------------------------------------------------
create or replace function public.remove_attachment(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.require_group();
  v_path  text;
begin
  update public.attachments a set deleted_at = now()
  where a.id = p_id and a.group_id = v_group and a.deleted_at is null
  returning a.storage_path into v_path;
  if v_path is null then
    perform private.raise_error('Anexo não encontrado.');
  end if;
  return v_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios: funções privadas não são chamáveis pela API; RPCs públicas só
-- por usuários autenticados.
-- -----------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_member(uuid),
  private.is_owner(uuid),
  private.shares_group(uuid),
  private.my_group(),
  private.storage_path_group(text),
  private.attachment_target_ok(text, uuid, uuid)
to authenticated;

revoke all on function
  public.create_group(text),
  public.create_invitation(integer),
  public.preview_invitation(text),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.remove_member(uuid),
  public.update_member_shares(jsonb),
  public.save_transaction(jsonb),
  public.cancel_transaction(uuid, text),
  public.save_bill(jsonb),
  public.generate_bill_occurrences(date),
  public.pay_bill_occurrence(jsonb),
  public.cancel_bill_occurrence(uuid),
  public.get_account_balances(),
  public.get_balance_series(date, date),
  public.get_member_balances(boolean),
  public.register_settlement_payment(jsonb),
  public.cancel_settlement_payment(uuid),
  public.contribute_goal(jsonb),
  public.cancel_goal_contribution(uuid),
  public.remove_attachment(uuid)
from public, anon;

grant execute on function
  public.create_group(text),
  public.create_invitation(integer),
  public.preview_invitation(text),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.remove_member(uuid),
  public.update_member_shares(jsonb),
  public.save_transaction(jsonb),
  public.cancel_transaction(uuid, text),
  public.save_bill(jsonb),
  public.generate_bill_occurrences(date),
  public.pay_bill_occurrence(jsonb),
  public.cancel_bill_occurrence(uuid),
  public.get_account_balances(),
  public.get_balance_series(date, date),
  public.get_member_balances(boolean),
  public.register_settlement_payment(jsonb),
  public.cancel_settlement_payment(uuid),
  public.contribute_goal(jsonb),
  public.cancel_goal_contribution(uuid),
  public.remove_attachment(uuid)
to authenticated;
