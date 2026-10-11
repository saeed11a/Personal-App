-- ===========================================================================
-- 0006_labour_and_accounting.sql   (additive — no existing row is modified)
--
-- Adds, on top of 0001..0005:
--   1. the Labour module        : categories, labours, category links, per-pair
--                                 rates with effective dates, production
--                                 entries with stage moves, earnings.
--   2. manual categories        : administrator-defined Roznamcha / payment
--                                 categories with an income or expense direction.
--   3. one authoritative money  : post_payment() writes the payment row and its
--      posting path              single Roznamcha entry in ONE transaction, is
--                                 retry-safe (idempotency key) and checks the
--                                 caller's module permission server-side.
--      reverse_payment()         : corrections are linked reversing entries, never
--                                 deletes of financial history.
--      labour functions          : record / complete / move production. Earnings are
--                                 computed from completed pairs at the rate that was
--                                 effective, and are never counted twice.
--
-- Rollback: 0006_labour_and_accounting.rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Money register: retry-safe, reversible, singular
-- ---------------------------------------------------------------------------
-- `public.payments` stays the single register every module writes to (customer,
-- supplier, labour, manual). These columns make a posting identifiable (so a retry
-- cannot post twice) and make corrections traceable.

alter table public.payments
  add column if not exists source text,
  add column if not exists roznamcha_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists is_advance boolean not null default false,
  add column if not exists reversed boolean not null default false,
  add column if not exists reversal_of uuid references public.payments(id),
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_reason text,
  add column if not exists created_by uuid;

-- One posting per key, and one reversal per payment.
create unique index if not exists payments_idempotency_key_idx
  on public.payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_reversal_of_idx
  on public.payments (reversal_of) where reversal_of is not null;
create index if not exists payments_party_id_idx on public.payments (party_id);
create index if not exists payments_source_idx on public.payments (source);

-- ---------------------------------------------------------------------------
-- 2. Manual categories (income / expense) for manual cash-book transactions
-- ---------------------------------------------------------------------------
create table if not exists public.manual_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  direction text not null check (direction in ('in', 'out')),
  description text,
  active boolean not null default true,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create unique index if not exists manual_categories_name_idx
  on public.manual_categories (lower(name));

-- ---------------------------------------------------------------------------
-- 3. Labour module
-- ---------------------------------------------------------------------------
create table if not exists public.labour_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  -- The three shipped process categories cannot be deleted — only deactivated —
  -- so historical production always keeps its stage.
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create unique index if not exists labour_categories_name_idx
  on public.labour_categories (lower(name));

insert into public.labour_categories (name, description, is_system, sort_order)
select * from (values
  ('Upper / Last Process', 'Upper closing and last-making work', true, 1),
  ('Machine / Sole',       'Machine and sole attaching work',    true, 2),
  ('Finishing',            'Finishing, packing and cleaning',    true, 3)
) as seed(name, description, is_system, sort_order)
where not exists (select 1 from public.labour_categories);

