-- HIKER+ Shoes Factory ERP — 0008 profile avatars
--
-- Additive and idempotent: safe to re-run. Gives every profile a stored avatar and
-- opens one narrow write path for it, so the profile menu can save a picture without
-- loosening the "no user changes their own role, status or PIN" rule from 0001.
--
-- What this adds:
--   1. profiles.avatar_url — the saved picture, read by AuthContext and the top bar.
--   2. public.set_own_avatar(text) — writes ONLY the caller's own avatar_url. A
--      SECURITY DEFINER function is used instead of a self-update RLS policy because
--      RLS cannot restrict columns: a policy permissive enough to let staff set their
--      picture would also let them set their own role, status or pin_hash.
--   3. The private-write / public-read `avatars` Storage bucket and its policies.
--      Uploads are confined to a folder named after the uploader's user id, so no
--      account can overwrite another account's picture.
--
-- Rollback: 0008_profile_avatar.rollback.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. The column, and the read grant for it
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists avatar_url text;

-- 0002/0003 replaced the table-wide SELECT grant on profiles with an explicit column
-- list, so a new column has to be added to that list or the browser cannot read it.
revoke select on public.profiles from anon, authenticated;
grant select (id, email, full_name, phone, role, status, department, avatar_url,
              pin_updated_at, last_login_at, created_date, updated_date)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The single write path: your own avatar, and nothing else
-- ---------------------------------------------------------------------------

create or replace function public.set_own_avatar(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Only the avatar_url column of the caller's own row is touched; role, status and
  -- the PIN columns are never part of this statement.
  update public.profiles
     set avatar_url = nullif(btrim(coalesce(p_url, '')), '')
   where id = auth.uid();
end $$;

revoke all on function public.set_own_avatar(text) from public, anon;
grant execute on function public.set_own_avatar(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage: the avatars bucket and its policies
-- ---------------------------------------------------------------------------

-- Public read (the picture is shown by URL, including after a fresh sign-in), but a
-- 2 MB image limit and an explicit MIME allowlist. Writes stay owner-scoped below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Every object lives at '<user id>/<file name>', so the first path segment is the
-- owner. An account can therefore only create, replace or delete its own picture.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
