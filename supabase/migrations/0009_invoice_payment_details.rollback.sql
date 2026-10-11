-- Rollback for 0009_invoice_payment_details.sql.
--
-- Drops the invoice PAYMENT INFO and Terms & Conditions columns from public.settings.
-- Only the columns are removed: the settings row itself (company name, currency,
-- packing defaults) is untouched, so the app keeps working with its defaults.
-- Re-running 0009 afterwards restores the columns, empty.

begin;

alter table public.settings drop column if exists bank_account_no;
alter table public.settings drop column if exists bank_account_name;
alter table public.settings drop column if exists bank_branch;
alter table public.settings drop column if exists terms;

commit;