create table if not exists public.labours (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  cnic text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create index if not exists labours_name_idx on public.labours (lower(name));
create index if not exists labours_status_idx on public.labours (status);

-- A labour can work in more than one stage.
create table if not exists public.labour_category_links (
  labour_id uuid not null references public.labours(id) on delete cascade,
  category_id uuid not null references public.labour_categories(id) on delete restrict,
  created_date timestamptz not null default now(),
  primary key (labour_id, category_id)
);

-- Per-pair rates by category and effective date. Never edited in place: a new
-- effective date records the change, so past production keeps its own rate.
create table if not exists public.labour_rates (
  id uuid primary key default gen_random_uuid(),
  labour_id uuid not null references public.labours(id) on delete cascade,
  category_id uuid not null references public.labour_categories(id) on delete restrict,
  rate_per_pair numeric(12, 2) not null check (rate_per_pair >= 0),
  effective_date date not null default current_date,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create unique index if not exists labour_rates_unique_idx
  on public.labour_rates (labour_id, category_id, effective_date);
create index if not exists labour_rates_lookup_idx
  on public.labour_rates (labour_id, category_id, effective_date desc);

create table if not exists public.labour_production (
  id uuid primary key default gen_random_uuid(),
  labour_id uuid not null references public.labours(id) on delete restrict,
  category_id uuid not null references public.labour_categories(id) on delete restrict,
  production_date date not null default current_date,
  article_code text,
  pairs_received numeric(12, 2) not null default 0 check (pairs_received >= 0),
  pairs_completed numeric(12, 2) not null default 0 check (pairs_completed >= 0),
  -- Never stored by hand: received minus completed, so it can never go negative.
  pairs_pending numeric(12, 2) generated always as (pairs_received - pairs_completed) stored,
  reference text,
  notes text,
  idempotency_key text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint labour_production_completed_within_received check (pairs_completed <= pairs_received)
);

create unique index if not exists labour_production_idempotency_idx
  on public.labour_production (idempotency_key) where idempotency_key is not null;
-- The same labour's same stage, article, date and reference is one entry: a second
-- identical submission is a duplicate, not a new quantity.
create unique index if not exists labour_production_duplicate_idx
  on public.labour_production (
    labour_id, category_id, coalesce(article_code, ''), production_date, coalesce(reference, '')
  );
create index if not exists labour_production_labour_idx
  on public.labour_production (labour_id, production_date desc);

create table if not exists public.labour_earnings (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.labour_production(id) on delete cascade,
  labour_id uuid not null references public.labours(id) on delete restrict,
  category_id uuid not null references public.labour_categories(id) on delete restrict,
  earned_date date not null default current_date,
  pairs numeric(12, 2) not null check (pairs > 0),
  -- Snapshot of the rate used: a later rate change never rewrites history.
  rate_per_pair numeric(12, 2) not null,
  amount numeric(14, 2) not null check (amount >= 0),
  idempotency_key text,
  -- '<production id>:<cumulative pairs completed>' — the same completion can only
  -- ever be earned once, which is what makes a retry or a stage move safe.
  completion_key text not null,
  created_date timestamptz not null default now()
);

create unique index if not exists labour_earnings_completion_idx
  on public.labour_earnings (completion_key);
create unique index if not exists labour_earnings_idempotency_idx
  on public.labour_earnings (idempotency_key) where idempotency_key is not null;
create index if not exists labour_earnings_labour_idx
  on public.labour_earnings (labour_id, earned_date desc);

-- Moving pairs to the next stage keeps a record of the move instead of rewriting
-- the source entry's history.
create table if not exists public.labour_stage_moves (
  id uuid primary key default gen_random_uuid(),
  from_production_id uuid not null references public.labour_production(id) on delete cascade,
  to_production_id uuid not null references public.labour_production(id) on delete cascade,
  labour_id uuid not null references public.labours(id) on delete restrict,
  from_category_id uuid not null references public.labour_categories(id) on delete restrict,
  to_category_id uuid not null references public.labour_categories(id) on delete restrict,
  pairs numeric(12, 2) not null check (pairs > 0),
  move_date date not null default current_date,
  notes text,
  created_date timestamptz not null default now()
);

create index if not exists labour_stage_moves_labour_idx
  on public.labour_stage_moves (labour_id, move_date desc);

-- ---------------------------------------------------------------------------
-- 4. Row level security — deny by default, module permission per action
-- ---------------------------------------------------------------------------
alter table public.labour_categories     enable row level security;
alter table public.labours               enable row level security;
alter table public.labour_category_links enable row level security;
alter table public.labour_rates          enable row level security;
alter table public.labour_production     enable row level security;
alter table public.labour_earnings       enable row level security;
alter table public.labour_stage_moves    enable row level security;
alter table public.manual_categories     enable row level security;

revoke all on public.labour_categories, public.labours, public.labour_category_links,
              public.labour_rates, public.labour_production, public.labour_earnings,
              public.labour_stage_moves, public.manual_categories from anon;

grant select, insert, update, delete on public.labour_categories, public.labours,
      public.labour_category_links, public.labour_rates, public.labour_production,
      public.labour_earnings, public.labour_stage_moves, public.manual_categories
  to authenticated;

do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('labour_categories',     'labour',   false),
      ('labours',               'labour',   false),
      ('labour_category_links', 'labour',   false),
      ('labour_rates',          'labour',   false),
      ('labour_production',     'labour',   false),
      ('labour_earnings',       'labour',   false),
      ('labour_stage_moves',    'labour',   false),
      ('manual_categories',     'payments', true)
    ) as t(tbl, module, readable_by_roznamcha)
  loop
    execute format('drop policy if exists %I on public.%I', m.tbl || '_select', m.tbl);
    execute format('drop policy if exists %I on public.%I', m.tbl || '_insert', m.tbl);
    execute format('drop policy if exists %I on public.%I', m.tbl || '_update', m.tbl);
    execute format('drop policy if exists %I on public.%I', m.tbl || '_delete', m.tbl);

    if m.readable_by_roznamcha then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.has_permission(%L) or public.has_permission(%L))',
        m.tbl || '_select', m.tbl, m.module || ':view', 'roznamcha:view');
    else
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.has_permission(%L))',
        m.tbl || '_select', m.tbl, m.module || ':view');
    end if;

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(%L))',
      m.tbl || '_insert', m.tbl, m.module || ':add');
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))',
      m.tbl || '_update', m.tbl, m.module || ':edit', m.module || ':edit');
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_permission(%L))',
      m.tbl || '_delete', m.tbl, m.module || ':delete');
  end loop;
