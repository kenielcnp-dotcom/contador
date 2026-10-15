-- =============================================================================
-- 0500 · Storage privado e Realtime
-- =============================================================================

-- Comprovantes: privado, até 5 MB, só imagens e PDF. Caminho: <group_id>/<arquivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Fotos de perfil: privado, até 2 MB. Caminho: <user_id>/<arquivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Comprovantes: mesma regra das tabelas — só membros ativos da carteira da pasta.
-- Não há UPDATE: um comprovante não é sobrescrito, só removido.
create policy comprovantes_select on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and private.is_member(private.storage_path_group(name)));
create policy comprovantes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and private.is_member(private.storage_path_group(name)));
create policy comprovantes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and private.is_member(private.storage_path_group(name)));

-- Avatares: cada um escreve na própria pasta; o parceiro pode ver.
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or private.shares_group(private.storage_path_group(name))));
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);

-- Realtime: alterações nestas tabelas chegam ao outro participante. O Realtime
-- respeita o RLS, então cada pessoa só recebe eventos da própria carteira.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.transactions, public.expense_splits, public.accounts, public.categories,
      public.bills, public.bill_occurrences, public.settlements, public.settlement_payments,
      public.budgets, public.savings_goals, public.goal_contributions,
      public.group_members, public.financial_groups, public.attachments;
  end if;
end;
$$;
