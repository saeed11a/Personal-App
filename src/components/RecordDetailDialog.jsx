import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The read-only "view" behind the eye button every module's table now carries.
//
// It shows the record the same way its own table does — the column labels with the
// cells already rendered — so a new column never has to be described twice. A screen
// that needs more than the columns can pass `fields` (label/value pairs) instead, and
// drop extra sections in as children.
//
// One label/value row per line with a rule between them, the way the article and raw
// stock views read: the label stays with the row, however long the value is.
export default function RecordDetailDialog({ open, onOpenChange, title, subtitle, badge, columns = [], fields, row, children }) {
  if (!row) return null;

  const entries = (
    fields ||
    columns.map((column) => ({
      label: column.label,
      numeric: column.numeric,
      value: typeof column.render === "function" ? column.render(row) : row[column.key],
    }))
  ).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {title || "Record"}
            {badge}
          </DialogTitle>
        </DialogHeader>

        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}

        <dl className="divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="field-label shrink-0 pt-0.5">{entry.label}</dt>
              <dd className={cn("min-w-0 break-words text-right text-sm font-medium", entry.numeric && "font-mono")}>
                {entry.value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>

        {children}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
