import { supabase } from "@/api/supabaseClient";

// The Database Center's table registry.
//
// Only business tables are listed — the identity and security tables (`profiles`,
// `user_permissions`, `audit_logs`, and the PIN columns) are deliberately absent, so
// no credentials, PIN hashes or keys can ever be selected here. Reads go straight to
// the table through PostgREST, which means RLS decides what each account may see: a
// clerk with raw-stock access sees raw stock rows and nothing else, and the explorer
// cannot be used to read around the policies. No SQL is ever accepted from the
// browser.
export const EXPLORER_TABLES = [
  { table: "articles", label: "Articles", module: "articles", order: "updated_date", search: ["code", "name", "category"] },
  { table: "raw_categories", label: "Raw Categories", module: "raw_stock", order: "updated_date", search: ["name", "slug"] },
  {
    table: "raw_stocks",
    label: "Raw Stock",
    module: "raw_stock",
    order: "updated_date",
    search: ["item_name", "article_code", "category", "supplier_name"],
  },
  {
    table: "ready_shoes",
    label: "Ready Shoes",
    module: "ready_shoes",
    order: "updated_date",
    search: ["article_code", "article_name", "batch_label", "source"],
  },
  {
    table: "production_entries",
    label: "Production",
    module: "production",
    order: "updated_date",
    search: ["article_code", "article_name", "operator", "line"],
  },
  { table: "purchases", label: "Purchases", module: "purchase", order: "updated_date", search: ["item_name", "supplier_name", "article_code"] },
  { table: "customers", label: "Customers", module: "customers", order: "updated_date", search: ["name", "phone", "city"] },
  { table: "suppliers", label: "Suppliers", module: "suppliers", order: "updated_date", search: ["name", "phone"] },
  { table: "invoices", label: "Invoices", module: "invoices", order: "updated_date", search: ["invoice_number", "customer_name"] },
  {
    table: "invoice_lines",
    label: "Invoice Lines",
    module: "invoices",
    order: "updated_date",
    search: ["invoice_number", "article_code", "customer_name"],
  },
  { table: "payments", label: "Payments", module: "payments", order: "updated_date", search: ["party_name", "reference", "method"] },
  {
    table: "roznamcha",
    label: "Roznamcha",
    module: "roznamcha",
    order: "updated_date",
    search: ["party_name", "description", "category", "reference"],
  },
  { table: "labours", label: "Labours", module: "labour", order: "updated_date", search: ["name", "phone"] },
  { table: "labour_categories", label: "Labour Categories", module: "labour", order: "sort_order", search: ["name"] },
  { table: "labour_production", label: "Labour Production", module: "labour", order: "updated_date", search: ["article_code", "reference"] },
  { table: "labour_earnings", label: "Labour Earnings", module: "labour", order: "created_date", search: [] },
  { table: "manual_categories", label: "Manual Categories", module: "roznamcha", order: "name", search: ["name"] },
  { table: "settings", label: "Settings", module: "settings", order: "created_date", search: ["company_name"] },
];

// Columns never shown or exported, whatever a table happens to contain.
const HIDDEN_COLUMNS = ["pin_hash", "pin_failed_attempts", "pin_locked_until", "idempotency_key", "completion_key"];

const humanize = (key) => key.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());

export const tableEntry = (table) => EXPLORER_TABLES.find((entry) => entry.table === table);

/** The display columns for a table, derived from a real row so empty tables still work. */
export function columnsFromRow(row) {
  if (!row) return [];
  return Object.keys(row)
    .filter((key) => !HIDDEN_COLUMNS.includes(key))
    .map((key) => ({
      key,
      label: humanize(key),
      type: typeof row[key] === "number" ? "number" : "text",
    }));
}

/** One sample row, used to learn a table's shape (and its columns) once per view. */
export async function fetchTableShape(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function countTable(table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

const cleanSearch = (value) => String(value || "").replace(/[%,()*]/g, " ").trim();

/**
 * One page of a table: search across its text columns, optional equality filters,
 * explicit ordering and a real total count.
 */
export async function fetchPage({ table, page = 1, pageSize = 25, search = "", order, ascending = false, filters = {} }) {
  const entry = tableEntry(table);
  const from = (page - 1) * pageSize;
  let query = supabase.from(table).select("*", { count: "exact" });

  const term = cleanSearch(search);
  const searchColumns = entry?.search || [];
  if (term && searchColumns.length) {
    query = query.or(searchColumns.map((column) => `${column}.ilike.%${term}%`).join(","));
  }

  Object.entries(filters || {}).forEach(([column, value]) => {
    if (value !== "" && value !== null && value !== undefined) query = query.eq(column, value);
  });

  query = query.order(entry?.order || "created_date", { ascending }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

/** Every matching row, paged — used by the Excel/PDF exports and the backup. */
export async function fetchAllRows({ table, search = "", order, ascending = false, filters = {}, limit = 20000 }) {
  const entry = tableEntry(table);
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  for (;;) {
    let query = supabase.from(table).select("*");
    const term = cleanSearch(search);
    const searchColumns = entry?.search || [];
    if (term && searchColumns.length) {
      query = query.or(searchColumns.map((column) => `${column}.ilike.%${term}%`).join(","));
    }
    Object.entries(filters || {}).forEach(([column, value]) => {
      if (value !== "" && value !== null && value !== undefined) query = query.eq(column, value);
    });
    query = query.order(entry?.order || "created_date", { ascending }).range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize || rows.length >= limit) break;
    from += pageSize;
  }

  return rows.slice(0, limit);
}
