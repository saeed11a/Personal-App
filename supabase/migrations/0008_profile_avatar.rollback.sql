-- Rollback for 0008_profile_avatar.sql.
--
-- Removes the avatar write path, the storage policies and the bucket, then the
-- column itself. Objects already stored in the bucket are NOT deleted by this file:
-- run `delete from storage.objects where bucket_id = 'avatars';` first if you want a
-- clean sweep. Re-running 0008 afterwards restores everything additively.

begin;

drop policy if exists avatars_read on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

delete from storage.buckets where id = 'avatars';

drop function if exists public.set_own_avatar(text);

alter table public.profiles drop column if exists avatar_url;

-- Put the 0003 column list back, without avatar_url.
revoke select on public.profiles from anon, authenticated;
grant select (id, email, full_name, phone, role, status, department, pin_updated_at,
              last_login_at, created_date, updated_date)
  on public.profiles to authenticated;

commit;
