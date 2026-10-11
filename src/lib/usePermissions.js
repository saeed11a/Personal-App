import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { MODULES, levelForKeys } from "@/lib/permissions";

// The caller's own access levels, read from user_permissions.
//
// This is what the database already enforces: RLS asks has_permission() for every
// read and write, and the 0006 posting functions check the module permission again
// before they move money. The hook exists so the sidebar, routes and buttons show
// the same thing the database will allow — never as a replacement for it. An
// administrator passes every check through is_admin(), and the Base44 backend (the
// shipped APK/EXE builds) has no permission tables, so it is left ungated there.
//
export function usePermissions() {
  const { user } = useAuth();
  const [levels, setLevels] = useState(null);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";
  const usesSupabase = Boolean(supabase);

  const refresh = useCallback(async () => {
    if (!user?.id || !usesSupabase) return;
    const { data, error: readError } = await supabase
      .from("user_permissions")
      .select("permission")
      .eq("user_id", user.id)
      .eq("granted", true);
    if (readError) {
      setError(readError.message);
      return;
    }
    const keys = (data || []).map((row) => row.permission);
    setLevels(Object.fromEntries(MODULES.map((module) => [module.key, levelForKeys(module.key, keys)])));
    setError("");
  }, [user?.id, usesSupabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Permissions can be changed by an administrator at any time: refresh when the
  // window comes back into focus so the change is picked up without a reload.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const level = useCallback(
    (module) => {
      if (!usesSupabase) return "full";
      if (isAdmin) return "full";
      return levels?.[module] || "none";
    },
    [isAdmin, levels, usesSupabase]
  );

  const can = useCallback(
    (module, action = "view") => {
      const current = level(module);
      if (current === "full") return true;
      return action === "view" && current === "view";
    },
    [level]
  );

  return {
    loading: usesSupabase && !isAdmin && levels === null,
    isAdmin: isAdmin || !usesSupabase,
    levels,
    level,
    can,
    error,
    refresh,
  };
}
