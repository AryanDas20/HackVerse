-- HackVerse v12 add-on migration. Run after the existing v11 supabase-schema.sql.
-- This is additive and safe to run more than once.
-- HackVerse v12 community feed and hackathon portfolio visibility.
-- The helper uses SECURITY DEFINER to inspect the parent post without causing
-- recursive row-level-security evaluation on public.documents.
create or replace function public.builder_post_is_public(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents
    where collection_path = 'builderPosts'
      and doc_id = p_post_id
      and coalesce(data->>'visibility', 'public') = 'public'
  );
$$;
revoke all on function public.builder_post_is_public(text) from public, anon;
grant execute on function public.builder_post_is_public(text) to authenticated;

-- Extend public reads without exposing private posts, private hackathon records,
-- or a member's saved-post collection.
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
  or (
    collection_path = 'builderPosts'
    and coalesce(data->>'visibility', 'public') = 'public'
  )
  or (
    collection_path = 'hackathonHistory'
    and coalesce(data->>'visibility', 'private') = 'public'
  )
  or collection_path = 'builderFollows'
  or (
    collection_path in ('builderPostVotes','builderPostComments','builderReposts')
    and public.builder_post_is_public(data->>'postId')
  )
  or owner_uid = auth.uid()
  or auth.uid()::text = any(coalesce(participants, '{}'))
  or (collection_path like 'conversations/%/messages' and public.document_has_participant(split_part(path, '/messages/', 1), auth.uid()))
  or (collection_path like 'aiConversations/%/messages' and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
);

-- Keep the generic insert path closed for new community collections and apply
-- explicit author checks to prevent voting/reposting on behalf of another user.
drop policy if exists "authenticated insert own data" on public.documents;
create policy "authenticated insert own data" on public.documents
for insert to authenticated with check (
  (
    collection_path not in ('users', 'publicProfiles', 'usernames', 'conversations', 'builderPosts', 'builderPostVotes', 'builderPostComments', 'builderReposts', 'builderPostSaves', 'builderFollows', 'hackathonHistory')
    and collection_path not like 'conversations/%/messages'
    and collection_path not like 'aiConversations/%/messages'
    and owner_uid = auth.uid()
  )
  or (collection_path = 'users' and doc_id = auth.uid()::text and owner_uid = auth.uid())
  or (collection_path = 'publicProfiles' and doc_id = auth.uid()::text and data->>'uid' = auth.uid()::text and owner_uid = auth.uid())
  or (collection_path = 'usernames' and data->>'uid' = auth.uid()::text and owner_uid = auth.uid())
  or (collection_path = 'builderPosts' and owner_uid = auth.uid() and data->>'ownerUid' = auth.uid()::text and data->>'authorUid' = auth.uid()::text)
  or (collection_path = 'builderPostVotes' and owner_uid = auth.uid() and data->>'userUid' = auth.uid()::text and public.builder_post_is_public(data->>'postId'))
  or (collection_path = 'builderPostComments' and owner_uid = auth.uid() and data->>'authorUid' = auth.uid()::text and public.builder_post_is_public(data->>'postId'))
  or (collection_path = 'builderReposts' and owner_uid = auth.uid() and data->>'userUid' = auth.uid()::text and public.builder_post_is_public(data->>'postId'))
  or (collection_path = 'builderPostSaves' and owner_uid = auth.uid() and data->>'userUid' = auth.uid()::text)
  or (collection_path = 'builderFollows' and owner_uid = auth.uid() and data->>'followerUid' = auth.uid()::text and data->>'followingUid' <> auth.uid()::text)
  or (collection_path = 'hackathonHistory' and owner_uid = auth.uid() and data->>'ownerUid' = auth.uid()::text)
  or (collection_path = 'conversations' and (
    (coalesce(data->>'isGroup', 'false') = 'true' and data->>'createdBy' = auth.uid()::text and auth.uid()::text = any(coalesce(participants, '{}')) and cardinality(coalesce(participants, '{}')) between 2 and 11 and coalesce(data->'admins', '[]'::jsonb) ? auth.uid()::text)
    or (coalesce(data->>'isGroup', 'false') <> 'true' and auth.uid()::text = any(coalesce(participants, '{}')) and cardinality(coalesce(participants, '{}')) = 2)
  ))
  or (collection_path like 'conversations/%/messages' and data->>'authorUid' = auth.uid()::text and public.document_has_participant(split_part(path, '/messages/', 1), auth.uid()))
  or (collection_path like 'aiConversations/%/messages' and public.document_owned_by(split_part(path, '/messages/', 1), auth.uid()))
);


-- Public bucket for community project cover images. Server-side signed uploads
-- are used; public visibility is required for feed image previews.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

-- Partial expression indexes keep the builder community queries bounded as it grows.
create index if not exists documents_collection_doc_idx
  on public.documents (collection_path, doc_id);
create index if not exists documents_builder_posts_created_idx
  on public.documents ((data->>'createdAt') desc, doc_id)
  where collection_path = 'builderPosts';
create index if not exists documents_builder_posts_owner_created_idx
  on public.documents ((data->>'ownerUid'), (data->>'createdAt') desc)
  where collection_path = 'builderPosts';
create index if not exists documents_builder_comments_created_idx
  on public.documents ((data->>'createdAt') desc)
  where collection_path = 'builderPostComments';
create index if not exists documents_community_post_id_idx
  on public.documents (collection_path, (data->>'postId'))
  where collection_path in ('builderPostVotes','builderPostComments','builderReposts','builderPostSaves');
create index if not exists documents_builder_follows_follower_idx
  on public.documents ((data->>'followerUid'), (data->>'followingUid'))
  where collection_path = 'builderFollows';
create index if not exists documents_hackathon_history_owner_idx
  on public.documents ((data->>'ownerUid'), (data->>'year') desc)
  where collection_path = 'hackathonHistory';
create index if not exists documents_public_profiles_skills_idx
  on public.documents using gin ((data->'skillsLower'))
  where collection_path = 'publicProfiles';
create index if not exists documents_public_profiles_interests_idx
  on public.documents using gin ((data->'interestsLower'))
  where collection_path = 'publicProfiles';

