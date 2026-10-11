import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import { listManualCategories, saveManualCategory } from "@/lib/accounting";
import { useToast } from "@/components/ui/use-toast";

// Manual transaction categories for the roznamcha and "Other" payments.
//
// A category owns its direction (income or expense), so a manual transaction can
// never be posted against the wrong side of the cash book. Deactivating a category
// hides it from new entries and leaves every historical transaction in place.
export default function ManualCategories() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: "", direction: "out", description: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listManualCategories({ includeInactive: true }));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = (category) => {
    setEditing(category || {});
    setDraft({
      name: category?.name || "",
      direction: category?.direction || "out",
      description: category?.description || "",
    });
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await saveManualCategory({ id: editing?.id, ...draft, active: editing?.active ?? true });
      toast({ title: editing?.id ? "Category updated" : "Category added" });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (category, active) => {
    setError("");
    try {
      await saveManualCategory({ id: category.id, name: category.name, direction: category.direction, description: category.description, active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Manual categories</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Income and expense categories for manual roznamcha entries and “Other” payments. Deactivating keeps every transaction
            already recorded under it.
          </p>
        </div>
        <Button variant="outline" onClick={() => open(null)}>
          <Plus className="mr-2 h-4 w-4" /> Add category
        </Button>
      </div>

      <FormError message={error} />

      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No manual categories yet. Add one (for example “Daily expense”, expense) before recording a manual entry.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {rows.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {category.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {category.direction === "in" ? "income" : "expense"}
                    {category.active ? "" : " · inactive"}
                  </span>
                </p>
                {category.description && <p className="truncate text-xs text-muted-foreground">{category.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => open(category)}>
                  Edit
                </Button>
                <Button size="sm" variant={category.active ? "outline" : "default"} onClick={() => setActive(category, !category.active)}>
                  {category.active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormDialog
        open={!!editing}
        onOpenChange={(openState) => !openState && setEditing(null)}
        title={editing?.id ? "Edit manual category" : "New manual category"}
        description="The direction decides whether entries in this category are cash in or cash out."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !draft.name.trim()}>
              {saving ? "Saving…" : "Save category"}
            </Button>
          </>
        }
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g. Daily expense" />
          </Field>
          <Field label="Direction">
            <Select value={draft.direction} onValueChange={(value) => setDraft((prev) => ({ ...prev, direction: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Income — cash in</SelectItem>
                <SelectItem value="out">Expense — cash out</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
          </Field>
        </div>
      </FormDialog>
    </section>
  );
}
