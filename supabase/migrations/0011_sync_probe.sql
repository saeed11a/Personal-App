-- HIKER+ Shoes Factory ERP — 0011 sync probe
--
-- One small, RLS-respecting helper the synchronization panel uses to answer
-- "how many server rows changed since I last reconciled?" without one request per
-- table. It is deliberately SECURITY INVOKER (no `security definer`), so every
-- count is filtered by the caller's own RLS policies: an account only ever sees the
-- changed-row counts of the modules it may read, and every other count comes back 0.
--
-- Rollback: 0011_sync_probe.rollback.sql

begin;

create or replace function public.sync_probe(p_since timestamptz)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'articles',           (select count(*) from public.articles           where updated_date > p_since),
    'raw_categories',     (select count(*) from public.raw_categories     where updated_date > p_since),
    'raw_stocks',         (select count(*) from public.raw_stocks         where updated_date > p_since),
    'ready_shoes',        (select count(*) from public.ready_shoes        where updated_date > p_since),
    'production_entries', (select count(*) from public.production_entries where updated_date > p_since),
    'purchases',          (select count(*) from public.purchases          where updated_date > p_since),
    'customers',          (select count(*) from public.customers          where updated_date > p_since),
    'suppliers',          (select count(*) from public.suppliers          where updated_date > p_since),
    'invoices',           (select count(*) from public.invoices           where updated_date > p_since),
    'invoice_lines',      (select count(*) from public.invoice_lines      where updated_date > p_since),
    'payments',           (select count(*) from public.payments           where updated_date > p_since),
    'roznamcha',          (select count(*) from public.roznamcha          where updated_date > p_since)
  );
$$;

revoke all on function public.sync_probe(timestamptz) from anon;
grant execute on function public.sync_probe(timestamptz) to authenticated;

commit;
