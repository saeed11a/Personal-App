import React from "react";
import { cn } from "@/lib/utils";

// The metric card every module shares. `accent` paints the top rule in the brand
// colour; `tone` instead paints it — and the figure — money-in green or money-out red,
// so a cash book's TOTAL IN / TOTAL OUT pair reads at a glance.
export default function KpiCard({ label, value, hint, icon: Icon, accent = false, tone }) {
  const rule = tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-destructive" : accent ? "bg-brand" : "bg-border";
  const figure =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400" : tone === "danger" ? "text-destructive" : "";

  return (
    <div className="panel relative overflow-hidden p-5">
      <span className={cn("absolute inset-x-0 top-0 h-[3px]", rule)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className={cn("mt-3 font-heading text-3xl font-bold leading-none tracking-tight", figure)}>{value}</p>
          {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              accent ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
