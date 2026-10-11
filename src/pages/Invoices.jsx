import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import InvoiceDetailDialog from "@/components/InvoiceDetailDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import StatusPill, { statusTone } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { invoiceStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Invoices() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.invoice_date = {};
      if (from) query.invoice_date.$gte = from;
      if (to) query.invoice_date.$lte = to;
    }
    const [page, totals] = await Promise.all([
      base44.entities.Invoice.filter(query, { sort: "-invoice_date", limit: 100 }),
      invoiceStats({ from, to }).catch(() => null),
    ]);
    setRows(page?.items || []);
    setStats(totals);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const columns = [
    { key: "invoice_number", label: "Invoice", render: (row) => <span className="font-heading font-semibold">{row.invoice_number}</span> },
    { key: "invoice_date", label: "Date", render: (row) => shortDate(row.invoice_date) },
    { key: "customer_name", label: "Customer", render: (row) => row.customer_name },
    {
      key: "total_cartons",
      label: "Cartons × pairs",
      numeric: true,
      render: (row) => (
        <span className="font-mono">
          {num(row.total_cartons)} × {num(row.total_pairs)}
        </span>
      ),
    },
    { key: "total", label: "Total", numeric: true, render: (row) => <span className="font-semibold">{money(row.total, settings.currency_symbol)}</span> },
    { key: "received", label: "Received", numeric: true, render: (row) => money(row.received, settings.currency_symbol) },
    { key: "balance", label: "Balance", numeric: true, render: (row) => money(row.balance, settings.currency_symbol) },
    { key: "status", label: "Status", render: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill> },
  ];

  const confirmDelete = async () => {
    await softDelete("Invoice", pendingDelete.id);
    toast({
      title: "Moved to Recycle Bin",
      description: `${num(pendingDelete.total_pairs)} pairs returned to ready stock while the invoice is in the bin.`,
    });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Sales desk"
        title="Invoices"
        description="Create an invoice, deduct pairs from Ready Shoes and post the balance to the customer's kata."
        actions={
          <>
            <ExportButtons
              filename="invoices"
              title="Invoice register"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows}
            />
            <Button asChild>
              <Link to="/invoices/new">
                <Plus className="mr-2 h-4 w-4" /> New invoice
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Invoices" value={stats?.count || 0} accent />
        <KpiCard label="Value" value={money(stats?.total || 0, settings.currency_symbol)} />
        <KpiCard label="Received" value={money(stats?.received || 0, settings.currency_symbol)} />
        <KpiCard label="Outstanding" value={money(stats?.balance || 0, settings.currency_symbol)} hint={pairs(stats?.pairs || 0)} />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel="No invoices yet"
          emptyHint="Use New invoice to bill a customer."
          onRowClick={setActive}
          actions={(row) => <RowActions onDelete={() => setPendingDelete(row)} />}
        />
      </div>

      <InvoiceDetailDialog invoice={active} onOpenChange={(open) => !open && setActive(null)} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this invoice to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.invoice_number} will stop counting in sales and in ${pendingDelete.customer_name}'s kata until restored.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
