import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import { saveReadyStock } from "@/functions/saveReadyStock";
import { CARTON_TYPES } from "@/lib/rawCategories";
import { pairs, todayISO } from "@/lib/format";

export default function ReadyShoeForm({ open, onOpenChange, initial, onSaved, articles = [] }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      article_code: initial?.article_code || "",
      carton_type: initial?.carton_type || CARTON_TYPES[2].label,
      pairs_per_carton: initial?.pairs_per_carton || CARTON_TYPES[2].pairs,
      cartons: initial?.cartons ?? "",
      batch_label: initial?.batch_label || "",
      entry_date: initial?.entry_date || todayISO(),
      notes: initial?.notes || "",
    });
    setError("");
  }, [open, initial]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const cartons = Number(values.cartons) || 0;
  const perCarton = Number(values.pairs_per_carton) || 0;

  const submit = async () => {
    if (!values.article_code) {
      setError("Select the article these cartons belong to");
      return;
    }
    setSaving(true);
    setError("");
    const article = articles.find((entry) => entry.code === values.article_code);
    const result = await saveReadyStock({
      id: initial?.id,
      article_code: values.article_code,
      article_name: article?.name || initial?.article_name,
      carton_type: values.carton_type,
      pairs_per_carton: perCarton,
      cartons,
      batch_label: values.batch_label,
      entry_date: values.entry_date,
      notes: values.notes,
      source: initial?.source || "manual",
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
      title={initial?.id ? "Edit ready shoe batch" : "Add ready shoes"}
      description="Cartons are converted into pairs automatically."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save batch"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Article">
        <Select value={values.article_code} onValueChange={(value) => setValues((prev) => ({ ...prev, article_code: value }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select article" />
          </SelectTrigger>
          <SelectContent>
            {articles.map((article) => (
              <SelectItem key={article.code} value={article.code}>
                {article.code} · {article.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Carton type">
          <Select
            value={values.carton_type}
            onValueChange={(value) =>
              setValues((prev) => ({
                ...prev,
                carton_type: value,
                pairs_per_carton: CARTON_TYPES.find((option) => option.label === value)?.pairs || prev.pairs_per_carton,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARTON_TYPES.map((option) => (
                <SelectItem key={option.label} value={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Carton quantity">
          <Input type="number" value={values.cartons} onChange={set("cartons")} placeholder="0" />
        </Field>
        <Field label="Batch label">
          <Input value={values.batch_label} onChange={set("batch_label")} placeholder="Finishing batch 12" />
        </Field>
        <Field label="Date">
          <Input type="date" value={values.entry_date} onChange={set("entry_date")} />
        </Field>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
        <CalcRow label={`${cartons} carton(s) × ${perCarton} pairs`} value={pairs(cartons * perCarton)} accent />
      </div>

      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
