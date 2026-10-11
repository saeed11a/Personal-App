import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import InvoiceLines from "@/components/InvoiceLines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormError } from "@/components/FormDialog";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { articleStockMap } from "@/lib/analytics";
import { createInvoice } from "@/functions/createInvoice";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, todayISO } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function InvoiceNew() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "" });
  const [values, setValues] = useState({ discount: "", received: "", payment_method: "Cash", notes: "" });
  const [lines, setLines] = useState([
    { article_code: "", carton_type: "24-pair carton", pairs_per_carton: 24, cartons: "", price_per_pair: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [articlePage, customerPage, map] = await Promise.all([
        base44.entities.Article.filter(ALIVE, { limit: 500 }),
        base44.entities.Customer.filter(ALIVE, { sort: "name", limit: 200 }),
        articleStockMap().catch(() => new Map()),
      ]);
      setCustomers(customerPage?.items || []);
      setArticles(
        Array.from(map.values())
          .filter((entry) => entry.ready_available > 0)
          .map((entry) => {
            const record = (articlePage?.items || []).find((article) => String(article.code).toUpperCase() === entry.article_code);
            return {
              code: entry.article_code,
              name: record?.name || entry.article_code,
              selling_price: record?.selling_price || 0,
              available: entry.ready_available,
            };
          })
          .sort((a, b) => a.code.localeCompare(b.code))
      );
    })();
  }, []);

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const pairsCount = num(line.cartons) * num(line.pairs_per_carton);
      return sum + pairsCount * num(line.price_per_pair);
    }, 0);
    const discount = num(values.discount);
    const total = Math.max(subtotal - discount, 0);
    const received = num(values.received);
    return { subtotal, discount, total, received, balance: Math.max(total - received, 0), pairs: lines.reduce((sum, line) => sum + num(line.cartons) * num(line.pairs_per_carton), 0) };
  }, [lines, values.discount, values.received]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    const customer = selectedCustomer || newCustomer;
    if (!customer?.name?.trim()) {
      setError("Select an existing customer or enter a new customer name");
      return;
    }
    setSaving(true);
    setError("");
    const result = await createInvoice({
      customer: selectedCustomer
        ? { id: selectedCustomer.id, name: selectedCustomer.name, phone: selectedCustomer.phone, address: selectedCustomer.address }
        : { name: newCustomer.name, phone: newCustomer.phone, address: newCustomer.address },
      invoice_date: todayISO(),
      discount: num(values.discount),
      received: num(values.received),
      payment_method: values.payment_method,
      notes: values.notes,
      items: lines.map((line) => ({
        article_code: line.article_code,
        carton_type: line.carton_type,
        pairs_per_carton: num(line.pairs_per_carton),
        cartons: num(line.cartons),
        price_per_pair: num(line.price_per_pair),
      })),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast({
      title: `Invoice ${result.invoice?.invoice_number} saved`,
      description: `${pairs(result.invoice?.total_pairs || 0)} deducted from Ready Shoes and posted to the customer kata.`,
    });
    navigate("/invoices");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Sales desk"
        title="New invoice"
        description="Cartons convert into pairs, stock is deducted and the customer kata is updated on save."
        actions={
          <Button variant="outline" onClick={() => navigate("/invoices")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to invoices
          </Button>
        }
      />

      <FormError message={error} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <section className="panel p-5">
            <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Customer</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Existing customer">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={customers.length ? "Select customer" : "No customers yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {!customerId && (
                <>
                  <Field label="Or new customer name">
                    <Input
                      value={newCustomer.name}
                      onChange={(event) => setNewCustomer((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Walk-in customer"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={newCustomer.phone}
                      onChange={(event) => setNewCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                    />
                  </Field>
                  <Field label="Address">
                    <Input
                      value={newCustomer.address}
                      onChange={(event) => setNewCustomer((prev) => ({ ...prev, address: event.target.value }))}
                    />
                  </Field>
                </>
              )}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Items</h2>
            <p className="mt-1 text-xs text-muted-foreground">Only articles with ready stock can be invoiced.</p>
            <div className="mt-4">
              <InvoiceLines lines={lines} onChange={setLines} articles={articles} />
            </div>
          </section>
        </div>

        <section className="panel h-fit p-5">
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Invoice total</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pairs on this invoice</span>
              <span className="font-mono font-semibold">{pairs(totals.pairs)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono font-semibold">{money(totals.subtotal, settings.currency_symbol)}</span>
            </div>

            <Field label="Discount">
              <Input type="number" value={values.discount} onChange={set("discount")} placeholder="0" />
            </Field>
            <Field label="Amount received now">
              <Input type="number" value={values.received} onChange={set("received")} placeholder="0" />
            </Field>
            <Field label="Payment method">
              <Select value={values.payment_method} onValueChange={(value) => setValues((prev) => ({ ...prev, payment_method: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Cash", "Bank", "Cheque", "Online"].map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-semibold">{money(totals.total, settings.currency_symbol)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-mono font-semibold text-destructive">{money(totals.balance, settings.currency_symbol)}</span>
              </div>
            </div>

            <Field label="Notes">
              <Textarea value={values.notes} onChange={set("notes")} rows={2} />
            </Field>

            <Button className="w-full" onClick={submit} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? "Saving invoice…" : "Save invoice"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Date {todayISO()} · time is stamped automatically from the server clock.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
