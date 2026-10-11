import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import { Button } from "@/components/ui/button";
import RawStockForm from "@/components/forms/RawStockForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { findCategory } from "@/lib/rawCategories";
import { useSettings } from "@/lib/useSettings";
import { num, pairs, money, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function RawCategoryPage() {
  const { slug } = useParams();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const [categoryPage, stockPage] = await Promise.all([
      base44.entities.RawCategory.filter(ALIVE, { limit: 100 }),
      base44.entities.RawStock.filter({ ...ALIVE, category: slug }, { sort: "-updated_date", limit: 100 }),
    ]);
    setCategories(categoryPage?.items || []);
    setRows(stockPage?.items || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const category = useMemo(() => findCategory(slug, categories), [slug, categories]);
  const totals = rows.reduce(
    (acc, row) => ({
      quantity: acc.quantity + num(row.quantity),
      pairs: acc.pairs + num(row.total_pairs),
      value: acc.value + num(row.amount),
    }),
    { quantity: 0, pairs: 0, value: 0 }
  );

  const columns = [
    { key: "item_name", label: "Item", render: (row) => <span className="font-medium">{row.item_name}</span> },
    { key: "article_code", label: "Article", render: (row) => row.article_code || "—" },
    { key: "pack_type", label: "Pack", render: (row) => row.pack_type || row.unit || "—" },
    { key: "quantity", label: `Quantity (${category.unit_label || "units"})`, numeric: true, render: (row) => num(row.quantity) },
    ...(category.uses_pairs
      ? [{ key: "total_pairs", label: "Total pairs", numeric: true, render: (row) => <span className="font-semibold">{num(row.total_pairs)}</span> }]
      : []),
    { key: "amount", label: "Value", numeric: true, render: (row) => money(row.amount, settings.currency_symbol) },
    { key: "purchase_date", label: "Updated", render: (row) => shortDate(row.purchase_date) },
  ];

  const exportColumns = columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }));

  const confirmDelete = async () => {
    await softDelete("RawStock", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: `${pendingDelete.item_name} can be restored from the Recycle Bin.` });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Raw stock"
        title={category.name}
        description={category.description || "Stock lines for this category."}
        actions={
          <>
            <ExportButtons
              filename={`raw-stock-${slug}`}
              title={`${category.name} stock`}
              subtitle={settings.company_name}
              columns={exportColumns}
              rows={rows}
            />
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add item
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Stock lines" value={rows.length} accent />
        <KpiCard label={`Quantity (${category.unit_label || "units"})`} value={num(totals.quantity)} />
        {category.uses_pairs && <KpiCard label="Total pairs" value={pairs(totals.pairs)} />}
        <KpiCard label="Stock value" value={money(totals.value, settings.currency_symbol)} />
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel={`No ${category.name.toLowerCase()} stock yet`}
          emptyHint="Use Add item to enter the first stock line."
          actions={(row) => (
            <RowActions
              onEdit={() => {
                setEditing(row);
                setFormOpen(true);
              }}
              onDelete={() => setPendingDelete(row)}
            />
          )}
        />
      </div>

      <RawStockForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={category}
        initial={editing}
        onSaved={load}
      />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this stock line to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.item_name} will stop counting towards stock until it is restored.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
