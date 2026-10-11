import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import { recordProduction } from "@/functions/recordProduction";
import { articleStockMap } from "@/lib/analytics";
import { BAG_TYPES, CARTON_TYPES } from "@/lib/rawCategories";
import { pairs, todayISO } from "@/lib/format";

export default function ProductionForm({ open, onOpenChange, onSaved, settings }) {
  const [options, setOptions] = useState([]);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      article_code: "",
      production_date: todayISO(),
      line: "",
      shift: "Day",
      operator: "",
      input_bags: "",
      pairs_per_bag: Number(settings?.default_pairs_per_bag) || 100,
      carton_type: CARTON_TYPES[2].label,
      pairs_per_carton: Number(settings?.default_pairs_per_carton) || CARTON_TYPES[2].pairs,
      output_cartons: "",
      notes: "",
    });
    setError("");
    articleStockMap().then((map) => {
      const list = Array.from(map.values())
        .filter((entry) => entry.uppers_added > 0)
        .sort((a, b) => a.article_code.localeCompare(b.article_code));
      setOptions(list);
    });
  }, [open, settings?.default_pairs_per_bag, settings?.default_pairs_per_carton]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const selected = options.find((entry) => entry.article_code === values.article_code);
  const bags = Number(values.input_bags) || 0;
  const perBag = Number(values.pairs_per_bag) || 0;
  const cartons = Number(values.output_cartons) || 0;
  const perCarton = Number(values.pairs_per_carton) || 0;
  const uppersUsed = bags * perBag;
  const outputPairs = cartons * perCarton;

  const submit = async () => {
    if (!values.article_code) {
      setError("Select the article being produced");
      return;
    }
    setSaving(true);
    setError("");
    const result = await recordProduction({
      article_code: values.article_code,
      production_date: values.production_date,
      line: values.line,
      shift: values.shift,
      operator: values.operator,
      input_bags: bags,
      pairs_per_bag: perBag,
      carton_type: values.carton_type,
      pairs_per_carton: perCarton,
      output_cartons: cartons,
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
      title="New production entry"
      description="Uppers are deducted from stock and the produced pairs are added to Ready Shoes."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save production"}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      <Field label="Article (from Uppers stock)">
        <Select value={values.article_code} onValueChange={(value) => setValues((prev) => ({ ...prev, article_code: value }))}>
          <SelectTrigger>
            <SelectValue placeholder={options.length ? "Select article" : "No uppers stock yet"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((entry) => (
              <SelectItem key={entry.article_code} value={entry.article_code}>
                {entry.article_code} · {entry.uppers_available} pairs available
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {selected && (
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <div>
            <p className="eyebrow">Uppers in stock</p>
            <p className="mt-1 font-mono text-sm font-semibold">{pairs(selected.uppers_available)}</p>
          </div>
          <div>
            <p className="eyebrow">Bags added</p>
            <p className="mt-1 font-mono text-sm font-semibold">{selected.bags}</p>
          </div>
          <div>
            <p className="eyebrow">Already produced</p>
            <p className="mt-1 font-mono text-sm font-semibold">{pairs(selected.produced)}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Uppers issued (bags)">
          <Input type="number" value={values.input_bags} onChange={set("input_bags")} placeholder="0" />
        </Field>
        <Field label="Pairs per bag">
          <Select
            value={String(values.pairs_per_bag)}
            onValueChange={(value) => setValues((prev) => ({ ...prev, pairs_per_bag: Number(value) }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAG_TYPES.map((option) => (
                <SelectItem key={option.label} value={String(option.pairs)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ready carton size">
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
        <Field label="Output cartons">
          <Input type="number" value={values.output_cartons} onChange={set("output_cartons")} placeholder="0" />
        </Field>
        <Field label="Production date">
          <Input type="date" value={values.production_date} onChange={set("production_date")} />
        </Field>
        <Field label="Shift">
          <Select value={values.shift} onValueChange={(value) => setValues((prev) => ({ ...prev, shift: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Day", "Night", "Morning", "Evening"].map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Production line">
          <Input value={values.line} onChange={set("line")} placeholder="Line A" />
        </Field>
        <Field label="Operator">
          <Input value={values.operator} onChange={set("operator")} placeholder="Supervisor name" />
        </Field>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
        <CalcRow label={`Uppers used = ${bags} bag(s) × ${perBag} pairs`} value={pairs(uppersUsed)} />
        <CalcRow label={`Ready output = ${cartons} carton(s) × ${perCarton} pairs`} value={pairs(outputPairs)} accent />
        {selected && <CalcRow label="Uppers left after saving" value={pairs(selected.uppers_available - uppersUsed)} />}
      </div>

      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} rows={2} />
      </Field>
    </FormDialog>
  );
}
