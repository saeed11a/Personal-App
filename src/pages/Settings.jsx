import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormError } from "@/components/FormDialog";
import { useSettings } from "@/lib/useSettings";
import { CURRENCY_SYMBOLS } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Settings() {
  const { settings, save, loading } = useSettings();
  const { toast } = useToast();
  const [values, setValues] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValues(settings);
  }, [settings]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));
  const setNumber = (key) => (event) => setValues((prev) => ({ ...prev, [key]: Number(event.target.value) || 0 }));

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await save({
        company_name: values.company_name,
        tagline: values.tagline,
        currency: values.currency,
        currency_symbol: values.currency_symbol || CURRENCY_SYMBOLS[values.currency] || values.currency,
        address: values.address,
        phone: values.phone,
        email: values.email,
        invoice_prefix: values.invoice_prefix,
        low_stock_threshold: Number(values.low_stock_threshold) || 0,
        default_pairs_per_bag: Number(values.default_pairs_per_bag) || 0,
        default_pairs_per_carton: Number(values.default_pairs_per_carton) || 0,
        opening_cash: Number(values.opening_cash) || 0,
        footer_note: values.footer_note,
      });
      toast({ title: "Settings saved", description: "New defaults apply across every module." });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Company identity, currency, packing defaults and the low stock alert level."
        actions={
          <Button onClick={submit} disabled={saving || loading}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
          </Button>
        }
      />

      <FormError message={error} />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Company</h2>
          <div className="mt-4 space-y-4">
            <Field label="Company name">
              <Input value={values.company_name || ""} onChange={set("company_name")} />
            </Field>
            <Field label="Tagline">
              <Input value={values.tagline || ""} onChange={set("tagline")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address">
                <Input value={values.address || ""} onChange={set("address")} />
              </Field>
              <Field label="Phone">
                <Input value={values.phone || ""} onChange={set("phone")} />
              </Field>
              <Field label="Email">
                <Input value={values.email || ""} onChange={set("email")} />
              </Field>
              <Field label="Invoice prefix">
                <Input value={values.invoice_prefix || ""} onChange={set("invoice_prefix")} placeholder="INV" />
              </Field>
            </div>
            <Field label="Invoice footer note">
              <Textarea value={values.footer_note || ""} onChange={set("footer_note")} rows={2} />
            </Field>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Factory defaults</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select
                  value={values.currency}
                  onValueChange={(value) =>
                    setValues((prev) => ({ ...prev, currency: value, currency_symbol: CURRENCY_SYMBOLS[value] || value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CURRENCY_SYMBOLS).map((code) => (
                      <SelectItem key={code} value={code}>
                        {code} ({CURRENCY_SYMBOLS[code]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency symbol">
                <Input value={values.currency_symbol || ""} onChange={set("currency_symbol")} />
              </Field>
              <Field label="Low stock alert level" hint="Pairs">
                <Input type="number" value={values.low_stock_threshold ?? 0} onChange={setNumber("low_stock_threshold")} />
              </Field>
              <Field label="Opening cash" hint="Starting balance of the roznamcha">
                <Input type="number" value={values.opening_cash ?? 0} onChange={setNumber("opening_cash")} />
              </Field>
              <Field label="Default pairs per bag">
                <Input type="number" value={values.default_pairs_per_bag ?? 100} onChange={setNumber("default_pairs_per_bag")} />
              </Field>
              <Field label="Default pairs per carton">
                <Input type="number" value={values.default_pairs_per_carton ?? 24} onChange={setNumber("default_pairs_per_carton")} />
              </Field>
            </div>
            <p className="rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              Packing options in the forms follow these defaults: 100 / 150-pair bags for uppers and 12 / 18 / 24-pair cartons for
              ready shoes.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
