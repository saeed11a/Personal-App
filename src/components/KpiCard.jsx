import React from "react";
import { cn } from "@/lib/utils";

export default function KpiCard({ label, value, hint, icon: Icon, accent = false }) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <span className={cn("absolute inset-x-0 top-0 h-[3px]", accent ? "bg-brand" : "bg-border")} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="mt-3 font-heading text-3xl font-bold leading-none tracking-tight">{value}</p>
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
