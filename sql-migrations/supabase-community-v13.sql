-- HackVerse v13 social network migration
-- Additive migration: run after v11 schema and v12 community migrations.
-- Do not drop or truncate existing HackVerse tables.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_lower text generated always as (lower(username)) stored,
  display_name text not null default 'HackVerse member',
  bio text not null default '',
  avatar_url text,
  cover_url text,
  location text,
  website text,
  github_url text,
  linkedin_url text,
  portfolio_url text,
  pronouns text,
  is_verified boolean not null default false,
  is_private boolean not null default false,
  profile_visibility text not null default 'public' check (profile_visibility in ('public','followers','private')),
  hackathon_count integer not null default 0 check (hackathon_count >= 0),
  follower_count integer not null default 0 check (follower_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),
  post_count integer not null default 0 check (post_count >= 0),
  upvote_count integer not null default 0 check (upvote_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  constraint profiles_username_unique unique (username_lower)
);

alter table public.profiles add column if not exists profile_visibility text not null default 'public';
alter table public.profiles add column if not exists hackathon_count integer not null default 0;
alter table public.profiles add column if not exists github_url text;
alter table public.profiles add column if not exists linkedin_url text;
alter table public.profiles add column if not exists portfolio_url text;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  media_url text,
  media_type text check (media_type is null or media_type in ('image','video')),
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  upvote_count integer not null default 0 check (upvote_count >= 0),
  downvote_count integer not null default 0 check (downvote_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  share_count integer not null default 0 check (share_count >= 0),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','pending','rejected')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint follows_unique_pair unique (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  value text not null check (value in ('upvote','downvote')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint votes_unique_user_post unique (user_id, post_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1200),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reposts_unique_user_post unique (user_id, post_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('follow','follow_request','upvote','downvote','comment','mention','repost','follow_accepted')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user','post','comment','message','site_issue','other')),
  target_id text,
  target_user_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('spam','harassment','hate_or_abuse','impersonation','scam_or_fraud','privacy','copyright','unsafe_content','technical_issue','other')),
  details text not null check (char_length(details) between 10 and 2000),
  evidence_url text,
  status text not null default 'new' check (status in ('new','reviewing','resolved','dismissed')),
  moderator_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_feed_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  home_feed text not null default 'overview' check (home_feed in ('overview','public_posts','following_posts','builds','opportunities')),
  profile_visibility text not null default 'public' check (profile_visibility in ('public','followers','private')),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.social_rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc, id desc) where is_deleted = false;
create index if not exists posts_created_idx on public.posts(created_at desc, id desc) where is_deleted = false;
create index if not exists posts_visibility_created_idx on public.posts(visibility, created_at desc, id desc) where is_deleted = false;
create index if not exists votes_post_idx on public.votes(post_id);
create index if not exists votes_user_post_idx on public.votes(user_id, post_id);
create index if not exists follows_follower_idx on public.follows(follower_id, status);
create index if not exists follows_following_idx on public.follows(following_id, status);
create index if not exists comments_post_created_idx on public.comments(post_id, created_at desc) where is_deleted = false;
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports(reporter_id, created_at desc);
create index if not exists profiles_username_lower_idx on public.profiles(username_lower);
create index if not exists social_rate_limit_lookup_idx on public.social_rate_limit_events(user_id, action, created_at desc);
create index if not exists social_rate_limit_cleanup_idx on public.social_rate_limit_events(created_at);

create or replace function public.social_is_following(p_follower uuid, p_following uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.follows f where f.follower_id=p_follower and f.following_id=p_following and f.status='active');
$$;

create or replace function public.social_can_view_profile(p_viewer uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer = p_owner or exists (
    select 1 from public.profiles p where p.id=p_owner and p.profile_visibility='public'
  ) or public.social_is_following(p_viewer,p_owner);
$$;

create or replace function public.social_rate_limit(p_user_id uuid, p_action text, p_max integer default 20, p_window_seconds integer default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_action));
  delete from public.social_rate_limit_events where id in (select id from public.social_rate_limit_events where created_at < now() - interval '1 day' order by created_at limit 100);
  select count(*) into v_count from public.social_rate_limit_events
    where user_id=p_user_id and action=p_action and created_at > now() - make_interval(secs => greatest(1,p_window_seconds));
  if v_count >= greatest(1,p_max) then return false; end if;
  insert into public.social_rate_limit_events(user_id,action) values(p_user_id,p_action);
  return true;
