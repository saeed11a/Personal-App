import { supabase } from "@/api/supabaseClient";

// Labour module reads and writes for the Supabase backend.
//
// Rules the database owns, repeated here only so the UI can explain them:
//   * a per-pair rate is recorded per stage with an effective date; completing
//     production earns completed pairs × the rate that applied on the completion
//     date, and that rate is snapshotted on the earning;
//   * a production entry can only be completed inside the quantity received, and
//     an identical entry (same labour, stage, article, date and reference) is a
//     duplicate rather than a new quantity;
//   * moving pending pairs to the next stage never earns anything again.
// The browser sends the request and shows what comes back — it does not compute
// quantities, rates or money.

const fail = (error) => {
  throw new Error(error?.message || "The request could not be completed");
};

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(error);
  if (data?.error) throw new Error(data.error);
  return data;
};

export const newKey = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listLabourCategories({ includeInactive = false } = {}) {
  let query = supabase.from("labour_categories").select("*").order("sort_order", { ascending: true }).order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) fail(error);
  return data || [];
}

export async function saveLabourCategory({ id, name, description, active = true }) {
  const payload = { name: name?.trim(), description: description?.trim() || null, active };
  if (!payload.name) throw new Error("Give the category a name");
  const query = id
    ? supabase.from("labour_categories").update(payload).eq("id", id)
    : supabase.from("labour_categories").insert(payload);
  const { error } = await query;
  if (error) fail(error);
}

// ---------------------------------------------------------------------------
// Labour accounts and their rates
// ---------------------------------------------------------------------------

export async function listLabourAccounts() {
  const [labours, links, categories] = await Promise.all([
    supabase.from("labours").select("*").eq("is_deleted", false).order("name", { ascending: true }).limit(500),
    supabase.from("labour_category_links").select("labour_id, category_id"),
    supabase.from("labour_categories").select("id, name"),
  ]);
  if (labours.error) fail(labours.error);
  if (links.error) fail(links.error);
  if (categories.error) fail(categories.error);

  const categoryName = new Map((categories.data || []).map((row) => [row.id, row.name]));
  const byLabour = new Map();
  (links.data || []).forEach((row) => {
    if (!byLabour.has(row.labour_id)) byLabour.set(row.labour_id, []);
    byLabour.get(row.labour_id).push(row.category_id);
  });

  return (labours.data || []).map((labour) => ({
    ...labour,
    category_ids: byLabour.get(labour.id) || [],
    category_names: (byLabour.get(labour.id) || []).map((id) => categoryName.get(id)).filter(Boolean),
  }));
}

/** Ledger totals for every labour account (earned, paid, outstanding, advance, pending pairs). */
export async function listLabourBalances() {
  return rpc("labour_balances", {});
}

export async function saveLabour({ id, name, phone, cnic, address, status = "active", notes, categoryIds = [] }) {
  const payload = {
    name: name?.trim(),
    phone: phone?.trim() || null,
    cnic: cnic?.trim() || null,
    address: address?.trim() || null,
    status,
    notes: notes?.trim() || null,
  };
  if (!payload.name) throw new Error("Enter the labour's name");

  let labourId = id;
  if (id) {
    const { error } = await supabase.from("labours").update(payload).eq("id", id);
    if (error) fail(error);
  } else {
    const { data, error } = await supabase.from("labours").insert(payload).select("id").single();
    if (error) fail(error);
    labourId = data.id;
  }

  // Assigned stages: replace the links so the account only works in the stages chosen.
  const { error: clearError } = await supabase.from("labour_category_links").delete().eq("labour_id", labourId);
  if (clearError) fail(clearError);
  if (categoryIds.length > 0) {
    const { error } = await supabase
      .from("labour_category_links")
      .insert(categoryIds.map((categoryId) => ({ labour_id: labourId, category_id: categoryId })));
    if (error) fail(error);
  }

  return labourId;
}

export async function listLabourRates(labourId) {
  const { data, error } = await supabase
    .from("labour_rates")
    .select("*")
    .eq("labour_id", labourId)
    .order("effective_date", { ascending: false });
  if (error) fail(error);
  return data || [];
}

