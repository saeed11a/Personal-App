import { callBackend } from "@/lib/invoke";

// An invoice, its lines and the receipt that comes with it are written by the
// database function create_invoice() (0007) on the Supabase backend, and by the
// hosted Base44 function on the shipped builds.
export function createInvoice(payload) {
  return callBackend({ supabaseFunction: "create_invoice", base44Function: "createInvoice", payload });
}
