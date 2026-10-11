import React, { useState } from "react";
import { useSync } from "@/lib/SyncContext";
import { formatAppStamp } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { SYNC_STATES } from "@/lib/syncStates";
import SyncPanel from "@/components/layout/SyncPanel";

// The top-bar connection / synchronization indicator.
//
// Green only when the backend has answered AND every eligible local change is
// confirmed uploaded with nothing failed. Amber while an upload, download or
// reconciliation is running. Red when the backend is unreachable or work is still
// waiting. Clicking it opens the sync panel.

export default function ConnectionStatus({ className = "" }) {
  const [open, setOpen] = useState(false);
  const { status, pending, failed, lastSyncedAt } = useSync();
  const state = SYNC_STATES[status] || SYNC_STATES.offline;

  const waiting = pending + failed;
  const detail = lastSyncedAt ? `last synced ${formatAppStamp(lastSyncedAt)}` : "no successful sync yet";
  const label = `${state.hint} · ${detail}${waiting ? ` · ${waiting} change${waiting === 1 ? "" : "s"} waiting` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={`Synchronization status: ${label}. Open the sync panel.`}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-1.5 py-1 transition-colors hover:border-brand/40 hover:bg-muted sm:px-2",
          className
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", state.dot)} aria-hidden="true" />
        <span className={cn("text-[10px] font-bold uppercase tracking-[0.12em]", state.text)} aria-hidden="true">
          {state.label}
        </span>
        {waiting > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground" aria-hidden="true">
            {waiting}
          </span>
        )}
      </button>

      <SyncPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
