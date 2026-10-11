-- Rollback for 0010_admin_console_security.sql
--
-- Drops only what 0010 created. The hardened has_permission() is restored to its
-- pre-0010 definition (no status check) because dropping a SECURITY DEFINER function
-- every policy depends on would break the whole app. No business row is touched.

begin;

drop function if exists public.restore_table_rows(text, jsonb);
drop function if exists public.admin_update_user(uuid, text, text, text, text, text);
drop function if exists public.admin_users();
drop function if exists public.log_admin_event(text, text, text, text, jsonb, boolean);

drop trigger if exists user_permissions_audit on public.user_permissions;
drop trigger if exists profiles_audit_change on public.profiles;
drop function if exists public.audit_permission_change();
drop function if exists public.audit_profile_change();

drop table if exists public.backups;

drop index if exists public.invoices_created_date_idx;
drop index if exists public.invoice_lines_created_date_idx;
drop index if exists public.payments_created_date_idx;
drop index if exists public.roznamcha_created_date_idx;
drop index if exists public.customers_name_idx;
drop index if exists public.suppliers_name_idx;

-- Back to the pre-0010 permission check (administrator role only, no active check).
create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.user_permissions up
      where up.user_id = auth.uid()
        and up.granted
        and (
          up.permission = p_permission
          or up.permission = split_part(p_permission, ':', 1) || ':*'
        )
    );
$$;

commit;
