import { invokeFunction } from "@/lib/invoke";

export function createInvoice(payload) {
  return invokeFunction("createInvoice", payload);
}
