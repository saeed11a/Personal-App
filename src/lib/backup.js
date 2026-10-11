import { supabase } from "@/api/supabaseClient";
import { EXPLORER_TABLES, fetchAllRows } from "@/lib/databaseCenter";

// Backup and restore for the Database Center.
//
// A backup is a single JSON file the administrator downloads; nothing is stored in
// the repository or in a shared bucket. It contains the business tables the explorer
// lists — every record, in full — plus a manifest (row counts, timestamps, versions)
// so a restore can be checked before it runs.
//
// A restore never overwrites: it calls public.restore_table_rows(), which can only
// INSERT records whose id is not already present. Existing production rows are left
// exactly as they are, and the outcome is reported per table.
//
// Out of scope by design (documented in the panel): Supabase Auth users, Storage
// files (avatars), and project configuration — a data backup is not an identity or
// infrastructure backup.

export const BACKUP_VERSION = 1;

export async function logEvent(action, module, entity = null, entityId = null, details = null, success = true) {
  try {
    await supabase.rpc("log_admin_event", {
      p_action: action,
      p_module: module,
      p_entity: entity,
      p_entity_id: entityId,
      p_details: details,
      p_success: success,
    });
  } catch {
    /* auditing is best-effort and must never break the operation it records */
  }
}

/** Reads every business table in full and returns the backup object plus its manifest. */
export async function collectBackup({ onProgress } = {}) {
  const tables = {};
  const counts = {};
  let totalRows = 0;

  for (const entry of EXPLORER_TABLES) {
    onProgress?.(`Reading ${entry.label}…`);
    // eslint-disable-next-line no-await-in-loop
    const rows = await fetchAllRows({ table: entry.table, limit: 50000 });
    tables[entry.table] = rows;
    counts[entry.table] = rows.length;
    totalRows += rows.length;
  }

  const backup = {
    meta: {
      app: "HIKER+ Shoes Factory ERP",
      version: BACKUP_VERSION,
      created_at: new Date().toISOString(),
      tables: counts,
      total_rows: totalRows,
    },
    tables,
  };

  return { backup, manifest: backup.meta, bytes: JSON.stringify(backup).length };
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function recordBackup({ manifest, bytes, status = "complete", label, notes }) {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from("backups").insert({
    label: label || `Backup ${new Date().toLocaleString()}`,
    created_by: session?.user?.id || null,
    created_by_email: session?.user?.email || null,
    table_counts: manifest?.tables || {},
    total_rows: manifest?.total_rows || 0,
    byte_size: bytes || null,
    format: "json",
    status,
    notes: notes || null,
  });
  if (error) throw error;
}

export async function listBackups() {
  const { data, error } = await supabase.from("backups").select("*").order("created_date", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

/** Checks a file before it is allowed anywhere near the database. */
export function validateBackup(input) {
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ok: false, error: "That file is not valid JSON." };
    }
  }

  if (!parsed || typeof parsed !== "object") return { ok: false, error: "The backup file is empty or unreadable." };
  if (!parsed.tables || typeof parsed.tables !== "object") {
    return { ok: false, error: "The file has no tables — it does not look like a HIKER+ backup." };
  }

  const known = new Set(EXPLORER_TABLES.map((entry) => entry.table));
  const recognised = {};
  const skipped = [];
  let totalRows = 0;

  Object.entries(parsed.tables).forEach(([table, rows]) => {
    if (!known.has(table)) {
      skipped.push(table);
      return;
    }
    if (!Array.isArray(rows)) {
      skipped.push(table);
      return;
    }
    recognised[table] = rows.length;
    totalRows += rows.length;
  });

  if (Object.keys(recognised).length === 0) {
    return { ok: false, error: "The file names no tables this Database Center can restore." };
  }

  return {
    ok: true,
    version: parsed.meta?.version ?? "unknown",
    createdAt: parsed.meta?.created_at || null,
    tables: recognised,
    skipped,
    totalRows,
    data: parsed,
  };
}

/** Merge-restores an already-validated backup, one table at a time. */
export async function restoreBackup(backup, { onProgress } = {}) {
  const known = new Set(EXPLORER_TABLES.map((entry) => entry.table));
  const summary = { inserted: 0, skipped: 0, tables: {} };

  for (const entry of EXPLORER_TABLES) {
    const rows = backup?.tables?.[entry.table];
    if (!known.has(entry.table) || !Array.isArray(rows) || rows.length === 0) continue;
    onProgress?.(`Restoring ${entry.label}…`);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.rpc("restore_table_rows", { p_table: entry.table, p_rows: rows });
    if (error) throw new Error(`${entry.label}: ${error.message}`);
    if (data?.error) throw new Error(`${entry.label}: ${data.error}`);
    summary.tables[entry.table] = data;
    summary.inserted += Number(data?.inserted || 0);
    summary.skipped += Number(data?.skipped || 0);
  }

  return summary;
}
