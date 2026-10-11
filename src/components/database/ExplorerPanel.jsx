import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Loader2, RefreshCw, Search, Server, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusPill from "@/components/StatusPill";
import { useToast } from "@/components/ui/use-toast";
import { useSync } from "@/lib/SyncContext";
import { EXPLORER_TABLES, columnsFromRow, fetchPage, fetchTableShape, fetchAllRows, tableEntry } from "@/lib/databaseCenter";
import { list as outboxList } from "@/lib/syncQueue";
import { exportXlsx } from "@/lib/xlsx";
import { exportTablePdf } from "@/lib/pdfTable";
import { downloadCSV } from "@/lib/reportExport";
import { logEvent } from "@/lib/backup";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100];

const formatCell = (value, type) => {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "number") return Number(value).toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// The live explorer. Reads go through the table's own RLS policies (read-only, no
// SQL from the browser), and the panel shows which rows are server-confirmed versus
// still waiting in the offline outbox.
export default function ExplorerPanel({ initialTable }) {
  const { toast } = useToast();
  const sync = useSync();
  const [table, setTable] = useState(initialTable || EXPLORER_TABLES[0].table);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const entry = tableEntry(table);

  const pendingForTable = useMemo(
    () => outboxList().filter((item) => item.table === table && item.status !== "done").length,
    // sync.total changes whenever the outbox changes
    [table, sync.total, sync.pending, sync.failed]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const shape = await fetchTableShape(table);
      setColumns(columnsFromRow(shape));
      const result = await fetchPage({ table, page, pageSize, search });
      setRows(result.rows);
      setTotal(result.count);
    } catch (err) {
      setError(err.message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [table, page, pageSize, search]);

  useEffect(() => {
    load();
  }, [load]);

  // A completed synchronization may have brought new rows in — refresh the view.
  useEffect(() => {
    if (sync.status === "live") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.lastSyncedAt]);

  const onSelectTable = (value) => {
    setTable(value);
    setPage(1);
    setSearch("");
  };

  const exportRows = async (kind) => {
    setBusy(kind);
    setError("");
    try {
      const all = await fetchAllRows({ table, search, limit: 20000 });
      const cols = columns.length ? columns : columnsFromRow(all[0]);
      const label = entry?.label || table;
      const scope = search ? `search "${search}"` : "all server records";

      if (kind === "xlsx") {
        exportXlsx({ filename: `hiker-${table}-${stamp()}.xlsx`, sheetName: label, columns: cols, rows: all });
      } else if (kind === "csv") {
        downloadCSV(`hiker-${table}-${stamp()}.csv`, cols, all);
      } else if (kind === "pdf") {
        exportTablePdf({
          title: `${label} — Database Center export`,
          tableLabel: label,
          filters: scope,
          columns: cols,
          rows: all,
          filename: `hiker-${table}-${stamp()}.pdf`,
        });
      }

      await logEvent("export_created", "database_center", table, null, { format: kind, rows: all.length, scope }, true);
      toast({ title: "Export ready", description: `${all.length} record(s) exported as ${kind.toUpperCase()}.` });
    } catch (err) {
      setError(err.message);
      await logEvent("export_failed", "database_center", table, null, { format: kind, error: err.message }, false);
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="eyebrow">Table</span>
          <Select value={table} onValueChange={onSelectTable}>
            <SelectTrigger aria-label="Select a table">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPLORER_TABLES.map((item) => (
                <SelectItem key={item.table} value={item.table}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="eyebrow">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search records…"
              className="pl-9"
              aria-label="Search records"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Rows</span>
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
            <SelectTrigger className="w-[110px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={sync.status === "live" ? "success" : sync.status === "syncing" ? "warning" : "danger"}>
          {sync.status === "live" ? "Server synced" : sync.status === "syncing" ? "Syncing" : "Not synced"}
        </StatusPill>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Server className="h-3.5 w-3.5" aria-hidden="true" />
          {total.toLocaleString()} server record{total === 1 ? "" : "s"}
        </span>
        {pendingForTable > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingForTable} unsynchronized local record{pendingForTable === 1 ? "" : "s"} (kept offline)
          </span>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportRows("xlsx")} disabled={Boolean(busy)}>
            {busy === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />} Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportRows("csv")} disabled={Boolean(busy)}>
            {busy === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportRows("pdf")} disabled={Boolean(busy)}>
            {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />} PDF
          </Button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/40">
                {columns.map((column) => (
                  <td key={column.key} className="whitespace-nowrap px-3 py-2.5 text-foreground">
                    {formatCell(row[column.key], column.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No records in this table{search ? " match this search" : " yet"}.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
