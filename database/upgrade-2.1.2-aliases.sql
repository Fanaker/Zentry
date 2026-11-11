-- Opcional. Ejecutar una vez en el proyecto Supabase actual para sincronizar alias.
begin;

create table if not exists public.capture_aliases (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  field text not null check (field in ('account','category')),
  phrase_key text not null check (char_length(phrase_key) between 1 and 80),
  phrase text not null check (char_length(phrase) between 1 and 80),
  target_id uuid not null,
  primary key (owner_id, field, phrase_key)
);

alter table public.capture_aliases enable row level security;
revoke all on public.capture_aliases from anon, public;
grant select, insert, update, delete on public.capture_aliases to authenticated;

drop policy if exists own_capture_aliases on public.capture_aliases;
create policy own_capture_aliases on public.capture_aliases
  for all to authenticated
  using (owner_id = auth.uid() and public.zentry_access())
  with check (
    owner_id = auth.uid() and public.zentry_access() and (
      (field = 'account' and exists(select 1 from public.accounts where id = target_id and owner_id = auth.uid()))
      or
      (field = 'category' and exists(select 1 from public.categories where id = target_id and owner_id = auth.uid()))
    )
  );

commit;
