-- HackTheta PayU billing migration v3
-- Additive migration: preserves legacy Razorpay IDs and payment history.
-- Run this in the EXISTING Supabase project after reviewing the changes.
begin;

alter table public.billing_subscriptions
  add column if not exists payment_provider text,
  add column if not exists payu_txnid text,
  add column if not exists payu_mihpayid text,
  add column if not exists payu_mandate_status text,
  add column if not exists payu_payment_mode text,
  add column if not exists payu_phone text,
  add column if not exists payu_email text,
  add column if not exists payu_predebit_for date,
  add column if not exists payu_predebit_sent_at timestamptz,
  add column if not exists payu_mandate_seq_no integer not null default 2,
  add column if not exists payu_last_error text;

-- Preserve legacy provider attribution for pre-existing Razorpay records.
update public.billing_subscriptions
set payment_provider = 'razorpay'
where payment_provider is null and razorpay_subscription_id is not null;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_status_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_status_check
  check (status in ('trialing','created','authenticated','active','pending','halted','paused','past_due','cancelled','completed','expired','failed'));

create table if not exists public.payu_billing_attempts (
  txnid text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('mandate_registration','recurring')),
  cycle_date date,
  amount numeric(12,2) not null default 0,
  currency text not null default 'INR',
  status text not null default 'created',
  mihpayid text,
  payment_mode text,
  paid_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists payu_billing_attempts_user_created_idx
  on public.payu_billing_attempts(user_id, created_at desc);
create index if not exists payu_billing_attempts_status_idx
  on public.payu_billing_attempts(status, created_at);
create unique index if not exists payu_billing_attempts_recurring_cycle_unique
  on public.payu_billing_attempts(user_id, transaction_type, cycle_date)
  where transaction_type = 'recurring' and cycle_date is not null;

alter table public.payu_billing_attempts enable row level security;
revoke all on table public.payu_billing_attempts from public, anon, authenticated;
grant all on table public.payu_billing_attempts to service_role;

-- Keep browser users read-only for their own existing subscription/payment rows.
revoke insert, update, delete on table public.billing_subscriptions, public.billing_payments from authenticated, anon, public;
grant select on table public.billing_subscriptions, public.billing_payments to authenticated;

commit;
