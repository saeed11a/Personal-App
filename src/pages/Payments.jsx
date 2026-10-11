import React, { useEffect, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import RecordDetailDialog from "@/components/RecordDetailDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import PaymentForm from "@/components/forms/PaymentForm";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { listPayments, reversePayment } from "@/lib/accounting";

// The payment register. Receipts from customers, payments to suppliers and to
// labour, and manual entries all sit here in one list, each with the single
// roznamcha entry it posted. A posted payment is never deleted: it is reversed,
// which posts the linked opposite entry.
export default function Payments() {
  const { settings } = useSettings();
  const currency = settings.currency_symbol || "Rs";
  const { toast } = useToast();

  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [reversing, setReversing] = useState(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await listPayments({ from, to }));
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

  const received = rows
    .filter((row) => row.direction === "in")
    .reduce((total, row) => total + (Number(row.amount) || 0), 0);
  const paid = rows
    .filter((row) => row.direction === "out")
    .reduce((total, row) => total + (Number(row.amount) || 0), 0);

  const columns = [
    { key: "payment_date", label: "Date", render: (row) => shortDate(row.payment_date) },
    { key: "party_name", label: "Account", render: (row) => <span className="font-medium">{row.party_name}</span> },
    {
      key: "party_type",
      label: "Type",
      render: (row) => (
        <StatusPill tone={row.party_type === "customer" ? "success" : row.party_type === "other" ? "muted" : "warning"}>
          {row.party_type}
        </StatusPill>
      ),
    },
    { key: "method", label: "Method", render: (row) => row.method || "—" },
    { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
    {
      key: "amount",
      label: "Amount",
      numeric: true,
      render: (row) => (
        <span className={row.reversed ? "font-semibold text-muted-foreground line-through" : "font-semibold"}>
          {money(row.amount, currency)}
        </span>
      ),
    },
    { key: "direction", label: "Cash", render: (row) => (row.direction === "in" ? "IN" : "OUT") },
    {
      key: "state",
      label: "State",
      render: (row) =>
        row.reversal_of ? (
          <StatusPill tone="muted">Reversal</StatusPill>
        ) : row.reversed ? (
          <StatusPill tone="danger">Reversed</StatusPill>
        ) : row.is_advance ? (
          <StatusPill tone="warning">Advance</StatusPill>
        ) : (
          <StatusPill tone="success">Posted</StatusPill>
        ),
    },
  ];

  const confirmReverse = async () => {
    setSaving(true);
    try {
      await reversePayment(reversing.id, reason);
      toast({
        title: "Payment reversed",
        description: "A linked opposite entry was posted to the account ledger and the roznamcha.",
      });
      setReversing(null);
      setReason("");
      await load();
    } catch (err) {
      toast({ title: "Could not reverse", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Kata postings"
        title="Payments"
        description="Receipts from customers reduce their kata; payments to suppliers and labour reduce what they are owed. Every posting writes exactly one roznamcha entry."
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

      <FormError message={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Receipts" value={money(received, currency)} hint="Cash in" accent />
        <KpiCard label="Paid out" value={money(paid, currency)} hint="Cash out" />
        <KpiCard label="Net movement" value={money(received - paid, currency)} />
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
          emptyHint="Customer receipts, supplier and labour payments appear here."
          actions={(row) => (
            <RowActions
              onView={() => setViewing(row)}
              extra={
                !row.reversed &&
                !row.reversal_of && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Reverse payment"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setReversing(row)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )
              }
            />
          )}
        />
      </div>

      <RecordDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title="Payment"
        subtitle={viewing?.party_name}
        columns={columns}
        row={viewing}
      />

      <PaymentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(result) => {
          toast({
            title: result?.duplicate ? "Already posted" : "Payment posted",
            description: result?.duplicate
              ? "That submission had already been posted — nothing was added twice."
              : `Roznamcha entry created for ${money(result?.amount, currency)}.`,
          });
          load();
        }}
      />

      <FormDialog
        open={!!reversing}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverse this payment?"
        description={
          reversing
            ? `${money(reversing.amount, currency)} for ${reversing.party_name} stays in the register, marked reversed, and an opposite entry is posted to the ledger and the cash book.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setReversing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmReverse} disabled={saving}>
              {saving ? "Reversing…" : "Confirm reversal"}
            </Button>
          </>
        }
      >
        <Field label="Reason (kept with the reversal)">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. entered twice" />
        </Field>
      </FormDialog>
    </div>
  );
}
