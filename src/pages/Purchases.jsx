import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import PurchaseForm from "@/components/forms/PurchaseForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Purchases() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.purchase_date = {};
      if (from) query.purchase_date.$gte = from;
      if (to) query.purchase_date.$lte = to;
    }
    const [page, custom] = await Promise.all([
      base44.entities.Purchase.filter(query, { sort: "-purchase_date", limit: 100 }),
      base44.entities.RawCategory.filter(ALIVE, { limit: 100 }),
    ]);
    setRows(page?.items || []);
    setCategories(custom?.items || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = rows.reduce(
    (acc, row) => ({ amount: acc.amount + num(row.amount), pairs: acc.pairs + num(row.total_pairs) }),
    { amount: 0, pairs: 0 }
  );

  const columns = [
    { key: "purchase_date", label: "Date", render: (row) => shortDate(row.purchase_date) },
    {
      key: "item_name",
      label: "Item",
      render: (row) => (
        <div>
          <p className="font-medium">{row.item_name}</p>
          <p className="text-xs text-muted-foreground">
            {[row.category, row.article_code].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    { key: "supplier_name", label: "Supplier", render: (row) => row.supplier_name || "—" },
    { key: "quantity", label: "Quantity", numeric: true, render: (row) => `${num(row.quantity)} ${row.unit || ""}`.trim() },
    { key: "total_pairs", label: "Pairs", numeric: true, render: (row) => (row.total_pairs ? num(row.total_pairs) : "—") },
    { key: "unit_price", label: "Rate", numeric: true, render: (row) => money(row.unit_price, settings.currency_symbol) },
    { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
  ];

  const confirmDelete = async () => {
    await softDelete("Purchase", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: "The supplier kata no longer counts this purchase." });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Procurement"
        title="Purchases"
        description="Every raw material purchase increases stock and credits the supplier's kata."
        actions={
          <>
            <ExportButtons
              filename="purchases"
              title="Purchase register"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows}
            />
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New purchase
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Purchases" value={rows.length} accent />
        <KpiCard label="Purchase value" value={money(totals.amount, settings.currency_symbol)} />
        <KpiCard label="Pairs received" value={pairs(totals.pairs)} />
        <KpiCard label="Suppliers" value={new Set(rows.map((row) => row.supplier_name).filter(Boolean)).size} />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel="No purchases yet"
          emptyHint="Record a purchase to increase raw stock and credit the supplier."
          actions={(row) => <RowActions onDelete={() => setPendingDelete(row)} />}
        />
      </div>

      <PurchaseForm open={formOpen} onOpenChange={setFormOpen} onSaved={load} customCategories={categories} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this purchase to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.item_name} · ${money(pendingDelete.amount, settings.currency_symbol)} will stop counting in the supplier kata.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
