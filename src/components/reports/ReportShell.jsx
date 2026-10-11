import React, { createContext, useContext, useEffect } from "react";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import DateRangeFilter from "@/components/DateRangeFilter";
import { useSettings } from "@/lib/useSettings";

// The report that is on screen hands its rows and columns up to the Reports page, so
// the Excel / CSV and PDF / Print buttons sit beside the page title — the same place
// every other module keeps them — instead of inside the open tab. A shell rendered
// without that provider simply publishes nothing.
export const ReportExportContext = createContext(null);

// Shared shell for every report: totals, date filter, export payload and the table.
export default function ReportShell({ title, description, filename, columns, rows, loading, totals = [], range, children }) {
  const { settings } = useSettings();
  const publish = useContext(ReportExportContext);

  useEffect(() => {
    if (!publish) return undefined;
    publish({
      filename,
      title,
      subtitle: settings.company_name,
      columns: columns.map((column) => ({
        label: column.label,
        key: column.key,
        value: (row) => (typeof column.render === "function" ? column.render(row) : row[column.key]),
      })),
      rows,
    });
    return () => publish(null);
    // `columns` is rebuilt on every report render; the payload only has to change when
    // the report or its rows do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, filename, title, settings.company_name, rows]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold tracking-tight">{title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
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
