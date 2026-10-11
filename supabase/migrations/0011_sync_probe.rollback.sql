-- Rollback for 0011_sync_probe.sql
begin;
drop function if exists public.sync_probe(timestamptz);
commit;
