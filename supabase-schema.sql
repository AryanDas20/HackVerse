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
  if jsonb_typeof(new.data->'participants') = 'array' then
    select array_agg(value order by ordinal)
      into new.participants
      from jsonb_array_elements_text(new.data->'participants') with ordinality as p(value, ordinal);
  else
    new.participants = null;
  end if;
  return new;
end $$;

drop trigger if exists documents_metadata_trigger on public.documents;
create trigger documents_metadata_trigger before insert or update on public.documents
for each row execute function public.set_document_metadata();

create or replace function public.guard_document_identity()
returns trigger language plpgsql as $$
declare
  actor_uid text := auth.uid()::text;
  creator_uid text;
  is_group_manager boolean := false;
  is_group_creator boolean := false;
  is_message_author boolean := false;
  parent_path text;
begin
  -- Service-role operations have no end-user auth.uid(); they are trusted server-side jobs.
  if auth.uid() is null then
    return new;
  end if;

  if new.path is distinct from old.path
     or new.collection_path is distinct from old.collection_path
     or new.doc_id is distinct from old.doc_id then
    raise exception 'Document identity fields cannot be changed.';
  end if;

  if new.owner_uid is distinct from old.owner_uid
     and not (old.owner_uid is null and new.owner_uid = auth.uid()) then
    raise exception 'Document ownership cannot be reassigned.';
  end if;

  if new.data->>'ownerUid' is distinct from old.data->>'ownerUid'
     or new.data->>'uid' is distinct from old.data->>'uid' then
    raise exception 'Document owner identity cannot be changed.';
  end if;

  -- Conversation membership and administration must not be controlled by an arbitrary member.
  if old.collection_path = 'conversations' then
    creator_uid := coalesce(old.data->>'createdBy', old.owner_uid::text);
    is_group_creator := actor_uid = creator_uid;
    is_group_manager := is_group_creator
      or coalesce(old.data->'admins', '[]'::jsonb) ? actor_uid;

    if new.data->>'createdBy' is distinct from old.data->>'createdBy'
       or new.data->>'isGroup' is distinct from old.data->>'isGroup' then
      raise exception 'Conversation identity fields cannot be changed.';
    end if;

    if new.data->'participants' is not null
       and to_jsonb(new.participants) is distinct from new.data->'participants' then
      raise exception 'Conversation participant metadata must remain consistent.';
    end if;

    if (
      new.participants is distinct from old.participants
      or new.data->'participants' is distinct from old.data->'participants'
    ) and not is_group_manager then
      raise exception 'Only group creators or admins can change membership.';
    end if;

    if new.data->'admins' is distinct from old.data->'admins'
       and not is_group_creator then
      raise exception 'Only the group creator can change administrators.';
    end if;

    if old.data->>'isGroup' = 'true' then
      if cardinality(coalesce(new.participants, '{}')) not between 2 and 11
         or not (creator_uid = any(coalesce(new.participants, '{}'))) then
        raise exception 'A group must contain its creator and between 1 and 10 other members.';
      end if;
      if not (coalesce(new.data->'admins', '[]'::jsonb) ? creator_uid) then
        raise exception 'The group creator must remain an administrator.';
      end if;
      if exists (
        select 1
        from jsonb_array_elements_text(coalesce(new.data->'admins', '[]'::jsonb)) as admins(admin_uid)
        where not (admins.admin_uid = any(coalesce(new.participants, '{}')))
      ) then
        raise exception 'Only group members can be administrators.';
      end if;
    end if;

    if (
      new.data->'groupName' is distinct from old.data->'groupName'
      or new.data->'groupDescription' is distinct from old.data->'groupDescription'
      or new.data->'groupPhotoUrl' is distinct from old.data->'groupPhotoUrl'
      or new.data->'participantNames' is distinct from old.data->'participantNames'
    ) and not is_group_manager then
      raise exception 'Only group creators or admins can update group details.';
    end if;

    if new.data->'deleted' is distinct from old.data->'deleted'
       and not is_group_creator then
      raise exception 'Only the group creator can delete a group.';
    end if;

    if new.data->>'lastMessageSender' is distinct from old.data->>'lastMessageSender'
       and new.data->>'lastMessageSender' is distinct from actor_uid then
      raise exception 'A member can only send messages as their own account.';
    end if;
  end if;

  -- Message authorship is immutable; users can only change their own reactions/hidden state.
  if old.collection_path like 'conversations/%/messages' then
    is_message_author := old.data->>'authorUid' = actor_uid;
    if new.data->>'authorUid' is distinct from old.data->>'authorUid'
       or new.data->>'createdAt' is distinct from old.data->>'createdAt' then
      raise exception 'Message identity fields cannot be changed.';
    end if;

    if new.data->'text' is distinct from old.data->'text'
       and not is_message_author then
      parent_path := split_part(old.path, '/messages/', 1);
      if new.data->>'deleted' is distinct from 'true'
         or not exists (
           select 1 from public.documents parent
           where parent.path = parent_path
             and (
               parent.data->>'createdBy' = actor_uid
               or coalesce(parent.data->'admins', '[]'::jsonb) ? actor_uid
             )
         ) then
        raise exception 'Only the message author or a group admin can change message text.';
      end if;
    end if;

    if new.data->'text' is distinct from old.data->'text'
       and new.data->>'deleted' is distinct from 'true'
       and is_message_author
       and (old.data->>'createdAt')::timestamptz < now() - interval '15 minutes' then
      raise exception 'Messages can only be edited within 15 minutes.';
    end if;

    if new.data->'deleted' is distinct from old.data->'deleted'
       and new.data->>'deleted' = 'true'
       and (old.data->>'createdAt')::timestamptz < now() - interval '1 hour' then
      raise exception 'Messages can only be deleted for everyone within one hour.';
    end if;

    if new.data->'deleted' is distinct from old.data->'deleted'
       and not is_message_author then
      parent_path := split_part(old.path, '/messages/', 1);
      if not exists (
        select 1 from public.documents parent
        where parent.path = parent_path
          and (
            parent.data->>'createdBy' = actor_uid
            or coalesce(parent.data->'admins', '[]'::jsonb) ? actor_uid
          )
      ) then
        raise exception 'Only the message author or a group admin can delete a message.';
      end if;
    end if;

    if coalesce(new.data->'hiddenForBy', '{}'::jsonb) - actor_uid
       is distinct from coalesce(old.data->'hiddenForBy', '{}'::jsonb) - actor_uid then
      raise exception 'A member can only change their own message visibility.';
    end if;

    if coalesce(new.data->'reactions', '{}'::jsonb) - actor_uid
       is distinct from coalesce(old.data->'reactions', '{}'::jsonb) - actor_uid then
      raise exception 'A member can only change their own message reaction.';
    end if;

    if is_message_author then
      if (new.data - 'text' - 'edited' - 'editedAt' - 'deleted' - 'deletedAt' - 'reactions' - 'hiddenForBy' - 'updatedAt')
         is distinct from
         (old.data - 'text' - 'edited' - 'editedAt' - 'deleted' - 'deletedAt' - 'reactions' - 'hiddenForBy' - 'updatedAt') then
        raise exception 'Message identity and attachment fields cannot be changed.';
      end if;
    else
      if (new.data - 'reactions' - 'hiddenForBy' - 'text' - 'deleted' - 'deletedAt' - 'updatedAt')
         is distinct from
         (old.data - 'reactions' - 'hiddenForBy' - 'text' - 'deleted' - 'deletedAt' - 'updatedAt') then
        raise exception 'A member cannot modify another member message.';
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists documents_identity_guard on public.documents;
drop trigger if exists zz_documents_identity_guard on public.documents;
create trigger zz_documents_identity_guard before update on public.documents
for each row execute function public.guard_document_identity();

