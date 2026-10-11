import React from "react";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import { useSettings } from "@/lib/useSettings";

// Shared shell for every report: totals, date filter, export and the table itself.
export default function ReportShell({ title, description, filename, columns, rows, loading, totals = [], range, children }) {
  const { settings } = useSettings();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold tracking-tight">{title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <ExportButtons
          filename={filename}
          title={title}
          subtitle={settings.company_name}
          columns={columns.map((column) => ({
            label: column.label,
            key: column.key,
            value: (row) => (typeof column.render === "function" ? column.render(row) : row[column.key]),
          }))}
          rows={rows}
        />
      </div>

      {!!totals.length && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {totals.map((total) => (
            <KpiCard key={total.label} label={total.label} value={total.value} hint={total.hint} accent={total.accent} />
          ))}
        </div>
      )}

      {range && <DateRangeFilter {...range} />}
      {children}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyLabel={`No ${title.toLowerCase()} records for this selection`}
        emptyHint="Change the date filter or record new entries in the module."
      />
    </section>
  );
}
