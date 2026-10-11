import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import { Button } from "@/components/ui/button";
import ReadyShoeForm from "@/components/forms/ReadyShoeForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { articleStockMap } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function ReadyShoes() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [articles, setArticles] = useState([]);
  const [articleStats, setArticleStats] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const [batches, articlePage, stats] = await Promise.all([
      base44.entities.ReadyShoe.filter(ALIVE, { sort: "-updated_date", limit: 100 }),
      base44.entities.Article.filter(ALIVE, { sort: "code", limit: 500 }),
      articleStockMap().catch(() => new Map()),
    ]);
    setRows(batches?.items || []);
    setArticles(articlePage?.items || []);
    setArticleStats(stats);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const available = Array.from(articleStats.values())
    .filter((entry) => entry.ready_added > 0 || entry.sold > 0)
    .sort((a, b) => b.ready_available - a.ready_available);

  const totals = rows.reduce((acc, row) => ({ cartons: acc.cartons + num(row.cartons), pairs: acc.pairs + num(row.pairs) }), {
    cartons: 0,
    pairs: 0,
  });

  const columns = [
    { key: "article_code", label: "Article", render: (row) => <span className="font-medium">{row.article_code}</span> },
    { key: "article_name", label: "Name", render: (row) => row.article_name || "—" },
    { key: "carton_type", label: "Carton", render: (row) => row.carton_type || "—" },
    { key: "cartons", label: "Cartons", numeric: true, render: (row) => num(row.cartons) },
    { key: "pairs", label: "Pairs", numeric: true, render: (row) => <span className="font-semibold">{num(row.pairs)}</span> },
    { key: "batch_label", label: "Batch", render: (row) => row.batch_label || (row.source === "production" ? "Production" : "Manual") },
    { key: "entry_date", label: "Date", render: (row) => shortDate(row.entry_date) },
  ];

  const confirmDelete = async () => {
    await softDelete("ReadyShoe", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: `${num(pendingDelete.pairs)} pairs removed from ready stock.` });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Finished goods"
        title="Ready Shoes"
        description="Every batch of finished cartons. Production adds batches here automatically and invoices deduct from them."
        actions={
          <>
            <ExportButtons
              filename="ready-shoes"
              title="Ready shoes batches"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows}
            />
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add cartons
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Batches" value={rows.length} accent />
        <KpiCard label="Cartons added" value={num(totals.cartons)} />
        <KpiCard label="Pairs added" value={pairs(totals.pairs)} />
        <KpiCard
          label="Available now"
          value={pairs(available.reduce((total, entry) => total + entry.ready_available, 0))}
          hint="Added batches minus invoiced pairs"
        />
      </div>

      {!!available.length && (
        <div className="mt-6">
          <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-[0.14em]">Article-wise ready stock</h2>
          <DataTable
            columns={[
              { key: "article_code", label: "Article", render: (row) => <span className="font-medium">{row.article_code}</span> },
              { key: "ready_cartons", label: "Cartons", numeric: true, render: (row) => num(row.ready_cartons) },
              { key: "ready_added", label: "Pairs added", numeric: true, render: (row) => num(row.ready_added) },
              { key: "sold", label: "Pairs sold", numeric: true, render: (row) => num(row.sold) },
              {
                key: "ready_available",
                label: "Available",
                numeric: true,
                render: (row) => (
                  <span className={row.ready_available <= (settings.low_stock_threshold || 0) ? "font-semibold text-destructive" : "font-semibold"}>
                    {num(row.ready_available)}
                  </span>
                ),
              },
              { key: "sales_value", label: "Sales value", numeric: true, render: (row) => money(row.sales_value, settings.currency_symbol) },
            ]}
            rows={available}
          />
        </div>
      )}

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel="No ready shoes yet"
          emptyHint="Record a production run or add cartons by hand."
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

      <ReadyShoeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSaved={load}
        articles={articles.map((article) => ({ code: article.code, name: article.name }))}
      />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this batch to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.article_code} · ${num(pendingDelete.pairs)} pairs will no longer count towards ready stock.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
