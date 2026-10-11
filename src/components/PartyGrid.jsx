import React from "react";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";

// Rectangular kata buttons: one per customer / supplier.
export default function PartyGrid({ parties = [], balances, selectedId, onSelect, emptyLabel }) {
  if (!parties.length) {
    return (
      <div className="panel px-6 py-10 text-center">
        <p className="font-heading text-sm font-semibold">{emptyLabel}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Add one to start recording invoices, purchases and payments.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {parties.map((party) => {
        const entry = balances?.get(party.name) || {};
        const balance = (Number(party.opening_balance) || 0) + (entry.invoiced || entry.purchased || 0) - (entry.paid || 0);
        const selected = selectedId === party.id;
        return (
          <button
            key={party.id}
            type="button"
            onClick={() => onSelect(party)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              selected
                ? "border-brand bg-brand/5 shadow-sm"
                : "border-border bg-card hover:border-brand/40 hover:shadow-sm"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-heading text-sm font-bold">{party.name}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  balance > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                )}
              >
                {balance > 0 ? "Balance due" : "Clear"}
              </span>
            </div>
            <p className={cn("mt-2 font-mono text-lg font-bold", balance > 0 ? "text-destructive" : "text-foreground")}>
              {money(Math.abs(balance))}
            </p>
            {(party.phone || party.product_details) && (
              <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                {party.phone && <Phone className="h-3 w-3 shrink-0" />}
                {party.phone || party.product_details}
              </p>
            )}
            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
              {entry.invoices || entry.purchases || 0} {entry.invoices ? "invoice(s)" : "purchase(s)"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
