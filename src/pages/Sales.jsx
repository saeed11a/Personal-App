import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import InvoiceDetailDialog from "@/components/InvoiceDetailDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import StatusPill, { statusTone } from "@/components/StatusPill";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { invoiceStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";

// Sales module: every invoice line across all invoices, ready to filter and total up.
export default function Sales() {
  const { settings } = useSettings();
  const [lines, setLines] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const load = async () => {
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.invoice_date = {};
      if (from) query.invoice_date.$gte = from;
      if (to) query.invoice_date.$lte = to;
    }
    const [page, invoiceTotals] = await Promise.all([
      base44.entities.InvoiceLine.filter(query, { sort: "-invoice_date", limit: 200 }),
      invoiceStats({ from, to }).catch(() => null),
    ]);
    setLines(page?.items || []);
    setStats(invoiceTotals);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = lines.reduce(
    (acc, line) => ({ pairs: acc.pairs + num(line.pairs), value: acc.value + num(line.line_total) }),
    { pairs: 0, value: 0 }
  );

  const byArticle = Array.from(
    lines
      .reduce((map, line) => {
        const entry = map.get(line.article_code) || { article_code: line.article_code, pairs: 0, value: 0 };
        entry.pairs += num(line.pairs);
        entry.value += num(line.line_total);
        map.set(line.article_code, entry);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => b.value - a.value);

  const columns = [
    { key: "invoice_number", label: "Invoice", render: (row) => <span className="font-medium">{row.invoice_number}</span> },
    { key: "invoice_date", label: "Date", render: (row) => shortDate(row.invoice_date) },
    { key: "customer_name", label: "Customer", render: (row) => row.customer_name },
    {
      key: "article_code",
      label: "Article",
      render: (row) => (
        <div>
          <p className="font-medium">{row.article_code}</p>
          <p className="text-xs text-muted-foreground">{row.article_name || "—"}</p>
        </div>
      ),
    },
    {
      key: "cartons",
      label: "Cartons × pairs",
      numeric: true,
      render: (row) => (
        <span className="font-mono">
          {num(row.cartons)} × {num(row.pairs_per_carton)}
        </span>
      ),
    },
    { key: "pairs", label: "Pairs", numeric: true, render: (row) => <span className="font-semibold">{num(row.pairs)}</span> },
    { key: "price_per_pair", label: "Rate", numeric: true, render: (row) => money(row.price_per_pair, settings.currency_symbol) },
    { key: "line_total", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.line_total, settings.currency_symbol)}</span> },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="All invoice details"
        description="Every item sold, with the cartons, pairs and value — filtered by date."
        actions={
          <ExportButtons
            filename="sales-details"
            title="Sales details"
            subtitle={settings.company_name}
            columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
            rows={lines}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Invoiced" value={money(stats?.total || 0, settings.currency_symbol)} hint={`${stats?.count || 0} invoice(s)`} accent />
        <KpiCard label="Received" value={money(stats?.received || 0, settings.currency_symbol)} />
        <KpiCard label="Outstanding" value={money(stats?.balance || 0, settings.currency_symbol)} hint="Balance on invoices" />
        <KpiCard label="Pairs sold" value={pairs(totals.pairs)} hint={money(totals.value, settings.currency_symbol)} />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={lines}
          loading={loading}
          emptyLabel="No sales in this period"
          emptyHint="Create an invoice to see its items here."
          onRowClick={(row) => setActive({ id: row.invoice_id, invoice_number: row.invoice_number, customer_name: row.customer_name })}
        />
      </div>

      {!!byArticle.length && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em]">
            <FileText className="h-4 w-4 text-brand" /> Sales by article
          </h2>
          <DataTable
            columns={[
              { key: "article_code", label: "Article", render: (row) => <span className="font-medium">{row.article_code}</span> },
              { key: "pairs", label: "Pairs sold", numeric: true, render: (row) => num(row.pairs) },
              { key: "value", label: "Value", numeric: true, render: (row) => <span className="font-semibold">{money(row.value, settings.currency_symbol)}</span> },
            ]}
            rows={byArticle}
          />
        </div>
      )}

      <InvoiceDetailDialog invoice={active} onOpenChange={(open) => !open && setActive(null)} />
    </div>
  );
}
