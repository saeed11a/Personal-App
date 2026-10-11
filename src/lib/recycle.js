import { base44 } from "@/api/base44Client";
import { todayISO } from "@/lib/format";

// Every module deletes softly: the record keeps its place and links, is hidden from
// its module, and waits in the Recycle Bin until restored or permanently deleted.
export const ALIVE = { is_deleted: { $ne: true } };

export const MODULES = [
  { entity: "Article", label: "Articles", path: "/articles", name: (row) => `${row.code} · ${row.name}` },
  { entity: "RawStock", label: "Raw Stock", path: "/raw-stock", name: (row) => [row.item_name, row.article_code].filter(Boolean).join(" · ") },
  { entity: "RawCategory", label: "Raw Categories", path: "/raw-stock", name: (row) => row.name },
  { entity: "ReadyShoe", label: "Ready Shoes", path: "/ready-shoes", name: (row) => `${row.article_code} · ${row.cartons || 0} cartons` },
  { entity: "ProductionEntry", label: "Production", path: "/production", name: (row) => `${row.article_code} · ${row.output_pairs || 0} prs produced` },
  { entity: "Customer", label: "Customers (Kata)", path: "/customers", name: (row) => row.name },
  { entity: "Supplier", label: "Suppliers (Kata)", path: "/suppliers", name: (row) => row.name },
  { entity: "Purchase", label: "Purchases", path: "/purchases", name: (row) => [row.item_name, row.supplier_name].filter(Boolean).join(" · ") },
  { entity: "Invoice", label: "Invoices", path: "/invoices", name: (row) => `${row.invoice_number} · ${row.customer_name}` },
  { entity: "InvoiceLine", label: "Invoice Items", path: "/sales", name: (row) => `${row.invoice_number} · ${row.article_code}` },
  { entity: "Payment", label: "Payments", path: "/payments", name: (row) => `${row.party_name} · ${row.amount}` },
  { entity: "Roznamcha", label: "Roznamcha", path: "/roznamcha", name: (row) => [row.description || row.party_name || "Entry", row.amount].join(" · ") },
];

export function moduleFor(entity) {
  return MODULES.find((module) => module.entity === entity);
}

export async function softDelete(entity, id) {
  await base44.entities[entity].update(id, { is_deleted: true, deleted_date: todayISO() });
}

export async function restoreRecord(entity, id) {
  await base44.entities[entity].update(id, { is_deleted: false });
}

export async function purgeRecord(entity, id) {
  return base44.entities[entity].delete(id);
}

export async function listDeleted() {
  const groups = await Promise.all(
    MODULES.map(async (module) => {
      const page = await base44.entities[module.entity].filter({ is_deleted: true }, { limit: 100 });
      return (page?.items || []).map((record) => ({ ...record, _module: module, _key: `${module.entity}:${record.id}` }));
    })
  );
  return groups
    .flat()
    .sort((a, b) => String(b.deleted_date || "").localeCompare(String(a.deleted_date || "")));
}
