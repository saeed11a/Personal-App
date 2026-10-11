import React, { useEffect, useState } from "react";
import ReportShell from "@/components/reports/ReportShell";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";

export default function KharchaReport() {
  const { settings } = useSettings();
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = { ...ALIVE, source: "kharcha" };
    if (from || to) {
      query.entry_date = {};
      if (from) query.entry_date.$gte = from;
      if (to) query.entry_date.$lte = to;
    }
    base44.entities.Roznamcha.filter(query, { sort: "-entry_date", limit: 250 }).then((page) => {
      if (!active) return;
      setRows(page?.items || []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const byCategory = Array.from(
    rows
      .reduce((map, row) => {
        const key = row.category || "Uncategorised";
        map.set(key, (map.get(key) || 0) + (Number(row.amount) || 0));
        return map;
      }, new Map())
      .entries()
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <ReportShell
      title="Kharcha report"
      description="Daily expenses for the period with the total spend and category split."
      filename="kharcha-report"
      loading={loading}
      rows={rows}
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
      totals={[
        { label: "Total spend", value: money(total, settings.currency_symbol), accent: true },
        { label: "Entries", value: rows.length },
        { label: "Categories", value: byCategory.length },
        { label: "Average entry", value: money(rows.length ? total / rows.length : 0, settings.currency_symbol) },
      ]}
      columns={[
        { key: "entry_date", label: "Date", render: (row) => shortDate(row.entry_date) },
        { key: "description", label: "Expense", render: (row) => <span className="font-medium">{row.description}</span> },
        { key: "category", label: "Category", render: (row) => row.category || "—" },
        { key: "method", label: "Paid by", render: (row) => row.method || "Cash" },
        { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
      ]}
    >
      {!!byCategory.length && (
        <div className="panel p-5">
          <h3 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Category split</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {byCategory.map((entry) => (
              <li key={entry.category} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{entry.category}</span>
                <span className="font-mono font-semibold">{money(entry.amount, settings.currency_symbol)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ReportShell>
  );
}
