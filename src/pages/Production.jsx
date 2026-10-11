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
import ProductionForm from "@/components/forms/ProductionForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { useSettings } from "@/lib/useSettings";
import { num, pairs, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Production() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.production_date = {};
      if (from) query.production_date.$gte = from;
      if (to) query.production_date.$lte = to;
    }
    const page = await base44.entities.ProductionEntry.filter(query, { sort: "-production_date", limit: 100 });
    setRows(page?.items || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = rows.reduce(
    (acc, row) => ({
      uppers: acc.uppers + num(row.uppers_used_pairs),
      output: acc.output + num(row.output_pairs),
      cartons: acc.cartons + num(row.output_cartons),
      bags: acc.bags + num(row.input_bags),
    }),
    { uppers: 0, output: 0, cartons: 0, bags: 0 }
  );

  const columns = [
    {
      key: "article_code",
      label: "Article",
      render: (row) => (
        <div>
          <p className="font-heading font-semibold">{row.article_code}</p>
          <p className="text-xs text-muted-foreground">{row.article_name || "—"}</p>
        </div>
      ),
    },
    { key: "production_date", label: "Date", render: (row) => shortDate(row.production_date) },
    { key: "input_bags", label: "Uppers bags", numeric: true, render: (row) => num(row.input_bags) },
    { key: "uppers_used_pairs", label: "Uppers used", numeric: true, render: (row) => num(row.uppers_used_pairs) },
    { key: "carton_type", label: "Carton size", render: (row) => row.carton_type || "—" },
    { key: "output_cartons", label: "Cartons", numeric: true, render: (row) => num(row.output_cartons) },
    { key: "output_pairs", label: "Pairs produced", numeric: true, render: (row) => <span className="font-semibold">{num(row.output_pairs)}</span> },
    { key: "line", label: "Line / shift", render: (row) => [row.line, row.shift].filter(Boolean).join(" · ") || "—" },
  ];

  const confirmDelete = async () => {
    await softDelete("ProductionEntry", pendingDelete.id);
    toast({
      title: "Moved to Recycle Bin",
      description: `${num(pendingDelete.uppers_used_pairs)} pairs of uppers are back in stock.`,
    });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Shop floor"
        title="Production"
        description="Issue uppers for an article, receive the ready cartons — uppers stock falls and Ready Shoes rises automatically."
        actions={
          <>
            <ExportButtons
              filename="production"
              title="Production register"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows}
            />
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New production
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Production runs" value={rows.length} accent />
        <KpiCard label="Uppers issued" value={pairs(totals.uppers)} hint={`${num(totals.bags)} bag(s)`} />
        <KpiCard label="Pairs produced" value={pairs(totals.output)} hint={`${num(totals.cartons)} carton(s)`} />
        <KpiCard label="Yield" value={`${totals.uppers ? Math.round((totals.output / totals.uppers) * 100) : 0}%`} hint="Produced vs uppers issued" />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel="No production recorded yet"
          emptyHint="Start with New production to issue uppers and receive cartons."
          actions={(row) => <RowActions onDelete={() => setPendingDelete(row)} />}
        />
      </div>

      <ProductionForm open={formOpen} onOpenChange={setFormOpen} onSaved={load} settings={settings} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Reverse this production entry?"
        description={pendingDelete ? `${num(pendingDelete.uppers_used_pairs)} pairs of uppers return to stock and ${num(pendingDelete.output_pairs)} produced pairs stop counting.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
