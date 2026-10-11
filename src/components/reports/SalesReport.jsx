import React, { useEffect, useState } from "react";
import ReportShell from "@/components/reports/ReportShell";
import StatusPill, { statusTone } from "@/components/StatusPill";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { invoiceStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";

export default function SalesReport() {
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
      query.invoice_date = {};
      if (from) query.invoice_date.$gte = from;
      if (to) query.invoice_date.$lte = to;
    }
    Promise.all([
      base44.entities.Invoice.filter(query, { sort: "-invoice_date", limit: 200 }),
      invoiceStats({ from, to }).catch(() => null),
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

  return (
    <ReportShell
      title="Sales report"
      description="Invoices raised in the period with what was received and what is still owed."
      filename="sales-report"
      loading={loading}
      rows={rows}
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
      totals={[
        { label: "Sales value", value: money(stats?.total || 0, settings.currency_symbol), accent: true },
        { label: "Received", value: money(stats?.received || 0, settings.currency_symbol) },
        { label: "Outstanding", value: money(stats?.balance || 0, settings.currency_symbol) },
        { label: "Pairs sold", value: pairs(stats?.pairs || 0) },
      ]}
      columns={[
        { key: "invoice_number", label: "Invoice", render: (row) => <span className="font-medium">{row.invoice_number}</span> },
        { key: "invoice_date", label: "Date", render: (row) => shortDate(row.invoice_date) },
        { key: "customer_name", label: "Customer", render: (row) => row.customer_name },
        { key: "total_cartons", label: "Cartons", numeric: true, render: (row) => num(row.total_cartons) },
        { key: "total_pairs", label: "Pairs", numeric: true, render: (row) => num(row.total_pairs) },
        { key: "total", label: "Total", numeric: true, render: (row) => <span className="font-semibold">{money(row.total, settings.currency_symbol)}</span> },
        { key: "received", label: "Received", numeric: true, render: (row) => money(row.received, settings.currency_symbol) },
        { key: "balance", label: "Balance", numeric: true, render: (row) => money(row.balance, settings.currency_symbol) },
        { key: "status", label: "Status", render: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill> },
      ]}
    />
  );
}
