-- HIKER+ Shoes Factory ERP — 0012 kharcha <-> roznamcha link
--
-- The Kharcha module, the dashboard "Kharcha" card and the Kharcha report all read the
-- cash book: roznamcha rows with source = 'kharcha'. Only the Kharcha screen itself wrote
-- that source, so an expense posted from the Payments menu (a manual category, which
-- post_payment() stored as source 'manual') left the cash book correctly but never showed
-- up in Kharcha.
--
-- This migration lines the two up, additively:
--   1. A manual posting takes the source of its direction in post_payment(): every
--      expense (out) becomes a kharcha row, every manual receipt (in) an other_income
--      row. Still one transaction, still idempotent, still direction-checked against the
--      category — the money path itself is unchanged.
--   2. A 'Kharcha' expense category is seeded so the Payments menu can offer it straight
--      away. It can be renamed or deactivated in Settings > Manual categories.
--
-- Existing rows are not rewritten: each keeps the source it was posted with, and the
-- roznamcha policies continue to allow all of ('kharcha', 'other_income', 'opening',
-- 'manual') for staff's own manual entries.
--
-- Rollback: 0012_kharcha_ledger_link.rollback.sql

begin;

-- 1. The expense category the Payments menu offers out of the box.
insert into public.manual_categories (name, direction, description)
values ('Kharcha', 'out', 'Daily factory expense')
on conflict (lower(name)) do nothing;

