import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import { recordPayment } from "@/functions/recordPayment";
import { customerBalanceMap, supplierBalanceMap } from "@/lib/analytics";
import { money, todayISO } from "@/lib/format";

const METHODS = ["Cash", "Bank", "Cheque", "Online"];

export default function PaymentForm({ open, onOpenChange, onSaved, initial }) {
  const [parties, setParties] = useState([]);
  const [balances, setBalances] = useState(new Map());
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const type = initial?.party_type || "customer";
    setValues({
      party_type: type,
      party_id: initial?.party_id || "",
      party_name: initial?.party_name || "",
      amount: initial?.amount ?? "",
      payment_date: initial?.payment_date || todayISO(),
      method: initial?.method || "Cash",
      reference: initial?.reference || "",
      notes: initial?.notes || "",
    });
    setError("");
    loadParties(type);
  }, [open, initial]);

  const loadParties = async (type) => {
    const entity = type === "supplier" ? "Supplier" : "Customer";
    const page = await base44.entities[entity].filter({ is_deleted: { $ne: true } }, { sort: "name", limit: 200 });
    setParties(page?.items || []);
    const map = type === "supplier" ? await supplierBalanceMap() : await customerBalanceMap();
    setBalances(map);
  };

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const selected = parties.find((party) => party.id === values.party_id);
  const entry = selected ? balances.get(selected.name) || {} : {};
  const outstanding =
    (Number(selected?.opening_balance) || 0) + (entry.invoiced || entry.purchased || 0) - (entry.paid || 0);

  const submit = async () => {
    if (!selected) {
      setError("Select the customer or supplier");
      return;
    }
    if (Number(values.amount) <= 0) {
      setError("Enter a payment amount");
      return;
    }
    setSaving(true);
    setError("");
    const result = await recordPayment({
      party_type: values.party_type,
      party_id: selected.id,
      party_name: selected.name,
      amount: values.amount,
      payment_date: values.payment_date,
      method: values.method,
      reference: values.reference,
      notes: values.notes,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={values.party_type === "supplier" ? "Pay supplier" : "Receive from customer"}
      description="The kata and the roznamcha cash book are updated automatically."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save payment"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Party type">
          <Select
            value={values.party_type}
            onValueChange={(value) => {
              setValues((prev) => ({ ...prev, party_type: value, party_id: "" }));
              loadParties(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={values.party_type === "supplier" ? "Supplier" : "Customer"}>
          <Select value={values.party_id} onValueChange={(value) => setValues((prev) => ({ ...prev, party_id: value }))}>
            <SelectTrigger>
              <SelectValue placeholder={parties.length ? "Select" : "None added yet"} />
            </SelectTrigger>
            <SelectContent>
              {parties.map((party) => (
                <SelectItem key={party.id} value={party.id}>
                  {party.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Amount">
          <Input type="number" value={values.amount} onChange={set("amount")} placeholder="0" />
        </Field>
        <Field label="Date">
          <Input type="date" value={values.payment_date} onChange={set("payment_date")} />
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
        <Field label="Reference">
          <Input value={values.reference} onChange={set("reference")} placeholder="Cheque / slip no." />
        </Field>
      </div>

      {selected && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
          <CalcRow label="Current balance" value={money(outstanding)} />
          <CalcRow
            label={values.party_type === "supplier" ? "Balance after payment" : "Balance after receipt"}
            value={money(outstanding - (Number(values.amount) || 0))}
            accent
          />
        </div>
      )}

      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
