-- HIKER+ Shoes Factory ERP — 0005 PIN helpers: correct search_path
--
-- Repairs a defect in 0001/0004: the PIN functions were declared with
-- `set search_path = public` only, but pgcrypto's crypt() / gen_salt() live in
-- Supabase's `extensions` schema, so the unqualified calls could not be resolved
-- and setting or checking a PIN failed with
--
--   ERROR: function gen_salt(unknown, integer) does not exist
--
-- Nothing exposed it earlier because no account had a PIN yet, and verify_pin()
-- short-circuits before calling crypt() when pin_hash is null.
--
-- ALTER FUNCTION re-declares the search_path without touching the body, so this is
-- additive and idempotent. 0001 and 0004 carry the corrected declaration as well,
-- so a fresh apply is right from the start.

begin;

alter function public.verify_pin(text) set search_path = public, extensions;
alter function public.set_pin(uuid, text) set search_path = public, extensions;
alter function public.setup_pin(text) set search_path = public, extensions;
alter function public.change_pin(text, text) set search_path = public, extensions;

commit;
