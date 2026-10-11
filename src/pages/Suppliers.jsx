import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import PartyGrid from "@/components/PartyGrid";
import PartyLedger from "@/components/PartyLedger";
import DeleteDialog from "@/components/DeleteDialog";
import { Button } from "@/components/ui/button";
import SupplierForm from "@/components/forms/SupplierForm";
import PaymentForm from "@/components/forms/PaymentForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { supplierBalanceMap } from "@/lib/analytics";
import { useSettings } from "@/lib/useSettings";
import { money } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Suppliers() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
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
      base44.entities.Supplier.filter(ALIVE, { sort: "name", limit: 200 }),
      supplierBalanceMap().catch(() => new Map()),
    ]);
    setSuppliers(page?.items || []);
    setBalances(map);
    setRefreshKey((key) => key + 1);
    setSelected((current) => (current ? (page?.items || []).find((entry) => entry.id === current.id) || null : null));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const balanceOf = (supplier) =>
    (Number(supplier.opening_balance) || 0) +
    (balances.get(supplier.name)?.purchased || 0) -
    (balances.get(supplier.name)?.paid || 0);

  const payable = suppliers.reduce((total, supplier) => total + Math.max(balanceOf(supplier), 0), 0);
  const advance = suppliers.reduce((total, supplier) => total + Math.max(-balanceOf(supplier), 0), 0);

  const confirmDelete = async () => {
    await softDelete("Supplier", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: `${pendingDelete.name} can be restored from the Recycle Bin.` });
    if (selected?.id === pendingDelete.id) setSelected(null);
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Kata"
        title={`Suppliers (${suppliers.length})`}
        description="Each supplier button opens his kata: product details, purchases, payments and remaining balance."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New supplier
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Suppliers" value={suppliers.length} accent />
        <KpiCard label="Payable" value={money(payable, settings.currency_symbol)} hint="Owed by the factory" />
        <KpiCard label="Advances paid" value={money(advance, settings.currency_symbol)} hint="Paid ahead of supply" />
        <KpiCard label="Purchases" value={Array.from(balances.values()).reduce((total, entry) => total + (entry.purchases || 0), 0)} />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-[0.14em]">Supplier kata buttons</h2>
        {loading ? (
          <p className="panel px-6 py-10 text-center text-sm text-muted-foreground">Loading suppliers…</p>
        ) : (
          <PartyGrid
            parties={suppliers}
            balances={balances}
            selectedId={selected?.id}
            onSelect={setSelected}
            emptyLabel="No suppliers yet"
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
          type="supplier"
          party={selected}
          refreshKey={refreshKey}
          onRecordPayment={(party) => {
            setPaymentParty(party);
            setPaymentOpen(true);
          }}
        />
      </div>

      <SupplierForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={load} />
      <PaymentForm
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        initial={{ party_type: "supplier", party_id: paymentParty?.id, party_name: paymentParty?.name }}
        onSaved={load}
      />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this supplier to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.name} will be hidden until restored. Purchases and payments are kept.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
