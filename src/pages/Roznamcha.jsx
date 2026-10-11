import React, { useEffect, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import RoznamchaForm from "@/components/forms/RoznamchaForm";
import PaymentForm from "@/components/forms/PaymentForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { cashStats } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

const SOURCE_LABELS = {
  customer_receipt: "Customer receipt",
  supplier_payment: "Supplier payment",
  kharcha: "Expense",
  other_income: "Other income",
  opening: "Opening cash",
};

export default function Roznamcha() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [inRows, setInRows] = useState([]);
  const [outRows, setOutRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [entryOpen, setEntryOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const range = {};
    if (from || to) {
      range.entry_date = {};
      if (from) range.entry_date.$gte = from;
      if (to) range.entry_date.$lte = to;
    }
    const [inPage, outPage, totals] = await Promise.all([
      base44.entities.Roznamcha.filter({ ...ALIVE, ...range, direction: "in" }, { sort: "-entry_date", limit: 100 }),
      base44.entities.Roznamcha.filter({ ...ALIVE, ...range, direction: "out" }, { sort: "-entry_date", limit: 100 }),
      cashStats({ from, to }).catch(() => null),
    ]);
    setInRows(inPage?.items || []);
    setOutRows(outPage?.items || []);
    setStats(totals);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const remaining = (Number(settings.opening_cash) || 0) + (stats?.cashIn || 0) - (stats?.cashOut || 0);

  const columns = [
    { key: "entry_date", label: "Date", render: (row) => shortDate(row.entry_date) },
    {
      key: "description",
      label: "Particulars",
      render: (row) => (
        <div>
          <p className="font-medium">{row.description || row.party_name || "—"}</p>
          <p className="text-xs text-muted-foreground">{SOURCE_LABELS[row.source] || row.source}</p>
        </div>
      ),
    },
    { key: "party_name", label: "Party", render: (row) => row.party_name || "—" },
    { key: "method", label: "Method", render: (row) => row.method || "—" },
    { key: "category", label: "Category", render: (row) => row.category || "—" },
    { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
  ];

  const confirmDelete = async () => {
    await softDelete("Roznamcha", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: "The cash book balance has been recalculated." });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Cash book"
        title="Roznamcha"
        description="Cash in hand, amounts received from customers, other income, supplier payments and daily expenses — with the remaining balance."
        actions={
          <>
            <ExportButtons
              filename="roznamcha"
              title="Roznamcha"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={[...inRows.map((row) => ({ ...row, flow: "IN" })), ...outRows.map((row) => ({ ...row, flow: "OUT" }))]}
            />
            <Button variant="outline" onClick={() => setPaymentOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" /> Record payment
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEntryOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New entry
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total IN" value={money(stats?.cashIn || 0, settings.currency_symbol)} accent />
        <KpiCard label="Total OUT" value={money(stats?.cashOut || 0, settings.currency_symbol)} />
        <KpiCard label="Kharcha included" value={money(stats?.kharcha || 0, settings.currency_symbol)} hint="Daily expenses paid" />
        <KpiCard label="Remaining balance" value={money(remaining, settings.currency_symbol)} hint={`Opening ${money(settings.opening_cash)}`} />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em]">
            IN <StatusPill tone="success">{inRows.length}</StatusPill>
          </h2>
          <DataTable
            columns={columns}
            rows={inRows}
            loading={loading}
            emptyLabel="No cash received in this period"
            actions={(row) => (
              <RowActions
                onEdit={() => {
                  setEditing(row);
                  setEntryOpen(true);
                }}
                onDelete={() => setPendingDelete(row)}
              />
            )}
          />
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em]">
            OUT <StatusPill tone="danger">{outRows.length}</StatusPill>
          </h2>
          <DataTable
            columns={columns}
            rows={outRows}
            loading={loading}
            emptyLabel="No cash paid out in this period"
            actions={(row) => (
              <RowActions
                onEdit={() => {
                  setEditing(row);
                  setEntryOpen(true);
                }}
                onDelete={() => setPendingDelete(row)}
              />
            )}
          />
        </section>
      </div>

      <section className="panel mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="eyebrow">REMAINING</p>
          <p className="mt-1 font-heading text-2xl font-bold">{money(remaining, settings.currency_symbol)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Opening {money(settings.opening_cash, settings.currency_symbol)} + IN {money(stats?.cashIn || 0, settings.currency_symbol)} − OUT{" "}
          {money(stats?.cashOut || 0, settings.currency_symbol)}
        </p>
      </section>

      <RoznamchaForm open={entryOpen} onOpenChange={setEntryOpen} initial={editing} onSaved={load} />
      <PaymentForm open={paymentOpen} onOpenChange={setPaymentOpen} onSaved={load} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this cash entry to the Recycle Bin?"
        description={pendingDelete ? `${money(pendingDelete.amount, settings.currency_symbol)} will be taken out of the cash book until restored.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
