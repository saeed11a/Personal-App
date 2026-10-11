import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44, isBase44Configured } from "@/api/base44Client";
import { supabase, isSupabaseConfigured } from "@/api/supabaseClient";
import { usesSupabaseAuth } from "@/lib/authMode";
import {
  clearFailed,
  counts,
  flushOutbox,
  lastSyncedAt as readLastSyncedAt,
  probeRemoteChanges,
  setLastSyncedAt as writeLastSyncedAt,
  subscribe,
} from "@/lib/syncQueue";

// Live synchronization status — one source of truth for the top-bar indicator and
// the sync panel.
//
// It deliberately separates two things:
//   * connectivity — has the backend actually answered?
//   * synchronization — are all eligible local changes uploaded and confirmed?
//
// Green requires BOTH: a verified backend AND an empty outbox with no failed
// operations. Merely having internet never turns it green. Amber means a sync,
// upload, download or reconciliation is running. Red means the backend is
// unreachable, or work is still waiting to be uploaded, or an upload failed.

const SyncContext = createContext(null);

const PROBE_INTERVAL_MS = 45_000;
const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000];

async function pingBackend() {
  if (usesSupabaseAuth) {
    if (!isSupabaseConfigured) return { ok: false, reason: "Supabase is not configured" };
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return { ok: !error, reason: error?.message || "" };
  }
  if (!isBase44Configured) return { ok: false, reason: "Backend is not linked" };
  try {
    await base44.app.getPublicSettings();
    return { ok: true, reason: "" };
  } catch (error) {
    return { ok: false, reason: error?.message || "Backend not reachable" };
  }
}

export function SyncProvider({ children }) {
  const queryClient = useQueryClient();
  const [dbOk, setDbOk] = useState(null);
  const [checking, setChecking] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [outbox, setOutbox] = useState(() => counts());
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readLastSyncedAt());
  const [remoteChanged, setRemoteChanged] = useState(0);
  const [message, setMessage] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const running = useRef(false);
  const retryTimer = useRef(null);
  const didInitialSync = useRef(false);

  useEffect(() => subscribe(() => setOutbox(counts())), []);

  const check = useCallback(async ({ silent = true } = {}) => {
    if (!silent) setChecking(true);
    const { ok, reason } = await pingBackend();
    setDbOk(ok);
    setMessage(ok ? "" : reason);
    setLastCheckedAt(new Date());
    setChecking(false);
    return ok;
  }, []);

  const refreshFromStore = useCallback(() => {
    setOutbox(counts());
    setLastSyncedAt(readLastSyncedAt());
  }, []);

  // The whole synchronization pass, in the order the requirement sets out:
  //   1. verify the session and the backend
  //   2. upload queued local changes in order (idempotent replays)
  //   3. download/reconcile remote changes since the last confirmed sync
  //   4. only then confirm green and stamp the last-sync time
  const runSync = useCallback(
    async ({ manual = false } = {}) => {
      if (running.current) return { skipped: true };
      running.current = true;
      setSyncing(true);
      if (manual) setMessage("");
      let outcome = { applied: 0, pending: 0, failed: 0, offline: false, remoteChanged: 0 };

      try {
        // 1. session + backend
        if (usesSupabaseAuth && supabase) {
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            setMessage("Not signed in — sign in to synchronize.");
            return outcome;
          }
        }
        const ok = await check();
        if (!ok) {
          setMessage("Cannot reach the database right now. Your changes are kept and will upload when it is back.");
          return outcome;
        }

        if (!usesSupabaseAuth) {
          outcome.remoteChanged = 0;
          return outcome;
        }

        // 2. upload queued changes
        const flushed = await flushOutbox();
        outcome = { ...outcome, ...flushed };
        refreshFromStore();

        // 3. reconcile / download
        const since = readLastSyncedAt();
        const probe = await probeRemoteChanges(since);
        setRemoteChanged(probe.total);
        outcome.remoteChanged = probe.total;
        if (probe.total > 0) {
          // Pull what changed into the open screens.
          queryClient.invalidateQueries();
        }

        // 4. confirm
        const now = counts();
        if (now.pending === 0 && now.failed === 0) {
          const stamp = new Date().toISOString();
          writeLastSyncedAt(stamp);
          setLastSyncedAt(stamp);
        }
        return outcome;
      } catch (error) {
        setMessage(error?.message || "Synchronization failed");
        return outcome;
      } finally {
        running.current = false;
        setSyncing(false);
      }
    },
    [check, queryClient, refreshFromStore]
  );

  // Background: a periodic connection probe, a sync whenever the tab comes back or
  // the browser reports the network returned, and exponential-backoff retries while
  // operations are waiting. No tight polling and no duplicate posting.
  useEffect(() => {
    // One reconciliation pass on load, so the panel can show a real last-sync time
    // rather than "not confirmed" even when there is nothing queued to upload.
    check().then((ok) => {
      if (ok && !didInitialSync.current) {
        didInitialSync.current = true;
        runSync();
      }
    });

    const interval = setInterval(() => {
      check().then((ok) => {
        if (ok && counts().pending > 0) runSync();
      });
    }, PROBE_INTERVAL_MS);

    const onOnline = () => runSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        check().then((ok) => {
          if (ok && counts().pending > 0) runSync();
        });
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check, runSync]);

  // Retry with backoff while anything is waiting and the backend is reachable.
  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    const waiting = outbox.pending + outbox.failed;
    if (!waiting || dbOk !== true) return undefined;

    const attempt = Math.min(outbox.failed, BACKOFF_MS.length - 1);
    const delay = outbox.failed > 0 ? BACKOFF_MS[Math.max(attempt, 0)] : 15_000;
    retryTimer.current = setTimeout(() => runSync(), delay);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [outbox.pending, outbox.failed, dbOk, runSync]);

  const status = useMemo(() => {
    if (syncing || (checking && dbOk === null)) return "syncing";
    if (dbOk === true && outbox.pending === 0 && outbox.failed === 0) return "live";
    return "offline";
  }, [syncing, checking, dbOk, outbox]);

  const value = useMemo(
    () => ({
      status,
      syncing,
      checking,
      dbOk,
      lastCheckedAt,
      lastSyncedAt,
      pending: outbox.pending,
      failed: outbox.failed,
      total: outbox.total,
      remoteChanged,
      message,
      syncNow: () => runSync({ manual: true }),
      checkNow: () => check({ silent: false }),
      refresh: refreshFromStore,
      clearFailed,
      usesSupabaseAuth,
    }),
    [status, syncing, checking, dbOk, lastCheckedAt, lastSyncedAt, outbox, remoteChanged, message, runSync, check, refreshFromStore]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used inside a SyncProvider");
  return context;
}
