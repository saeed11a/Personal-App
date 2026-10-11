-- HIKER+ Shoes Factory ERP — 0002 administrator bootstrap + PIN status
--
-- Additive and idempotent: safe to re-run. Adds the two server-side pieces the
-- five-digit PIN screen needs, plus the one-time administrator bootstrap.
--
-- Nothing here creates an auth user: accounts stay with Supabase Auth (dashboard
-- "Add user" / invite), so no password ever passes through this repository or
-- through an automated agent. Run the bootstrap AFTER that user exists.

begin;

-- ---------------------------------------------------------------------------
-- PIN status — everything the unlock screen is allowed to know
-- ---------------------------------------------------------------------------

-- Whether this account has a PIN, and whether it is locked out. Deliberately does
-- NOT expose pin_hash or pin_failed_attempts: the browser never sees the hash, and
-- the comparison stays inside verify_pin().
create or replace function public.pin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select jsonb_build_object(
        'has_pin', p.pin_hash is not null,
        'locked_until', p.pin_locked_until
      )
      from public.profiles p
      where p.id = auth.uid()
    ),
    jsonb_build_object('has_pin', false, 'locked_until', null)
  );
$$;

-- Supabase grants EXECUTE to anon/authenticated explicitly on new functions, so
-- revoke from both roles as well as from PUBLIC.
revoke all on function public.pin_status() from public, anon;
grant execute on function public.pin_status() to authenticated;

-- The PIN entry points are for signed-in accounts only. 0001 revoked them from
-- anon, but a PUBLIC grant would still reach anon through role inheritance, so
-- revoke that too and hand execute back to authenticated explicitly.
revoke all on function public.verify_pin(text) from public, anon;
grant execute on function public.verify_pin(text) to authenticated;
revoke all on function public.set_pin(uuid, text) from public, anon;
grant execute on function public.set_pin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep the PIN hash out of the client's reach
-- ---------------------------------------------------------------------------

-- profiles RLS already limits an account to its own row (administrators to all).
-- Column privileges make sure those rows cannot carry the salted PIN hash or the
-- lockout counters to the browser.
revoke select on public.profiles from anon, authenticated;
grant select (id, email, full_name, phone, role, status, pin_updated_at,
              last_login_at, created_date, updated_date)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- One-time administrator bootstrap
-- ---------------------------------------------------------------------------

-- Promotes the configured administrator's existing, confirmed auth user to an
-- active admin profile. One-shot by design — it refuses as soon as any
-- administrator exists, and public sign-up stays off:
--   'invalid_email'        — no usable address was passed
--   'already_bootstrapped' — an administrator already exists; nothing is changed
--   'user_not_found'       — no confirmed auth user with that email yet
--   'done'                 — the profile was created/promoted to administrator
-- Not callable by the app: database owner / service_role only.
--
--   select public.bootstrap_admin('hikerplusshoes@gmail.com');
create or replace function public.bootstrap_admin(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_existing uuid;
  v_uid uuid;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return 'invalid_email';
  end if;

  select id into v_existing from public.profiles where role = 'admin' limit 1;
  if v_existing is not null then
    return 'already_bootstrapped';
  end if;

  select id into v_uid
    from auth.users
   where lower(email) = lower(p_email)
     and email_confirmed_at is not null
   order by created_at
   limit 1;

  if v_uid is null then
    return 'user_not_found';
  end if;

  insert into public.profiles (id, email, role, status)
  values (v_uid, lower(p_email), 'admin', 'active')
  on conflict (id) do update
    set role = 'admin', status = 'active', email = excluded.email;

  perform public.log_audit(
    'admin_bootstrap', 'users', 'profiles', v_uid::text,
    jsonb_build_object('email', lower(p_email)), true
  );

  return 'done';
end $$;

revoke all on function public.bootstrap_admin(text) from public, anon, authenticated;

commit;
