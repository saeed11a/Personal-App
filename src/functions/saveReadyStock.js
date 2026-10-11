import { callBackend } from "@/lib/invoke";

// Ready shoe batches are written by the database function save_ready_stock() (0007)
// on the Supabase backend, and by the hosted Base44 function on the shipped builds.
export function saveReadyStock(payload) {
  return callBackend({ supabaseFunction: "save_ready_stock", base44Function: "saveReadyStock", payload });
}