end;
$$;

create or replace function public.social_adjust_post_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='votes' then
    if tg_op='INSERT' then
      update public.posts set upvote_count=upvote_count + case when new.value='upvote' then 1 else 0 end,
        downvote_count=downvote_count + case when new.value='downvote' then 1 else 0 end where id=new.post_id;
      update public.profiles set upvote_count=upvote_count + case when new.value='upvote' then 1 else 0 end where id=(select author_id from public.posts where id=new.post_id);
      return new;
    elsif tg_op='UPDATE' then
      update public.posts set upvote_count=greatest(0,upvote_count + case when new.value='upvote' then 1 else 0 end - case when old.value='upvote' then 1 else 0 end),
        downvote_count=greatest(0,downvote_count + case when new.value='downvote' then 1 else 0 end - case when old.value='downvote' then 1 else 0 end) where id=new.post_id;
      update public.profiles set upvote_count=greatest(0,upvote_count + case when new.value='upvote' then 1 else 0 end - case when old.value='upvote' then 1 else 0 end) where id=(select author_id from public.posts where id=new.post_id);
      return new;
    else
      update public.posts set upvote_count=greatest(0,upvote_count - case when old.value='upvote' then 1 else 0 end),
        downvote_count=greatest(0,downvote_count - case when old.value='downvote' then 1 else 0 end) where id=old.post_id;
      update public.profiles set upvote_count=greatest(0,upvote_count - case when old.value='upvote' then 1 else 0 end) where id=(select author_id from public.posts where id=old.post_id);
      return old;
    end if;
  elsif tg_table_name='comments' then
    if tg_op='INSERT' then update public.posts set comment_count=comment_count+1 where id=new.post_id; return new;
    elsif tg_op='DELETE' then update public.posts set comment_count=greatest(0,comment_count-1) where id=old.post_id; return old; end if;
  elsif tg_table_name='reposts' then
    if tg_op='INSERT' then update public.posts set share_count=share_count+1 where id=new.post_id; return new;
    elsif tg_op='DELETE' then update public.posts set share_count=greatest(0,share_count-1) where id=old.post_id; return old; end if;
  elsif tg_table_name='follows' then
    if tg_op='INSERT' and new.status='active' then
      update public.profiles set following_count=following_count+1 where id=new.follower_id;
      update public.profiles set follower_count=follower_count+1 where id=new.following_id;
    elsif tg_op='UPDATE' then
      if old.status<>'active' and new.status='active' then
        update public.profiles set following_count=following_count+1 where id=new.follower_id;
        update public.profiles set follower_count=follower_count+1 where id=new.following_id;
      elsif old.status='active' and new.status<>'active' then
        update public.profiles set following_count=greatest(0,following_count-1) where id=new.follower_id;
        update public.profiles set follower_count=greatest(0,follower_count-1) where id=new.following_id;
      end if;
    elsif tg_op='DELETE' and old.status='active' then
      update public.profiles set following_count=greatest(0,following_count-1) where id=old.follower_id;
      update public.profiles set follower_count=greatest(0,follower_count-1) where id=old.following_id;
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  return null;
end;
$$;

drop trigger if exists social_votes_counts on public.votes;
create trigger social_votes_counts after insert or update or delete on public.votes for each row execute function public.social_adjust_post_counts();
drop trigger if exists social_comments_counts on public.comments;
create or replace function public.social_adjust_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    if not new.is_deleted then update public.posts set comment_count=comment_count+1 where id=new.post_id; end if;
    return new;
  elsif tg_op='DELETE' then
    if not old.is_deleted then update public.posts set comment_count=greatest(0,comment_count-1) where id=old.post_id; end if;
    return old;
  else
    if old.is_deleted=false and new.is_deleted=true then update public.posts set comment_count=greatest(0,comment_count-1) where id=new.post_id;
    elsif old.is_deleted=true and new.is_deleted=false then update public.posts set comment_count=comment_count+1 where id=new.post_id; end if;
    return new;
  end if;
