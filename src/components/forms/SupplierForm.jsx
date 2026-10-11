import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { Field, FormError } from "@/components/FormDialog";

const BLANK = { name: "", phone: "", address: "", product_details: "", opening_balance: 0, notes: "", status: "active" };

export default function SupplierForm({ open, onOpenChange, initial, onSaved }) {
  const [values, setValues] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValues({ ...BLANK, ...(initial || {}) });
      setError("");
    }
  }, [open, initial]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    if (!values.name.trim()) {
      setError("Supplier name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...values, opening_balance: Number(values.opening_balance) || 0, is_deleted: false };
      if (initial?.id) await base44.entities.Supplier.update(initial.id, payload);
      else await base44.entities.Supplier.create(payload);
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
      title={initial?.id ? "Edit supplier" : "New supplier"}
      description="Suppliers appear as kata buttons with their product details and balance."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save supplier"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier name">
          <Input value={values.name} onChange={set("name")} placeholder="e.g. Karachi Leather House" />
        </Field>
        <Field label="Phone">
          <Input value={values.phone} onChange={set("phone")} />
        </Field>
        <Field label="Opening balance" hint="Positive = you already owe the supplier">
          <Input type="number" value={values.opening_balance} onChange={set("opening_balance")} />
        </Field>
        <Field label="Status">
          <Select value={values.status} onValueChange={(value) => setValues((prev) => ({ ...prev, status: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Products supplied">
        <Input value={values.product_details} onChange={set("product_details")} placeholder="Uppers, adhesives, sole sheets" />
      </Field>
      <Field label="Address">
        <Input value={values.address} onChange={set("address")} />
      </Field>
      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
