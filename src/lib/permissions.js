import { supabase } from "@/api/supabaseClient";

// Staff roles. The database constraint on profiles.role allows exactly these two,
// and the RLS policies treat 'admin' as the unrestricted role (is_admin()).
export const ROLES = [
  { value: "admin", label: "Administrator" },
  { value: "user", label: "Staff" },
];

// Every module the sidebar offers, each with the access level an administrator can
// assign. `aliasOf` marks a screen that is a *view of another module's records*
// (Sales is the invoices list, Kharcha and Supplier Payments are views of the cash
// book and the payments list): the grant it writes is the underlying module's, so a
// checkbox can never grant a capability the database does not actually enforce.
export const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "raw_stock", label: "Raw Stock" },
  { key: "ready_shoes", label: "Ready Shoes" },
  { key: "articles", label: "Articles" },
  { key: "production", label: "Production" },
  { key: "labour", label: "Labour" },
  { key: "purchase", label: "Purchase" },
  { key: "suppliers", label: "Suppliers Kata" },
  { key: "invoices", label: "Invoices" },
  { key: "sales", label: "Sales", aliasOf: "invoices" },
  { key: "customers", label: "Customers Kata" },
  { key: "payments", label: "Payments" },
  { key: "supplier_payments", label: "Supplier Payments", aliasOf: "payments" },
  { key: "roznamcha", label: "Roznamcha" },
  { key: "kharcha", label: "Kharcha", aliasOf: "roznamcha" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
  { key: "recycle_bin", label: "Recycle Bin" },
  { key: "database_center", label: "Database Center" },
  { key: "backup", label: "Backup & Restore" },
  { key: "users", label: "Users" },
];

// Admin-only surfaces: offered on the checkbox list, but a staff account is never
// granted them through a department preset, and the panels behind them re-check
// administrators on the server as well.
export const ADMIN_ONLY_MODULES = ["users", "backup", "database_center"];

// One simple choice per module instead of four separate ticks.
export const ACCESS_LEVELS = [
  { value: "none", label: "No access" },
  { value: "view", label: "View only" },
  { value: "full", label: "Full access" },
];

// The action names stored as '<module>:<action>' — the same ones the RLS policies
// ask has_permission() for.
const ACTIONS = ["view", "add", "edit", "delete"];

const LEVEL_RANK = { none: 0, view: 1, full: 2 };

export const moduleEntry = (key) => MODULES.find((module) => module.key === key);
export const moduleLabel = (key) => moduleEntry(key)?.label || key;

// The module a checkbox really writes: 'sales' is the invoices list, 'kharcha' the
// cash book, 'supplier_payments' the payments list.
export const underlyingModule = (key) => moduleEntry(key)?.aliasOf || key;

export const keysForLevel = (moduleKey, level) => {
  const target = underlyingModule(moduleKey);
  if (level === "full") return ACTIONS.map((action) => `${target}:${action}`);
  if (level === "view") return [`${target}:view`];
  return [];
};

// Reads a preset back from the granted keys: anything beyond viewing counts as full
// access. '<module>:*' is the wildcard grant has_permission() understands.
export const levelForKeys = (moduleKey, keys) => {
  const target = underlyingModule(moduleKey);
  const own = keys.filter((key) => key.startsWith(`${target}:`));
  if (own.length === 0) return "none";
  return own.some((key) => key === `${target}:*` || key !== `${target}:view`) ? "full" : "view";
};

// Collapses the checkbox levels onto their underlying modules, taking the widest
// level asked for — so two checkboxes for the same records can never disagree.
export function resolveLevels(levels) {
  const out = {};
  MODULES.forEach((module) => {
    const target = underlyingModule(module.key);
    const level = levels[module.key] || "none";
    if (!out[target] || LEVEL_RANK[level] > LEVEL_RANK[out[target]]) out[target] = level;
  });
  return out;
}

// The fixed factory departments the permissions screen offers.
export const DEPARTMENTS = [
  { value: "store", label: "Store / Raw Stock" },
  { value: "production", label: "Production" },
  { value: "ready_shoes", label: "Ready Shoes" },
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "accounts", label: "Accounts" },
  { value: "management", label: "Management" },
];

