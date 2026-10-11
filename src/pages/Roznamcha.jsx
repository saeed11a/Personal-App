import React, { useEffect, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import RecordDetailDialog from "@/components/RecordDetailDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import RoznamchaForm from "@/components/forms/RoznamchaForm";
import PaymentForm from "@/components/forms/PaymentForm";
import { supabase } from "@/api/supabaseClient";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { listRoznamcha } from "@/lib/accounting";

const SOURCE_LABELS = {
  customer_receipt: "Customer receipt",
  supplier_payment: "Supplier payment",
  labour_payment: "Labour payment",
  kharcha: "Expense",
  other_income: "Other income",
  opening: "Opening cash",
  manual: "Manual entry",
  reversal: "Reversal",
};

const MANUAL_SOURCES = ["kharcha", "other_income", "opening", "manual"];

export default function Roznamcha() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await listRoznamcha({ from, to }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const inRows = rows.filter((row) => row.direction === "in");
  const outRows = rows.filter((row) => row.direction === "out");
  const cashIn = inRows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
  const cashOut = outRows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
  const expenses = outRows
    .filter((row) => MANUAL_SOURCES.includes(row.source))
    .reduce((total, row) => total + (Number(row.amount) || 0), 0);
  const remaining = (Number(settings.opening_cash) || 0) + cashIn - cashOut;

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
    { key: "party_name", label: "Account", render: (row) => row.party_name || "—" },
    { key: "method", label: "Method", render: (row) => row.method || "—" },
    { key: "category", label: "Category", render: (row) => row.category || "—" },
    {
      key: "amount",
      label: "Amount",
      numeric: true,
      // Money in reads green, money out red — the same pair of colours the totals use.
      render: (row) => (
        <span className={cn("font-semibold", row.direction === "out" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
          {money(row.amount, settings.currency_symbol)}
        </span>
      ),
    },
  ];

  const confirmDelete = async () => {
    const { error: deleteError } = await supabase.from("roznamcha").update({ is_deleted: true, deleted_date: new Date().toISOString() }).eq("id", pendingDelete.id);
    if (deleteError) {
      toast({ title: "Could not remove", description: deleteError.message, variant: "destructive" });
    } else {
      toast({ title: "Entry removed", description: "The cash book balance was recalculated." });
      load();
    }
    setPendingDelete(null);
  };

  const rowActions = (row) => (
    <RowActions
      onView={() => setViewing(row)}
      onEdit={
        MANUAL_SOURCES.includes(row.source)
          ? () => {
              setEditing(row);
              setEntryOpen(true);
            }
          : undefined
      }
      onDelete={MANUAL_SOURCES.includes(row.source) ? () => setPendingDelete(row) : undefined}
    />
  );

  return (
    <div>
      <PageHeader
        eyebrow="Cash book"
        title="Roznamcha"
        description="Cash in hand: customer receipts, other income, supplier and labour payments and daily expenses — with the remaining balance."
        actions={
          <>
            <ExportButtons
              filename="roznamcha"
              title="Roznamcha"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows.map((row) => ({ ...row, flow: row.direction === "in" ? "IN" : "OUT" }))}
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

      {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total IN" value={money(cashIn, settings.currency_symbol)} tone="success" />
        <KpiCard label="Total OUT" value={money(cashOut, settings.currency_symbol)} tone="danger" />
        <KpiCard label="Expenses included" value={money(expenses, settings.currency_symbol)} hint="Manual entries paid out" />
        <KpiCard
          label="Remaining balance"
          value={money(remaining, settings.currency_symbol)}
          hint={`Opening ${money(settings.opening_cash, settings.currency_symbol)}`}
          tone={remaining < 0 ? "danger" : "success"}
        />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em]">
                IN <StatusPill tone="success">{inRows.length}</StatusPill>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Money received from customers</p>
            </div>
            <StatusPill tone="success">IN · {money(cashIn, settings.currency_symbol)}</StatusPill>
          </div>
          <DataTable
            columns={columns}
            rows={inRows}
            loading={loading}
            emptyLabel="No cash received in this period"
            actions={rowActions}
          />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em]">
                OUT <StatusPill tone="danger">{outRows.length}</StatusPill>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Supplier payments and daily expenses</p>
            </div>
            <StatusPill tone="danger">OUT · {money(cashOut, settings.currency_symbol)}</StatusPill>
          </div>
          <DataTable
            columns={columns}
            rows={outRows}
            loading={loading}
            emptyLabel="No cash paid out in this period"
            actions={rowActions}
          />
        </section>
      </div>

      <section className="panel mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="eyebrow">REMAINING</p>
          <p className={cn("mt-1 font-heading text-2xl font-bold", remaining < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
            {money(remaining, settings.currency_symbol)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Opening {money(settings.opening_cash, settings.currency_symbol)} + IN {money(cashIn, settings.currency_symbol)} − OUT{" "}
          {money(cashOut, settings.currency_symbol)}
        </p>
      </section>

      <RecordDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title="Cash entry"
        subtitle={viewing?.description || viewing?.party_name}
        columns={columns}
        row={viewing}
      />

      <RoznamchaForm open={entryOpen} onOpenChange={setEntryOpen} initial={editing} onSaved={load} />
      <PaymentForm open={paymentOpen} onOpenChange={setPaymentOpen} onSaved={load} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove this cash entry?"
        description={pendingDelete ? `${money(pendingDelete.amount, settings.currency_symbol)} will no longer count in the cash book.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