/** A rate change is a new row with its own effective date; earlier production keeps its rate. */
export async function saveLabourRate({ labourId, categoryId, ratePerPair, effectiveDate, notes }) {
  const { error } = await supabase.from("labour_rates").upsert(
    {
      labour_id: labourId,
      category_id: categoryId,
      rate_per_pair: Number(ratePerPair) || 0,
      effective_date: effectiveDate,
      notes: notes?.trim() || null,
    },
    { onConflict: "labour_id,category_id,effective_date" }
  );
  if (error) fail(error);
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

export async function listProduction({ labourId, limit = 200 } = {}) {
  let query = supabase
    .from("labour_production")
    .select("*")
    .eq("is_deleted", false)
    .order("production_date", { ascending: false })
    .order("created_date", { ascending: false })
    .limit(limit);
  if (labourId) query = query.eq("labour_id", labourId);
  const { data, error } = await query;
  if (error) fail(error);
  return data || [];
}

export const recordProduction = (payload) =>
  rpc("record_labour_production", { p_payload: { ...payload, idempotency_key: payload.idempotency_key || newKey() } });

export const completeProduction = (payload) =>
  rpc("complete_labour_production", { p_payload: { ...payload, idempotency_key: payload.idempotency_key || newKey() } });

export const moveProduction = (payload) =>
  rpc("transfer_labour_stage", { p_payload: { ...payload, idempotency_key: payload.idempotency_key || newKey() } });

// ---------------------------------------------------------------------------
// Statement: earnings, payments and pending work in one list
// ---------------------------------------------------------------------------

export async function labourStatement(labourId) {
  const [earnings, production, payments, rates, categories] = await Promise.all([
    supabase
      .from("labour_earnings")
      .select("*")
      .eq("labour_id", labourId)
      .order("earned_date", { ascending: false })
      .order("created_date", { ascending: false }),
    supabase
      .from("labour_production")
      .select("*")
      .eq("labour_id", labourId)
      .eq("is_deleted", false)
      .order("production_date", { ascending: false }),
    supabase
      .from("payments")
      .select("*")
      .eq("party_type", "labour")
      .eq("party_id", labourId)
      .eq("is_deleted", false)
      .order("payment_date", { ascending: false }),
    supabase.from("labour_rates").select("*").eq("labour_id", labourId).order("effective_date", { ascending: false }),
    supabase.from("labour_categories").select("id, name"),
  ]);

  for (const result of [earnings, production, payments, rates, categories]) {
    if (result.error) fail(result.error);
  }

  const categoryName = new Map((categories.data || []).map((row) => [row.id, row.name]));
  const rows = [
    ...(earnings.data || []).map((row) => ({
      id: `earning-${row.id}`,
      date: row.earned_date,
      kind: "earning",
      label: `Completed ${row.pairs} prs · ${categoryName.get(row.category_id) || ""}`.trim(),
      detail: `@ ${row.rate_per_pair} / pair`,
      amount: Number(row.amount) || 0,
      earning: Number(row.amount) || 0,
      paid: 0,
      reversed: false,
    })),
    ...(payments.data || []).map((row) => ({
      id: `payment-${row.id}`,
      raw_id: row.id,
      date: row.payment_date,
      kind: "payment",
      label: `${row.direction === "out" ? "Paid" : "Received"} · ${row.method || ""}`.trim(),
      detail: [row.reference, row.notes].filter(Boolean).join(" · "),
      amount: Number(row.amount) || 0,
      earning: 0,
      paid: (row.direction === "out" ? 1 : -1) * (Number(row.amount) || 0),
      reversed: row.reversed,
      reversal: Boolean(row.reversal_of),
      is_advance: row.is_advance,
    })),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const earned = (earnings.data || []).reduce((total, row) => total + (Number(row.amount) || 0), 0);
  const paid = (payments.data || []).reduce(
    (total, row) => total + (row.direction === "out" ? 1 : -1) * (Number(row.amount) || 0),
    0
  );
  const pending = (production.data || []).reduce((total, row) => total + (Number(row.pairs_pending) || 0), 0);

  return {
    rows,
    earned,
    paid,
    pending,
    outstanding: earned - paid,
    advance: Math.max(paid - earned, 0),
    production: production.data || [],
    rates: rates.data || [],
    categories: categories.data || [],
    categoryName,
  };
}
