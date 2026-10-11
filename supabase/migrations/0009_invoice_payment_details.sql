-- HIKER+ Shoes Factory ERP — 0009 invoice payment details
--
-- Additive and idempotent: safe to re-run. The printed invoice follows the factory's
-- sample design, which carries a PAYMENT INFO block (account number, account name,
-- branch) and a Terms & Conditions block. Neither had anywhere to live, so the invoice
-- would print placeholders forever.
--
-- What this adds (public.settings, the single company row created by 0001):
--   1. bank_account_no / bank_account_name / bank_branch — the PAYMENT INFO block.
--   2. terms — the Terms & Conditions block.
--
-- Privileges need no change: 0001 grants the settings table as a whole, so new columns
-- inherit the same module-permission RLS. The columns are added first and the row is
-- left untouched, so an existing settings row simply reads NULL until it is saved from
-- Settings.
--
-- Rollback: 0009_invoice_payment_details.rollback.sql

begin;

alter table public.settings add column if not exists bank_account_no text;
alter table public.settings add column if not exists bank_account_name text;
alter table public.settings add column if not exists bank_branch text;
alter table public.settings add column if not exists terms text;

commit;
