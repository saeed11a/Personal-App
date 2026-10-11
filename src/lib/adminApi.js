import { supabase } from "@/api/supabaseClient";
import { logEvent } from "@/lib/backup";
import { keysForLevel, resolveLevels } from "@/lib/permissions";

// Staff account administration.
//
// Reading accounts and changing role / status / department goes through the audited
// database functions added by 0010. Issuing a PIN goes through set_pin(), which hashes
// it server-side — no PIN is ever stored or returned in plaintext, and an existing PIN
// can never be read back.
//
// Creating an account (and setting its initial password) needs the Supabase
// service_role key, which must never reach the browser. That one action is therefore
// performed by the `admin-users` Edge Function, which holds the key server-side and
// re-checks that the caller is an administrator.

export async function listAdminUsers() {
  const { data, error } = await supabase.rpc("admin_users");
  if (error) throw error;
  return data || [];
}

export async function issuePin(userId, pin) {
  const { data, error } = await supabase.rpc("set_pin", { p_user_id: userId, p_pin: pin });
  if (error) throw error;
  if (data !== true) throw new Error("The PIN could not be set (it must be exactly five digits).");
  await logEvent("user_pin_issued", "users", "profiles", userId, null, true);
  return true;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
  await logEvent("user_password_reset_sent", "users", "profiles", null, { email }, true);
}

async function callAdminFunction(body) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    // A missing deployment is the most likely failure and deserves a plain message.
    const message = String(error.message || "");
    if (message.includes("Failed to send") || message.includes("404") || message.includes("not found")) {
      throw new Error(
        "The staff-account service is not deployed yet. An administrator must deploy the `admin-users` Edge Function (see docs/PROGRESS.md)."
      );
    }
    throw new Error(message || "The account operation failed");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Creates a staff account: the Auth user, its profile (name/department/role/status)
 * and its initial permissions, in one server-side call.
 */
export async function createStaffAccount({ email, password, fullName, phone, department, role, levels }) {
  // The access levels are turned into '<module>:<action>' grants here, with the same
  // helper the Staff & access screen uses, so the account is created with exactly the
  // grants the RLS policies will enforce.
  const resolved = resolveLevels(levels || {});
  const permissions = Object.entries(resolved).flatMap(([moduleKey, level]) => keysForLevel(moduleKey, level));

  const result = await callAdminFunction({
    action: "create",
    email,
    password,
    fullName,
    phone,
    department,
    role,
    permissions,
  });
  await logEvent("user_created", "users", "profiles", result?.userId || null, { email, role }, true);
  return result;
}

export async function deleteStaffAccount(userId) {
  const result = await callAdminFunction({ action: "delete", userId });
  await logEvent("user_deleted", "users", "profiles", userId, null, true);
  return result;
}
