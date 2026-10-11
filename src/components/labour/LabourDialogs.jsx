import React, { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FormDialog, { CalcRow, Field, FormError } from "@/components/FormDialog";
import DataTable from "@/components/DataTable";
import { money, pairs, shortDate, todayISO } from "@/lib/format";
import {
  completeProduction,
  listLabourRates,
  moveProduction,
  newKey,
  recordProduction,
  saveLabour,
  saveLabourCategory,
  saveLabourRate,
  labourStatement,
} from "@/lib/labour";

// All Labour dialogs live together: they share the same field layout and the same
// rule — the database decides quantities, rates and money, the form only asks.

const activeStages = (categories) => categories.filter((category) => category.active);

// ---------------------------------------------------------------------------
// Labour account (with its stages and per-pair rates)
// ---------------------------------------------------------------------------
export function LabourForm({ open, onOpenChange, onSaved, account, categories }) {
  const [values, setValues] = useState({});
  const [stageIds, setStageIds] = useState([]);
  const [rates, setRates] = useState([]);
  const [pending, setPending] = useState([]);
  const [draft, setDraft] = useState({ rate_per_pair: "", effective_date: todayISO(), notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      name: account?.name || "",
      phone: account?.phone || "",
      cnic: account?.cnic || "",
      address: account?.address || "",
      status: account?.status || "active",
      notes: account?.notes || "",
    });
    setStageIds(account?.category_ids || []);
    setPending([]);
    setDraft({ rate_per_pair: "", effective_date: todayISO(), notes: "" });
    setError("");
    if (account?.id) listLabourRates(account.id).then(setRates).catch(() => setRates([]));
    else setRates([]);
  }, [open, account]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const toggleStage = (id) =>
    setStageIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));

  const addRate = () => {
    // The stage selected for the rate, or the first stage this labour works in, so a
    // rate can be recorded without touching the stage dropdown first.
    const categoryId = draft.category_id || stageIds[0] || activeStages(categories)[0]?.id;
    if (!categoryId) {
      setError("Choose the stage this rate is for");
      return;
    }
    if (!(Number(draft.rate_per_pair) >= 0) || draft.rate_per_pair === "") {
      setError("Enter the per-pair rate");
      return;
    }
    if (!stageIds.includes(categoryId)) setStageIds((prev) => [...prev, categoryId]);
    setPending((prev) => [...prev, { ...draft, category_id: categoryId, rate_per_pair: Number(draft.rate_per_pair) }]);
    setDraft({ rate_per_pair: "", effective_date: todayISO(), notes: "" });
    setError("");
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const labourId = await saveLabour({ id: account?.id, ...values, categoryIds: stageIds });
      for (const rate of pending) {
        await saveLabourRate({ labourId, categoryId: rate.category_id, ratePerPair: rate.rate_per_pair, effectiveDate: rate.effective_date, notes: rate.notes });
      }
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
      size="lg"
      title={account?.id ? "Edit labour account" : "New labour account"}
      description="Who they are, the stages they work in, and their per-pair rate for each stage."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save labour"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Labour name">
          <Input value={values.name || ""} onChange={set("name")} placeholder="e.g. Rashid Ali" />
        </Field>
        <Field label="Phone">
          <Input value={values.phone || ""} onChange={set("phone")} placeholder="03xx-xxxxxxx" />
        </Field>
        <Field label="CNIC">
          <Input value={values.cnic || ""} onChange={set("cnic")} placeholder="Optional" />
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
        <Field label="Address" className="sm:col-span-2">
          <Input value={values.address || ""} onChange={set("address")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={values.notes || ""} onChange={set("notes")} rows={2} />
        </Field>
      </div>

      <div className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stages this labour works in</p>
        <div className="flex flex-wrap gap-2">
          {activeStages(categories).map((category) => (
            <Button
              key={category.id}
              type="button"
              size="sm"
              variant={stageIds.includes(category.id) ? "default" : "outline"}
              onClick={() => toggleStage(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Per-pair rates</p>
        <p className="text-xs text-muted-foreground">
          A rate change is a new entry with its own effective date — production already completed keeps the rate that applied then.
        </p>

        {rates.length > 0 && (
          <div className="space-y-1">
            {rates.map((rate) => (
              <CalcRow
                key={rate.id}
                label={`${categories.find((entry) => entry.id === rate.category_id)?.name || "Stage"} · from ${shortDate(rate.effective_date)}`}
                value={`${money(rate.rate_per_pair)} / pair`}
              />
            ))}
          </div>
        )}
        {pending.map((rate, index) => (
          <CalcRow
            key={`pending-${index}`}
            label={`${categories.find((entry) => entry.id === rate.category_id)?.name || "Stage"} · from ${shortDate(rate.effective_date)} (new)`}
            value={`${money(rate.rate_per_pair)} / pair`}
            accent
          />
        ))}

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Stage">
            <Select value={draft.category_id || ""} onValueChange={(value) => setDraft((prev) => ({ ...prev, category_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose stage" />
              </SelectTrigger>
              <SelectContent>
                {activeStages(categories).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rate / pair">
            <Input
              type="number"
              value={draft.rate_per_pair}
              onChange={(event) => setDraft((prev) => ({ ...prev, rate_per_pair: event.target.value }))}
              placeholder="0"
            />
          </Field>
          <Field label="Effective from">
            <Input
              type="date"
              value={draft.effective_date}
              onChange={(event) => setDraft((prev) => ({ ...prev, effective_date: event.target.value }))}
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full" onClick={addRate}>
              <Plus className="mr-1 h-4 w-4" /> Add rate
            </Button>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Stage categories (the three shipped ones plus administrator-defined ones)
// ---------------------------------------------------------------------------
export function CategoryManager({ open, onOpenChange, categories, onSaved }) {
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft({ name: "", description: "" });
    setError("");
  }, [open]);

  const add = async () => {
    setSaving(true);
    setError("");
    try {
      await saveLabourCategory(draft);
      setDraft({ name: "", description: "" });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (category) => {
    setSaving(true);
    setError("");
    try {
      await saveLabourCategory({ id: category.id, name: category.name, description: category.description, active: !category.active });
      onSaved?.();
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
      title="Labour categories"
      description="Upper / Last Process, Machine / Sole and Finishing ship with the module. Deactivating a category keeps every record already recorded in it."
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <FormError message={error} />
      <div className="space-y-2">
        {categories.map((category) => (
          <div key={category.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{category.name}</p>
              {category.description && <p className="truncate text-xs text-muted-foreground">{category.description}</p>}
            </div>
            <Button size="sm" variant={category.active ? "outline" : "default"} disabled={saving} onClick={() => toggle(category)}>
              {category.active ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        ))}
      </div>
      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
        <Field label="New category">
          <Input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g. Cutting" />
        </Field>
        <Field label="Description">
          <Input value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
        </Field>
      </div>
      <Button onClick={add} disabled={saving || !draft.name.trim()}>
        <Plus className="mr-1 h-4 w-4" /> Add category
      </Button>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Production: record what came in
// ---------------------------------------------------------------------------
export function ProductionDialog({ open, onOpenChange, onSaved, accounts, categories }) {
  const [values, setValues] = useState({});
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({
      labour_id: accounts[0]?.id || "",
      category_id: accounts[0]?.category_ids?.[0] || categories[0]?.id || "",
      production_date: todayISO(),
      article_code: "",
      pairs_received: "",
      reference: "",
      notes: "",
    });
    // One key per opened form: a double submit or a retry is the same entry.
    setKey(newKey());
    setError("");
  }, [open, accounts, categories]);

  const set = (field) => (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));
  const selected = accounts.find((account) => account.id === values.labour_id);
  const stages = selected?.category_ids?.length
    ? categories.filter((category) => selected.category_ids.includes(category.id) && category.active)
    : activeStages(categories);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await recordProduction({ ...values, idempotency_key: key });
      onSaved?.(result);
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
      title="Record labour production"
      description="Pairs handed to a labour for a stage. Completing them later is what earns money."
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Labour">
          <Select value={values.labour_id || ""} onValueChange={(value) => {
            const account = accounts.find((entry) => entry.id === value);
            setValues((prev) => ({ ...prev, labour_id: value, category_id: account?.category_ids?.[0] || prev.category_id }));
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Choose labour" />
            </SelectTrigger>
            <SelectContent>
              {accounts.filter((account) => account.status === "active").map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={values.category_id || ""} onValueChange={(value) => setValues((prev) => ({ ...prev, category_id: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Choose stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={values.production_date || ""} onChange={set("production_date")} />
        </Field>
        <Field label="Article code">
          <Input value={values.article_code || ""} onChange={set("article_code")} placeholder="Optional" />
        </Field>
        <Field label="Pairs received" hint="Completed and pending are worked out from this.">
          <Input type="number" value={values.pairs_received || ""} onChange={set("pairs_received")} placeholder="0" />
        </Field>
        <Field label="Reference / lot">
          <Input value={values.reference || ""} onChange={set("reference")} placeholder="Optional" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={values.notes || ""} onChange={set("notes")} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Complete work (earns) and move work to the next stage (earns nothing)
// ---------------------------------------------------------------------------
export function CompleteDialog({ open, onOpenChange, onSaved, entry, categoryName }) {
  const [values, setValues] = useState({});
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({ pairs: "", completion_date: todayISO() });
    setKey(newKey());
    setError("");
  }, [open, entry]);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await completeProduction({
        production_id: entry.id,
        pairs: Number(values.pairs) || 0,
        completion_date: values.completion_date,
        idempotency_key: key,
      });
      onSaved?.(result);
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
      title="Complete production"
      description="Completed pairs earn at the rate that applies on the completion date. Repeating this only ever earns the difference."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Complete"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="space-y-1">
        <CalcRow label="Stage" value={categoryName || "—"} />
        <CalcRow label="Received" value={pairs(entry?.pairs_received)} />
        <CalcRow label="Already completed" value={pairs(entry?.pairs_completed)} />
        <CalcRow label="Still pending" value={pairs(entry?.pairs_pending)} accent />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pairs completed now">
          <Input type="number" value={values.pairs || ""} onChange={(event) => setValues((prev) => ({ ...prev, pairs: event.target.value }))} placeholder="0" />
        </Field>
        <Field label="Completion date">
          <Input type="date" value={values.completion_date || ""} onChange={(event) => setValues((prev) => ({ ...prev, completion_date: event.target.value }))} />
        </Field>
      </div>
    </FormDialog>
  );
}

export function MoveStageDialog({ open, onOpenChange, onSaved, entry, categories, categoryName }) {
  const [values, setValues] = useState({});
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues({ to_category_id: "", pairs: "", move_date: todayISO(), notes: "" });
    setKey(newKey());
    setError("");
  }, [open, entry]);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await moveProduction({
        production_id: entry.id,
        to_category_id: values.to_category_id,
        pairs: Number(values.pairs) || 0,
        move_date: values.move_date,
        notes: values.notes,
        idempotency_key: key,
      });
      onSaved?.(result);
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
      title="Move work to the next stage"
      description="Pending pairs leave this stage and appear in the next one. They are not earned again."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="space-y-1">
        <CalcRow label="From stage" value={categoryName || "—"} />
        <CalcRow label="Pending here" value={pairs(entry?.pairs_pending)} accent />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Move to">
          <Select value={values.to_category_id || ""} onValueChange={(value) => setValues((prev) => ({ ...prev, to_category_id: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Choose stage" />
            </SelectTrigger>
            <SelectContent>
              {activeStages(categories)
                .filter((category) => category.id !== entry?.category_id)
                .map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pairs moving">
          <Input type="number" value={values.pairs || ""} onChange={(event) => setValues((prev) => ({ ...prev, pairs: event.target.value }))} placeholder="0" />
        </Field>
        <Field label="Date">
          <Input type="date" value={values.move_date || ""} onChange={(event) => setValues((prev) => ({ ...prev, move_date: event.target.value }))} />
        </Field>
        <Field label="Notes">
          <Input value={values.notes || ""} onChange={(event) => setValues((prev) => ({ ...prev, notes: event.target.value }))} />
        </Field>
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Statement: earnings, payments and pending work for one labour
// ---------------------------------------------------------------------------
export function StatementDialog({ open, onOpenChange, account, onPay, onReversed, currency }) {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!account?.id) return;
    setLoading(true);
    setError("");
    try {
      setStatement(await labourStatement(account.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [account?.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const columns = [
    { key: "date", label: "Date", render: (row) => shortDate(row.date) },
    { key: "label", label: "Entry", render: (row) => <span className="font-medium">{row.label}</span> },
    { key: "detail", label: "Detail", render: (row) => row.detail || "—" },
    {
      key: "amount",
      label: "Earned",
      numeric: true,
      render: (row) => (row.earning ? <span className="text-emerald-600">{money(row.earning, currency)}</span> : "—"),
    },
    {
      key: "paid",
      label: "Paid",
      numeric: true,
      render: (row) =>
        row.kind === "payment" ? (
          <span className={row.reversed ? "text-muted-foreground line-through" : "text-rose-600"}>
            {money(Math.abs(row.paid), currency)}
            {row.reversal ? " (reversal)" : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) =>
        row.kind === "payment" ? (
          <span className="text-xs text-muted-foreground">
            {row.reversed ? "Reversed" : row.is_advance ? "Advance" : row.reversal ? "Reversal" : "Posted"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Earned</span>
        ),
    },
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`${account?.name || "Labour"} statement`}
      description="Earnings from completed work, payments made, and the balance the two produce."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => onPay?.(account)}>Pay labour</Button>
        </>
      }
    >
      <FormError message={error} />
      {statement && (
        <div className="space-y-1">
          <CalcRow label="Earned from completed work" value={money(statement.earned, currency)} />
          <CalcRow label="Paid out" value={money(statement.paid, currency)} />
          <CalcRow label="Outstanding balance" value={money(Math.max(statement.outstanding, 0), currency)} accent />
          <CalcRow label="Advance already paid" value={money(statement.advance, currency)} />
          <CalcRow label="Pairs still pending" value={pairs(statement.pending)} />
        </div>
      )}

      {statement && statement.production.some((row) => Number(row.pairs_pending) > 0) && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending work</p>
          <div className="mt-2 space-y-1">
            {statement.production
              .filter((row) => Number(row.pairs_pending) > 0)
              .map((row) => (
                <CalcRow
                  key={row.id}
                  label={`${statement.categoryName.get(row.category_id) || "Stage"} · ${shortDate(row.production_date)}${row.article_code ? ` · ${row.article_code}` : ""}`}
                  value={`${row.pairs_pending} pending`}
                />
              ))}
          </div>
        </div>
      )}

      {statement && statement.rates.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate history</p>
          <div className="mt-2 space-y-1">
            {statement.rates.map((rate) => (
              <CalcRow
                key={rate.id}
                label={`${statement.categoryName.get(rate.category_id) || "Stage"} · from ${shortDate(rate.effective_date)}`}
                value={`${money(rate.rate_per_pair, currency)} / pair`}
              />
            ))}
          </div>
        </div>
      )}

      <DataTable columns={columns} rows={statement?.rows || []} loading={loading} emptyLabel="Nothing recorded yet" />

      {onReversed && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Correct a payment</p>
          <p className="text-xs text-muted-foreground">
            A payment is never deleted: reversing it posts a linked opposite entry in the labour ledger and the cash book.
          </p>
          <div className="flex flex-wrap gap-2">
            {(statement?.rows || [])
              .filter((row) => row.kind === "payment" && !row.reversed && !row.reversal)
              .slice(0, 8)
              .map((row) => (
                <Button key={row.id} size="sm" variant="outline" onClick={() => onReversed(row)}>
                  Reverse {money(row.amount, currency)} · {shortDate(row.date)}
                </Button>
              ))}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