end $$;

-- Financial writes go through the posting functions: an administrator keeps direct
-- table access for data repair, staff must use the audited, atomic function, which
-- checks their module permission itself. This is what stops a "view only" account —
-- or a hand-crafted API call — from posting money directly.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated with check (public.is_admin());

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete to authenticated using (public.is_admin());

-- A staff account may keep its own manual cash-book entries (kharcha, other income,
-- opening cash) but may never edit or delete an entry a module produced: those are
-- corrected with a reversing entry.
drop policy if exists roznamcha_insert on public.roznamcha;
drop policy if exists roznamcha_update on public.roznamcha;
drop policy if exists roznamcha_delete on public.roznamcha;

create policy roznamcha_insert on public.roznamcha
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.has_permission('roznamcha:add')
        and coalesce(source, '') in ('kharcha', 'other_income', 'opening', 'manual'))
  );

create policy roznamcha_update on public.roznamcha
  for update to authenticated
  using (
    public.is_admin()
    or (public.has_permission('roznamcha:edit')
        and coalesce(source, '') in ('kharcha', 'other_income', 'opening', 'manual'))
  )
  with check (
    public.is_admin()
    or (public.has_permission('roznamcha:edit')
        and coalesce(source, '') in ('kharcha', 'other_income', 'opening', 'manual'))
  );

create policy roznamcha_delete on public.roznamcha
  for delete to authenticated
  using (
    public.is_admin()
    or (public.has_permission('roznamcha:edit')
        and coalesce(source, '') in ('kharcha', 'other_income', 'opening', 'manual'))
  );

-- Earnings are produced by complete_labour_production() only. Nobody edits them
-- from the browser, administrators included.
drop policy if exists labour_earnings_insert on public.labour_earnings;
create policy labour_earnings_insert on public.labour_earnings
  for insert to authenticated with check (public.is_admin());
