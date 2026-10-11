import React, { useEffect, useState } from "react";
import DataTable from "@/components/DataTable";
import ReportShell from "@/components/reports/ReportShell";
import { articleStockMap, rawStockByCategory } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs } from "@/lib/format";

export default function StockReport() {
  const { settings } = useSettings();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([articleStockMap().catch(() => new Map()), rawStockByCategory().catch(() => [])]).then(([map, categoryRows]) => {
      if (!active) return;
      setRows(Array.from(map.values()).sort((a, b) => a.article_code.localeCompare(b.article_code)));
      setCategories(categoryRows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const totals = rows.reduce(
    (acc, row) => ({
      uppers: acc.uppers + row.uppers_available,
      ready: acc.ready + row.ready_available,
      sold: acc.sold + row.sold,
      value: acc.value + row.sales_value,
    }),
    { uppers: 0, ready: 0, sold: 0, value: 0 }
  );

  const columns = [
    { key: "article_code", label: "Article", render: (row) => <span className="font-medium">{row.article_code}</span> },
    { key: "bags", label: "Uppers bags", numeric: true, render: (row) => num(row.bags) },
    { key: "uppers_used", label: "Uppers used", numeric: true, render: (row) => num(row.uppers_used) },
    { key: "uppers_available", label: "Uppers in stock", numeric: true, render: (row) => <span className="font-semibold">{num(row.uppers_available)}</span> },
    { key: "produced", label: "Produced", numeric: true, render: (row) => num(row.produced) },
    { key: "sold", label: "Sold", numeric: true, render: (row) => num(row.sold) },
    { key: "ready_available", label: "Ready in stock", numeric: true, render: (row) => <span className="font-semibold">{num(row.ready_available)}</span> },
    { key: "sales_value", label: "Sales value", numeric: true, render: (row) => money(row.sales_value, settings.currency_symbol) },
  ];

  return (
    <ReportShell
      title="Stock report"
      description="Live position of uppers and ready shoes for every article."
      filename="stock-report"
      columns={columns}
      rows={rows}
      loading={loading}
      totals={[
        { label: "Uppers in stock", value: pairs(totals.uppers), accent: true },
        { label: "Ready in stock", value: pairs(totals.ready) },
        { label: "Pairs sold", value: pairs(totals.sold) },
        { label: "Sales value", value: money(totals.value, settings.currency_symbol) },
      ]}
    >
      <div>
        <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-[0.14em]">Raw stock by category</h3>
        <DataTable
          columns={[
            { key: "category", label: "Category", render: (row) => <span className="font-medium capitalize">{row.category}</span> },
            { key: "count", label: "Lines", numeric: true, render: (row) => num(row.count) },
            { key: "sum_quantity", label: "Quantity", numeric: true, render: (row) => num(row.sum_quantity) },
            { key: "sum_total_pairs", label: "Pairs", numeric: true, render: (row) => num(row.sum_total_pairs) },
            { key: "sum_amount", label: "Value", numeric: true, render: (row) => money(row.sum_amount, settings.currency_symbol) },
          ]}
          rows={categories}
          loading={loading}
          emptyLabel="No raw stock recorded"
        />
      </div>
    </ReportShell>
  );
}
