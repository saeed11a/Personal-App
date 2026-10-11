import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { base44, isBase44Configured } from "@/api/base44Client";
import { supabase, isSupabaseConfigured } from "@/api/supabaseClient";
import { usesSupabaseAuth } from "@/lib/authMode";

// Is the configured backend actually answering?
//
// The check is a real request to that backend — never `navigator.onLine`, which only
// reports that the browser has a network. On Supabase it reads the caller's own
// profile row (the one read every signed-in account is guaranteed by RLS); on the
// Base44 backend it asks for the app's public settings, the same lightweight call
// AuthContext already makes at startup. Nothing is claimed as LIVE until one of
// those has come back.
//
//   live    — the last check succeeded, and recently
//   syncing — a check, or a React Query request, is in flight right now
//   offline — the last check failed, or nothing has succeeded recently
//
// Background checks run at most once a minute (plus when the tab becomes visible
// again), so the indicator never turns into a request loop.

const CHECK_INTERVAL_MS = 60_000;
// A success older than this is no longer treated as a verified connection.
const STALE_AFTER_MS = 150_000;

async function pingBackend() {
  if (usesSupabaseAuth) {
    if (!isSupabaseConfigured) return false;
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return !error;
  }
  if (!isBase44Configured) return false;
  try {
    await base44.app.getPublicSettings();
    return true;
  } catch {
    return false;
  }
}

export function useBackendStatus() {
  const [lastResult, setLastResult] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const [checking, setChecking] = useState(true);
  const inFlight = useRef(false);

  // `silent` skips the amber flash for the routine background checks; a check the
  // user is waiting on (first load, coming back to the tab) shows as SYNCING.
  const check = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setChecking(true);

    let ok = false;
    try {
      ok = await pingBackend();
    } catch {
      ok = false;
    }

    inFlight.current = false;
    setChecking(false);
    setLastResult(ok);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    check();

    const timer = setInterval(() => check({ silent: true }), CHECK_INTERVAL_MS);
    const onOnline = () => check();
    const onOffline = () => {
      setLastResult(false);
      setCheckedAt(new Date());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  // Existing synchronisation status: any in-flight React Query read or write.
  const fetching = useIsFetching();
  const mutating = useIsMutating();

  let status = "offline";
  if (checking || fetching > 0 || mutating > 0) {
    status = "syncing";
  } else if (lastResult === true && checkedAt && Date.now() - checkedAt.getTime() < STALE_AFTER_MS) {
    status = "live";
  }

  return { status, checkedAt, check };
}
