import React, { useEffect, useState } from "react";
import ReportShell from "@/components/reports/ReportShell";
import StatusPill from "@/components/StatusPill";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { cashStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";

export default function RoznamchaReport() {
  const { settings } = useSettings();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.entry_date = {};
      if (from) query.entry_date.$gte = from;
      if (to) query.entry_date.$lte = to;
    }
    Promise.all([
      base44.entities.Roznamcha.filter(query, { sort: "-entry_date", limit: 250 }),
      cashStats({ from, to }).catch(() => null),
    ]).then(([page, totals]) => {
      if (!active) return;
      setRows(page?.items || []);
      setStats(totals);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const remaining = (Number(settings.opening_cash) || 0) + (stats?.cashIn || 0) - (stats?.cashOut || 0);

  return (
    <ReportShell
      title="Roznamcha report"
      description="Cash book movement for the period: receipts, payments, expenses and other income."
      filename="roznamcha-report"
      loading={loading}
      rows={rows}
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
      totals={[
        { label: "Total IN", value: money(stats?.cashIn || 0, settings.currency_symbol), accent: true },
        { label: "Total OUT", value: money(stats?.cashOut || 0, settings.currency_symbol) },
        { label: "Kharcha", value: money(stats?.kharcha || 0, settings.currency_symbol) },
        { label: "Remaining", value: money(remaining, settings.currency_symbol) },
      ]}
      columns={[
        { key: "entry_date", label: "Date", render: (row) => shortDate(row.entry_date) },
        { key: "description", label: "Particulars", render: (row) => <span className="font-medium">{row.description || row.party_name || "—"}</span> },
        { key: "direction", label: "Flow", render: (row) => <StatusPill tone={row.direction === "in" ? "success" : "danger"}>{row.direction === "in" ? "IN" : "OUT"}</StatusPill> },
        { key: "source", label: "Source", render: (row) => String(row.source || "").replace(/_/g, " ") },
        { key: "party_name", label: "Party", render: (row) => row.party_name || "—" },
        { key: "method", label: "Method", render: (row) => row.method || "—" },
        { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
      ]}
    />
  );
}
