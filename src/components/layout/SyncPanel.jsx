import React from "react";
import { AlertTriangle, CloudOff, Database, RefreshCw, UploadCloud, Wifi } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/StatusPill";
import { SYNC_STATES } from "@/lib/syncStates";
import { useSync } from "@/lib/SyncContext";
import { failures } from "@/lib/syncQueue";
import { formatAppStamp } from "@/lib/datetime";
import { cn } from "@/lib/utils";

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

// The compact synchronization panel behind the top-bar indicator. It tells the
// truth about what is happening and never claims a sync the server has not confirmed.
export default function SyncPanel({ open, onOpenChange }) {
  const { status, syncing, checking, dbOk, lastCheckedAt, lastSyncedAt, pending, failed, remoteChanged, message, syncNow, checkNow } =
    useSync();
  const state = SYNC_STATES[status] || SYNC_STATES.offline;
  const failureRows = failures();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", state.dot)} aria-hidden="true" />
            Synchronization
          </DialogTitle>
          <DialogDescription>Connection and database synchronization status.</DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border">
          <Row icon={Wifi} label="Connection">
            <div className="flex items-center gap-2">
              <StatusPill tone={status === "live" ? "success" : status === "syncing" ? "warning" : "danger"}>
                {state.label}
              </StatusPill>
              <span className="text-xs text-muted-foreground">{state.hint}</span>
            </div>
          </Row>

          <Row icon={Database} label="Database">
            {dbOk === true ? (
              <span className="text-emerald-600 dark:text-emerald-400">Reachable</span>
            ) : dbOk === false ? (
              <span className="text-rose-600 dark:text-rose-400">Not reachable</span>
            ) : (
              <span className="text-muted-foreground">Checking…</span>
            )}
            {lastCheckedAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">Last checked {formatAppStamp(lastCheckedAt)}</p>
            )}
          </Row>

          <Row icon={UploadCloud} label="Last successful sync">
            {lastSyncedAt ? (
              formatAppStamp(lastSyncedAt)
            ) : (
              <span className="text-muted-foreground">Not confirmed since this browser started</span>
            )}
          </Row>

          <Row icon={UploadCloud} label="Waiting to upload / download">
            <span>
              {pending} upload{pending === 1 ? "" : "s"} pending
              {failed > 0 && <span className="text-rose-600 dark:text-rose-400"> · {failed} failed</span>}
              {remoteChanged > 0 && <span className="text-amber-600 dark:text-amber-400"> · {remoteChanged} to download</span>}
            </span>
          </Row>
        </div>

        {message && (
          <p className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">{message}</p>
        )}

        {failureRows.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Failed operations
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-foreground">
              {failureRows.slice(0, 5).map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">{item.lastError || "The server refused this change."}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Nothing was discarded — these stay queued until they succeed.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={syncNow} disabled={syncing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} aria-hidden="true" />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
          <Button variant="outline" onClick={checkNow} disabled={checking}>
            {checking ? "Checking…" : "Check status"}
          </Button>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            Offline work is kept
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
