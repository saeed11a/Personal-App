import { supabase } from "@/api/supabaseClient";

// The five-digit PIN is only ever an input to a comparison that happens in the
// database. verify_pin() hashes the attempt against the salted hash stored on the
// profile, counts attempts and applies the lockout; this side receives true/false
// and nothing about the stored value.
export async function verifyPin(pin) {
  const { data, error } = await supabase.rpc("verify_pin", { p_pin: pin });
  if (error) throw error;
  return data === true;
}

// First-time setup for the signed-in administrator's own account. The PIN is
// validated and hashed server-side (setup_pin); only the outcome comes back:
// 'done' | 'already_set' | 'invalid_pin' | 'not_allowed'.
export async function setupPin(pin) {
  const { data, error } = await supabase.rpc("setup_pin", { p_pin: pin });
  if (error) throw error;
  return data;
}

// Replaces the signed-in account's PIN. The current PIN is checked server-side
// (change_pin), so a stolen password alone cannot replace it. Returns
// 'done' | 'wrong_current' | 'locked' | 'invalid_pin' | 'not_allowed'.
export async function changePin(currentPin, newPin) {
  const { data, error } = await supabase.rpc("change_pin", { p_current: currentPin, p_new: newPin });
  if (error) throw error;
  return data;
}

// Whether a PIN is set, and until when the account is locked out.
export async function getPinStatus() {
  const { data, error } = await supabase.rpc("pin_status");
  if (error) throw error;
  return data || { has_pin: false, locked_until: null };
}
