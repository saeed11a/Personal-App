import React, { useEffect, useState } from "react";
import ReportShell from "@/components/reports/ReportShell";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { purchaseStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";

export default function PurchaseReport() {
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
      query.purchase_date = {};
      if (from) query.purchase_date.$gte = from;
      if (to) query.purchase_date.$lte = to;
    }
    Promise.all([
      base44.entities.Purchase.filter(query, { sort: "-purchase_date", limit: 200 }),
      purchaseStats({ from, to }).catch(() => null),
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
      title="Purchase report"
      description="Raw material bought in the period, with quantities, pairs and value."
      filename="purchase-report"
      loading={loading}
      rows={rows}
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
      totals={[
        { label: "Purchase value", value: money(stats?.amount || 0, settings.currency_symbol), accent: true },
        { label: "Purchases", value: stats?.count || 0 },
        { label: "Pairs received", value: pairs(stats?.pairs || 0) },
        { label: "Suppliers", value: new Set(rows.map((row) => row.supplier_name).filter(Boolean)).size },
      ]}
      columns={[
        { key: "purchase_date", label: "Date", render: (row) => shortDate(row.purchase_date) },
        { key: "item_name", label: "Item", render: (row) => <span className="font-medium">{row.item_name}</span> },
        { key: "supplier_name", label: "Supplier", render: (row) => row.supplier_name || "—" },
        { key: "category", label: "Category", render: (row) => row.category || "—" },
        { key: "quantity", label: "Quantity", numeric: true, render: (row) => `${num(row.quantity)} ${row.unit || ""}`.trim() },
        { key: "total_pairs", label: "Pairs", numeric: true, render: (row) => (row.total_pairs ? num(row.total_pairs) : "—") },
        { key: "unit_price", label: "Rate", numeric: true, render: (row) => money(row.unit_price, settings.currency_symbol) },
        { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
      ]}
    />
  );
}
