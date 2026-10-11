import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import { todayISO } from "@/lib/format";

const CATEGORIES = ["Wages", "Utilities", "Transport", "Rent", "Maintenance", "Packing", "Misc"];

export default function ExpenseForm({ open, onOpenChange, initial, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      description: initial?.description || "",
      amount: initial?.amount ?? "",
      category: initial?.category || "Misc",
      entry_date: initial?.entry_date || todayISO(),
    });
    setError("");
  }, [open, initial]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    if (!values.description?.trim()) {
      setError("Describe the expense");
      return;
    }
    if (Number(values.amount) <= 0) {
      setError("Enter the expense amount");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        entry_date: values.entry_date,
        direction: "out",
        source: "kharcha",
        description: values.description,
        category: values.category,
        amount: Number(values.amount),
        method: "Cash",
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
      title={initial?.id ? "Edit expense" : "New expense"}
      description="Expenses also appear in the roznamcha cash book as cash out."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save expense"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Expense">
        <Input value={values.description} onChange={set("description")} placeholder="Generator diesel" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <Input type="number" value={values.amount} onChange={set("amount")} placeholder="0" />
        </Field>
        <Field label="Date">
          <Input type="date" value={values.entry_date} onChange={set("entry_date")} />
        </Field>
      </div>
      <Field label="Category">
        <Select value={values.category} onValueChange={(value) => setValues((prev) => ({ ...prev, category: value }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
