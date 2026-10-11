import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { usesSupabaseAuth } from "@/lib/authMode";

// Backend operations answer with { error } for validation problems; normalise both
// the success payload and the thrown response so forms can show one inline message.
export async function invokeFunction(name, payload) {
  try {
    const response = await base44.functions.invoke(name, payload);
    return response.data || {};
  } catch (error) {
    const data = error?.response?.data;
    return { error: data?.error || error?.message || "The operation could not be completed" };
  }
}

// The same contract for the Supabase backend: the write paths live in the database
// functions added by 0007 and are called through PostgREST's rpc endpoint.
export async function invokeDatabaseFunction(name, payload) {
  try {
    if (!supabase) return { error: "Supabase is not configured" };
    const { data, error } = await supabase.rpc(name, { p_payload: payload || {} });
    if (error) return { error: error.message };
    return data || {};
  } catch (error) {
    return { error: error?.message || "The operation could not be completed" };
  }
}

/**
 * Routes one operation to the backend this build runs on: the database function in
 * a Supabase build, the hosted Base44 function in the shipped APK/EXE builds.
 */
export function callBackend({ supabaseFunction, base44Function, payload }) {
  return usesSupabaseAuth ? invokeDatabaseFunction(supabaseFunction, payload) : invokeFunction(base44Function, payload);
}
