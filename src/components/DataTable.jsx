import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function cell(column, row) {
  if (typeof column.render === "function") return column.render(row);
  return row[column.key];
}

// One table for every module: a real table on desktop, stacked cards on mobile.
export default function DataTable({
  columns,
  rows = [],
  loading = false,
  emptyLabel = "No records yet",
  emptyHint,
  actions,
  onRowClick,
  footer,
}) {
  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="panel overflow-hidden">
      <div className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn("space-y-3 p-4", onRowClick && "cursor-pointer active:bg-muted/60")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-semibold">{cell(columns[0], row)}</p>
                {columns[1] && <p className="mt-0.5 truncate text-xs text-muted-foreground">{cell(columns[1], row)}</p>}
              </div>
              {actions && <div className="flex shrink-0 items-center gap-1">{actions(row)}</div>}
            </div>
            {columns.length > 2 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {columns.slice(2).map((column) => (
                  <div key={column.key || column.label} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{column.label}</dt>
                    <dd className={cn("truncate text-sm", column.numeric && "font-mono")}>{cell(column, row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((column) => (
                <th
                  key={column.key || column.label}
                  className={cn(
                    "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                    column.numeric && "text-right",
                    column.className
                  )}
                >
                  {column.label}
                </th>
              ))}
              {actions && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-muted/40")}
              >
                {columns.map((column) => (
                  <td
                    key={column.key || column.label}
                    className={cn("px-4 py-3 align-middle", column.numeric && "text-right font-mono", column.className)}
                  >
                    {cell(column, row)}
                  </td>
                ))}
                {actions && <td className="px-4 py-3 text-right">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading records…
        </div>
      )}
      {isEmpty && (
        <div className="px-6 py-12 text-center">
          <p className="font-heading text-sm font-semibold">{emptyLabel}</p>
          {emptyHint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{emptyHint}</p>}
        </div>
      )}
      {footer && !isEmpty && <div className="border-t border-border bg-muted/30 px-4 py-3">{footer}</div>}
    </div>
  );
}
