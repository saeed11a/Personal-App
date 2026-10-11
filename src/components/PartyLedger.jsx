import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/DataTable";
import StatusPill from "@/components/StatusPill";
import { partyLedger } from "@/lib/analytics";
import { money, pairs, shortDate } from "@/lib/format";

// One customer's or supplier's kata: documents, payments and the running balance.
export default function PartyLedger({ type, party, onRecordPayment, refreshKey = 0 }) {
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!party?.id) {
      setLedger(null);
      return;
    }
    let active = true;
    setLoading(true);
    partyLedger(type, party)
      .then((result) => active && setLedger(result))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [type, party, refreshKey]);

  if (!party) {
    return (
      <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Wallet className="h-6 w-6 text-muted-foreground" />
        <p className="font-heading text-sm font-semibold">Select a {type} to open the kata</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The kata shows every invoice, purchase and payment with the running balance.
        </p>
      </div>
    );
  }

  const isCustomer = type === "customer";
  const closing = ledger?.closing ?? (Number(party.opening_balance) || 0);
  const columns = [
    { key: "date", label: "Date", render: (row) => shortDate(row.date) },
    { key: "label", label: "Particulars", render: (row) => (
        <div>
          <p className="font-medium">{row.label}</p>
          {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
        </div>
      ) },
    { key: "debit", label: isCustomer ? "Invoiced" : "Paid", numeric: true, render: (row) => (row.debit ? money(row.debit) : "—") },
    { key: "credit", label: isCustomer ? "Received" : "Credit", numeric: true, render: (row) => (row.credit ? money(row.credit) : "—") },
    { key: "balance", label: "Balance", numeric: true, render: (row) => <span className="font-semibold">{money(row.balance)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{isCustomer ? "Customer kata" : "Supplier kata"}</p>
            <h2 className="mt-1 font-heading text-xl font-bold">{party.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {[party.phone, party.city, party.product_details].filter(Boolean).join(" · ") || "No contact details"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill tone={closing > 0 ? "danger" : "success"}>
              {closing > 0 ? (isCustomer ? "Receivable" : "Payable") : "Settled"}
            </StatusPill>
            <p className="font-mono font-heading text-2xl font-bold">{money(Math.abs(closing))}</p>
            {onRecordPayment && (
              <Button size="sm" onClick={() => onRecordPayment(party)}>
                {isCustomer ? "Receive payment" : "Pay supplier"}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <p className="eyebrow">Opening</p>
            <p className="mt-1 font-mono text-sm">{money(party.opening_balance)}</p>
          </div>
          <div>
            <p className="eyebrow">{isCustomer ? "Invoiced" : "Purchased"}</p>
            <p className="mt-1 font-mono text-sm">
              {money((ledger?.rows || []).reduce((total, row) => total + (row.kind === "payment" ? 0 : isCustomer ? row.debit : row.credit), 0))}
            </p>
          </div>
          <div>
            <p className="eyebrow">{isCustomer ? "Received" : "Paid"}</p>
            <p className="mt-1 font-mono text-sm">
              {money((ledger?.rows || []).reduce((total, row) => total + (row.kind === "payment" ? (isCustomer ? row.credit : row.debit) : 0), 0))}
            </p>
          </div>
          <div>
            <p className="eyebrow">{isCustomer ? "Pairs sold" : "Documents"}</p>
            <p className="mt-1 font-mono text-sm">
              {isCustomer
                ? pairs((ledger?.rows || []).reduce((total, row) => total + (row.kind === "invoice" ? row.pairs || 0 : 0), 0))
                : ledger?.documents || 0}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="panel flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading kata…
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={ledger?.rows || []}
          emptyLabel="No transactions yet"
          emptyHint={isCustomer ? "Sales invoices and payments will appear here." : "Purchases and payments will appear here."}
          footer={
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
                Balance brought forward {money(party.opening_balance)} · {ledger?.rows?.length || 0} entries
              </span>
              <span className="font-mono text-sm font-semibold">Closing {money(closing)}</span>
            </div>
          }
        />
      )}
    </div>
  );
}
