import { callBackend } from "@/lib/invoke";

// Raw stock lines are written by the database function save_raw_stock() (0007) on the
// Supabase backend, and by the hosted Base44 function on the shipped builds.
export function saveRawStock(payload) {
  return callBackend({ supabaseFunction: "save_raw_stock", base44Function: "saveRawStock", payload });
}
