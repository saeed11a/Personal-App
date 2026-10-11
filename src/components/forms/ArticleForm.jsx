import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { Field, FormError } from "@/components/FormDialog";

const BLANK = {
  code: "",
  name: "",
  category: "Unisex",
  upper_type: "",
  sole_type: "",
  unit_cost: "",
  selling_price: "",
  sizes: "",
  colors: "",
  notes: "",
  status: "active",
};

const toList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function ArticleForm({ open, onOpenChange, initial, onSaved }) {
  const [values, setValues] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValues({
        ...BLANK,
        ...(initial || {}),
        sizes: (initial?.sizes || []).join(", "),
        colors: (initial?.colors || []).join(", "),
      });
      setError("");
    }
  }, [open, initial]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    if (!values.code.trim() || !values.name.trim()) {
      setError("Article number and name are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        category: values.category,
        upper_type: values.upper_type,
        sole_type: values.sole_type,
        unit_cost: Number(values.unit_cost) || 0,
        selling_price: Number(values.selling_price) || 0,
        sizes: toList(values.sizes),
        colors: toList(values.colors),
        notes: values.notes,
        status: values.status,
        is_deleted: false,
      };
      if (initial?.id) await base44.entities.Article.update(initial.id, payload);
      else await base44.entities.Article.create(payload);
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
      title={initial?.id ? "Edit article" : "New article"}
      description="Articles are created automatically from Uppers stock — add one here to plan it in advance."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save article"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Article number">
          <Input value={values.code} onChange={set("code")} placeholder="HK-1024" />
        </Field>
        <Field label="Article name">
          <Input value={values.name} onChange={set("name")} placeholder="Trail Runner Pro" />
        </Field>
        <Field label="Category">
          <Select value={values.category} onValueChange={(value) => setValues((prev) => ({ ...prev, category: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Men", "Women", "Kids", "Unisex", "Sports", "Formal", "Casual"].map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <Field label="Upper type">
          <Input value={values.upper_type} onChange={set("upper_type")} placeholder="Full grain leather" />
        </Field>
        <Field label="Sole type">
          <Input value={values.sole_type} onChange={set("sole_type")} placeholder="Rubber" />
        </Field>
        <Field label="Cost per pair">
          <Input type="number" value={values.unit_cost} onChange={set("unit_cost")} />
        </Field>
        <Field label="Selling price per pair">
          <Input type="number" value={values.selling_price} onChange={set("selling_price")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sizes" hint="Comma separated, e.g. 39, 40, 41">
          <Input value={values.sizes} onChange={set("sizes")} />
        </Field>
        <Field label="Colours" hint="Comma separated, e.g. Black, Brown">
          <Input value={values.colors} onChange={set("colors")} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
