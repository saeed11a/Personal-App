import { supabase } from "@/api/supabaseClient";

// The offline outbox.
//
// Every write the app makes to a plain business table goes through here. When the
// database answers, the write is done immediately and nothing is stored. When it
// cannot be reached (no connection, backend down), the operation is kept in
// localStorage and replayed later — in the order it was made — so offline work is
// never lost.
//
// Two rules keep replays from duplicating records:
//
//   1. A queued *create* carries the row's own id, generated once when the operation
//      is first attempted (crypto.randomUUID). Replaying it inserts the same id; the
//      primary key refuses a second copy (23505), which is treated as "already
//      applied", not as a failure.
//   2. An *update* or *delete* is naturally idempotent — it targets one id.
//
// This covers the plain entity writes. The multi-row accounting paths (post_payment,
// create_invoice, record_production, save_raw_stock …) already run as single atomic
// database functions with their own idempotency keys, and are not queued here: a
// replay of a function that has no key could post a second transaction, which is
// exactly what must not happen.

const OUTBOX_KEY = "hiker_sync_outbox_v1";
const LAST_SYNC_KEY = "hiker_last_sync_at_v1";

const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — the operation still ran or will surface as an error */
  }
  listeners.forEach((fn) => fn(items));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function list() {
  return read();
}

export function pending() {
  return read().filter((item) => item.status !== "done");
}

export function failures() {
  return read().filter((item) => item.status === "failed");
}

export function counts() {
  const items = read();
  return {
    total: items.length,
    pending: items.filter((item) => item.status === "pending" || item.status === "retrying").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}

function nextSeq(items) {
  return items.reduce((max, item) => Math.max(max, item.seq || 0), 0) + 1;
}

export function enqueue({ op, table, payload, recordId, idempotencyKey, label }) {
  const items = read();
  const item = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    seq: nextSeq(items),
    op,
    table,
    payload: payload ?? null,
    recordId: recordId ?? null,
    idempotencyKey: idempotencyKey ?? null,
    label: label ?? `${op} ${table}`,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  write(items);
  return item;
}

export function removeItem(id) {
  write(read().filter((item) => item.id !== id));
}

export function clearFailed() {
  write(read().filter((item) => item.status !== "failed"));
}

export function clearAll() {
  write([]);
}

export function lastSyncedAt() {
  return localStorage.getItem(LAST_SYNC_KEY);
}

export function setLastSyncedAt(value) {
  if (value) localStorage.setItem(LAST_SYNC_KEY, value);
}

// A network-level failure — the write never reached the database. Anything else
// (a constraint, an RLS denial, a validation error) reached it and was refused, so
// retrying blindly would never succeed; those become visible failures instead.
export function isOfflineError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "23505") return false; // duplicate key: a replay that already applied
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = String(error.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("load failed") ||
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("aborted")
  );
}

function apply(item) {
  const client = supabase.from(item.table);
  if (item.op === "create") return client.insert(item.payload).select().single();
  if (item.op === "update") return client.update(item.payload).eq("id", item.recordId).select();
  if (item.op === "delete") return client.delete().eq("id", item.recordId);
  return Promise.resolve({ error: { message: `Unknown operation ${item.op}` } });
}

/**
 * Replays every queued operation in order.
 *
 * Stops as soon as the backend looks unreachable again (so nothing is lost and no
 * request storm starts), and records a clear message on an operation the server
 * refused. Returns a summary the panel renders.
 */
export async function flushOutbox() {
  if (!supabase) return { applied: 0, pending: pending().length, failed: failures().length, offline: true };

  let applied = 0;
  const snapshot = pending().sort((a, b) => a.seq - b.seq);

  for (const item of snapshot) {
    let result;
    try {
      result = await apply(item);
    } catch (error) {
      result = { error };
    }

    const { error } = result || {};
    if (!error) {
      removeItem(item.id);
      applied += 1;
      continue;
    }

    // A duplicate primary key on a create means this exact operation already ran.
    if (item.op === "create" && String(error.code) === "23505") {
      removeItem(item.id);
      applied += 1;
      continue;
    }

    if (isOfflineError(error)) {
      // Still no connection: keep it queued and stop replaying for now.
      return { applied, pending: pending().length, failed: failures().length, offline: true };
    }

    // Reached the server and was refused — surface it, keep it, never drop it.
    const items = read().map((row) =>
      row.id === item.id
        ? { ...row, status: "failed", attempts: (row.attempts || 0) + 1, lastError: error.message || "Failed" }
        : row
    );
    write(items);
  }

  return { applied, pending: pending().length, failed: failures().length, offline: false };
}

/** Server rows changed since a timestamp, per table, filtered by the caller's RLS. */
export async function probeRemoteChanges(since) {
  if (!supabase || !since) return { total: 0, tables: {} };
  const { data, error } = await supabase.rpc("sync_probe", { p_since: since });
  if (error || !data) return { total: 0, tables: {} };
  const tables = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value) || 0]));
  return { total: Object.values(tables).reduce((sum, value) => sum + value, 0), tables };
}
