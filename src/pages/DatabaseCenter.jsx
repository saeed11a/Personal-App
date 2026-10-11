import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, Wifi } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusPill from "@/components/StatusPill";
import ExplorerPanel from "@/components/database/ExplorerPanel";
import BackupPanel from "@/components/database/BackupPanel";
import { useSync } from "@/lib/SyncContext";
import { formatAppStamp } from "@/lib/datetime";

// The Database Center: a live explorer over the real tables, Excel/CSV/PDF exports,
// and the administrator-only backup and restore panel. Everything it reads is decided
// by RLS — the screen never sees more than the signed-in account is allowed.
export default function DatabaseCenter() {
  const [params, setParams] = useSearchParams();
  const sync = useSync();
  const [tab, setTab] = useState(params.get("tab") === "backup" ? "backup" : "explorer");

  useEffect(() => {
    const next = params.get("tab") === "backup" ? "backup" : "explorer";
    setTab(next);
  }, [params]);

  const onTab = (value) => {
    setTab(value);
    setParams(value === "backup" ? { tab: "backup" } : {}, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Database Center"
        description="Browse live database records, export them, and take verified backups. Reads are read-only and limited to what your account may access."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={sync.status === "live" ? "success" : sync.status === "syncing" ? "warning" : "danger"}>
              {sync.status === "live" ? "Synced" : sync.status === "syncing" ? "Syncing" : "Not synced"}
            </StatusPill>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              {sync.dbOk ? "Database reachable" : "Database unreachable"}
            </span>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          {sync.lastSyncedAt ? `Last confirmed sync ${formatAppStamp(sync.lastSyncedAt)}` : "No confirmed sync yet"}
        </span>
        <span>{sync.pending} upload(s) waiting</span>
        {sync.failed > 0 && <span className="text-destructive">{sync.failed} failed operation(s)</span>}
        <span className="ml-auto">Server-confirmed records only, unless a row is marked as waiting locally.</span>
      </div>

      <Tabs value={tab} onValueChange={onTab}>
        <TabsList>
          <TabsTrigger value="explorer">Live explorer</TabsTrigger>
          <TabsTrigger value="backup">Backup &amp; Restore</TabsTrigger>
        </TabsList>
        <TabsContent value="explorer" className="mt-5">
          <ExplorerPanel />
        </TabsContent>
        <TabsContent value="backup" className="mt-5">
          <BackupPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
