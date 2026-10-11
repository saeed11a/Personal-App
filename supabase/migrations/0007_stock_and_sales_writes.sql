-- HIKER+ Shoes Factory ERP — 0007 stock, production, purchase and invoice writes
--
-- Why this exists
-- ---------------
-- Every "add new" form in these modules called a hosted Base44 backend function
-- (saveReadyStock, saveRawStock, recordPurchase, recordProduction, createInvoice).
-- That backend is not linked in the Supabase environment, so each save came back as
-- "Request failed with status code 404" and nothing was stored. The write paths now
-- live in the database, one transaction per action, reproducing the original Base44
-- function logic (base44/shared/stockOps.ts and functions/*/entry.ts) exactly:
-- cartons x pairs-per-carton become pairs, uppers issued are checked against the
-- uppers bought minus the pairs already produced, ready pairs are checked against
-- what is on hand minus what has been invoiced, and the article list stays populated
-- from the stock entries that name an article.
--
-- Permission gate
-- ---------------
-- Each function checks the one module action its screen is gated on
-- (raw_stock:add|edit, ready_shoes:add|edit, purchase:add, production:add,
-- invoices:add) and refuses a caller without it. The rows a function derives from the
-- action it authorizes — the article a stock line creates, the ready-shoe batch a
-- production run adds, the receipt an invoice carries — are written inside the same
-- transaction. The functions are SECURITY DEFINER, so a Store clerk needs raw stock
-- access only and not articles:add as well, exactly as before.
--
-- Rollback: 0007_stock_and_sales_writes.rollback.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers — number parsing, article lookup, the two stock positions
-- ---------------------------------------------------------------------------

-- The forms send numbers as JSON, but a blank field arrives as "". Anything that is
-- not a plain number is zero, never an exception (the app's own num()).
create or replace function public.num_or_zero(p_value text) returns numeric
language sql immutable set search_path = public as $$
  select case
    when btrim(coalesce(p_value, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p_value)::numeric
    else 0
  end;
$$;

-- Articles are populated automatically from stock entries — never duplicated.
create or replace function public.find_or_create_article(
  p_code text,
  p_name text default null,
  p_category text default null
) returns public.articles
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_article public.articles;
begin
  if v_code <> '' then
    select * into v_article from public.articles a
     where not a.is_deleted and lower(a.code) = lower(v_code)
     limit 1;
  end if;

  if v_article.id is null and v_name <> '' then
    select * into v_article from public.articles a
     where not a.is_deleted and lower(a.name) = lower(v_name)
     limit 1;
  end if;

  if v_article.id is null then
    insert into public.articles (code, name, category, status, is_deleted)
    values (
      coalesce(nullif(v_code, ''), 'ART-' || right(to_char(clock_timestamp(), 'US'), 6)),
      coalesce(nullif(v_name, ''), nullif(v_code, ''), 'New Article'),
      coalesce(nullif(v_category, ''), 'Unisex'),
      'active', false)
    returning * into v_article;
    return v_article;
  end if;

  -- A placeholder name is replaced once a real one arrives; the category follows the
  -- entry that names it.
  if v_name <> '' and lower(v_article.name) <> lower(v_name) and v_article.name ~* '^(art-|new article)' then
    update public.articles set name = v_name where id = v_article.id returning * into v_article;
  end if;

  if v_category <> '' and coalesce(v_article.category, '') <> v_category then
    update public.articles set category = v_category where id = v_article.id returning * into v_article;
  end if;

  return v_article;
end $$;

-- Pairs of uppers bought for an article minus the pairs already issued to production.
create or replace function public.article_uppers_stock(p_article_code text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(total_pairs) from public.raw_stocks
                    where category = 'uppers'
                      and upper(article_code) = upper(btrim(coalesce(p_article_code, '')))
                      and not is_deleted), 0)
       - coalesce((select sum(uppers_used_pairs) from public.production_entries
                    where upper(article_code) = upper(btrim(coalesce(p_article_code, '')))
                      and not is_deleted), 0);
$$;

-- Ready pairs added (produced or by hand) minus the pairs already invoiced.
create or replace function public.article_ready_stock(p_article_code text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(pairs) from public.ready_shoes
                    where upper(article_code) = upper(btrim(coalesce(p_article_code, '')))
                      and not is_deleted), 0)
       - coalesce((select sum(pairs) from public.invoice_lines
                    where upper(article_code) = upper(btrim(coalesce(p_article_code, '')))
                      and not is_deleted), 0);
$$;

-- ---------------------------------------------------------------------------
-- 2. save_ready_stock() — cartons x pairs-per-carton, article kept in step
-- ---------------------------------------------------------------------------
create or replace function public.save_ready_stock(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(btrim(coalesce(p_payload->>'id', '')), '')::uuid;
  v_code text := upper(btrim(coalesce(p_payload->>'article_code', '')));
  v_per_carton numeric := public.num_or_zero(p_payload->>'pairs_per_carton');
  v_cartons numeric := public.num_or_zero(p_payload->>'cartons');
  v_pairs numeric;
  v_article public.articles;
  v_record public.ready_shoes;
  v_name text;
  v_source text;
  v_date date;
begin
  if v_id is null then
    if not public.has_permission('ready_shoes:add') then
      perform public.log_audit('ready_stock_save_denied', 'ready_shoes', 'ready_shoes', null,
        jsonb_build_object('reason', 'no ready_shoes:add'), false);
      return jsonb_build_object('error', 'You do not have permission to add ready shoes');
    end if;
  elsif not public.has_permission('ready_shoes:edit') then
    perform public.log_audit('ready_stock_save_denied', 'ready_shoes', 'ready_shoes', v_id::text,
      jsonb_build_object('reason', 'no ready_shoes:edit'), false);
    return jsonb_build_object('error', 'You do not have permission to change ready shoe batches');
  end if;

  if v_code = '' then
    return jsonb_build_object('error', 'Article number is required');
  end if;

  v_article := public.find_or_create_article(v_code, p_payload->>'article_name', p_payload->>'article_category');
  v_pairs := case when v_per_carton > 0 then v_cartons * v_per_carton
                  else public.num_or_zero(p_payload->>'pairs') end;
  v_name := coalesce(btrim(coalesce(v_article.name, '')), '');
  v_source := coalesce(nullif(btrim(coalesce(p_payload->>'source', '')), ''), 'manual');
  v_date := coalesce(nullif(btrim(coalesce(p_payload->>'entry_date', '')), '')::date, current_date);

  if v_id is null then
    insert into public.ready_shoes (article_id, article_code, article_name, batch_label, carton_type,
      pairs_per_carton, cartons, pairs, source, entry_date, notes, is_deleted)
    values (v_article.id, v_article.code, v_name,
      nullif(btrim(coalesce(p_payload->>'batch_label', '')), ''),
      nullif(btrim(coalesce(p_payload->>'carton_type', '')), ''),
      v_per_carton, v_cartons, v_pairs, v_source, v_date,
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
    returning * into v_record;
  else
    update public.ready_shoes set
      article_id = v_article.id,
      article_code = v_article.code,
      article_name = v_name,
      batch_label = nullif(btrim(coalesce(p_payload->>'batch_label', '')), ''),
      carton_type = nullif(btrim(coalesce(p_payload->>'carton_type', '')), ''),
      pairs_per_carton = v_per_carton,
      cartons = v_cartons,
      pairs = v_pairs,
      source = v_source,
      entry_date = v_date,
      notes = nullif(btrim(coalesce(p_payload->>'notes', '')), '')
     where id = v_id
    returning * into v_record;

    if v_record.id is null then
      return jsonb_build_object('error', 'That ready shoe batch no longer exists');
    end if;
  end if;

  perform public.log_audit('ready_stock_saved', 'ready_shoes', 'ready_shoes', v_record.id::text,
    jsonb_build_object('article', v_article.code, 'cartons', v_cartons, 'pairs', v_pairs), true);

  return jsonb_build_object('record', to_jsonb(v_record), 'article', to_jsonb(v_article));
end $$;

-- ---------------------------------------------------------------------------
-- 3. save_raw_stock() — one raw stock line, article kept in step
-- ---------------------------------------------------------------------------
create or replace function public.save_raw_stock(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(btrim(coalesce(p_payload->>'id', '')), '')::uuid;
  v_category text := coalesce(nullif(btrim(coalesce(p_payload->>'category', '')), ''), 'uppers');
  v_item text := btrim(coalesce(p_payload->>'item_name', ''));
  v_code text := upper(btrim(coalesce(p_payload->>'article_code', '')));
  v_per_pack numeric := public.num_or_zero(p_payload->>'pairs_per_pack');
  v_quantity numeric := public.num_or_zero(p_payload->>'quantity');
  v_price numeric := public.num_or_zero(p_payload->>'price');
  v_custom text := btrim(coalesce(p_payload->>'custom_json', ''));
  v_article public.articles;
  v_record public.raw_stocks;
begin
  if v_id is null then
    if not public.has_permission('raw_stock:add') then
      perform public.log_audit('raw_stock_save_denied', 'raw_stock', 'raw_stocks', null,
        jsonb_build_object('reason', 'no raw_stock:add'), false);
      return jsonb_build_object('error', 'You do not have permission to add raw stock');
    end if;
  elsif not public.has_permission('raw_stock:edit') then
    perform public.log_audit('raw_stock_save_denied', 'raw_stock', 'raw_stocks', v_id::text,
      jsonb_build_object('reason', 'no raw_stock:edit'), false);
    return jsonb_build_object('error', 'You do not have permission to change raw stock');
  end if;

  if v_item = '' then
    return jsonb_build_object('error', 'Item name is required');
  end if;

  if v_category = 'uppers' and v_code <> '' then
    v_article := public.find_or_create_article(v_code, coalesce(nullif(btrim(coalesce(p_payload->>'article_name', '')), ''), v_item),
      p_payload->>'article_category');
  end if;

  if v_id is null then
    insert into public.raw_stocks (category, item_name, article_code, article_id, pack_type, pairs_per_pack,
      quantity, unit, total_pairs, price, amount, supplier_name, purchase_date, custom_json, notes, is_deleted)
    values (v_category, v_item,
      case when v_article.id is null then v_code else v_article.code end,
      v_article.id,
      nullif(btrim(coalesce(p_payload->>'pack_type', '')), ''),
      v_per_pack, v_quantity,
      nullif(btrim(coalesce(p_payload->>'unit', '')), ''),
      case when v_per_pack > 0 then v_quantity * v_per_pack else public.num_or_zero(p_payload->>'total_pairs') end,
      v_price, v_price * v_quantity,
      nullif(btrim(coalesce(p_payload->>'supplier_name', '')), ''),
      coalesce(nullif(btrim(coalesce(p_payload->>'purchase_date', '')), '')::date, current_date),
      -- The form stores its custom fields as a JSON string, exactly as before.
      case when v_custom = '' then null else to_jsonb(v_custom) end,
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
    returning * into v_record;
  else
    update public.raw_stocks set
      category = v_category,
      item_name = v_item,
      article_code = case when v_article.id is null then v_code else v_article.code end,
      article_id = v_article.id,
      pack_type = nullif(btrim(coalesce(p_payload->>'pack_type', '')), ''),
      pairs_per_pack = v_per_pack,
      quantity = v_quantity,
      unit = nullif(btrim(coalesce(p_payload->>'unit', '')), ''),
      total_pairs = case when v_per_pack > 0 then v_quantity * v_per_pack else public.num_or_zero(p_payload->>'total_pairs') end,
      price = v_price,
      amount = v_price * v_quantity,
      supplier_name = nullif(btrim(coalesce(p_payload->>'supplier_name', '')), ''),
      purchase_date = coalesce(nullif(btrim(coalesce(p_payload->>'purchase_date', '')), '')::date, current_date),
      custom_json = case when v_custom = '' then null else to_jsonb(v_custom) end,
      notes = nullif(btrim(coalesce(p_payload->>'notes', '')), '')
     where id = v_id
    returning * into v_record;

    if v_record.id is null then
      return jsonb_build_object('error', 'That raw stock item no longer exists');
    end if;
  end if;

  perform public.log_audit('raw_stock_saved', 'raw_stock', 'raw_stocks', v_record.id::text,
    jsonb_build_object('item', v_item, 'category', v_category, 'quantity', v_quantity), true);

  return jsonb_build_object('record', to_jsonb(v_record), 'article', to_jsonb(v_article));
end $$;

-- ---------------------------------------------------------------------------
-- 4. add raw stock line for a purchase — top up the matching line, else open one
-- ---------------------------------------------------------------------------
create or replace function public.add_raw_stock_line(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_category text := coalesce(nullif(btrim(coalesce(p_payload->>'category', '')), ''), 'uppers');
  v_item text := btrim(coalesce(p_payload->>'item_name', ''));
  v_code text := upper(btrim(coalesce(p_payload->>'article_code', '')));
  v_pack text := nullif(btrim(coalesce(p_payload->>'pack_type', '')), '');
  v_per_pack numeric := public.num_or_zero(p_payload->>'pairs_per_pack');
  v_quantity numeric := public.num_or_zero(p_payload->>'quantity');
  v_amount numeric := public.num_or_zero(p_payload->>'amount');
  v_price numeric := public.num_or_zero(p_payload->>'price');
  v_date date := coalesce(nullif(btrim(coalesce(p_payload->>'purchase_date', '')), '')::date, current_date);
  v_article public.articles;
  v_line public.raw_stocks;
  v_record public.raw_stocks;
begin
  if v_category = 'uppers' and v_code <> '' then
    v_article := public.find_or_create_article(v_code,
      coalesce(nullif(btrim(coalesce(p_payload->>'article_name', '')), ''), v_item),
      p_payload->>'article_category');
  end if;

  select * into v_line from public.raw_stocks r
   where not r.is_deleted
     and r.category = v_category
     and lower(r.item_name) = lower(v_item)
     and upper(coalesce(r.article_code, '')) = case when v_article.id is null then v_code else upper(v_article.code) end
     and coalesce(r.pack_type, '') = coalesce(v_pack, '')
   limit 1;

  if v_line.id is not null then
    update public.raw_stocks set
      quantity = coalesce(quantity, 0) + v_quantity,
      total_pairs = coalesce(total_pairs, 0) + (case when v_per_pack > 0 then v_quantity * v_per_pack else public.num_or_zero(p_payload->>'total_pairs') end),
      amount = coalesce(amount, 0) + v_amount,
      price = case when v_price > 0 then v_price else price end,
      unit = coalesce(nullif(btrim(coalesce(p_payload->>'unit', '')), ''), unit),
      supplier_name = coalesce(nullif(btrim(coalesce(p_payload->>'supplier_name', '')), ''), supplier_name),
      purchase_date = v_date
     where id = v_line.id
    returning * into v_record;
  else
    insert into public.raw_stocks (category, item_name, article_code, article_id, pack_type, pairs_per_pack,
      quantity, unit, total_pairs, price, amount, supplier_name, purchase_date, notes, is_deleted)
    values (v_category, v_item,
      case when v_article.id is null then v_code else v_article.code end,
      v_article.id, v_pack, v_per_pack, v_quantity,
      nullif(btrim(coalesce(p_payload->>'unit', '')), ''),
      case when v_per_pack > 0 then v_quantity * v_per_pack else 0 end,
      v_price, case when v_amount > 0 then v_amount else v_price * v_quantity end,
      nullif(btrim(coalesce(p_payload->>'supplier_name', '')), ''), v_date,
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
    returning * into v_record;
  end if;

  return jsonb_build_object('record', to_jsonb(v_record), 'article', to_jsonb(v_article));
end $$;

-- ---------------------------------------------------------------------------
-- 5. record_purchase() — the purchase row plus the raw stock it brings in
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item text := btrim(coalesce(p_payload->>'item_name', ''));
  v_quantity numeric := public.num_or_zero(p_payload->>'quantity');
  v_unit_price numeric := public.num_or_zero(p_payload->>'unit_price');
  v_per_pack numeric := public.num_or_zero(p_payload->>'pairs_per_pack');
  v_amount numeric := v_quantity * v_unit_price;
  v_date date := coalesce(nullif(btrim(coalesce(p_payload->>'purchase_date', '')), '')::date, current_date);
  v_category text := coalesce(nullif(btrim(coalesce(p_payload->>'category', '')), ''), 'uppers');
  v_code text := upper(btrim(coalesce(p_payload->>'article_code', '')));
  v_purchase public.purchases;
  v_stock jsonb;
begin
  if not public.has_permission('purchase:add') then
    perform public.log_audit('purchase_denied', 'purchase', 'purchases', null,
      jsonb_build_object('reason', 'no purchase:add'), false);
    return jsonb_build_object('error', 'You do not have permission to record purchases');
  end if;

  if v_item = '' then
    return jsonb_build_object('error', 'Item name is required');
  end if;

  insert into public.purchases (supplier_id, supplier_name, item_name, article_code, category, unit, pack_type,
    pairs_per_pack, quantity, total_pairs, unit_price, amount, purchase_date, notes, is_deleted)
  values (nullif(btrim(coalesce(p_payload->>'supplier_id', '')), '')::uuid,
    nullif(btrim(coalesce(p_payload->>'supplier_name', '')), ''),
    v_item, v_code, v_category,
    nullif(btrim(coalesce(p_payload->>'unit', '')), ''),
    nullif(btrim(coalesce(p_payload->>'pack_type', '')), ''),
    v_per_pack, v_quantity,
    case when v_per_pack > 0 then v_quantity * v_per_pack else 0 end,
    v_unit_price, v_amount, v_date,
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
  returning * into v_purchase;

  v_stock := public.add_raw_stock_line(jsonb_build_object(
    'category', v_category,
    'item_name', v_item,
    'article_code', v_code,
    'article_name', nullif(btrim(coalesce(p_payload->>'article_name', '')), ''),
    'article_category', nullif(btrim(coalesce(p_payload->>'article_category', '')), ''),
    'pack_type', nullif(btrim(coalesce(p_payload->>'pack_type', '')), ''),
    'pairs_per_pack', v_per_pack,
    'quantity', v_quantity,
    'unit', nullif(btrim(coalesce(p_payload->>'unit', '')), ''),
    'price', v_unit_price,
    'amount', v_amount,
    'supplier_name', nullif(btrim(coalesce(p_payload->>'supplier_name', '')), ''),
    'purchase_date', v_date,
    'notes', nullif(btrim(coalesce(p_payload->>'notes', '')), '')));

  perform public.log_audit('purchase_recorded', 'purchase', 'purchases', v_purchase.id::text,
    jsonb_build_object('item', v_item, 'supplier', v_purchase.supplier_name, 'quantity', v_quantity,
                       'amount', v_amount), true);

  return jsonb_build_object(
    'purchase', to_jsonb(v_purchase),
    'raw_stock', v_stock->'record',
    'article', v_stock->'article');
end $$;

-- ---------------------------------------------------------------------------
-- 6. record_production() — issues uppers, adds the produced cartons to Ready Shoes
-- ---------------------------------------------------------------------------
create or replace function public.record_production(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_payload->>'article_code', '')));
  v_bags numeric := public.num_or_zero(p_payload->>'input_bags');
  v_per_bag numeric := public.num_or_zero(p_payload->>'pairs_per_bag');
  v_cartons numeric := public.num_or_zero(p_payload->>'output_cartons');
  v_per_carton numeric := public.num_or_zero(p_payload->>'pairs_per_carton');
  v_uppers_used numeric;
  v_output_pairs numeric;
  v_available numeric;
  v_article public.articles;
  v_date date;
  v_entry public.production_entries;
  v_batch public.ready_shoes;
  v_carton_type text;
begin
  if not public.has_permission('production:add') then
    perform public.log_audit('production_denied', 'production', 'production_entries', null,
      jsonb_build_object('reason', 'no production:add'), false);
    return jsonb_build_object('error', 'You do not have permission to record production');
  end if;

  select * into v_article from public.articles a
   where not a.is_deleted and upper(a.code) = v_code
   limit 1;

  if v_article.id is null then
    return jsonb_build_object('error',
      format('No article found for %s', coalesce(nullif(v_code, ''), 'the selected article')));
  end if;

  v_uppers_used := case when v_per_bag > 0 then v_bags * v_per_bag
                        else public.num_or_zero(p_payload->>'uppers_used_pairs') end;
  v_output_pairs := case when v_per_carton > 0 then v_cartons * v_per_carton
                         else public.num_or_zero(p_payload->>'output_pairs') end;

  if v_uppers_used = 0 and v_output_pairs = 0 then
    return jsonb_build_object('error', 'Enter the uppers issued and the ready cartons produced');
  end if;

  v_available := public.article_uppers_stock(v_article.code);
  if v_uppers_used > v_available then
    return jsonb_build_object('error',
      format('Only %s pair(s) of uppers in stock for %s, %s requested', v_available, v_article.code, v_uppers_used));
  end if;

  v_date := coalesce(nullif(btrim(coalesce(p_payload->>'production_date', '')), '')::date, current_date);
  v_carton_type := nullif(btrim(coalesce(p_payload->>'carton_type', '')), '');

  insert into public.production_entries (article_id, article_code, article_name, production_date, line, shift,
    operator, input_bags, pairs_per_bag, uppers_used_pairs, carton_type, pairs_per_carton, output_cartons,
    output_pairs, notes, is_deleted)
  values (v_article.id, v_article.code, coalesce(v_article.name, ''), v_date,
    nullif(btrim(coalesce(p_payload->>'line', '')), ''),
    nullif(btrim(coalesce(p_payload->>'shift', '')), ''),
    nullif(btrim(coalesce(p_payload->>'operator', '')), ''),
    v_bags, v_per_bag, v_uppers_used, v_carton_type, v_per_carton, v_cartons, v_output_pairs,
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
  returning * into v_entry;

  if v_output_pairs > 0 then
    insert into public.ready_shoes (article_id, article_code, article_name, batch_label, carton_type,
      pairs_per_carton, cartons, pairs, source, entry_date, notes, is_deleted)
    values (v_article.id, v_article.code, coalesce(v_article.name, ''),
      'Production ' || to_char(v_date, 'YYYY-MM-DD'), v_carton_type, v_per_carton, v_cartons, v_output_pairs,
      'production', v_date, nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
    returning * into v_batch;
  end if;

  perform public.log_audit('production_recorded', 'production', 'production_entries', v_entry.id::text,
    jsonb_build_object('article', v_article.code, 'uppers_used', v_uppers_used,
                       'output_pairs', v_output_pairs, 'batch_id', v_batch.id), true);

  return jsonb_build_object(
    'entry', to_jsonb(v_entry),
    'batch', case when v_batch.id is null then null else to_jsonb(v_batch) end,
    'uppers_available', v_available - v_uppers_used);
end $$;

-- ---------------------------------------------------------------------------
-- 7. create_invoice() — invoice, its lines, and the receipt that comes with it
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_customer_input jsonb := coalesce(p_payload->'customer', '{}'::jsonb);
  v_customer_name text := btrim(coalesce(v_customer_input->>'name', ''));
  v_customer_id uuid := nullif(btrim(coalesce(v_customer_input->>'id', '')), '')::uuid;
  v_customer public.customers;
  v_article public.articles;
  v_settings public.settings;
  v_line jsonb;
  v_row public.invoice_lines;
  v_lines jsonb := '[]'::jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_requested jsonb := '{}'::jsonb;
  v_code text;
  v_cartons numeric;
  v_per_carton numeric;
  v_pairs numeric;
  v_price numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_total_cartons numeric := 0;
  v_total_pairs numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_received numeric;
  v_date date;
  v_method text;
  v_prefix text;
  v_count integer;
  v_number text;
  v_status text;
  v_available numeric;
  v_outstanding numeric;
  v_advance boolean := false;
  v_invoice public.invoices;
  v_payment public.payments;
  v_entry public.roznamcha;
  v_i integer;
begin
  if not public.has_permission('invoices:add') then
    perform public.log_audit('invoice_denied', 'invoices', 'invoices', null,
      jsonb_build_object('reason', 'no invoices:add'), false);
    return jsonb_build_object('error', 'You do not have permission to create invoices');
  end if;

  if v_customer_name = '' then
    return jsonb_build_object('error', 'Customer name is required');
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('error', 'Add at least one item to the invoice');
  end if;

  -- --- every line: cartons become pairs, the article is found or created ---------
  for v_line in select * from jsonb_array_elements(v_items)
  loop
    v_code := upper(btrim(coalesce(v_line->>'article_code', '')));
    if v_code = '' then
      return jsonb_build_object('error', 'Every line needs an article');
    end if;

    v_cartons := public.num_or_zero(v_line->>'cartons');
    v_per_carton := public.num_or_zero(v_line->>'pairs_per_carton');
    v_pairs := case when v_per_carton > 0 then v_cartons * v_per_carton
                    else public.num_or_zero(v_line->>'pairs') end;

    if v_pairs <= 0 then
      return jsonb_build_object('error', format('Enter the carton quantity for %s', v_code));
    end if;

    v_article := public.find_or_create_article(v_code, v_line->>'article_name', v_line->>'article_category');
    v_price := public.num_or_zero(v_line->>'price_per_pair');
    v_line_total := v_pairs * v_price;

    v_lines := v_lines || jsonb_build_object(
      'article_id', v_article.id,
      'article_code', v_article.code,
      'article_name', v_article.name,
      'carton_type', nullif(btrim(coalesce(v_line->>'carton_type', '')), ''),
      'pairs_per_carton', v_per_carton,
      'cartons', v_cartons,
      'pairs', v_pairs,
      'price_per_pair', v_price,
      'line_total', v_line_total);

    v_requested := jsonb_set(
      v_requested,
      array[v_article.code],
      to_jsonb(public.num_or_zero(v_requested->>v_article.code) + v_pairs),
      true);

    v_total_cartons := v_total_cartons + v_cartons;
    v_total_pairs := v_total_pairs + v_pairs;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  -- --- never invoice more ready pairs than are on hand ---------------------------
  for v_code in select jsonb_object_keys(v_requested)
  loop
    v_available := public.article_ready_stock(v_code);
    if public.num_or_zero(v_requested->>v_code) > v_available then
      return jsonb_build_object('error',
        format('Only %s pair(s) of %s in Ready Shoes stock, %s needed',
               v_available, v_code, public.num_or_zero(v_requested->>v_code)));
    end if;
  end loop;

  -- --- the customer the invoice is against ---------------------------------------
  if v_customer_id is not null then
    select * into v_customer from public.customers where id = v_customer_id and not is_deleted;
  else
    select * into v_customer from public.customers c
     where not c.is_deleted and lower(c.name) = lower(v_customer_name)
     limit 1;

    if v_customer.id is null then
      insert into public.customers (name, phone, address, opening_balance, status, is_deleted)
      values (v_customer_name,
        nullif(btrim(coalesce(v_customer_input->>'phone', '')), ''),
        nullif(btrim(coalesce(v_customer_input->>'address', '')), ''), 0, 'active', false)
      returning * into v_customer;
    end if;
  end if;

  -- --- the invoice number, following the prefix and never clashing ---------------
  select * into v_settings from public.settings limit 1;
  v_prefix := coalesce(nullif(btrim(coalesce(v_settings.invoice_prefix, '')), ''), 'INV');
  select count(*) into v_count from public.invoices;
  v_number := v_prefix || '-' || lpad((v_count + 1)::text, 4, '0');
  for v_i in 1..20
  loop
    exit when not exists (select 1 from public.invoices where invoice_number = v_number);
    v_number := v_prefix || '-' || lpad((v_count + 1 + v_i)::text, 4, '0');
  end loop;

  v_date := coalesce(nullif(btrim(coalesce(p_payload->>'invoice_date', '')), '')::date, current_date);
  v_discount := public.num_or_zero(p_payload->>'discount');
  v_total := greatest(v_subtotal - v_discount, 0);
  v_received := public.num_or_zero(p_payload->>'received');
  v_method := coalesce(nullif(btrim(coalesce(p_payload->>'payment_method', '')), ''), 'Cash');
  v_status := case when v_received <= 0 then 'unpaid'
                   when v_received >= v_total then 'paid'
                   else 'partial' end;

  insert into public.invoices (invoice_number, customer_id, customer_name, customer_phone, customer_address,
    invoice_date, invoice_time, total_cartons, total_pairs, subtotal, discount, total, received, balance,
    payment_method, status, notes, is_deleted)
  values (v_number, v_customer.id, v_customer_name,
    nullif(btrim(coalesce(v_customer.phone, v_customer_input->>'phone', '')), ''),
    nullif(btrim(coalesce(v_customer.address, v_customer_input->>'address', '')), ''),
    v_date,
    coalesce(nullif(btrim(coalesce(p_payload->>'invoice_time', '')), ''), to_char(now(), 'HH24:MI')),
    v_total_cartons, v_total_pairs, v_subtotal, v_discount, v_total, v_received,
    greatest(v_total - v_received, 0), v_method, v_status,
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''), false)
  returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    insert into public.invoice_lines (invoice_id, invoice_number, customer_id, customer_name, invoice_date,
      article_id, article_code, article_name, carton_type, pairs_per_carton, cartons, pairs, price_per_pair,
      line_total, is_deleted)
    values (v_invoice.id, v_number, v_customer.id, v_customer_name, v_date,
      nullif(btrim(coalesce(v_line->>'article_id', '')), '')::uuid,
      v_line->>'article_code', v_line->>'article_name', v_line->>'carton_type',
      public.num_or_zero(v_line->>'pairs_per_carton'), public.num_or_zero(v_line->>'cartons'),
      public.num_or_zero(v_line->>'pairs'), public.num_or_zero(v_line->>'price_per_pair'),
      public.num_or_zero(v_line->>'line_total'), false)
    returning * into v_row;
    v_inserted := v_inserted || to_jsonb(v_row);
  end loop;

  -- --- money received with the invoice: one payments row and its one cash entry --
  -- Same row shape post_payment() writes (direction 'in', source 'customer_receipt',
  -- the invoice number as the reference, advance flagged against the kata), so the
  -- register and the cash book stay consistent while the invoice stays one
  -- transaction. It is posted here rather than through post_payment() because a
  -- sales clerk creates invoices without holding payments:add.
  if v_received > 0 then
    v_outstanding := coalesce(v_customer.opening_balance, 0)
      + coalesce((select sum(total) from public.invoices
                   where customer_id = v_customer.id and not is_deleted), 0)
      - coalesce((select sum(amount) from public.payments
                   where party_type = 'customer' and party_id = v_customer.id and not is_deleted), 0);
    v_advance := v_received > v_outstanding;

    insert into public.payments (party_type, party_id, party_name, direction, amount, payment_date, method,
      reference, notes, source, is_advance, idempotency_key, created_by, is_deleted)
    values ('customer', v_customer.id, v_customer_name, 'in', v_received, v_date, v_method,
      v_number, 'Received against ' || v_number, 'customer_receipt', v_advance,
      'invoice:' || v_invoice.id::text, auth.uid(), false)
    returning * into v_payment;

    insert into public.roznamcha (entry_date, direction, source, party_type, party_id, party_name, description,
      amount, method, reference, is_deleted)
    values (v_date, 'in', 'customer_receipt', 'customer', v_customer.id, v_customer_name,
      'Received against ' || v_number, v_received, v_method, v_number, false)
    returning * into v_entry;

    update public.payments set roznamcha_id = v_entry.id where id = v_payment.id;
  end if;

  perform public.log_audit('invoice_created', 'invoices', 'invoices', v_invoice.id::text,
    jsonb_build_object('invoice_number', v_number, 'customer', v_customer_name, 'total', v_total,
                       'received', v_received, 'pairs', v_total_pairs), true);

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'lines', v_inserted,
    'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants — the browser calls these; anonymous callers cannot
-- ---------------------------------------------------------------------------
-- The helpers are internal: they carry no permission check of their own (the
-- function that calls them does), so no client role may call them directly.
revoke all on function public.num_or_zero(text) from public, anon, authenticated;
revoke all on function public.find_or_create_article(text, text, text) from public, anon, authenticated;
revoke all on function public.article_uppers_stock(text) from public, anon, authenticated;
revoke all on function public.article_ready_stock(text) from public, anon, authenticated;
revoke all on function public.add_raw_stock_line(jsonb) from public, anon, authenticated;

revoke all on function public.save_ready_stock(jsonb) from anon;
revoke all on function public.save_raw_stock(jsonb) from anon;
revoke all on function public.record_purchase(jsonb) from anon;
revoke all on function public.record_production(jsonb) from anon;
revoke all on function public.create_invoice(jsonb) from anon;

grant execute on function public.save_ready_stock(jsonb) to authenticated;
grant execute on function public.save_raw_stock(jsonb) to authenticated;
grant execute on function public.record_purchase(jsonb) to authenticated;
grant execute on function public.record_production(jsonb) to authenticated;
grant execute on function public.create_invoice(jsonb) to authenticated;

commit;
