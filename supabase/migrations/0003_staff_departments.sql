-- HIKER+ Shoes Factory ERP — 0003 staff departments
--
-- Additive and idempotent: safe to re-run. Gives every profile a fixed department,
-- which the administrator's "Staff & access" screen uses to offer sensible starting
-- access levels per employee. The department -> module defaults themselves live in
-- the app (src/lib/permissions.js); nothing server-side needs to know them.

begin;

-- Fixed factory list, enforced here so a typo cannot invent a department.
alter table public.profiles add column if not exists department text;

alter table public.profiles drop constraint if exists profiles_department_check;
alter table public.profiles add constraint profiles_department_check
  check (
    department is null
    or department in ('store', 'production', 'ready_shoes', 'sales', 'purchase', 'accounts', 'management')
  );

create index if not exists profiles_department_idx on public.profiles (department);

-- 0002 replaced the table-wide SELECT grant on profiles with an explicit column
-- list, so a new column has to be added to that list or the browser cannot read it.
revoke select on public.profiles from anon, authenticated;
grant select (id, email, full_name, phone, role, status, department, pin_updated_at,
              last_login_at, created_date, updated_date)
  on public.profiles to authenticated;

commit;
