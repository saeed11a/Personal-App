import { invokeFunction } from "@/lib/invoke";

export function recordPurchase(payload) {
  return invokeFunction("recordPurchase", payload);
}
