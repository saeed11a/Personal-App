import React, { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import ArticleForm from "@/components/forms/ArticleForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { articleStockMap } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Articles() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [articles, setArticles] = useState([]);
  const [stock, setStock] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // The article list is populated from Uppers stock and refreshed on every load.
  const load = async () => {
    setLoading(true);
    const [page, map] = await Promise.all([
      base44.entities.Article.filter(ALIVE, { sort: "code", limit: 500 }),
      articleStockMap().catch(() => new Map()),
    ]);
    let records = page?.items || [];

    const known = new Set(records.map((article) => String(article.code).toUpperCase()));
    const missing = Array.from(map.values()).filter((entry) => entry.article_code && !known.has(entry.article_code));
    if (missing.length) {
      await base44.entities.Article.bulkCreate(
        missing.map((entry) => ({
          code: entry.article_code,
          name: entry.article_code,
          category: "Unisex",
          status: "active",
          is_deleted: false,
        }))
      );
      const refreshed = await base44.entities.Article.filter(ALIVE, { sort: "code", limit: 500 });
      records = refreshed?.items || records;
      toast({ title: "Articles synced from Uppers", description: `${missing.length} new article number(s) added.` });
    }

    setArticles(records);
    setStock(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = Array.from(stock.values()).reduce(
    (acc, entry) => ({
      uppers: acc.uppers + entry.uppers_available,
      ready: acc.ready + entry.ready_available,
      sold: acc.sold + entry.sold,
      value: acc.value + entry.sales_value,
    }),
    { uppers: 0, ready: 0, sold: 0, value: 0 }
  );

  const columns = [
    {
      key: "code",
      label: "Article no.",
      render: (row) => (
        <div>
          <p className="font-heading font-semibold">{row.code}</p>
          <p className="text-xs text-muted-foreground">{row.name}</p>
        </div>
      ),
    },
    { key: "category", label: "Category", render: (row) => row.category || "—" },
    {
      key: "uppers",
      label: "Uppers bags",
      numeric: true,
      render: (row) => num(stock.get(String(row.code).toUpperCase())?.bags),
    },
    {
      key: "uppers_available",
      label: "Uppers pairs",
      numeric: true,
      render: (row) => {
        const entry = stock.get(String(row.code).toUpperCase());
        if (!entry?.uppers_added) return "—";
        return (
          <span className={entry.uppers_available <= (settings.low_stock_threshold || 0) ? "font-semibold text-destructive" : "font-semibold"}>
            {num(entry.uppers_available)}
          </span>
        );
      },
    },
    {
      key: "ready",
      label: "Ready pairs",
      numeric: true,
      render: (row) => {
        const entry = stock.get(String(row.code).toUpperCase());
        if (!entry?.ready_added) return "—";
        return (
          <span className={entry.ready_available <= (settings.low_stock_threshold || 0) ? "font-semibold text-destructive" : "font-semibold"}>
            {num(entry.ready_available)}
          </span>
        );
      },
    },
    {
      key: "sold",
      label: "Sold",
      numeric: true,
      render: (row) => {
        const entry = stock.get(String(row.code).toUpperCase());
        return entry?.sold ? money(entry.sales_value, settings.currency_symbol) : "—";
      },
    },
    { key: "status", label: "Status", render: (row) => <StatusPill tone={row.status === "inactive" ? "danger" : "success"}>{row.status || "active"}</StatusPill> },
  ];

  const confirmDelete = async () => {
    await softDelete("Article", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: `${pendingDelete.code} can be restored from the Recycle Bin.` });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Master data"
        title="Articles"
        description="Article numbers are created automatically from Uppers stock, with quantities kept in sync as stock and production change."
        actions={
          <>
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Sync now
            </Button>
            <ExportButtons
              filename="articles"
              title="Articles"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={articles}
            />
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New article
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Articles" value={articles.length} accent />
        <KpiCard label="Uppers available" value={pairs(totals.uppers)} />
        <KpiCard label="Ready pairs" value={pairs(totals.ready)} />
        <KpiCard label="Pairs sold" value={pairs(totals.sold)} hint={money(totals.value, settings.currency_symbol)} />
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={articles}
          loading={loading}
          emptyLabel="No articles yet"
          emptyHint="Article numbers appear here as soon as uppers stock is saved against them."
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

      <ArticleForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={load} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this article to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.code} will be hidden from the article list until restored.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
