import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import FormDialog, { Field, FormError } from "@/components/FormDialog";

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
];

// Raw stock categories can be extended with your own fields.
export default function CategoryForm({ open, onOpenChange, initial, onSaved }) {
  const [values, setValues] = useState({ name: "", slug: "", description: "", unit_label: "", uses_pairs: false });
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      name: initial?.name || "",
      slug: initial?.slug || "",
      description: initial?.description || "",
      unit_label: initial?.unit_label || "",
      uses_pairs: !!initial?.uses_pairs,
    });
    setFields((initial?.fields || []).map((field) => ({ ...field, optionsText: (field.options || []).join(", ") })));
    setError("");
  }, [open, initial]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const updateField = (index, key, value) =>
    setFields((prev) => prev.map((field, position) => (position === index ? { ...field, [key]: value } : field)));

  const submit = async () => {
    if (!values.name.trim()) {
      setError("Category name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: values.name.trim(),
        slug: values.slug.trim() || slugify(values.name),
        description: values.description,
        unit_label: values.unit_label || "units",
        uses_pairs: !!values.uses_pairs,
        fields: fields
          .filter((field) => field.label)
          .map((field, index) => ({
            key: field.key || slugify(field.label) || `field_${index}`,
            label: field.label,
            type: field.type || "text",
            options: String(field.optionsText || "")
              .split(",")
              .map((option) => option.trim())
              .filter(Boolean),
            unit: field.unit || "",
          })),
        is_deleted: false,
      };
      if (initial?.id) await base44.entities.RawCategory.update(initial.id, payload);
      else await base44.entities.RawCategory.create(payload);
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
      title={initial?.id ? "Edit raw category" : "New raw stock category"}
      description="The new category gets its own page with the fields you define here."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save category"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category name">
          <Input value={values.name} onChange={set("name")} placeholder="Sole sheets" />
        </Field>
        <Field label="Default unit">
          <Input value={values.unit_label} onChange={set("unit_label")} placeholder="sheets" />
        </Field>
      </div>
      <Field label="Description">
        <Input value={values.description} onChange={set("description")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={values.uses_pairs}
          onChange={(event) => setValues((prev) => ({ ...prev, uses_pairs: event.target.checked }))}
        />
        Convert quantity into pairs (pack × pairs per pack)
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="field-label">Custom fields</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFields((prev) => [...prev, { label: "", type: "text", optionsText: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add field
          </Button>
        </div>
        {fields.map((field, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_130px_1fr_auto]">
            <Input value={field.label} onChange={(event) => updateField(index, "label", event.target.value)} placeholder="Field name" />
            <Select value={field.type} onValueChange={(value) => updateField(index, "type", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={field.optionsText || ""}
              onChange={(event) => updateField(index, "optionsText", event.target.value)}
              placeholder={field.type === "select" ? "Option 1, Option 2" : "Notes"}
              disabled={field.type !== "select"}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove field"
              onClick={() => setFields((prev) => prev.filter((_, position) => position !== index))}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
