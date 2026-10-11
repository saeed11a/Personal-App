import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import PartyGrid from "@/components/PartyGrid";
import PartyLedger from "@/components/PartyLedger";
import DeleteDialog from "@/components/DeleteDialog";
import { Button } from "@/components/ui/button";
import CustomerForm from "@/components/forms/CustomerForm";
import PaymentForm from "@/components/forms/PaymentForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { customerBalanceMap } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Customers() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [customers, setCustomers] = useState([]);
  const [balances, setBalances] = useState(new Map());
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentParty, setPaymentParty] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const [page, map] = await Promise.all([
      base44.entities.Customer.filter(ALIVE, { sort: "name", limit: 200 }),
      customerBalanceMap().catch(() => new Map()),
    ]);
    setCustomers(page?.items || []);
    setBalances(map);
    setRefreshKey((key) => key + 1);
    setSelected((current) => (current ? (page?.items || []).find((entry) => entry.id === current.id) || null : null));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const balanceOf = (customer) =>
    (Number(customer.opening_balance) || 0) +
    (balances.get(customer.name)?.invoiced || 0) -
    (balances.get(customer.name)?.paid || 0);

  const receivable = customers.reduce((total, customer) => total + Math.max(balanceOf(customer), 0), 0);
  const advance = customers.reduce((total, customer) => total + Math.max(-balanceOf(customer), 0), 0);

  const confirmDelete = async () => {
    await softDelete("Customer", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: `${pendingDelete.name} can be restored from the Recycle Bin.` });
    if (selected?.id === pendingDelete.id) setSelected(null);
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Kata"
        title={`Customers (${customers.length})`}
        description="Pick a customer button to open his kata — details, invoices, receipts and running balance."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New customer
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Customers" value={customers.length} accent />
        <KpiCard label="Receivable" value={money(receivable, settings.currency_symbol)} hint="Owed to the factory" />
        <KpiCard label="Advances" value={money(advance, settings.currency_symbol)} hint="Paid in advance" />
        <KpiCard label="Invoices" value={Array.from(balances.values()).reduce((total, entry) => total + (entry.invoices || 0), 0)} />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-[0.14em]">Customer kata buttons</h2>
        {loading ? (
          <p className="panel px-6 py-10 text-center text-sm text-muted-foreground">Loading customers…</p>
        ) : (
          <PartyGrid
            parties={customers}
            balances={balances}
            selectedId={selected?.id}
            onSelect={setSelected}
            emptyLabel="No customers yet"
          />
        )}
        {selected && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(selected);
                setFormOpen(true);
              }}
            >
              Edit {selected.name}
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setPendingDelete(selected)}>
              Delete
            </Button>
          </div>
        )}
      </section>

      <div className="mt-6">
        <PartyLedger
          type="customer"
          party={selected}
          refreshKey={refreshKey}
          onRecordPayment={(party) => {
            setPaymentParty(party);
            setPaymentOpen(true);
          }}
        />
      </div>

      <CustomerForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={load} />
      <PaymentForm
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        initial={{ party_type: "customer", party_id: paymentParty?.id, party_name: paymentParty?.name }}
        onSaved={load}
      />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this customer to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.name} will be hidden until restored. Invoices and payments are kept.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
