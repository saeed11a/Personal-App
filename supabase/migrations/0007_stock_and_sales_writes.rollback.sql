-- Rollback for 0007_stock_and_sales_writes.sql
--
-- Drops the functions the migration added. Nothing it writes is removed: the stock,
-- production, purchase, invoice and payment rows the app created stay in place.

begin;

drop function if exists public.create_invoice(jsonb);
drop function if exists public.record_production(jsonb);
drop function if exists public.record_purchase(jsonb);
drop function if exists public.add_raw_stock_line(jsonb);
drop function if exists public.save_raw_stock(jsonb);
drop function if exists public.save_ready_stock(jsonb);
drop function if exists public.article_ready_stock(text);
drop function if exists public.article_uppers_stock(text);
drop function if exists public.find_or_create_article(text, text, text);
drop function if exists public.num_or_zero(text);

commit;
