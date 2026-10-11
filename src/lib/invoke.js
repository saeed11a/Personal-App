import { base44 } from "@/api/base44Client";

// Backend operations answer with { error } for validation problems; normalise both
// the success payload and the thrown response so forms can show one inline message.
export async function invokeFunction(name, payload) {
  try {
    const response = await base44.functions.invoke(name, payload);
    return response.data || {};
  } catch (error) {
    const data = error?.response?.data;
    return { error: data?.error || error?.message || "The operation could not be completed" };
  }
}
