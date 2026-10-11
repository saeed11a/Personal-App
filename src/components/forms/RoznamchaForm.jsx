import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import { todayISO } from "@/lib/format";

const METHODS = ["Cash", "Bank", "Cheque", "Online"];

// Manual roznamcha entry: other income, opening cash or a daily expense.
export default function RoznamchaForm({ open, onOpenChange, initial, onSaved, lockDirection }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      entry_date: initial?.entry_date || todayISO(),
      direction: initial?.direction || lockDirection || "in",
      source: initial?.source || (lockDirection === "out" ? "kharcha" : "other_income"),
      description: initial?.description || "",
      amount: initial?.amount ?? "",
      category: initial?.category || "",
      method: initial?.method || "Cash",
      reference: initial?.reference || "",
    });
    setError("");
  }, [open, initial, lockDirection]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    if (!values.description?.trim()) {
      setError("Add a description for this entry");
      return;
    }
    if (Number(values.amount) <= 0) {
      setError("Enter the amount");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        entry_date: values.entry_date,
        direction: values.direction,
        source: values.source,
        description: values.description,
        category: values.category,
        amount: Number(values.amount),
        method: values.method,
        reference: values.reference,
        is_deleted: false,
      };
      if (initial?.id) await base44.entities.Roznamcha.update(initial.id, payload);
      else await base44.entities.Roznamcha.create(payload);
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
      description="Only manual entries are added here — customer receipts and supplier payments come from the Payments module."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Direction">
          <Select
            value={values.direction}
            onValueChange={(value) =>
              setValues((prev) => ({ ...prev, direction: value, source: value === "out" ? "kharcha" : "other_income" }))
            }
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
        <Field label="Type">
          <Select value={values.source} onValueChange={(value) => setValues((prev) => ({ ...prev, source: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {values.direction === "in" ? (
                <>
                  <SelectItem value="other_income">Other income</SelectItem>
                  <SelectItem value="opening">Opening cash</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="kharcha">Expense (kharcha)</SelectItem>
                  <SelectItem value="other_income">Other payment</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={values.entry_date} onChange={set("entry_date")} />
        </Field>
        <Field label="Amount">
          <Input type="number" value={values.amount} onChange={set("amount")} placeholder="0" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input value={values.description} onChange={set("description")} placeholder="Transport charges" />
        </Field>
        <Field label="Expense category">
          <Input value={values.category} onChange={set("category")} placeholder="Utilities / transport / wages" />
        </Field>
        <Field label="Method">
          <Select value={values.method} onValueChange={(value) => setValues((prev) => ({ ...prev, method: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Reference">
        <Input value={values.reference} onChange={set("reference")} />
      </Field>
    </FormDialog>
  );
}
