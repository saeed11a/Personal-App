import { callBackend } from "@/lib/invoke";

// A purchase and the raw stock it brings in are written by the database function
// record_purchase() (0007) on the Supabase backend, and by the hosted Base44
// function on the shipped builds.
export function recordPurchase(payload) {
  return callBackend({ supabaseFunction: "record_purchase", base44Function: "recordPurchase", payload });
}
