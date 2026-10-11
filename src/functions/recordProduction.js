import { callBackend } from "@/lib/invoke";

// A production run and the ready shoe batch it produces are written by the database
// function record_production() (0007) on the Supabase backend, and by the hosted
// Base44 function on the shipped builds.
export function recordProduction(payload) {
  return callBackend({ supabaseFunction: "record_production", base44Function: "recordProduction", payload });
}
