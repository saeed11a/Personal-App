import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import PaymentForm from "@/components/forms/PaymentForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { paymentStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Payments() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const query = { ...ALIVE };
    if (from || to) {
      query.payment_date = {};
      if (from) query.payment_date.$gte = from;
      if (to) query.payment_date.$lte = to;
    }
    const [page, stats] = await Promise.all([
      base44.entities.Payment.filter(query, { sort: "-payment_date", limit: 100 }),
      paymentStats({ from, to }).catch(() => []),
    ]);
    setRows(page?.items || []);
    setTotals(stats || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const received = totals.find((row) => row.direction === "in")?.sum_amount || 0;
  const paid = totals.find((row) => row.direction === "out")?.sum_amount || 0;

  const columns = [
    { key: "payment_date", label: "Date", render: (row) => shortDate(row.payment_date) },
    { key: "party_name", label: "Party", render: (row) => <span className="font-medium">{row.party_name}</span> },
    {
      key: "party_type",
      label: "Type",
      render: (row) => <StatusPill tone={row.party_type === "customer" ? "success" : "warning"}>{row.party_type}</StatusPill>,
    },
    { key: "method", label: "Method", render: (row) => row.method || "—" },
    { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
    { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
    { key: "direction", label: "Cash", render: (row) => (row.direction === "in" ? "IN" : "OUT") },
  ];

  const confirmDelete = async () => {
    await softDelete("Payment", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: `${pendingDelete.party_name}'s kata no longer counts this payment.` });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Kata postings"
        title="Payments"
        description="Receipts from customers credit their kata; payments to suppliers debit the supplier balance. Both post to the roznamcha."
        actions={
          <>
            <ExportButtons
              filename="payments"
              title="Payment register"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows}
            />
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New payment
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Receipts" value={money(received, settings.currency_symbol)} hint="Cash in from customers" accent />
        <KpiCard label="Paid out" value={money(paid, settings.currency_symbol)} hint="Cash out to suppliers" />
        <KpiCard label="Net movement" value={money(received - paid, settings.currency_symbol)} />
        <KpiCard label="Entries" value={rows.length} />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel="No payments recorded"
          emptyHint="Receipts and supplier payments appear here."
          actions={(row) => <RowActions onDelete={() => setPendingDelete(row)} />}
        />
      </div>

      <PaymentForm open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this payment to the Recycle Bin?"
        description={pendingDelete ? `${money(pendingDelete.amount, settings.currency_symbol)} for ${pendingDelete.party_name} will be removed from the kata until restored.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
