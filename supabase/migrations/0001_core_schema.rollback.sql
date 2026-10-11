-- Rollback for 0001_core_schema.sql
--
-- DESTRUCTIVE: drops every table and function the forward migration created, with
-- their data. It was safe to ship because the Supabase project was verified EMPTY
-- (0 tables, 0 users) when 0001 was applied. Do not run it on a populated project
-- without exporting the data first.
--
--   docker compose -f docker-compose.base44.yml run --rm dbadmin \
--     sh -c 'psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f /sql/migrations/0001_core_schema.rollback.sql'

begin;

drop table if exists
  public.invoice_lines,
  public.invoices,
  public.payments,
  public.roznamcha,
  public.purchases,
  public.production_entries,
  public.ready_shoes,
  public.raw_stocks,
  public.raw_categories,
  public.articles,
  public.customers,
  public.suppliers,
  public.settings,
  public.audit_logs,
  public.user_permissions,
  public.profiles
cascade;

drop function if exists public.verify_pin(text);
drop function if exists public.set_pin(uuid, text);
drop function if exists public.log_audit(text, text, text, text, jsonb, boolean);
drop function if exists public.has_permission(text);
drop function if exists public.is_admin();
drop function if exists public.touch_updated_date();

-- pgcrypto is deliberately left installed; other Supabase features rely on it.

commit;
