import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import { useSettings } from "@/lib/useSettings";
import { money, todayISO } from "@/lib/format";
import { listLabourAccounts } from "@/lib/labour";
import {
  ACCOUNT_TYPES,
  PAYMENT_METHODS,
  directionLabel,
  listCustomers,
  listManualCategories,
  listSuppliers,
  newIdempotencyKey,
  outstandingFor,
  postPayment,
} from "@/lib/accounting";

// One payment screen for every account type.
//
// The screen only collects the request: the direction, the account check, the
// balance effect, the single roznamcha entry and the retry handling all belong to
// post_payment() in the database, so the same transaction can never be posted twice
// or against the wrong side of the cash book.

const loadAccounts = async (type) => {
  if (type === "customer") return (await listCustomers()).filter((row) => row.status !== "inactive");
  if (type === "supplier") return (await listSuppliers()).filter((row) => row.status !== "inactive");
  if (type === "labour") return (await listLabourAccounts()).filter((row) => row.status === "active");
  return [];
};

export default function PaymentForm({ open, onOpenChange, onSaved, initial }) {
  const { settings } = useSettings();
  const currency = settings.currency_symbol || "Rs";

  const [type, setType] = useState("customer");
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [outstanding, setOutstanding] = useState(null);
  const [values, setValues] = useState({});
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const accountType = initial?.account_type || "customer";
    setType(accountType);
    setValues({
      account_id: initial?.account_id || "",
      amount: initial?.amount ?? "",
      payment_date: initial?.payment_date || todayISO(),
      method: initial?.method || "Cash",
      reference: initial?.reference || "",
      notes: initial?.notes || "",
      category: "",
      description: "",
    });
    setOutstanding(null);
    setError("");
    // One key per opened form: pressing save twice posts once.
    setKey(newIdempotencyKey());
    setLoading(true);
    Promise.all([loadAccounts(accountType), listManualCategories()])
      .then(([rows, manual]) => {
        setAccounts(rows);
        setCategories(manual);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, initial]);

  const changeType = async (nextType) => {
    setType(nextType);
    setValues((prev) => ({ ...prev, account_id: "", category: "", description: "" }));
    setOutstanding(null);
    setError("");
    setLoading(true);
    try {
      setAccounts(await loadAccounts(nextType));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));

  const selected = accounts.find((account) => account.id === values.account_id);
  const selectedCategory = categories.find((category) => category.name === values.category);
  const direction = type === "other" ? selectedCategory?.direction : type === "customer" ? "in" : "out";
  const amount = Number(values.amount) || 0;
  const projected = outstanding === null ? null : outstanding + (direction === "in" ? -amount : amount);
  const willAdvance =
    direction === "in" ? outstanding !== null && amount > outstanding : outstanding !== null && amount > outstanding;

  useEffect(() => {
    let active = true;
    setOutstanding(null);
    if (!values.account_id || type === "other") return undefined;
    outstandingFor(type, values.account_id)
      .then((value) => {
        if (active) setOutstanding(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [type, values.account_id]);

  const submit = async () => {
    if (type === "other" ? !selectedCategory : !selected) {
      setError(type === "other" ? "Choose a manual category" : "Select the account this payment is for");
      return;
    }
    if (!(amount > 0)) {
      setError("Enter a payment amount greater than zero");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await postPayment({
        account_type: type,
        account_id: type === "other" ? null : selected.id,
        account_name: type === "other" ? selectedCategory.name : selected.name,
        category: values.category,
        description: values.description,
        amount,
        payment_date: values.payment_date,
        method: values.method,
        reference: values.reference,
        notes: values.notes,
        idempotency_key: key,
      });
      onSaved?.(result);
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const accountLabel = useMemo(() => {
    if (type === "customer") return "Customer";
    if (type === "supplier") return "Supplier";
    if (type === "labour") return "Labour account";
    return "Manual category";
  }, [type]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New payment"
      description="Customer receipts come in, supplier and labour payments go out — the direction is decided by the account type, not by the form."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving ? "Posting…" : "Post payment"}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment type / account type">
          <Select value={type} onValueChange={changeType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {type === "other" ? (
          <Field label={accountLabel} hint={selectedCategory ? directionLabel(selectedCategory.direction) : "Income or expense is set on the category"}>
            <Select value={values.category || ""} onValueChange={(value) => setValues((prev) => ({ ...prev, category: value }))}>
              <SelectTrigger>
                <SelectValue placeholder={categories.length ? "Choose category" : "No categories yet"} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name} · {category.direction === "in" ? "income" : "expense"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label={accountLabel}>
            <Select
              value={values.account_id || ""}
              onValueChange={(value) => setValues((prev) => ({ ...prev, account_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={accounts.length ? `Choose ${accountLabel.toLowerCase()}` : "Nothing to select"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {type === "other" && (
          <Field label="Description" className="sm:col-span-2">
            <Input value={values.description || ""} onChange={set("description")} placeholder="What this entry is for" />
          </Field>
        )}

        <Field label="Amount">
          <Input type="number" value={values.amount} onChange={set("amount")} placeholder="0" />
        </Field>
        <Field label="Date">
          <Input type="date" value={values.payment_date} onChange={set("payment_date")} />
        </Field>
        <Field label="Payment method">
          <Select value={values.method} onValueChange={(value) => setValues((prev) => ({ ...prev, method: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Reference number">
          <Input value={values.reference || ""} onChange={set("reference")} placeholder="Cheque / transaction no." />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={values.notes || ""} onChange={set("notes")} rows={2} />
        </Field>
      </div>

      <div className="space-y-1 rounded-xl border border-border p-3">
        <CalcRow label="Direction" value={direction ? directionLabel(direction) : "—"} accent />
        {type === "other" && direction === "out" && <CalcRow label="Recorded in" value="Kharcha & Roznamcha" />}
        {outstanding !== null && (
          <>
            <CalcRow label="Current balance" value={money(Math.abs(outstanding), currency)} />
            <CalcRow label="Balance after this payment" value={money(Math.abs(projected), currency)} />
            {willAdvance && Number(values.amount) > 0 && <CalcRow label="Excess" value="counted as an advance" />}
          </>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          Posting writes the payment and its single roznamcha entry together; repeating the same submission does not post it twice.
        </p>
      </div>
    </FormDialog>
  );
}
