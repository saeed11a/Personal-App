export function escapeRegex(term) {
  return String(term || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Builds a server-side case-insensitive text query across the given fields.
export function textSearch(fields, term) {
  const value = String(term || "").trim();
  if (!value) return {};
  const safe = escapeRegex(value);
  return {
    $or: fields.map((field) => ({ [field]: { $regex: safe, $options: "i" } })),
  };
}
