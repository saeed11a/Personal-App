import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, HardDriveDownload, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import StatusPill from "@/components/StatusPill";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { collectBackup, downloadJson, listBackups, logEvent, recordBackup, restoreBackup, validateBackup } from "@/lib/backup";
import { formatAppStamp } from "@/lib/datetime";

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// Administrator-only: take a full backup, review backup history, and merge-restore a
// backup file. A restore can only add records whose id is not already present — it can
// never overwrite or delete a production row.
export default function BackupPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [history, setHistory] = useState([]);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  const loadHistory = () => {
    listBackups()
      .then(setHistory)
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    if (isAdmin) loadHistory();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="panel mx-auto mt-6 max-w-lg p-6 text-center">
        <ShieldCheck className="mx-auto h-5 w-5 text-muted-foreground" />
        <h2 className="mt-3 font-heading text-lg font-bold">Administrators only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Backups and restores are restricted to administrators and are enforced on the server.
        </p>
      </div>
    );
  }

  const createBackup = async () => {
    setBusy("create");
    setError("");
    setSummary(null);
    try {
      const { backup, manifest, bytes } = await collectBackup({ onProgress: setProgress });
      downloadJson(`hiker-backup-${stamp()}.json`, backup);
      await recordBackup({ manifest, bytes, status: "complete", label: `Backup ${new Date().toLocaleString()}` });
      await logEvent("backup_created", "backup", "backups", null, { rows: manifest.total_rows, bytes }, true);
      loadHistory();
      toast({
        title: "Backup downloaded",
        description: `${manifest.total_rows} records across ${Object.keys(manifest.tables).length} tables.`,
      });
    } catch (err) {
      setError(err.message);
      await logEvent("backup_failed", "backup", "backups", null, { error: err.message }, false);
      try {
        await recordBackup({ manifest: { tables: {}, total_rows: 0 }, bytes: 0, status: "failed", notes: err.message });
      } catch {
        /* history row is best-effort */
      }
    } finally {
      setBusy("");
      setProgress("");
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setSummary(null);
    setConfirmed(false);
    const text = await file.text();
    const result = validateBackup(text);
    if (!result.ok) {
      setPreview(null);
      setError(result.error);
      await logEvent("restore_validation_failed", "backup", null, null, { error: result.error }, false);
      return;
    }
    setPreview({ ...result, filename: file.name });
  };

  const runRestore = async () => {
    if (!preview?.data || !confirmed) return;
    setBusy("restore");
    setError("");
    try {
      await logEvent("restore_started", "backup", null, null, { filename: preview.filename, rows: preview.totalRows }, true);
      const result = await restoreBackup(preview.data, { onProgress: setProgress });
      setSummary(result);
      await logEvent("restore_completed", "backup", null, null, result, true);
      toast({ title: "Restore complete", description: `${result.inserted} added, ${result.skipped} already present.` });
      setPreview(null);
      setConfirmed(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err.message);
      await logEvent("restore_failed", "backup", null, null, { error: err.message }, false);
    } finally {
      setBusy("");
      setProgress("");
    }
  };

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Create a full backup</h2>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reads every business table in full and downloads one JSON file with a manifest (row counts and timestamps).
          Nothing is stored on the server or in this repository.
        </p>
        <Button className="mt-3" onClick={createBackup} disabled={Boolean(busy)}>
          {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
          {busy === "create" ? progress || "Backing up…" : "Create backup"}
        </Button>
      </section>

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Restore (safe merge)</h2>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A restore only <strong>adds</strong> records whose id is not already in the database. Existing production
          records are never overwritten or deleted. Authentication users, Storage files and project configuration are
          not part of a data backup.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="mt-3 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          aria-label="Choose a backup file"
        />

        {preview && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Backup validated — review before restoring
            </p>
            <ul className="mt-2 grid gap-1 text-xs text-foreground sm:grid-cols-2">
              <li>File: {preview.filename}</li>
              <li>Version: {String(preview.version)}</li>
              <li>Created: {preview.createdAt ? formatAppStamp(preview.createdAt) : "unknown"}</li>
              <li>Records: {preview.totalRows.toLocaleString()}</li>
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(preview.tables).map(([table, count]) => (
                <StatusPill key={table} tone="muted">
                  {table}: {count}
                </StatusPill>
              ))}
            </div>
            {preview.skipped.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Skipped (not restorable here): {preview.skipped.join(", ")}
              </p>
            )}

            <label className="mt-3 flex items-start gap-2 text-xs text-foreground">
              <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5" />
              I understand this will add the records above to the live database and never delete existing records.
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={runRestore} disabled={!confirmed || Boolean(busy)}>
                {busy === "restore" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {busy === "restore" ? progress || "Restoring…" : "Restore now"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setConfirmed(false);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                disabled={Boolean(busy)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Restore finished
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.inserted} record{summary.inserted === 1 ? "" : "s"} added · {summary.skipped} already present (left untouched).
            </p>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Backup history</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No backups recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {history.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.label || "Backup"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAppStamp(item.created_date)} · {item.total_rows} records · {item.created_by_email || "—"}
                  </p>
                </div>
                <StatusPill tone={item.status === "complete" ? "success" : item.status === "failed" ? "danger" : "warning"}>
                  {item.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