export const departmentLabel = (value) => DEPARTMENTS.find((entry) => entry.value === value)?.label || "";
export const roleLabel = (value) => ROLES.find((entry) => entry.value === value)?.label || value || "";

// What each department starts with: the modules it works in day to day get full
// access, the ones it only needs to look at get view only. These are a starting
// point pasted into the dialog — an administrator can change any of them. The
// admin-only surfaces are never part of a preset.
const VIEW_EVERYTHING = Object.fromEntries(
  MODULES.filter((module) => !ADMIN_ONLY_MODULES.includes(underlyingModule(module.key))).map((module) => [
    module.key,
    "view",
  ])
);

export const DEPARTMENT_DEFAULTS = {
  store: { dashboard: "view", raw_stock: "full", ready_shoes: "view", articles: "view", reports: "view" },
  production: {
    dashboard: "view",
    production: "full",
    labour: "full",
    raw_stock: "view",
    ready_shoes: "view",
    articles: "view",
    reports: "view",
  },
  ready_shoes: { dashboard: "view", ready_shoes: "full", production: "view", articles: "view", reports: "view" },
  sales: {
    dashboard: "view",
    invoices: "full",
    sales: "full",
    customers: "full",
    ready_shoes: "view",
    payments: "view",
    articles: "view",
    reports: "view",
  },
  purchase: {
    dashboard: "view",
    purchase: "full",
    suppliers: "full",
    raw_stock: "full",
    articles: "view",
    payments: "view",
    reports: "view",
  },
  accounts: {
    dashboard: "view",
    payments: "full",
    supplier_payments: "full",
    roznamcha: "full",
    kharcha: "full",
    labour: "full",
    invoices: "view",
    sales: "view",
    purchase: "view",
    customers: "view",
    suppliers: "view",
    reports: "view",
  },
  management: VIEW_EVERYTHING,
};

// Column list the permissions screen is allowed to read. Kept in step with the
// column grants in 0002/0003 — the PIN hash is never selectable.
const STAFF_COLUMNS = "id, email, full_name, phone, role, status, department, pin_updated_at, last_login_at";

export async function loadStaff() {
  const { data, error } = await supabase.from("profiles").select(STAFF_COLUMNS).order("created_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadPermissions(userId) {
  const { data, error } = await supabase
    .from("user_permissions")
    .select("permission")
    .eq("user_id", userId)
    .eq("granted", true);
  if (error) throw error;
  const keys = (data || []).map((row) => row.permission);
  return Object.fromEntries(MODULES.map((module) => [module.key, levelForKeys(module.key, keys)]));
}

// Writes the presets as '<module>:<action>' rows: what the presets grant is
// upserted, and any key from an earlier, wider preset is removed.
export async function savePermissions(userId, levels, grantedBy) {
  const resolved = resolveLevels(levels);
  const desired = Object.entries(resolved).flatMap(([moduleKey, level]) =>
    keysForLevel(moduleKey, level).map((permission) => ({
      user_id: userId,
      permission,
      granted: true,
      granted_by: grantedBy || null,
      granted_at: new Date().toISOString(),
    }))
  );

  const { data: existing, error: readError } = await supabase
    .from("user_permissions")
    .select("permission")
    .eq("user_id", userId);
  if (readError) throw readError;

  const keep = new Set(desired.map((row) => row.permission));
  const remove = (existing || []).map((row) => row.permission).filter((permission) => !keep.has(permission));

  if (remove.length > 0) {
    const { error } = await supabase.from("user_permissions").delete().eq("user_id", userId).in("permission", remove);
    if (error) throw error;
  }

  if (desired.length > 0) {
    const { error } = await supabase.from("user_permissions").upsert(desired, { onConflict: "user_id,permission" });
    if (error) throw error;
  }
}

// Department / role / status changes go through the audited administrator RPC added
// by 0010 (self-lockout protection and audit row live on the server).
export async function updateStaffProfile(userId, patch) {
  const { data, error } = await supabase.rpc("admin_update_user", {
    p_user_id: userId,
    p_full_name: patch.full_name ?? null,
    p_phone: patch.phone ?? null,
    // An empty string clears the department; null (absent) leaves it unchanged.
    p_department: "department" in patch ? patch.department ?? "" : null,
    p_role: patch.role ?? null,
    p_status: patch.status ?? null,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.profile || null;
}
