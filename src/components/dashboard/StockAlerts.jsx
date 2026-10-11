import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import StatusPill from "@/components/StatusPill";
import { pairs } from "@/lib/format";

export default function StockAlerts({ alerts = [], threshold }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Low stock alerts</h2>
        </div>
        <StatusPill tone="muted">Alert level {threshold} prs</StatusPill>
      </div>

      {alerts.length ? (
        <ul className="mt-4 space-y-2">
          {alerts.map((alert) => (
            <li
              key={`${alert.article_code}-${alert.kind}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-semibold">{alert.article_code}</p>
                <p className="text-xs text-muted-foreground">{alert.kind}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-destructive">{pairs(alert.available)}</p>
                <Link to={alert.kind === "Uppers" ? "/raw-stock/uppers" : "/ready-shoes"} className="text-[11px] font-semibold text-brand hover:underline">
                  Open module
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          Every article is above the alert level.
        </p>
      )}
    </section>
  );
}
