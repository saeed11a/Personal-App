import { base44 } from "@/api/base44Client";
import { num } from "@/lib/format";

const ALIVE = { is_deleted: { $ne: true } };

function withRange(query, from, to, field) {
  const next = { ...query };
  if (from || to) {
    next[field] = {};
    if (from) next[field].$gte = from;
    if (to) next[field].$lte = to;
  }
  return next;
}

const sums = (rows, field) => rows.reduce((total, row) => total + num(row[`sum_${field}`]), 0);
const counts = (rows) => rows.reduce((total, row) => total + num(row.count), 0);

/** One aggregate gives the whole invoice picture: totals, outstanding and open orders. */
export async function invoiceStats({ from, to } = {}) {
  const result = await base44.entities.Invoice.aggregate({
    query: withRange(ALIVE, from, to, "invoice_date"),
    groupBy: "status",
    sum: ["total", "received", "balance", "total_pairs"],
  });
  const rows = result?.rows || [];
  return {
    rows,
    count: counts(rows),
    total: sums(rows, "total"),
    received: sums(rows, "received"),
    balance: sums(rows, "balance"),
    pairs: sums(rows, "total_pairs"),
  };
}

/** Sales per day (or week/month) for the dashboard charts. */
export async function salesSeries({ from, to, unit = "day" } = {}) {
  const result = await base44.entities.Invoice.aggregate({
    query: withRange(ALIVE, from, to, "invoice_date"),
    dateBucket: { field: "invoice_date", unit },
    sum: ["total", "received"],
  });
  return (result?.rows || [])
    .map((row) => ({
      date: String(row.invoice_date || row.date || row.bucket || ""),
      total: num(row.sum_total),
      received: num(row.sum_received),
      orders: num(row.count),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Adds the day-on-day movement so the trend widget can show up / down per day. */
export function trendWithDeltas(series) {
  return series.map((point, index) => {
    const previous = index > 0 ? series[index - 1].total : point.total;
    const delta = point.total - previous;
    return { ...point, delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
  });
}

export async function purchaseStats({ from, to } = {}) {
  const result = await base44.entities.Purchase.aggregate({
    query: withRange(ALIVE, from, to, "purchase_date"),
    groupBy: "category",
    sum: ["amount", "quantity", "total_pairs"],
  });
  const rows = result?.rows || [];
  return { rows, count: counts(rows), amount: sums(rows, "amount"), pairs: sums(rows, "total_pairs") };
}

export async function paymentStats({ from, to } = {}) {
  const result = await base44.entities.Payment.aggregate({
    query: withRange(ALIVE, from, to, "payment_date"),
    groupBy: "direction",
    sum: ["amount"],
  });
  return result?.rows || [];
}

export async function cashStats({ from, to } = {}) {
  const [all, expenses] = await Promise.all([
    base44.entities.Roznamcha.aggregate({
      query: withRange(ALIVE, from, to, "entry_date"),
      groupBy: "direction",
      sum: ["amount"],
    }),
    base44.entities.Roznamcha.aggregate({
      query: { ...withRange(ALIVE, from, to, "entry_date"), source: "kharcha" },
      groupBy: "direction",
      sum: ["amount"],
    }),
  ]);
  const rows = all?.rows || [];
  const cashIn = num(rows.find((row) => row.direction === "in")?.sum_amount);
  const cashOut = num(rows.find((row) => row.direction === "out")?.sum_amount);
  const kharchaRows = expenses?.rows || [];
  return {
    rows,
    cashIn,
    cashOut,
    remaining: cashIn - cashOut,
    kharcha: kharchaRows.reduce((total, row) => total + num(row.sum_amount), 0),
  };
}

export async function rawStockByCategory() {
  const result = await base44.entities.RawStock.aggregate({
    query: ALIVE,
    groupBy: "category",
    sum: ["quantity", "total_pairs", "amount"],
  });
  return result?.rows || [];
}

/** Live uppers position per article: added, consumed by production, available. */
export async function articleStockMap({ from, to } = {}) {
  const [raw, production, ready, sold] = await Promise.all([
    base44.entities.RawStock.aggregate({ query: { ...ALIVE, category: "uppers" }, groupBy: "article_code", sum: ["total_pairs", "quantity"] }),
    base44.entities.ProductionEntry.aggregate({
      query: withRange(ALIVE, from, to, "production_date"),
      groupBy: "article_code",
      sum: ["uppers_used_pairs", "output_pairs"],
    }),
    base44.entities.ReadyShoe.aggregate({ query: ALIVE, groupBy: "article_code", sum: ["pairs", "cartons"] }),
    base44.entities.InvoiceLine.aggregate({
      query: withRange(ALIVE, from, to, "invoice_date"),
      groupBy: "article_code",
      sum: ["pairs", "cartons", "line_total"],
    }),
  ]);

  const map = new Map();
  const bucket = (code) => {
    const key = String(code || "").toUpperCase();
    if (!map.has(key)) {
      map.set(key, { article_code: key, uppers_added: 0, bags: 0, uppers_used: 0, produced: 0, ready_added: 0, ready_cartons: 0, sold: 0, sold_cartons: 0, sales_value: 0 });
    }
    return map.get(key);
  };

  (raw?.rows || []).forEach((row) => {
    const entry = bucket(row.article_code);
    entry.uppers_added += num(row.sum_total_pairs);
    entry.bags += num(row.sum_quantity);
  });
  (production?.rows || []).forEach((row) => {
    const entry = bucket(row.article_code);
    entry.uppers_used += num(row.sum_uppers_used_pairs);
    entry.produced += num(row.sum_output_pairs);
  });
  (ready?.rows || []).forEach((row) => {
    const entry = bucket(row.article_code);
    entry.ready_added += num(row.sum_pairs);
    entry.ready_cartons += num(row.sum_cartons);
  });
  (sold?.rows || []).forEach((row) => {
    const entry = bucket(row.article_code);
    entry.sold += num(row.sum_pairs);
    entry.sold_cartons += num(row.sum_cartons);
    entry.sales_value += num(row.sum_line_total);
  });

  map.forEach((entry) => {
    entry.uppers_available = entry.uppers_added - entry.uppers_used;
    entry.ready_available = entry.ready_added - entry.sold;
  });
  return map;
}

/** Customer balances: opening + invoiced - received, straight from the ledger. */
export async function customerBalanceMap() {
  const [invoices, payments] = await Promise.all([
    base44.entities.Invoice.aggregate({ query: ALIVE, groupBy: "customer_name", sum: ["total", "received"] }),
    base44.entities.Payment.aggregate({ query: { ...ALIVE, party_type: "customer" }, groupBy: "party_name", sum: ["amount"] }),
  ]);
  const map = new Map();
  (invoices?.rows || []).forEach((row) => {
    const key = String(row.customer_name || "").trim();
    if (key) map.set(key, { invoiced: num(row.sum_total), paid: num(row.sum_received), invoices: num(row.count) });
  });
  (payments?.rows || []).forEach((row) => {
    const key = String(row.party_name || "").trim();
    const entry = map.get(key) || { invoiced: 0, paid: 0, invoices: 0 };
    entry.paid += num(row.sum_amount);
    map.set(key, entry);
  });
  return map;
}

export async function supplierBalanceMap() {
  const [purchases, payments] = await Promise.all([
    base44.entities.Purchase.aggregate({ query: ALIVE, groupBy: "supplier_name", sum: ["amount"] }),
    base44.entities.Payment.aggregate({ query: { ...ALIVE, party_type: "supplier" }, groupBy: "party_name", sum: ["amount"] }),
  ]);
  const map = new Map();
  (purchases?.rows || []).forEach((row) => {
    const key = String(row.supplier_name || "").trim();
    if (key) map.set(key, { purchased: num(row.sum_amount), paid: 0, purchases: num(row.count) });
  });
  (payments?.rows || []).forEach((row) => {
    const key = String(row.party_name || "").trim();
    const entry = map.get(key) || { purchased: 0, paid: 0, purchases: 0 };
    entry.paid += num(row.sum_amount);
    map.set(key, entry);
  });
  return map;
}

/** Kata ledger for one customer or supplier, with a running balance. */
export async function partyLedger(type, party) {
  const isCustomer = type === "customer";
  const name = party?.name || "";
  const opening = num(party?.opening_balance);

  const [debitDocs, payments] = await Promise.all([
    isCustomer
      ? base44.entities.Invoice.filter({ ...ALIVE, customer_name: name }, { sort: "invoice_date", limit: 200 })
          .then((page) => (page?.items || []).map((row) => ({
            id: row.id,
            date: row.invoice_date,
            label: `Invoice ${row.invoice_number || ""}`.trim(),
            detail: `${num(row.total_pairs)} prs`,
            pairs: num(row.total_pairs),
            debit: num(row.total),
            credit: 0,
            kind: "invoice",
          })))
      : base44.entities.Purchase.filter({ ...ALIVE, supplier_name: name }, { sort: "purchase_date", limit: 200 })
          .then((page) => (page?.items || []).map((row) => ({
            id: row.id,
            date: row.purchase_date,
            label: row.item_name,
            detail: `${num(row.quantity)} ${row.unit || ""}`.trim(),
            debit: 0,
            credit: num(row.amount),
            kind: "purchase",
          }))),
    base44.entities.Payment.filter({ ...ALIVE, party_name: name }, { sort: "payment_date", limit: 200 })
      .then((page) => (page?.items || []).map((row) => ({
        id: row.id,
        date: row.payment_date,
        label: `${row.direction === "in" ? "Payment received" : "Payment made"} · ${row.method || ""}`.trim(),
        detail: row.reference || "",
        debit: isCustomer ? 0 : num(row.amount),
        credit: isCustomer ? num(row.amount) : 0,
        kind: "payment",
      }))),
  ]);

  const entries = [...debitDocs, ...payments].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  let running = opening;
  const rows = entries.map((entry) => {
    running += isCustomer ? entry.debit - entry.credit : entry.credit - entry.debit;
    return { ...entry, balance: running };
  });
  return { opening, closing: running, rows: rows.reverse(), documents: debitDocs.length, payments: payments.length };
}

/** Articles where uppers or ready shoes have fallen to the alert level. */
export async function lowStockAlerts(threshold, providedMap) {
  const limit = num(threshold) || 50;
  const map = providedMap || (await articleStockMap());
  const alerts = [];
  map.forEach((entry) => {
    if (!entry.article_code) return;
    if (entry.uppers_added && entry.uppers_available <= limit) {
      alerts.push({ article_code: entry.article_code, kind: "Uppers", available: entry.uppers_available, limit });
    }
    if (entry.ready_added && entry.ready_available <= limit) {
      alerts.push({ article_code: entry.article_code, kind: "Ready shoes", available: entry.ready_available, limit });
    }
  });
  return alerts.sort((a, b) => a.available - b.available).slice(0, 6);
}
