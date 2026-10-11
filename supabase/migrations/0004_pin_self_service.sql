-- HIKER+ Shoes Factory ERP — 0004 self-service PIN setup and change
--
-- Additive and idempotent: safe to re-run. Adds the two server-side entry points
-- the first-time setup and "change PIN" screens need:
--
--   setup_pin(p_pin)              own account, first time only, administrators only
--   change_pin(p_current, p_new)  own account, requires the current PIN
--
-- Both hash inside the database with a fresh bcrypt salt, so a plaintext PIN never
-- reaches a table, an audit row, a log or the browser. Issuing or resetting someone
-- else's PIN stays with set_pin() (0001), which is administrator-only.

begin;

-- ---------------------------------------------------------------------------
-- First-time setup — the authenticated administrator's own account
-- ---------------------------------------------------------------------------

-- Returns: 'done' | 'already_set' | 'invalid_pin' | 'not_allowed'
create or replace function public.setup_pin(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null or v_profile.status <> 'active' or v_profile.role <> 'admin' then
    perform public.log_audit('pin_setup_denied', 'auth', 'profiles', v_profile.id::text, null, false);
    return 'not_allowed';
  end if;

  -- First time only. An existing PIN can only be replaced through change_pin(),
  -- which demands the current one — that is what stops a hijacked session from
  -- silently replacing a PIN.
  if v_profile.pin_hash is not null then
    return 'already_set';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{5}$' then
    return 'invalid_pin';
  end if;

  update public.profiles
     set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
         pin_failed_attempts = 0,
         pin_locked_until = null,
         pin_updated_at = now()
   where id = v_profile.id;

  perform public.log_audit('pin_setup', 'auth', 'profiles', v_profile.id::text, null, true);
  return 'done';
end $$;

-- ---------------------------------------------------------------------------
-- Change — own account, current PIN required
-- ---------------------------------------------------------------------------

-- Returns: 'done' | 'wrong_current' | 'locked' | 'invalid_pin' | 'not_allowed'
--
-- A wrong current PIN counts towards the same five-attempt lockout as verify_pin(),
-- so guessing the old PIN is rate-limited exactly like guessing at the unlock screen.
create or replace function public.change_pin(p_current text, p_new text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_max_attempts constant integer := 5;
  v_lock_minutes constant integer := 15;
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null or v_profile.status <> 'active' or v_profile.pin_hash is null then
    perform public.log_audit('pin_change_denied', 'auth', 'profiles', v_profile.id::text, null, false);
    return 'not_allowed';
  end if;

  if v_profile.pin_locked_until is not null and v_profile.pin_locked_until > now() then
    perform public.log_audit('pin_locked', 'auth', 'profiles', v_profile.id::text, null, false);
    return 'locked';
  end if;

  if p_new is null or p_new !~ '^[0-9]{5}$' then
    return 'invalid_pin';
  end if;

  if p_current is null or crypt(p_current, v_profile.pin_hash) <> v_profile.pin_hash then
    update public.profiles
       set pin_failed_attempts = v_profile.pin_failed_attempts + 1,
           pin_locked_until = case
             when v_profile.pin_failed_attempts + 1 >= v_max_attempts
               then now() + (v_lock_minutes || ' minutes')::interval
             else v_profile.pin_locked_until
           end
     where id = v_profile.id;

    -- The attempted PINs are never logged; only the fact of the failure.
    perform public.log_audit('pin_change', 'auth', 'profiles', v_profile.id::text,
                             jsonb_build_object('reason', 'wrong_current'), false);
    return 'wrong_current';
  end if;

  update public.profiles
     set pin_hash = crypt(p_new, gen_salt('bf', 10)),
         pin_failed_attempts = 0,
         pin_locked_until = null,
         pin_updated_at = now()
   where id = v_profile.id;

  perform public.log_audit('pin_change', 'auth', 'profiles', v_profile.id::text, null, true);
  return 'done';
end $$;

-- ---------------------------------------------------------------------------
-- Execute rights: signed-in accounts only
-- ---------------------------------------------------------------------------

-- Supabase grants EXECUTE to anon/authenticated explicitly on new functions, so
-- PUBLIC and anon both have to be revoked before handing execute back.
revoke all on function public.setup_pin(text) from public, anon;
grant execute on function public.setup_pin(text) to authenticated;

revoke all on function public.change_pin(text, text) from public, anon;
grant execute on function public.change_pin(text, text) to authenticated;

commit;
