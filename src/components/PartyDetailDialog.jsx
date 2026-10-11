import React, { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/StatusPill";
import { partyLedger } from "@/lib/analytics";
import { money, pairs, shortDate } from "@/lib/format";
import { formatAppTime } from "@/lib/datetime";

// One person's card: the account details, what is still owed or due, the very last
// transaction with its date and time, and — below — every transaction and invoice
// behind that balance. It opens from the kata button in Customers and Suppliers, so a
// name is never just a name: the last payment and the remaining amount are one tap away.
//
// The ledger is loaded for the ONE party that is open (analytics.partyLedger), so the
// customer/supplier list itself stays a single query.

export default function PartyDetailDialog({ open, onOpenChange, type = "customer", party, balance, onRecordPayment, refreshKey = 0 }) {
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !party?.id) {
      setLedger(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    partyLedger(type, party)
      .then((result) => active && setLedger(result))
      .catch(() => active && setLedger(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, type, party?.id, refreshKey]);

  if (!party) return null;

  const isCustomer = type === "customer";
  const closing = Number.isFinite(balance) ? balance : (ledger?.closing ?? (Number(party.opening_balance) || 0));
  const rows = ledger?.rows || [];
  const last = rows[0];
  const movement = (row) => (isCustomer ? row.debit - row.credit : row.credit - row.debit);

  const details = [
    ["Phone", party.phone],
    ["City", party.city],
    ["Products", party.product_details],
    ["Opening balance", money(party.opening_balance)],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCustomer ? "Customer" : "Supplier"} details</DialogTitle>
        </DialogHeader>

        {/* The card itself: who this is and what is left. */}
        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand/70 p-5 text-brand-foreground shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                {isCustomer ? "Customer kata" : "Supplier kata"}
              </p>
              <p className="mt-1 truncate font-heading text-xl font-extrabold">{party.name}</p>
              <p className="mt-0.5 truncate text-xs opacity-90">
                {[party.phone, party.city].filter(Boolean).join(" · ") || "No contact details"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Remaining</p>
              <p className="mt-1 font-mono text-2xl font-extrabold">{money(Math.abs(closing))}</p>
              <p className="text-[11px] opacity-90">
                {closing > 0 ? (isCustomer ? "Receivable" : "Payable") : "Settled"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/25 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">
                {isCustomer ? "Invoiced" : "Purchased"}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {money(rows.reduce((total, row) => total + (row.kind === "payment" ? 0 : isCustomer ? row.debit : row.credit), 0))}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">{isCustomer ? "Received" : "Paid"}</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {money(rows.reduce((total, row) => total + (row.kind === "payment" ? (isCustomer ? row.credit : row.debit) : 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">Documents</p>
              <p className="mt-1 font-mono text-sm font-semibold">{ledger?.documents ?? "—"}</p>
            </div>
          </div>
        </div>

        {/* Last transaction, with its date and time. */}
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Last transaction</p>
            {last && <StatusPill tone="neutral">{isCustomer ? (last.debit ? "Invoice" : "Receipt") : last.credit ? "Purchase" : "Payment"}</StatusPill>}
          </div>
          {loading ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : last ? (
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-bold">{last.label}</p>
                <p className="text-xs text-muted-foreground">
                  {shortDate(last.date)}
                  {last.time ? ` · ${last.time}` : last.at ? ` · ${formatAppTime(last.at)}` : ""}
                  {last.detail ? ` · ${last.detail}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-bold">{money(Math.abs(movement(last)))}</p>
                <p className="text-xs text-muted-foreground">Balance {money(last.balance)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No transaction recorded yet.</p>
          )}
        </div>

        {/* Everything behind the balance: invoices/purchases and payments. */}
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Transactions &amp; invoices</h3>
            {ledger?.rows?.length ? <span className="text-xs text-muted-foreground">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span> : null}
          </div>
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <div key={`${row.kind}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {shortDate(row.date)}
                    {row.time ? ` · ${row.time}` : row.at ? ` · ${formatAppTime(row.at)}` : ""}
                    {row.detail ? ` · ${row.detail}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-sm font-semibold ${movement(row) < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                    {money(Math.abs(movement(row)))}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Balance {money(row.balance)}</p>
                </div>
              </div>
            ))}
            {!loading && !rows.length && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing recorded for {party.name} yet.
              </p>
            )}
          </div>
        </section>

        {isCustomer && ledger?.rows?.some((row) => row.kind === "invoice") && (
          <p className="text-xs text-muted-foreground">
            {pairs(rows.reduce((total, row) => total + (row.kind === "invoice" ? row.pairs || 0 : 0), 0))} sold on{" "}
            {rows.filter((row) => row.kind === "invoice").length} invoice(s).
          </p>
        )}

        <div className="flex justify-end gap-2">
          {onRecordPayment && (
            <Button
              onClick={() => {
                onOpenChange?.(false);
                onRecordPayment(party);
              }}
            >
              <Wallet className="mr-2 h-4 w-4" /> {isCustomer ? "Receive payment" : "Pay supplier"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
