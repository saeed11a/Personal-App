import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TableShell({ columns, children, loading, isEmpty, emptyLabel = "No records yet" }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((column) => (
                <th
                  key={column.key || column.label}
                  className={cn(
                    "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                    column.className
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading records…
        </div>
      )}
      {!loading && isEmpty && (
        <div className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      )}
    </div>
  );
}
