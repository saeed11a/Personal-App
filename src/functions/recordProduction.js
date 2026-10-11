import { invokeFunction } from "@/lib/invoke";

export function recordProduction(payload) {
  return invokeFunction("recordProduction", payload);
}