drop policy if exists labour_earnings_update on public.labour_earnings;
create policy labour_earnings_update on public.labour_earnings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists labour_earnings_delete on public.labour_earnings;
create policy labour_earnings_delete on public.labour_earnings
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. updated_date triggers (same helper 0001 installed)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['manual_categories', 'labour_categories', 'labours', 'labour_rates', 'labour_production']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_date', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_date()',
      t || '_touch_updated_date', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Labour helpers
-- ---------------------------------------------------------------------------

-- Outstanding = earned − paid. A negative outstanding is an advance already paid.
create or replace function public.labour_earned(p_labour_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.labour_earnings where labour_id = p_labour_id;
$$;

create or replace function public.labour_paid(p_labour_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when direction = 'out' then amount else -amount end), 0)
    from public.payments
   where party_type = 'labour' and party_id = p_labour_id and not is_deleted;
$$;

-- The rate that applied on a given date (latest effective date not in the future).
create or replace function public.labour_rate_on(p_labour_id uuid, p_category_id uuid, p_on date)
returns numeric
language sql stable security definer set search_path = public as $$
  select rate_per_pair
    from public.labour_rates
   where labour_id = p_labour_id and category_id = p_category_id and effective_date <= coalesce(p_on, current_date)
   order by effective_date desc
   limit 1;
$$;

