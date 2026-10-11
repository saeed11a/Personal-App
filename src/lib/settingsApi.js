import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { usesSupabaseAuth } from "@/lib/authMode";

// Which backend the company settings row lives in.
//
// Base44 stays the backend for the shipped APK/EXE builds (VITE_AUTH_BACKEND
// unset or 'base44'). Once a build runs the Supabase backend, that same switch
// makes settings read and write Supabase — the Base44 project is not linked
// there, so calling it only produced 404s on every screen that shows the
// company name, currency or packing defaults.
//
// `public.settings` was created by 0001_core_schema with the same columns as the
// Base44 entity, so rows pass through in both shapes unchanged and the screens
// stay identical whichever backend is active.

export async function loadSettings() {
  if (!usesSupabaseAuth) {
    const page = await base44.entities.Settings.filter({}, { limit: 1 });
    return page?.items?.[0] ?? null;
  }
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("settings").select("*").limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function createSettings(values) {
  if (!usesSupabaseAuth) {
    return base44.entities.Settings.create(values);
  }
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("settings").insert(values).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSettings(id, values) {
  if (!usesSupabaseAuth) {
    await base44.entities.Settings.update(id, values);
    return;
  }
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("settings").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}
