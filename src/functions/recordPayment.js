import { invokeFunction } from "@/lib/invoke";

export function recordPayment(payload) {
  return invokeFunction("recordPayment", payload);
}
