import React from "react";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "border-brand/25 bg-brand/10 text-brand",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

export default function StatusPill({ tone = "muted", children, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]",
        TONES[tone] || TONES.muted,
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status) {
  if (status === "paid" || status === "active") return "success";
  if (status === "partial") return "warning";
  if (status === "unpaid" || status === "inactive") return "danger";
  return "muted";
}