end;
$$;
create trigger social_comments_counts after insert or update of is_deleted or delete on public.comments for each row execute function public.social_adjust_comment_count();
drop trigger if exists social_reposts_counts on public.reposts;
create trigger social_reposts_counts after insert or delete on public.reposts for each row execute function public.social_adjust_post_counts();
drop trigger if exists social_follows_counts on public.follows;
create trigger social_follows_counts after insert or update or delete on public.follows for each row execute function public.social_adjust_post_counts();

drop trigger if exists social_post_author_count on public.posts;
create or replace function public.social_adjust_post_author_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    if not new.is_deleted then update public.profiles set post_count=post_count+1 where id=new.author_id; end if;
    return new;
  elsif tg_op='DELETE' then
    if not old.is_deleted then update public.profiles set post_count=greatest(0,post_count-1) where id=old.author_id; end if;
    return old;
  else
    if old.is_deleted=false and new.is_deleted=true then update public.profiles set post_count=greatest(0,post_count-1) where id=new.author_id;
    elsif old.is_deleted=true and new.is_deleted=false then update public.profiles set post_count=post_count+1 where id=new.author_id; end if;
    return new;
  end if;
end;
$$;
create trigger social_post_author_count after insert or update of is_deleted or delete on public.posts for each row execute function public.social_adjust_post_author_count();

-- Profile backfill from existing v11/v12 public profiles. Owners should call
-- the v13 sync-profile action once after migration to complete private profile fields.
insert into public.profiles(id,username,display_name,bio,avatar_url,location,website,github_url,linkedin_url,portfolio_url,is_private,profile_visibility,created_at,updated_at)
select d.doc_id::uuid,
  case when coalesce(d.data->>'username','') ~ '^[A-Za-z0-9_]{3,24}$'
        and row_number() over (partition by lower(coalesce(d.data->>'username','')) order by d.doc_id)=1
       then d.data->>'username' else 'builder_' || left(replace(d.doc_id,'-',''),12) end,
  coalesce(nullif(d.data->>'displayName',''), 'HackVerse member'),
  coalesce(d.data->>'bio',''), nullif(d.data->>'avatarUrl',''),
  nullif(concat_ws(', ',nullif(d.data->>'city',''),nullif(d.data->>'country','')),''),
  coalesce(nullif(d.data->>'portfolio',''), nullif(d.data->>'website','')),
  nullif(d.data->>'github',''), nullif(d.data->>'linkedin',''), nullif(d.data->>'portfolio',''),
  false,
  'public',
  now(), now()
from public.documents d
where d.collection_path='publicProfiles'
  and d.doc_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (id) do update set
  username=excluded.username, display_name=excluded.display_name, bio=excluded.bio,
  avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url), updated_at=now();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.reposts enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.profile_feed_preferences enable row level security;
alter table public.user_blocks enable row level security;
alter table public.social_rate_limit_events enable row level security;

-- RLS policies: API routes use a server-verified user token and service role.
-- These policies also keep direct authenticated access appropriately scoped.
drop policy if exists profiles_read_policy on public.profiles;
create policy profiles_read_policy on public.profiles for select to authenticated using (id=auth.uid() or profile_visibility='public' or public.social_is_following(auth.uid(),id));
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists posts_read_policy on public.posts;
create policy posts_read_policy on public.posts for select to authenticated using (
  not is_deleted and (author_id=auth.uid() or (visibility='public' and exists(select 1 from public.profiles owner where owner.id=author_id and owner.profile_visibility='public')) or (visibility<>'private' and public.social_is_following(auth.uid(),author_id)))
);
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated with check (author_id=auth.uid());
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());

drop policy if exists follows_read_policy on public.follows;
create policy follows_read_policy on public.follows for select to authenticated using (follower_id=auth.uid() or following_id=auth.uid() or status='active');
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows for insert to authenticated with check (follower_id=auth.uid() and follower_id<>following_id);
drop policy if exists follows_update_policy on public.follows;
create policy follows_update_policy on public.follows for update to authenticated using (following_id=auth.uid()) with check (following_id=auth.uid());
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows for delete to authenticated using (follower_id=auth.uid());

