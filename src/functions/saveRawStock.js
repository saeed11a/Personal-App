import { invokeFunction } from "@/lib/invoke";

export function saveRawStock(payload) {
  return invokeFunction("saveRawStock", payload);
}
