import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import DeleteDialog from "@/components/DeleteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDeleted, MODULES, purgeRecord, restoreRecord } from "@/lib/recycle";
import { shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function RecycleBin() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingPurge, setPendingPurge] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setRows(await listDeleted());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (row) => {
    setBusy(true);
    await restoreRecord(row._module.entity, row.id);
    setBusy(false);
    toast({
      title: "Restored",
      description: `${row._module.name(row)} is back in ${row._module.label}.`,
      action: (
        <Button asChild variant="outline" size="sm">
          <Link to={row._module.path}>Open module</Link>
        </Button>
      ),
    });
    load();
  };

  const purge = async () => {
    setBusy(true);
    await purgeRecord(pendingPurge._module.entity, pendingPurge.id);
    setBusy(false);
    toast({ title: "Deleted permanently", description: `${pendingPurge._module.name(pendingPurge)} cannot be recovered.` });
    setPendingPurge(null);
    load();
  };

  const filtered = rows.filter((row) => {
    if (moduleFilter !== "all" && row._module.entity !== moduleFilter) return false;
    if (!search.trim()) return true;
    return `${row._module.name(row)} ${row._module.label}`.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div>
      <PageHeader
        eyebrow="Recovery"
        title="Recycle Bin"
        description="Everything deleted anywhere in the app waits here. Restore puts a record back in its module; permanent delete cannot be undone."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Deleted records" value={rows.length} accent />
        <KpiCard label="Modules affected" value={new Set(rows.map((row) => row._module.entity)).size} />
        <KpiCard label="Latest deletion" value={rows.length ? shortDate(rows[0].deleted_date) : "—"} />
        <KpiCard label="Shown" value={filtered.length} hint="After filters" />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="field-label">Module</span>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {MODULES.map((module) => (
                <SelectItem key={module.entity} value={module.entity}>
                  {module.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="field-label">Search</span>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Record name" className="w-[220px]" />
        </label>
      </div>

      <div className="mt-4">
        <DataTable
          columns={[
            { key: "module", label: "Module", render: (row) => <span className="font-medium text-destructive">{row._module.label}</span> },
            { key: "name", label: "Record", render: (row) => row._module.name(row) },
            { key: "deleted_date", label: "Deleted", render: (row) => shortDate(row.deleted_date) },
          ]}
          rows={filtered}
          loading={loading}
          emptyLabel="Recycle Bin is empty"
          emptyHint="Deleted records from every module are collected here, shown in red."
          actions={(row) => (
            <div className="flex items-center justify-end gap-1">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => restore(row)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => setPendingPurge(row)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete permanently
              </Button>
            </div>
          )}
        />
      </div>

      <DeleteDialog
        open={!!pendingPurge}
        onOpenChange={(open) => !open && setPendingPurge(null)}
        title="Delete permanently?"
        description={pendingPurge ? `${pendingPurge._module.name(pendingPurge)} will be erased for good. This cannot be undone.` : ""}
        confirmLabel="Delete permanently"
        destructive
        busy={busy}
        onConfirm={purge}
      />
    </div>
  );
}
