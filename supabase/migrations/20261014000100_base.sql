-- =============================================================================
-- 0100 · Base: extensões, schema privado, perfis, carteiras, membros e convites
-- =============================================================================
-- Convenções deste projeto:
--   * Dinheiro é sempre bigint em centavos (exato, sem ponto flutuante).
--   * Toda tabela da carteira tem group_id e FKs compostas (id, group_id),
--     para que nenhuma linha aponte para registro de outra carteira.
--   * Funções privilegiadas ficam no schema "private" (não exposto pela API)
--     ou são RPCs SECURITY DEFINER com search_path vazio e checagem explícita
--     de membro.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- As políticas de RLS chamam funções deste schema com o papel de quem consulta.
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.raise_error(p_message text, p_code text default 'P0001')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_message, errcode = p_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Carteiras compartilhadas
-- -----------------------------------------------------------------------------
create table public.financial_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id    uuid not null references public.profiles (id),
  currency    text not null default 'BRL' check (currency = 'BRL'),
  status      text not null default 'active' check (status in ('active', 'archived')),
  -- MVP: dois participantes. A coluna deixa a expansão futura a um UPDATE.
  max_members smallint not null default 2 check (max_members between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger financial_groups_touch before update on public.financial_groups
  for each row execute function private.touch_updated_at();

create table public.group_members (
  group_id      uuid not null references public.financial_groups (id),
  user_id       uuid not null references public.profiles (id),
  role          text not null default 'member' check (role in ('owner', 'member')),
  status        text not null default 'active' check (status in ('active', 'removed')),
  -- Percentual sugerido de contribuição/rateio de cada pessoa.
  share_percent numeric(5, 2) not null default 50 check (share_percent between 0 and 100),
  joined_at     timestamptz not null default now(),
  removed_at    timestamptz,
  primary key (group_id, user_id),
  check ((status = 'removed') = (removed_at is not null))
);

-- Uma pessoa participa de no máximo UMA carteira ativa (evita entrar em outra por acidente).
create unique index group_members_one_active_group
  on public.group_members (user_id) where status = 'active';

create table public.group_invitations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.financial_groups (id),
  -- Só o hash SHA-256 do token fica no banco; o token em si é mostrado uma única vez.
  token_hash  text not null unique,
  created_by  uuid not null references public.profiles (id),
  expires_at  timestamptz not null,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((accepted_by is null) = (accepted_at is null))
);

create index group_invitations_group on public.group_invitations (group_id);

-- -----------------------------------------------------------------------------
-- Helpers de autorização (SECURITY DEFINER: leem group_members sem passar pelo
-- RLS da própria tabela, o que evita políticas recursivas).
-- -----------------------------------------------------------------------------
create or replace function private.is_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.is_owner(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'owner'
  );
$$;

-- Verdadeiro se o usuário atual e p_user estão (ou estiveram) na mesma carteira
-- em que o usuário atual está ativo. Usado para exibir o nome do parceiro
-- inclusive em movimentações antigas de alguém que saiu.
create or replace function private.shares_group(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members other on other.group_id = me.group_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and other.user_id = p_user
  );
$$;

-- Carteira ativa do usuário atual (ou null).
create or replace function private.my_group()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id from public.group_members m
  where m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
$$;

-- Exige sessão e carteira ativa; devolve o group_id. Usada no início das RPCs.
create or replace function private.require_group()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  if (select auth.uid()) is null then
    perform private.raise_error('Sessão expirada. Entre novamente.', '42501');
  end if;
  v_group := private.my_group();
  if v_group is null then
    perform private.raise_error('Você ainda não participa de uma carteira.', '42501');
  end if;
  return v_group;
end;
$$;

-- Caminhos no Storage começam com o group_id. Converte com segurança
-- (um nome malformado não pode derrubar a política com erro de cast).
create or replace function private.storage_path_group(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.is_member(uuid),
  private.is_owner(uuid),
  private.shares_group(uuid),
  private.my_group(),
  private.storage_path_group(text)
to authenticated;
