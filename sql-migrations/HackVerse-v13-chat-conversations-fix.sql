-- HackVerse v13: repair inbox/conversation reads for existing accounts.
-- Run this in Supabase SQL Editor on the existing project.
-- This does NOT make conversations public: a signed-in user can read only
-- conversation documents whose participants array contains their own auth UID.

begin;

-- Rebuild the indexed participants metadata from the JSON document payload.
-- This repairs older rows where data.participants exists but the indexed
-- public.documents.participants column was null or stale.
update public.documents
set participants = array(
  select jsonb_array_elements_text(data->'participants')
)
where collection_path = 'conversations'
  and jsonb_typeof(data->'participants') = 'array'
  and participants is distinct from array(
    select jsonb_array_elements_text(data->'participants')
  );

-- Explicit, narrow inbox policy. PostgreSQL combines permissive policies with
-- OR, so this supplements the existing public-data policy without widening
-- access to non-participants.
drop policy if exists "conversation participants can read inbox" on public.documents;
create policy "conversation participants can read inbox"
on public.documents
for select
to authenticated
using (
  collection_path = 'conversations'
  and auth.uid() is not null
  and auth.uid()::text = any(coalesce(participants, '{}'::text[]))
);

-- The client filters the participants array using PostgREST contains().
create index if not exists documents_conversation_participants_gin
on public.documents using gin (participants)
where collection_path = 'conversations';

grant select on public.documents to authenticated;

commit;

-- Diagnostic: after running, this should show only the signed-in user's
-- conversation documents when executed as that user (not from SQL Editor's
-- postgres/admin role, which bypasses RLS).
