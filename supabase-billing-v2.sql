-- HackTheta Premium billing (project/backend identity remains HackVerse)
-- Run once in the existing Supabase project's SQL Editor.
-- Safe to re-run: existing trial rows are never reset or extended.
-- This migration grants browser users read-only access to their own billing rows.
-- All billing writes must be performed by trusted server-side code using service_role.

begin;

create table if not exists public.billing_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  razorpay_subscription_id text unique,
  razorpay_plan_id text,
  status text not null default 'trialing'
    check (status in ('trialing','created','authenticated','active','pending','halted','paused','cancelled','completed','expired','failed')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  scheduled_start_at timestamptz,
  next_charge_at timestamptz,
  cancel_at_cycle_end boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions(status);
create index if not exists billing_subscriptions_trial_ends_idx
  on public.billing_subscriptions(trial_ends_at);

create table if not exists public.billing_payments (
  razorpay_payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  razorpay_subscription_id text,
  amount bigint not null default 0,
  currency text not null default 'INR',
  status text not null,
  transaction_type text not null default 'recurring'
    check (transaction_type in ('authorization','recurring')),
  method text,
  paid_at timestamptz,
  source_event_id text,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists billing_payments_user_created_idx
  on public.billing_payments(user_id, created_at desc);

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default pg_catalog.now()
);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_webhook_events enable row level security;

-- Explicitly remove browser write privileges, then grant read-only access.
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.billing_payments from public, anon, authenticated;
revoke all on table public.billing_webhook_events from public, anon, authenticated;

grant select on table public.billing_subscriptions, public.billing_payments to authenticated;
grant all on table public.billing_subscriptions, public.billing_payments, public.billing_webhook_events to service_role;

drop policy if exists "Users can read their own billing subscription" on public.billing_subscriptions;
create policy "Users can read their own billing subscription"
  on public.billing_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own billing payments" on public.billing_payments;
create policy "Users can read their own billing payments"
  on public.billing_payments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- SECURITY DEFINER is required because the trigger inserts into a protected table.
-- An empty search_path prevents objects in writable schemas from shadowing built-ins.
-- The table is schema-qualified below. Existing accounts are deliberately not backfilled.
create or replace function public.create_hacktheta_trial_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_subscriptions (
    user_id,
    trial_started_at,
    trial_ends_at,
    status
  )
  values (
    new.id,
    pg_catalog.now(),
    pg_catalog.now() + interval '7 days',
    'trialing'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_hacktheta_trial on auth.users;
create trigger on_auth_user_created_hacktheta_trial
after insert on auth.users
for each row
execute function public.create_hacktheta_trial_for_new_user();

-- Trigger invocation does not require browser roles to call this function directly.
revoke all on function public.create_hacktheta_trial_for_new_user() from public, anon, authenticated;

commit;

-- Existing accounts are not silently granted a new trial. They can subscribe immediately.