drop policy if exists votes_read_policy on public.votes;
create policy votes_read_policy on public.votes for select to authenticated using (true);
drop policy if exists votes_insert_own on public.votes;
create policy votes_insert_own on public.votes for insert to authenticated with check (user_id=auth.uid());
drop policy if exists votes_update_own on public.votes;
create policy votes_update_own on public.votes for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists votes_delete_own on public.votes;
create policy votes_delete_own on public.votes for delete to authenticated using (user_id=auth.uid());

drop policy if exists comments_read_policy on public.comments;
create policy comments_read_policy on public.comments for select to authenticated using (not is_deleted and exists(select 1 from public.posts p where p.id=comments.post_id and (p.author_id=auth.uid() or (p.visibility='public' and public.social_can_view_profile(auth.uid(),p.author_id)) or (p.visibility='followers' and public.social_is_following(auth.uid(),p.author_id)))));
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments for insert to authenticated with check (author_id=auth.uid());
drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());

drop policy if exists reposts_read_policy on public.reposts;
create policy reposts_read_policy on public.reposts for select to authenticated using (true);
drop policy if exists reposts_insert_own on public.reposts;
create policy reposts_insert_own on public.reposts for insert to authenticated with check (user_id=auth.uid());
drop policy if exists reposts_delete_own on public.reposts;
create policy reposts_delete_own on public.reposts for delete to authenticated using (user_id=auth.uid());

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (recipient_id=auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own on public.reports for select to authenticated using (reporter_id=auth.uid());
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id=auth.uid());

drop policy if exists preferences_read_own on public.profile_feed_preferences;
create policy preferences_read_own on public.profile_feed_preferences for select to authenticated using (user_id=auth.uid());
drop policy if exists preferences_write_own on public.profile_feed_preferences;
create policy preferences_write_own on public.profile_feed_preferences for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists blocks_read_own on public.user_blocks;
create policy blocks_read_own on public.user_blocks for select to authenticated using (blocker_id=auth.uid());
drop policy if exists blocks_write_own on public.user_blocks;
create policy blocks_write_own on public.user_blocks for all to authenticated using (blocker_id=auth.uid()) with check (blocker_id=auth.uid() and blocker_id<>blocked_id);

revoke all on public.social_rate_limit_events from anon, authenticated;
revoke all on function public.social_rate_limit(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.social_rate_limit(uuid,text,integer,integer) to service_role;
revoke all on function public.social_is_following(uuid,uuid) from public, anon;
grant execute on function public.social_is_following(uuid,uuid) to authenticated, service_role;
grant execute on function public.social_can_view_profile(uuid,uuid) to authenticated, service_role;

revoke all on public.profiles, public.posts, public.follows, public.votes, public.comments, public.reposts, public.notifications, public.reports, public.profile_feed_preferences, public.user_blocks from anon, authenticated;
grant select on public.profiles, public.posts, public.follows, public.votes, public.comments, public.reposts, public.notifications, public.reports, public.profile_feed_preferences, public.user_blocks to authenticated;
grant all on public.profiles, public.posts, public.follows, public.votes, public.comments, public.reposts, public.notifications, public.reports, public.profile_feed_preferences, public.user_blocks, public.social_rate_limit_events to service_role;

-- Add a notification when a follow or accepted request is recorded.
create or replace function public.social_notify_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(recipient_id,actor_id,type)
    values(new.following_id,new.follower_id,case when new.status='pending' then 'follow_request' else 'follow' end);
  elsif tg_op='UPDATE' and old.status='pending' and new.status='active' then
    insert into public.notifications(recipient_id,actor_id,type)
    values(new.follower_id,new.following_id,'follow_accepted');
  end if;
  return new;
end;
$$;
drop trigger if exists social_follow_notification on public.follows;
create trigger social_follow_notification after insert or update of status on public.follows for each row execute function public.social_notify_follow();

-- End v13 additive migration.
