import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import { supabase } from "@/api/supabaseClient";
import { todayISO } from "@/lib/format";
import { PAYMENT_METHODS, listManualCategories, newIdempotencyKey, postPayment } from "@/lib/accounting";

// Manual cash-book entries: other income, opening cash and daily expenses.
//
// They are posted through the same function as every other payment, using a manual
// category — so the direction comes from the category, the entry is written once
// even if the button is pressed twice, and it can never be posted against a
// customer, supplier or labour ledger by accident.
//
// An entry a module produced (a receipt, a supplier or labour payment, a reversal)
// is not editable here: those are corrected with a linked reversing entry.

const MANUAL_SOURCES = ["kharcha", "other_income", "opening", "manual"];

export default function RoznamchaForm({ open, onOpenChange, initial, onSaved, lockDirection }) {
  const [categories, setCategories] = useState([]);
  const [values, setValues] = useState({});
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      entry_date: initial?.entry_date || todayISO(),
      direction: initial?.direction || lockDirection || "in",
      category: initial?.category || "",
      description: initial?.description || "",
      amount: initial?.amount ?? "",
      method: initial?.method || "Cash",
      reference: initial?.reference || "",
    });
    setError("");
    setKey(newIdempotencyKey());
    listManualCategories().then(setCategories).catch((err) => setError(err.message));
  }, [open, initial, lockDirection]);

  const editable = !initial?.id || MANUAL_SOURCES.includes(initial?.source);
  const options = useMemo(
    () => categories.filter((category) => category.direction === values.direction),
    [categories, values.direction]
  );

  const set = (key2) => (event) => setValues((prev) => ({ ...prev, [key2]: event.target.value }));

  const submit = async () => {
    if (!values.category) {
      setError(
        options.length
          ? "Choose a category for this entry"
          : `No ${values.direction === "in" ? "income" : "expense"} category exists yet — an administrator adds them in Settings.`
      );
      return;
    }
    if (!(Number(values.amount) > 0)) {
      setError("Enter the amount");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (initial?.id) {
        const { error: updateError } = await supabase
          .from("roznamcha")
          .update({
            entry_date: values.entry_date,
            direction: values.direction,
            category: values.category,
            description: values.description || values.category,
            amount: Number(values.amount),
            method: values.method,
            reference: values.reference || null,
          })
          .eq("id", initial.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        await postPayment({
          account_type: "other",
          direction: values.direction,
          category: values.category,
          description: values.description,
          amount: Number(values.amount),
          payment_date: values.entry_date,
          method: values.method,
          reference: values.reference,
          idempotency_key: key,
        });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial?.id ? "Edit cash book entry" : "New cash book entry"}
      description="Manual income and expenses only — customer receipts, supplier and labour payments are recorded in Payments and appear here automatically."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !editable}>
            {saving ? "Posting…" : "Post entry"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      {!editable && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This entry was posted by a module. It cannot be edited — correct it with a reversing entry so the financial history stays complete.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Direction" hint="Set by the category">
          <Select
            value={values.direction}
            disabled={Boolean(lockDirection)}
            onValueChange={(value) => setValues((prev) => ({ ...prev, direction: value, category: "" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in">IN — cash received</SelectItem>
              <SelectItem value="out">OUT — cash paid</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Category">
          <Select value={values.category || ""} onValueChange={(value) => setValues((prev) => ({ ...prev, category: value }))}>
            <SelectTrigger>
              <SelectValue placeholder={options.length ? "Choose category" : "None for this direction"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((category) => (
                <SelectItem key={category.id} value={category.name}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={values.entry_date || ""} onChange={set("entry_date")} />
        </Field>
        <Field label="Amount">
          <Input type="number" value={values.amount || ""} onChange={set("amount")} placeholder="0" />
        </Field>
        <Field label="Method">
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
        <Field label="Reference">
          <Input value={values.reference || ""} onChange={set("reference")} placeholder="Optional" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input value={values.description || ""} onChange={set("description")} placeholder="What this entry is for" />
        </Field>
      </div>
    </FormDialog>
  );
}
