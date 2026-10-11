import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import { recordPurchase } from "@/functions/recordPurchase";
import { BAG_TYPES, BUILTIN_CATEGORIES } from "@/lib/rawCategories";
import { money, pairs, todayISO } from "@/lib/format";

export default function PurchaseForm({ open, onOpenChange, onSaved, customCategories = [] }) {
  const [suppliers, setSuppliers] = useState([]);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    base44.entities.Supplier.filter({ is_deleted: { $ne: true } }, { sort: "name", limit: 200 }).then((page) =>
      setSuppliers(page?.items || [])
    );
    setValues({
      supplier_id: "",
      supplier_name: "",
      item_name: "",
      article_code: "",
      category: "uppers",
      unit: "bags",
      pack_type: BAG_TYPES[0].label,
      pairs_per_pack: BAG_TYPES[0].pairs,
      quantity: "",
      unit_price: "",
      purchase_date: todayISO(),
      notes: "",
    });
    setError("");
  }, [open]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const quantity = Number(values.quantity) || 0;
  const price = Number(values.unit_price) || 0;
  const perPack = Number(values.pairs_per_pack) || 0;
  const isUppers = values.category === "uppers";
  const categories = [...BUILTIN_CATEGORIES, ...customCategories.map((entry) => ({ ...entry, builtin: false }))];

  const chooseCategory = (slug) => {
    const category = categories.find((entry) => entry.slug === slug);
    setValues((prev) => ({
      ...prev,
      category: slug,
      unit: category?.unit_label || "units",
      pack_type: slug === "uppers" ? BAG_TYPES[0].label : "",
      pairs_per_pack: slug === "uppers" ? BAG_TYPES[0].pairs : 0,
      article_code: slug === "uppers" ? prev.article_code : "",
    }));
  };

  const submit = async () => {
    if (!values.item_name?.trim()) {
      setError("Item name is required");
      return;
    }
    if (!quantity || !price) {
      setError("Enter the quantity and price");
      return;
    }
    setSaving(true);
    setError("");
    const supplier = suppliers.find((entry) => entry.id === values.supplier_id);
    const result = await recordPurchase({
      supplier_id: values.supplier_id,
      supplier_name: supplier?.name || "",
      item_name: values.item_name,
      article_code: values.article_code,
      category: values.category,
      unit: values.unit,
      pack_type: values.pack_type,
      pairs_per_pack: perPack,
      quantity,
      unit_price: price,
      purchase_date: values.purchase_date,
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
      title="New purchase"
      description="Stock is increased and the supplier's kata is credited with the amount."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save purchase"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Supplier">
        <Select
          value={values.supplier_id}
          onValueChange={(value) => setValues((prev) => ({ ...prev, supplier_id: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={suppliers.length ? "Select supplier" : "Add a supplier first"} />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={values.category} onValueChange={chooseCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.slug} value={category.slug}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Item name">
          <Input value={values.item_name} onChange={set("item_name")} placeholder="Black leather upper" />
        </Field>
        {isUppers && (
          <>
            <Field label="Article number">
              <Input value={values.article_code} onChange={set("article_code")} placeholder="HK-1024" />
            </Field>
            <Field label="Pack type">
              <Select
                value={values.pack_type}
                onValueChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    pack_type: value,
                    pairs_per_pack: BAG_TYPES.find((option) => option.label === value)?.pairs || 0,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAG_TYPES.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
        <Field label={`Quantity (${values.unit || "units"})`}>
          <Input type="number" value={values.quantity} onChange={set("quantity")} placeholder="0" />
        </Field>
        <Field label="Price per unit">
          <Input type="number" value={values.unit_price} onChange={set("unit_price")} placeholder="0" />
        </Field>
        <Field label="Purchase date">
          <Input type="date" value={values.purchase_date} onChange={set("purchase_date")} />
        </Field>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
        {isUppers && (
          <CalcRow label={`Pairs received = ${quantity} bag(s) × ${perPack} pairs`} value={pairs(quantity * perPack)} accent />
        )}
        <CalcRow label="Purchase amount" value={money(quantity * price)} />
      </div>

      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