create or replace function public.document_has_participant(parent_path text, member_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.path = parent_path
      and member_uid::text = any(coalesce(d.participants, '{}'))
  );
$$;

create or replace function public.document_owned_by(parent_path text, member_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.path = parent_path
      and d.owner_uid = member_uid
  );
$$;

revoke all on function public.document_has_participant(text, uuid) from public;
revoke all on function public.document_owned_by(text, uuid) from public;
grant execute on function public.document_has_participant(text, uuid) to authenticated;
grant execute on function public.document_owned_by(text, uuid) to authenticated;

create table if not exists public.ai_usage_daily (
  user_id uuid not null,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_usage_daily enable row level security;

create or replace function public.consume_ai_daily_limit(p_user_id uuid, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  if p_user_id is null or p_daily_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage_daily (user_id, usage_date, request_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date)
  do update set request_count = public.ai_usage_daily.request_count + 1
    where public.ai_usage_daily.request_count < p_daily_limit
  returning request_count into new_count;

  return new_count is not null;
end;
$$;

revoke all on function public.consume_ai_daily_limit(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_daily_limit(uuid, integer) to service_role;

-- Backfill ownership for existing private user documents created before the path-owner fix.
update public.documents
set owner_uid = doc_id::uuid
where collection_path = 'users'
  and owner_uid is null
  and doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.documents enable row level security;

drop policy if exists "authenticated read public data" on public.documents;
create policy "authenticated read public data" on public.documents
for select to authenticated using (
  (
    collection_path in ('hackathons','discoverySources')
    and coalesce(data->>'visibility','public') = 'public'
  )
  or (
    collection_path = 'publicProfiles'
    and coalesce(data->>'profileVisibility', data->>'visibility', 'public') = 'public'
  )
  or owner_uid = auth.uid()
  or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and public.document_has_participant(split_part(path, '/messages/', 1), auth.uid()))
  or (collection_path like 'aiConversations/%/messages' and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
);

drop policy if exists "authenticated insert own data" on public.documents;
create policy "authenticated insert own data" on public.documents
for insert to authenticated with check (
  (
    collection_path not in ('users', 'publicProfiles', 'usernames', 'conversations')
    and collection_path not like 'conversations/%/messages'
    and collection_path not like 'aiConversations/%/messages'
    and owner_uid = auth.uid()
  )
  or (collection_path = 'users'
    and doc_id = auth.uid()::text
    and owner_uid = auth.uid())
  or (collection_path = 'publicProfiles'
    and doc_id = auth.uid()::text
    and data->>'uid' = auth.uid()::text
    and owner_uid = auth.uid())
  or (collection_path = 'usernames'
    and data->>'uid' = auth.uid()::text
    and owner_uid = auth.uid())
  or (collection_path = 'conversations' and (
    (
      coalesce(data->>'isGroup', 'false') = 'true'
      and data->>'createdBy' = auth.uid()::text
      and auth.uid()::text = any(coalesce(participants, '{}'))
      and cardinality(coalesce(participants, '{}')) between 2 and 11
      and coalesce(data->'admins', '[]'::jsonb) ? auth.uid()::text
    )
    or (
      coalesce(data->>'isGroup', 'false') <> 'true'
      and auth.uid()::text = any(coalesce(participants, '{}'))
      and cardinality(coalesce(participants, '{}')) = 2
    )
  ))
  or (collection_path like 'conversations/%/messages'
    and data->>'authorUid' = auth.uid()::text
    and public.document_has_participant(split_part(path, '/messages/', 1), auth.uid()))
  or (collection_path like 'aiConversations/%/messages'
    and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
);

drop policy if exists "authenticated update own data" on public.documents;
create policy "authenticated update own data" on public.documents
for update to authenticated using (
  owner_uid = auth.uid() or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and public.document_has_participant(split_part(path, '/messages/', 1), auth.uid()))
  or (collection_path like 'aiConversations/%/messages' and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
) with check (
  owner_uid = auth.uid()
  or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and public.document_has_participant(split_part(path, '/messages/', 1), auth.uid()))
  or (collection_path like 'aiConversations/%/messages' and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
);

drop policy if exists "authenticated delete own data" on public.documents;
create policy "authenticated delete own data" on public.documents
for delete to authenticated using (
  owner_uid = auth.uid()
  or (collection_path like 'aiConversations/%/messages' and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
);

-- Opportunity rows are written by GitHub Actions with the Supabase service-role key.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in the browser.
