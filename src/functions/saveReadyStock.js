import { invokeFunction } from "@/lib/invoke";

export function saveReadyStock(payload) {
  return invokeFunction("saveReadyStock", payload);
}
