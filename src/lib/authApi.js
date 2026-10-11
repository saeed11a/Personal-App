import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { usesSupabaseAuth } from "@/lib/authMode";

// The single place that knows which backend authenticates this build, so the auth
// pages stay identical whichever one is active. Base44 is the current hosted
// backend; Supabase is the migration target (VITE_AUTH_BACKEND=supabase).

export async function signInWithPassword(email, password) {
  if (!usesSupabaseAuth) {
    await base44.auth.loginViaEmailPassword(email, password);
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signInWithProvider(provider, redirectTo) {
  if (!usesSupabaseAuth) {
    await base44.auth.loginWithProvider(provider, redirectTo);
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + redirectTo },
  });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (!usesSupabaseAuth) return;
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email) {
  if (!usesSupabaseAuth) {
    await base44.auth.resetPasswordRequest(email);
    return;
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password",
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

// True when the browser holds a session — on the recovery link Supabase puts one
// in place before the reset form is shown.
export async function hasActiveSession() {
  if (!usesSupabaseAuth) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}
