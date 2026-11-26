-- Optional cleanup for an existing HackTheta database after payment services are retired.
-- Before running this script:
-- 1. Cancel every active PayU Standing Instruction/mandate in the PayU merchant dashboard.
-- 2. Confirm no refunds, disputes, settlements, audits, or record-retention needs remain.
-- 3. Export/backup any payment history that must be retained.
-- This is destructive and is not required for the free application code to run.

drop table if exists public.payu_billing_attempts;
drop table if exists public.billing_payments;
drop table if exists public.billing_subscriptions;