-- 2. post_payment(): a manual posting is tagged by its direction, so it shows in Kharcha.
create or replace function public.post_payment(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_type text := lower(btrim(coalesce(p_payload->>'account_type', '')));
  v_id uuid := nullif(btrim(coalesce(p_payload->>'account_id', '')), '')::uuid;
  v_name text := btrim(coalesce(p_payload->>'account_name', ''));
  v_amount numeric := round(coalesce(nullif(btrim(coalesce(p_payload->>'amount', '')), '')::numeric, 0), 2);
  v_date date := coalesce(nullif(btrim(coalesce(p_payload->>'payment_date', '')), '')::date, current_date);
  v_method text := coalesce(nullif(btrim(coalesce(p_payload->>'method', '')), ''), 'Cash');
  v_reference text := nullif(btrim(coalesce(p_payload->>'reference', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_category text := nullif(btrim(coalesce(p_payload->>'category', '')), '');
  v_description text := nullif(btrim(coalesce(p_payload->>'description', '')), '');
  v_sent_direction text := lower(btrim(coalesce(p_payload->>'direction', '')));
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_direction text;
  v_source text;
  v_outstanding numeric;
  v_advance boolean := false;
  v_existing public.payments;
  v_payment public.payments;
  v_entry public.roznamcha;
  v_manual public.manual_categories;
  v_labour public.labours;
  v_account public.customers;
  v_supplier public.suppliers;
  v_methods constant text[] := array['Cash', 'Bank', 'Cheque', 'Online', 'JazzCash', 'EasyPaisa', 'Account'];
begin
  -- --- permission: the payment module, plus the module being posted to --------
  if not public.has_permission('payments:add') then
    perform public.log_audit('payment_denied', 'payments', 'payments', null,
      jsonb_build_object('reason', 'no payments:add', 'account_type', v_type), false);
    return jsonb_build_object('error', 'You do not have permission to record payments');
  end if;

  if v_type = 'labour' and not public.has_permission('labour:add') then
    perform public.log_audit('payment_denied', 'labour', 'payments', null,
      jsonb_build_object('reason', 'no labour:add'), false);
    return jsonb_build_object('error', 'You do not have permission to record labour payments');
  end if;

  if v_type = 'other' and not public.has_permission('roznamcha:add') then
    perform public.log_audit('payment_denied', 'roznamcha', 'payments', null,
      jsonb_build_object('reason', 'no roznamcha:add'), false);
    return jsonb_build_object('error', 'You do not have permission to record manual entries');
  end if;

  if v_type not in ('customer', 'supplier', 'labour', 'other') then
    return jsonb_build_object('error', 'Choose what this payment is for');
  end if;

  -- --- a retry of an already-posted request returns the same rows -------------
  if v_key is not null then
    select * into v_existing from public.payments where idempotency_key = v_key;
    if v_existing.id is not null then
      return jsonb_build_object(
        'duplicate', true, 'payment_id', v_existing.id, 'roznamcha_id', v_existing.roznamcha_id,
        'amount', v_existing.amount, 'direction', v_existing.direction, 'is_advance', v_existing.is_advance);
    end if;
  end if;

  if v_amount <= 0 then
    return jsonb_build_object('error', 'Payment amount must be greater than zero');
  end if;

  if not (v_method = any (v_methods)) then
    return jsonb_build_object('error', 'Choose one of the supported payment methods');
  end if;

  -- --- the account must exist in the table its type names --------------------
  if v_type = 'customer' then
    select * into v_account from public.customers where id = v_id and not is_deleted;
    if v_account.id is null then
      return jsonb_build_object('error', 'Select an existing customer');
    end if;
    v_name := v_account.name;
    v_direction := 'in';
    v_source := 'customer_receipt';
    v_outstanding := coalesce(v_account.opening_balance, 0)
      + coalesce((select sum(total) from public.invoices where customer_id = v_account.id and not is_deleted), 0)
      - coalesce((select sum(amount) from public.payments
                   where party_type = 'customer' and party_id = v_account.id and not is_deleted), 0);
    v_advance := v_amount > v_outstanding;
  elsif v_type = 'supplier' then
    select * into v_supplier from public.suppliers where id = v_id and not is_deleted;
    if v_supplier.id is null then
      return jsonb_build_object('error', 'Select an existing supplier');
    end if;
    v_name := v_supplier.name;
    v_direction := 'out';
    v_source := 'supplier_payment';
    v_outstanding := coalesce(v_supplier.opening_balance, 0)
      + coalesce((select sum(amount) from public.purchases where supplier_id = v_supplier.id and not is_deleted), 0)
      - coalesce((select sum(amount) from public.payments
                   where party_type = 'supplier' and party_id = v_supplier.id and not is_deleted), 0);
    v_advance := v_amount > v_outstanding;
  elsif v_type = 'labour' then
    select * into v_labour from public.labours where id = v_id and not is_deleted;
    if v_labour.id is null then
      return jsonb_build_object('error', 'Select an existing labour account');
    end if;
    if v_labour.status <> 'active' then
      return jsonb_build_object('error', 'This labour account is inactive');
    end if;
    v_name := v_labour.name;
    v_direction := 'out';
    v_source := 'labour_payment';
    v_advance := v_amount > (public.labour_earned(v_labour.id) - public.labour_paid(v_labour.id));
  else
    -- manual: the direction belongs to the category, so a transaction can never be
    -- posted against the wrong side of the cash book.
    select * into v_manual from public.manual_categories
     where lower(name) = lower(coalesce(v_category, '')) and active;
    if v_manual.id is null then
      return jsonb_build_object('error', 'Choose an active manual category');
    end if;
    if v_sent_direction in ('in', 'out') and v_sent_direction <> v_manual.direction then
      return jsonb_build_object('error',
        'This category is ' || case when v_manual.direction = 'in' then 'income' else 'expense' end
        || ', not the direction selected');
    end if;
    v_direction := v_manual.direction;
    -- An expense (out) is a Kharcha row: the Kharcha screen, the dashboard card and
    -- the Kharcha report all read roznamcha rows with source 'kharcha'. A manual
    -- receipt (in) keeps the other-income side of the same pair.
    v_source := case when v_manual.direction = 'out' then 'kharcha' else 'other_income' end;
    v_category := v_manual.name;
    v_name := coalesce(nullif(v_name, ''), v_manual.name);
    v_description := coalesce(v_description, v_manual.name);
  end if;

  v_description := coalesce(
    v_description,
    case
      when v_type = 'customer' then 'Received from ' || v_name
      when v_type = 'supplier' then 'Paid to ' || v_name
      when v_type = 'labour' then 'Paid to ' || v_name || ' (labour)'
      else v_name
    end);

  -- --- the posting itself: payment row and its one cash-book entry together ---
  insert into public.payments (
    party_type, party_id, party_name, direction, amount, payment_date, method,
    reference, notes, source, is_advance, idempotency_key, created_by, is_deleted)
  values (
    v_type, v_id, v_name, v_direction, v_amount, v_date, v_method,
    v_reference, v_notes, v_source, v_advance, v_key, auth.uid(), false)
  returning * into v_payment;

  insert into public.roznamcha (
    entry_date, direction, source, party_type, party_id, party_name, description,
    category, amount, method, reference, is_deleted)
  values (
    v_date, v_direction, v_source, v_type, v_id, v_name, v_description,
    v_category, v_amount, v_method, v_reference, false)
  returning * into v_entry;

  update public.payments set roznamcha_id = v_entry.id where id = v_payment.id;

  perform public.log_audit(
    'payment_posted',
    case when v_type = 'other' then 'roznamcha' when v_type = 'labour' then 'labour' else 'payments' end,
    'payments', v_payment.id::text,
    jsonb_build_object('account_type', v_type, 'party', v_name, 'direction', v_direction,
                       'amount', v_amount, 'method', v_method, 'advance', v_advance,
                       'roznamcha_id', v_entry.id),
    true);

  return jsonb_build_object(
    'duplicate', false, 'payment_id', v_payment.id, 'roznamcha_id', v_entry.id,
    'amount', v_amount, 'direction', v_direction, 'is_advance', v_advance,
    'party_name', v_name, 'account_type', v_type);
end $$;

commit;
