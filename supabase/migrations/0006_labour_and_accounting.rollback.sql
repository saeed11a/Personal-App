-- ===========================================================================
-- 0006_labour_and_accounting.rollback.sql
--
-- Reverses 0006. Nothing that existed before 0006 is deleted by this script: the
-- columns 0006 added to public.payments are dropped only after the labour tables
-- that reference them are gone, and the pre-0006 payments/roznamcha write policies
-- are restored exactly as 0001 created them.
--
-- Run only if the Labour module has to be removed; the settings/audit history in
-- audit_logs is intentionally left in place.
-- ===========================================================================

-- 1. Functions
drop function if exists public.post_payment(jsonb);
drop function if exists public.reverse_payment(uuid, text);
drop function if exists public.record_labour_production(jsonb);
drop function if exists public.complete_labour_production(jsonb);
drop function if exists public.transfer_labour_stage(jsonb);
drop function if exists public.labour_balances();
drop function if exists public.labour_earned(uuid);
drop function if exists public.labour_paid(uuid);
drop function if exists public.labour_rate_on(uuid, uuid, date);

-- 2. Labour + manual-category tables
drop table if exists public.labour_stage_moves;
drop table if exists public.labour_earnings;
drop table if exists public.labour_production;
drop table if exists public.labour_rates;
drop table if exists public.labour_category_links;
drop table if exists public.labours;
drop table if exists public.labour_categories;
drop table if exists public.manual_categories;

-- 3. payments: restore the plain permission policies of 0001
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_permission('payments:add'));
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.has_permission('payments:edit')) with check (public.has_permission('payments:edit'));
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_permission('payments:delete'));

drop index if exists public.payments_idempotency_key_idx;
drop index if exists public.payments_reversal_of_idx;
drop index if exists public.payments_party_id_idx;
drop index if exists public.payments_source_idx;

alter table public.payments
  drop column if exists source,
  drop column if exists roznamcha_id,
  drop column if exists idempotency_key,
  drop column if exists is_advance,
  drop column if exists reversed,
  drop column if exists reversal_of,
  drop column if exists reversed_at,
  drop column if exists reversed_reason,
  drop column if exists created_by;

-- 4. roznamcha: restore the plain permission policies of 0001
drop policy if exists roznamcha_insert on public.roznamcha;
create policy roznamcha_insert on public.roznamcha for insert to authenticated
  with check (public.has_permission('roznamcha:add'));
drop policy if exists roznamcha_update on public.roznamcha;
create policy roznamcha_update on public.roznamcha for update to authenticated
  using (public.has_permission('roznamcha:edit')) with check (public.has_permission('roznamcha:edit'));
drop policy if exists roznamcha_delete on public.roznamcha;
create policy roznamcha_delete on public.roznamcha for delete to authenticated
  using (public.has_permission('roznamcha:delete'));
