// Packing conversions and category definitions used across the raw stock modules.

export const BAG_TYPES = [
  { label: "100-pair bag", pairs: 100 },
  { label: "150-pair bag", pairs: 150 },
];

export const CARTON_TYPES = [
  { label: "12-pair carton", pairs: 12 },
  { label: "18-pair carton", pairs: 18 },
  { label: "24-pair carton", pairs: 24 },
];

export const CHEMICAL_UNITS = ["drums", "kg", "pieces", "cartons"];

export const BUILTIN_CATEGORIES = [
  {
    slug: "uppers",
    name: "Uppers",
    description: "Upper stock issued to production, entered in bags",
    unit_label: "bags",
    uses_pairs: true,
    pack_type: "bag",
    builtin: true,
  },
  {
    slug: "chemicals",
    name: "Chemicals",
    description: "Adhesives, solvents and finishing chemicals",
    unit_label: "units",
    uses_pairs: false,
    pack_type: "unit",
    builtin: true,
  },
];

export function packOptions(category) {
  if (!category) return [];
  if (category.slug === "uppers" || category.pack_type === "bag") return BAG_TYPES;
  if (category.pack_type === "carton") return CARTON_TYPES;
  return [];
}

export function findCategory(slug, customCategories = []) {
  const all = [...BUILTIN_CATEGORIES, ...customCategories];
  return all.find((category) => category.slug === slug) || { slug, name: slug, unit_label: "units", uses_pairs: false };
}

export function pairsForPack(packType, customCategories = []) {
  const match = [...BAG_TYPES, ...CARTON_TYPES].find((option) => option.label === packType);
  if (match) return match.pairs;
  const custom = customCategories.find((category) => category.pack_type === packType);
  return custom?.pairs || 0;
}
