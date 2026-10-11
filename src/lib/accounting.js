import { supabase } from "@/api/supabaseClient";

// Money postings for the Supabase backend.
//
// Nothing here calculates a balance to store: every posting goes through the
// database functions from 0006, which write the payment register row and its single
// roznamcha entry inside one transaction, decide the money direction themselves,
// refuse an account that does not exist in the table its type names, and treat a
// retry carrying the same idempotency key as the same posting. Totals shown in the
// UI are read back from the database, never computed by the browser and never
// trusted when writing.

// Kept in step with the allowed list inside post_payment().
export const PAYMENT_METHODS = ["Cash", "Bank", "Cheque", "Online", "JazzCash", "EasyPaisa", "Account"];

// What a payment can be for. The direction each one takes is fixed in the database.
export const ACCOUNT_TYPES = [
  { value: "customer", label: "Customer", hint: "Money received — reduces the customer's kata balance" },
  { value: "supplier", label: "Supplier", hint: "Money paid — reduces the supplier's payable" },
  { value: "labour", label: "Labour", hint: "Money paid — reduces the labour's outstanding wage" },
  {
    value: "other",
    label: "Other / Manual",
    hint: "Direction comes from the category — an expense goes out of the cash book and lands in Kharcha",
  },
];

export const directionFor = (type) => (type === "customer" ? "in" : type === "other" ? null : "out");

export const directionLabel = (direction) => (direction === "in" ? "Received (cash in)" : "Paid (cash out)");

const fail = (error) => {
  throw new Error(error?.message || "The request could not be completed");
};

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(error);
  if (data?.error) throw new Error(data.error);
  return data;
};

/** The key that makes one submission one posting, even if the button is pressed twice. */
export const newIdempotencyKey = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Posts money and its cash-book entry together. Returns the posted row summary. */
export async function postPayment(payload) {
  return rpc("post_payment", {
    p_payload: {
      account_type: payload.account_type,
      account_id: payload.account_id || null,
      account_name: payload.account_name || "",
      amount: Number(payload.amount) || 0,
      payment_date: payload.payment_date || null,
      method: payload.method || "Cash",
      reference: payload.reference || "",
      notes: payload.notes || "",
      category: payload.category || "",
      description: payload.description || "",
      direction: payload.direction || "",
      idempotency_key: payload.idempotency_key || newIdempotencyKey(),
    },
  });
}

/** Corrects a posting with a linked reversing entry — never by deleting history. */
export async function reversePayment(paymentId, reason) {
  return rpc("reverse_payment", { p_payment_id: paymentId, p_reason: reason || null });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, city, opening_balance, status")
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(500);
  if (error) fail(error);
  return data || [];
}

export async function listSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, phone, opening_balance, status")
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(500);
  if (error) fail(error);
  return data || [];
}

export async function listPayments({ from, to, limit = 200 } = {}) {
  let query = supabase
    .from("payments")
    .select("*")
    .eq("is_deleted", false)
    .order("payment_date", { ascending: false })
    .order("created_date", { ascending: false })
    .limit(limit);
  if (from) query = query.gte("payment_date", from);
  if (to) query = query.lte("payment_date", to);
  const { data, error } = await query;
  if (error) fail(error);
  return data || [];
}

export async function listRoznamcha({ from, to, limit = 200 } = {}) {
  let query = supabase
    .from("roznamcha")
    .select("*")
    .eq("is_deleted", false)
    .order("entry_date", { ascending: false })
    .order("created_date", { ascending: false })
    .limit(limit);
  if (from) query = query.gte("entry_date", from);
  if (to) query = query.lte("entry_date", to);
  const { data, error } = await query;
  if (error) fail(error);
  return data || [];
}

/** Cash in / out for a period, read back from the cash book itself. */
export async function cashTotals({ from, to } = {}) {
  const rows = await listRoznamcha({ from, to, limit: 5000 });
  return rows.reduce(
    (totals, row) => {
      const amount = Number(row.amount) || 0;
      if (row.direction === "in") totals.in += amount;
      else totals.out += amount;
      if (row.source === "kharcha" || row.source === "manual") totals.manual += amount;
      return totals;
    },
    { in: 0, out: 0, manual: 0 }
  );
}

/** Kata figures for one account, straight from the records that produce them. */
export async function outstandingFor(type, accountId) {
  if (!accountId) return 0;

  if (type === "labour") {
    const [earned, paid] = await Promise.all([
      rpc("labour_earned", { p_labour_id: accountId }),
      rpc("labour_paid", { p_labour_id: accountId }),
    ]);
    return Number(earned || 0) - Number(paid || 0);
  }

  const opening = type === "customer" ? await openingBalance("customers", accountId) : await openingBalance("suppliers", accountId);
  const documents =
    type === "customer"
      ? await sumColumn("invoices", "total", "customer_id", accountId)
      : await sumColumn("purchases", "amount", "supplier_id", accountId);

  const { data, error } = await supabase
    .from("payments")
    .select("direction, amount")
    .eq("party_type", type)
    .eq("party_id", accountId)
    .eq("is_deleted", false);
  if (error) fail(error);
  const paid = (data || []).reduce((total, row) => {
    const amount = Number(row.amount) || 0;
    return total + (type === "customer" ? (row.direction === "in" ? amount : -amount) : row.direction === "out" ? amount : -amount);
  }, 0);

  return Number(opening || 0) + documents - paid;
}

async function openingBalance(table, id) {
  const { data, error } = await supabase.from(table).select("opening_balance").eq("id", id).maybeSingle();
  if (error) fail(error);
  return Number(data?.opening_balance || 0);
}

async function sumColumn(table, column, keyColumn, id) {
  const { data, error } = await supabase.from(table).select(column).eq(keyColumn, id).eq("is_deleted", false);
  if (error) fail(error);
  return (data || []).reduce((total, row) => total + (Number(row[column]) || 0), 0);
}

// ---------------------------------------------------------------------------
// Manual categories (income / expense) — Roznamcha and "Other" payments
// ---------------------------------------------------------------------------

export async function listManualCategories({ includeInactive = false } = {}) {
  let query = supabase.from("manual_categories").select("*").order("name", { ascending: true });
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) fail(error);
  return data || [];
}

export async function saveManualCategory({ id, name, direction, description, active = true }) {
  const payload = { name: name?.trim(), direction, description: description?.trim() || null, active };
  if (!payload.name) throw new Error("Give the category a name");
  const query = id
    ? supabase.from("manual_categories").update(payload).eq("id", id)
    : supabase.from("manual_categories").insert(payload);
  const { error } = await query;
  if (error) fail(error);
}
