-- HackVerse v8.0 - Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.documents (
  path text primary key,
  collection_path text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  owner_uid uuid null,
  participants text[] null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_collection_idx on public.documents(collection_path);
create index if not exists documents_owner_idx on public.documents(owner_uid);
create index if not exists documents_participants_idx on public.documents using gin(participants);
create index if not exists documents_data_visibility_idx on public.documents((data->>'visibility'));
create index if not exists documents_data_updated_idx on public.documents((data->>'updatedAt'));

create or replace function public.set_document_metadata()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.created_at is null then new.created_at = now(); end if;
  if new.owner_uid is null and new.data ? 'ownerUid' then
    begin new.owner_uid = (new.data->>'ownerUid')::uuid; exception when others then null; end;
  end if;
  if new.participants is null and jsonb_typeof(new.data->'participants') = 'array' then
    select array_agg(value::text) into new.participants from jsonb_array_elements_text(new.data->'participants');
  end if;
  return new;
end $$;

drop trigger if exists documents_metadata_trigger on public.documents;
create trigger documents_metadata_trigger before insert or update on public.documents
for each row execute function public.set_document_metadata();

alter table public.documents enable row level security;

drop policy if exists "authenticated read public data" on public.documents;
create policy "authenticated read public data" on public.documents
for select to authenticated using (
  (collection_path in ('hackathons','publicProfiles','discoverySources') and coalesce(data->>'visibility','public') = 'public')
  or owner_uid = auth.uid()
  or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and exists (
    select 1 from public.documents parent
    where parent.path = split_part(path, '/messages/', 1)
      and (auth.uid()::text = any(coalesce(parent.participants, '{}')))
  ))
  or (collection_path like 'aiConversations/%/messages' and exists (
    select 1 from public.documents parent
    where parent.path = split_part(path, '/messages/', 1) and parent.owner_uid = auth.uid()
  ))
);

drop policy if exists "authenticated insert own data" on public.documents;
create policy "authenticated insert own data" on public.documents
for insert to authenticated with check (
  owner_uid = auth.uid()
  or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and exists (
    select 1 from public.documents parent where parent.path = split_part(path, '/messages/', 1) and auth.uid()::text = any(coalesce(parent.participants, '{}'))
  ))
  or (collection_path like 'aiConversations/%/messages' and exists (
    select 1 from public.documents parent where parent.path = split_part(path, '/messages/', 1) and parent.owner_uid = auth.uid()
  ))
);

drop policy if exists "authenticated update own data" on public.documents;
create policy "authenticated update own data" on public.documents
for update to authenticated using (
  owner_uid = auth.uid() or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and exists (select 1 from public.documents parent where parent.path = split_part(path, '/messages/', 1) and auth.uid()::text = any(coalesce(parent.participants, '{}'))))
  or (collection_path like 'aiConversations/%/messages' and exists (select 1 from public.documents parent where parent.path = split_part(path, '/messages/', 1) and parent.owner_uid = auth.uid()))
) with check (true);

drop policy if exists "authenticated delete own data" on public.documents;
create policy "authenticated delete own data" on public.documents
for delete to authenticated using (
  owner_uid = auth.uid() or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'aiConversations/%/messages' and exists (select 1 from public.documents parent where parent.path = split_part(path, '/messages/', 1) and parent.owner_uid = auth.uid()))
);

-- Opportunity rows are written by GitHub Actions with the Supabase service-role key.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in the browser.