-- Every labour with its ledger totals, in one round trip for the list screen.
create or replace function public.labour_balances()
returns table (
  labour_id uuid, name text, phone text, status text,
  categories text, earned numeric, paid numeric, outstanding numeric, advance numeric, pending_pairs numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('labour:view') then
    raise exception 'Not allowed to view labour records' using errcode = '42501';
  end if;

  return query
    select l.id, l.name, l.phone, l.status,
           coalesce((select string_agg(c.name, ', ' order by c.name)
                       from public.labour_category_links k
                       join public.labour_categories c on c.id = k.category_id
                      where k.labour_id = l.id), '') as categories,
           public.labour_earned(l.id) as earned,
           public.labour_paid(l.id) as paid,
           public.labour_earned(l.id) - public.labour_paid(l.id) as outstanding,
           greatest(public.labour_paid(l.id) - public.labour_earned(l.id), 0) as advance,
           coalesce((select sum(p.pairs_pending) from public.labour_production p
                      where p.labour_id = l.id and not p.is_deleted), 0) as pending_pairs
      from public.labours l
     where not l.is_deleted
     order by lower(l.name);
end $$;

-- ---------------------------------------------------------------------------
-- 7. post_payment() — the one authoritative money posting path
-- ---------------------------------------------------------------------------
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
    v_source := 'manual';
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

-- ---------------------------------------------------------------------------
-- 8. reverse_payment() — corrections are linked reversals, never deletions
-- ---------------------------------------------------------------------------
create or replace function public.reverse_payment(p_payment_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_original public.payments;
  v_reversal public.payments;
  v_entry public.roznamcha;
  v_module text;
  v_reference text;
begin
  select * into v_original from public.payments where id = p_payment_id;

  if v_original.id is null or v_original.is_deleted then
    return jsonb_build_object('error', 'Payment not found');
  end if;

  v_module := case when v_original.party_type = 'labour' then 'labour'
                   when v_original.party_type = 'other' then 'roznamcha'
                   else 'payments' end;

  if not public.has_permission(v_module || ':edit') then
    perform public.log_audit('payment_reverse_denied', v_module, 'payments', p_payment_id::text, null, false);
    return jsonb_build_object('error', 'You do not have permission to reverse this payment');
  end if;

  if v_original.reversal_of is not null then
    return jsonb_build_object('error', 'A reversing entry cannot itself be reversed');
  end if;

  if v_original.reversed then
    return jsonb_build_object('error', 'This payment has already been reversed');
  end if;

  v_reference := 'REV-' || coalesce(v_original.reference, v_original.id::text);

  insert into public.payments (
    party_type, party_id, party_name, direction, amount, payment_date, method,
    reference, notes, source, is_advance, reversal_of, created_by, is_deleted)
  values (
    v_original.party_type, v_original.party_id, v_original.party_name,
    case when v_original.direction = 'in' then 'out' else 'in' end,
    v_original.amount, current_date, v_original.method,
    v_reference,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Reversal of ' || coalesce(v_original.reference, v_original.id::text)),
    'reversal', false, v_original.id, auth.uid(), false)
  returning * into v_reversal;

  insert into public.roznamcha (
    entry_date, direction, source, party_type, party_id, party_name, description,
    category, amount, method, reference, is_deleted)
  values (
    current_date,
    case when v_original.direction = 'in' then 'out' else 'in' end,
    'reversal', v_original.party_type, v_original.party_id, v_original.party_name,
    'Reversal: ' || coalesce(v_original.notes, v_original.party_name),
    null, v_original.amount, v_original.method, v_reference, false)
  returning * into v_entry;

  update public.payments set roznamcha_id = v_entry.id where id = v_reversal.id;

  update public.payments
     set reversed = true, reversed_at = now(),
         reversed_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = v_original.id;

  perform public.log_audit('payment_reversed', v_module, 'payments', v_original.id::text,
    jsonb_build_object('reversal_id', v_reversal.id, 'roznamcha_id', v_entry.id,
                       'amount', v_original.amount, 'reason', p_reason), true);

  return jsonb_build_object('reversed', true, 'payment_id', v_original.id,
                            'reversal_id', v_reversal.id, 'roznamcha_id', v_entry.id);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Labour production: record, complete (earns), move stage (never earns twice)
-- ---------------------------------------------------------------------------
create or replace function public.record_labour_production(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_labour_id uuid := nullif(btrim(coalesce(p_payload->>'labour_id', '')), '')::uuid;
  v_category_id uuid := nullif(btrim(coalesce(p_payload->>'category_id', '')), '')::uuid;
  v_date date := coalesce(nullif(btrim(coalesce(p_payload->>'production_date', '')), '')::date, current_date);
  v_code text := nullif(upper(btrim(coalesce(p_payload->>'article_code', ''))), '');
  v_pairs numeric := round(coalesce(nullif(btrim(coalesce(p_payload->>'pairs_received', '')), '')::numeric, 0), 2);
  v_reference text := nullif(btrim(coalesce(p_payload->>'reference', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_labour public.labours;
  v_category public.labour_categories;
  v_existing public.labour_production;
  v_row public.labour_production;
begin
  if not public.has_permission('labour:add') then
    return jsonb_build_object('error', 'You do not have permission to record labour production');
  end if;

  if v_key is not null then
    select * into v_existing from public.labour_production where idempotency_key = v_key;
    if v_existing.id is not null then
      return jsonb_build_object('duplicate', true, 'production_id', v_existing.id,
                                'pairs_received', v_existing.pairs_received);
    end if;
  end if;

  if v_pairs <= 0 then
    return jsonb_build_object('error', 'Enter the number of pairs received');
  end if;

  select * into v_labour from public.labours where id = v_labour_id and not is_deleted;
  if v_labour.id is null then
    return jsonb_build_object('error', 'Select a labour');
  end if;
  if v_labour.status <> 'active' then
    return jsonb_build_object('error', 'This labour account is inactive');
  end if;

  select * into v_category from public.labour_categories where id = v_category_id;
  if v_category.id is null then
    return jsonb_build_object('error', 'Select a labour category');
  end if;
  if not v_category.active then
    return jsonb_build_object('error', 'This labour category is inactive');
  end if;

  -- Same labour, stage, article, date and reference is one entry.
  select * into v_existing from public.labour_production
   where labour_id = v_labour_id and category_id = v_category_id
     and coalesce(article_code, '') = coalesce(v_code, '')
     and production_date = v_date
     and coalesce(reference, '') = coalesce(v_reference, '');
  if v_existing.id is not null then
    return jsonb_build_object('duplicate', true, 'production_id', v_existing.id,
                              'error', 'This production entry already exists');
  end if;

  insert into public.labour_production (
    labour_id, category_id, production_date, article_code, pairs_received,
    reference, notes, idempotency_key, is_deleted)
  values (v_labour_id, v_category_id, v_date, v_code, v_pairs, v_reference, v_notes, v_key, false)
  returning * into v_row;

  perform public.log_audit('labour_production_recorded', 'labour', 'labour_production', v_row.id::text,
    jsonb_build_object('labour', v_labour.name, 'category', v_category.name, 'pairs', v_pairs),
    true);

  return jsonb_build_object('duplicate', false, 'production_id', v_row.id, 'pairs_received', v_pairs);
end $$;

create or replace function public.complete_labour_production(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(btrim(coalesce(p_payload->>'production_id', '')), '')::uuid;
  v_pairs numeric := round(coalesce(nullif(btrim(coalesce(p_payload->>'pairs', '')), '')::numeric, 0), 2);
  v_date date := coalesce(nullif(btrim(coalesce(p_payload->>'completion_date', '')), '')::date, current_date);
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_row public.labour_production;
  v_existing public.labour_earnings;
  v_rate numeric;
  v_new_completed numeric;
  v_amount numeric;
  v_earned public.labour_earnings;
begin
  if not public.has_permission('labour:edit') then
    return jsonb_build_object('error', 'You do not have permission to complete labour production');
  end if;

  if v_key is not null then
    select * into v_existing from public.labour_earnings where idempotency_key = v_key;
    if v_existing.id is not null then
      return jsonb_build_object('duplicate', true, 'earnings_id', v_existing.id,
                                'amount', v_existing.amount, 'pairs', v_existing.pairs);
    end if;
  end if;

  select * into v_row from public.labour_production where id = v_id and not is_deleted;
  if v_row.id is null then
    return jsonb_build_object('error', 'Production entry not found');
  end if;

  if v_pairs <= 0 then
    return jsonb_build_object('error', 'Enter how many pairs were completed');
  end if;

  v_new_completed := v_row.pairs_completed + v_pairs;
  if v_new_completed > v_row.pairs_received then
    return jsonb_build_object('error',
      'Only ' || (v_row.pairs_received - v_row.pairs_completed) || ' pair(s) are still pending on this entry');
  end if;

  -- The rate that applied on the completion date: a later rate change never
  -- rewrites what was already earned.
  v_rate := public.labour_rate_on(v_row.labour_id, v_row.category_id, v_date);
  if v_rate is null then
    return jsonb_build_object('error', 'Set this labour''s per-pair rate for the category before completing production');
  end if;

  v_amount := round(v_pairs * v_rate, 2);

  insert into public.labour_earnings (
    production_id, labour_id, category_id, earned_date, pairs, rate_per_pair, amount,
    idempotency_key, completion_key)
  values (
    v_row.id, v_row.labour_id, v_row.category_id, v_date, v_pairs, v_rate, v_amount,
    v_key, v_row.id::text || ':' || v_new_completed)
  returning * into v_earned;

  update public.labour_production set pairs_completed = v_new_completed where id = v_row.id;

  perform public.log_audit('labour_production_completed', 'labour', 'labour_production', v_row.id::text,
    jsonb_build_object('pairs', v_pairs, 'rate', v_rate, 'amount', v_amount, 'earned_on', v_date),
    true);

  return jsonb_build_object('duplicate', false, 'earnings_id', v_earned.id, 'pairs', v_pairs,
                            'rate', v_rate, 'amount', v_amount, 'pairs_completed', v_new_completed);
end $$;

create or replace function public.transfer_labour_stage(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(btrim(coalesce(p_payload->>'production_id', '')), '')::uuid;
  v_to_category uuid := nullif(btrim(coalesce(p_payload->>'to_category_id', '')), '')::uuid;
  v_pairs numeric := round(coalesce(nullif(btrim(coalesce(p_payload->>'pairs', '')), '')::numeric, 0), 2);
  v_date date := coalesce(nullif(btrim(coalesce(p_payload->>'move_date', '')), '')::date, current_date);
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_row public.labour_production;
  v_target public.labour_categories;
  v_existing public.labour_production;
  v_new public.labour_production;
begin
  if not public.has_permission('labour:edit') then
    return jsonb_build_object('error', 'You do not have permission to move production between stages');
  end if;

  select * into v_row from public.labour_production where id = v_id and not is_deleted;
  if v_row.id is null then
    return jsonb_build_object('error', 'Production entry not found');
  end if;

  select * into v_target from public.labour_categories where id = v_to_category and active;
  if v_target.id is null then
    return jsonb_build_object('error', 'Select an active category to move the work to');
  end if;
  if v_target.id = v_row.category_id then
    return jsonb_build_object('error', 'The work is already in that stage');
  end if;

  if v_pairs <= 0 then
    return jsonb_build_object('error', 'Enter how many pairs are moving');
  end if;

  if v_pairs > v_row.pairs_pending then
    return jsonb_build_object('error', 'Only ' || v_row.pairs_pending || ' pair(s) are pending in this stage');
  end if;

  if v_key is not null then
    select * into v_existing from public.labour_production where idempotency_key = v_key;
    if v_existing.id is not null then
      return jsonb_build_object('duplicate', true, 'production_id', v_existing.id);
    end if;
  end if;

  -- Pairs that are still pending leave this stage and appear, unearned, in the
  -- next one: moving work never creates a second earning.
  update public.labour_production
     set pairs_received = pairs_received - v_pairs
   where id = v_row.id;

  insert into public.labour_production (
    labour_id, category_id, production_date, article_code, pairs_received,
    reference, notes, idempotency_key, is_deleted)
  values (
    v_row.labour_id, v_target.id, v_date, v_row.article_code, v_pairs,
    coalesce(v_row.reference, '') || ' → ' || v_target.name,
    coalesce(v_notes, 'Moved from ' || (select name from public.labour_categories where id = v_row.category_id)),
    v_key, false)
  returning * into v_new;

  insert into public.labour_stage_moves (
    from_production_id, to_production_id, labour_id, from_category_id, to_category_id, pairs, move_date, notes)
  values (v_row.id, v_new.id, v_row.labour_id, v_row.category_id, v_target.id, v_pairs, v_date, v_notes);

  perform public.log_audit('labour_stage_moved', 'labour', 'labour_production', v_row.id::text,
    jsonb_build_object('pairs', v_pairs, 'to_production_id', v_new.id, 'to_category', v_target.name),
    true);

  return jsonb_build_object('duplicate', false, 'from_production_id', v_row.id,
                            'to_production_id', v_new.id, 'pairs', v_pairs);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Grants: the browser may call the functions; anon never may
-- ---------------------------------------------------------------------------
revoke all on function public.post_payment(jsonb) from anon;
revoke all on function public.reverse_payment(uuid, text) from anon;
revoke all on function public.record_labour_production(jsonb) from anon;
revoke all on function public.complete_labour_production(jsonb) from anon;
revoke all on function public.transfer_labour_stage(jsonb) from anon;
revoke all on function public.labour_balances() from anon;
revoke all on function public.labour_earned(uuid) from anon;
revoke all on function public.labour_paid(uuid) from anon;
revoke all on function public.labour_rate_on(uuid, uuid, date) from anon;

grant execute on function public.post_payment(jsonb),
                          public.reverse_payment(uuid, text),
                          public.record_labour_production(jsonb),
                          public.complete_labour_production(jsonb),
                          public.transfer_labour_stage(jsonb),
                          public.labour_balances(),
                          public.labour_earned(uuid),
                          public.labour_paid(uuid),
                          public.labour_rate_on(uuid, uuid, date)
  to authenticated;
