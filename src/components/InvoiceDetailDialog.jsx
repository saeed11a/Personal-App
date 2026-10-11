import React, { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusPill, { statusTone } from "@/components/StatusPill";
import { base44 } from "@/api/base44Client";
import { useSettings } from "@/lib/useSettings";
import { money, num, pairs, shortDate } from "@/lib/format";

export default function InvoiceDetailDialog({ invoice, onOpenChange }) {
  const { settings } = useSettings();
  const [lines, setLines] = useState([]);

  useEffect(() => {
    if (!invoice?.id) {
      setLines([]);
      return;
    }
    base44.entities.InvoiceLine.filter({ invoice_id: invoice.id }, { limit: 200 }).then((page) => setLines(page?.items || []));
  }, [invoice?.id]);

  if (!invoice) return null;
  const symbol = settings.currency_symbol || "Rs";

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Invoice {invoice.invoice_number}
            <StatusPill tone={statusTone(invoice.status)}>{invoice.status}</StatusPill>
          </DialogTitle>
        </DialogHeader>

        <div id="invoice-print" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <div>
              <p className="font-heading text-sm font-bold">{settings.company_name}</p>
              <p className="text-xs text-muted-foreground">{[settings.address, settings.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Date {shortDate(invoice.invoice_date)}</p>
              <p>Time {invoice.invoice_time || "—"}</p>
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Customer: </span>
              <span className="font-semibold">{invoice.customer_name}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Phone: </span>
              {invoice.customer_phone || "—"}
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Article</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cartons</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pairs</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{line.article_code}</p>
                      <p className="text-xs text-muted-foreground">{line.article_name}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {num(line.cartons)} <span className="text-xs text-muted-foreground">× {num(line.pairs_per_carton)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{num(line.pairs)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(line.price_per_pair, symbol)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{money(line.line_total, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{money(invoice.subtotal, symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-mono">{money(invoice.discount, symbol)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Total</span>
              <span className="font-mono">{money(invoice.total, symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Received</span>
              <span className="font-mono">{money(invoice.received, symbol)}</span>
            </div>
            <div className="flex justify-between font-semibold text-destructive">
              <span>Balance</span>
              <span className="font-mono">{money(invoice.balance, symbol)}</span>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {num(invoice.total_cartons)} carton(s) · {pairs(invoice.total_pairs)}
            </p>
          </div>
        </div>

        <div className="no-print flex justify-end gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
