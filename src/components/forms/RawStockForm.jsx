import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import { saveRawStock } from "@/functions/saveRawStock";
import { CHEMICAL_UNITS, packOptions } from "@/lib/rawCategories";
import { money, pairs } from "@/lib/format";

export default function RawStockForm({ open, onOpenChange, category, initial, onSaved }) {
  const [values, setValues] = useState({});
  const [custom, setCustom] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const packs = packOptions(category);
  const isUppers = category?.slug === "uppers";
  const isChemicals = category?.slug === "chemicals";

  useEffect(() => {
    if (!open) return;
    setValues({
      item_name: initial?.item_name || "",
      article_code: initial?.article_code || "",
      article_name: initial?.article_name || "",
      pack_type: initial?.pack_type || packs[0]?.label || "",
      pairs_per_pack: initial?.pairs_per_pack || packs[0]?.pairs || 0,
      quantity: initial?.quantity ?? "",
      unit: initial?.unit || category?.unit_label || "",
      price: initial?.price ?? "",
      notes: initial?.notes || "",
    });
    setCustom(initial?.custom_json ? JSON.parse(initial.custom_json) : {});
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, category?.slug]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const quantity = Number(values.quantity) || 0;
  const pairsPerPack = Number(values.pairs_per_pack) || 0;
  const price = Number(values.price) || 0;
  const totalPairs = quantity * pairsPerPack;
  const amount = quantity * price;

  const choosePack = (label) => {
    const pack = packs.find((option) => option.label === label);
    setValues((prev) => ({ ...prev, pack_type: label, pairs_per_pack: pack?.pairs || 0 }));
  };

  const submit = async () => {
    if (!values.item_name?.trim()) {
      setError("Item name is required");
      return;
    }
    if (isUppers && !values.article_code?.trim()) {
      setError("Article number is required for Uppers — the article list is built from it");
      return;
    }
    setSaving(true);
    setError("");
    const result = await saveRawStock({
      id: initial?.id,
      category: category.slug,
      item_name: values.item_name,
      article_code: values.article_code,
      article_name: values.article_name,
      pack_type: values.pack_type,
      pairs_per_pack: category?.uses_pairs ? pairsPerPack : 0,
      quantity,
      unit: values.unit,
      price,
      notes: values.notes,
      custom_json: Object.keys(custom).length ? JSON.stringify(custom) : "",
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
      title={`${initial?.id ? "Edit" : "Add"} ${category?.name || "raw stock"} item`}
      description={category?.description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save item"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Item name">
        <Input value={values.item_name} onChange={set("item_name")} placeholder={isUppers ? "Black leather upper" : "Adhesive 500"} />
      </Field>

      {isUppers && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Article number" hint="Articles are created and kept in sync automatically">
            <Input value={values.article_code} onChange={set("article_code")} placeholder="HK-1024" />
          </Field>
          <Field label="Article name">
            <Input value={values.article_name} onChange={set("article_name")} placeholder="Trail Runner Pro" />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!!packs.length && (
          <Field label="Pack type">
            <Select value={values.pack_type} onValueChange={choosePack}>
              <SelectTrigger>
                <SelectValue placeholder="Select pack" />
              </SelectTrigger>
              <SelectContent>
                {packs.map((pack) => (
                  <SelectItem key={pack.label} value={pack.label}>
                    {pack.label} · {pack.pairs} pairs
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label={isUppers ? "Quantity in bags" : `Quantity${values.unit ? ` (${values.unit})` : ""}`}>
          <Input type="number" value={values.quantity} onChange={set("quantity")} placeholder="0" />
        </Field>
        {isChemicals ? (
          <Field label="Unit">
            <Select value={values.unit} onValueChange={(value) => setValues((prev) => ({ ...prev, unit: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {CHEMICAL_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Unit">
            <Input value={values.unit} onChange={set("unit")} placeholder="bags" />
          </Field>
        )}
        <Field label="Price per unit">
          <Input type="number" value={values.price} onChange={set("price")} placeholder="0" />
        </Field>
      </div>

      {(category?.fields || []).map((field) => (
        <Field key={field.key} label={field.label}>
          {field.type === "select" ? (
            <Select
              value={custom[field.key] || ""}
              onValueChange={(value) => setCustom((prev) => ({ ...prev, [field.key]: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={custom[field.key] || ""}
              onChange={(event) => setCustom((prev) => ({ ...prev, [field.key]: event.target.value }))}
            />
          )}
        </Field>
      ))}

      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
        {category?.uses_pairs && <CalcRow label="Total pairs" value={pairs(totalPairs)} accent />}
        <CalcRow label="Stock value" value={money(amount)} />
      </div>

      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
