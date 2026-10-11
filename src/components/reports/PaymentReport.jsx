import React, { useEffect, useState } from "react";
import ReportShell from "@/components/reports/ReportShell";
import StatusPill from "@/components/StatusPill";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { paymentStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";

export default function PaymentReport() {
  const { settings } = useSettings();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.payment_date = {};
      if (from) query.payment_date.$gte = from;
      if (to) query.payment_date.$lte = to;
    }
    Promise.all([
      base44.entities.Payment.filter(query, { sort: "-payment_date", limit: 200 }),
      paymentStats({ from, to }).catch(() => []),
    ]).then(([page, totals]) => {
      if (!active) return;
      setRows(page?.items || []);
      setStats(totals || []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const received = Number(stats.find((row) => row.direction === "in")?.sum_amount) || 0;
  const paid = Number(stats.find((row) => row.direction === "out")?.sum_amount) || 0;

  return (
    <ReportShell
      title="Payment report"
      description="Money received from customers and paid to suppliers in the period."
      filename="payment-report"
      loading={loading}
      rows={rows}
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
      totals={[
        { label: "Received", value: money(received, settings.currency_symbol), accent: true },
        { label: "Paid out", value: money(paid, settings.currency_symbol) },
        { label: "Net movement", value: money(received - paid, settings.currency_symbol) },
        { label: "Entries", value: rows.length },
      ]}
      columns={[
        { key: "payment_date", label: "Date", render: (row) => shortDate(row.payment_date) },
        { key: "party_name", label: "Party", render: (row) => <span className="font-medium">{row.party_name}</span> },
        { key: "party_type", label: "Type", render: (row) => <StatusPill tone={row.party_type === "customer" ? "success" : "warning"}>{row.party_type}</StatusPill> },
        { key: "method", label: "Method", render: (row) => row.method || "—" },
        { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
        { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
      ]}
    />
  );
}
