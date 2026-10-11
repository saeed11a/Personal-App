import React, { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusPill, { statusTone } from "@/components/StatusPill";
import InvoicePrintView from "@/components/invoice/InvoicePrintView";
import { db } from "@/lib/entities";
import { useSettings } from "@/lib/useSettings";

export default function InvoiceDetailDialog({ invoice, onOpenChange }) {
  const { settings } = useSettings();
  const [stored, setStored] = useState(null);
  const [lines, setLines] = useState([]);
  const id = invoice?.id || null;

  // Callers hand over whatever they already hold: the invoice register passes the
  // whole row, while the sales list only knows the invoice id it read off a line.
  // Read the invoice and its lines back here, so what is shown and printed is
  // always the stored invoice — every total, date and time — and never a
  // half-filled copy.
  useEffect(() => {
    if (!id) {
      setStored(null);
      setLines([]);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      db.Invoice.filter({ id }, { limit: 1 }),
      db.InvoiceLine.filter({ invoice_id: id }, { limit: 200 }),
    ])
      .then(([page, linePage]) => {
        if (cancelled) return;
        setStored(page?.items?.[0] || null);
        setLines(linePage?.items || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The loaded row wins once it arrives; until then the passed invoice renders.
  const record = stored?.id === id ? stored : invoice;

  // Mark the document while an invoice is open: the print rules in index.css then
  // hide the whole app behind the dialog, so printing produces the invoice and
  // nothing else — no sidebar, top bar, buttons or page background.
  useEffect(() => {
    if (!id) return undefined;
    document.documentElement.classList.add("printing-invoice");
    return () => document.documentElement.classList.remove("printing-invoice");
  }, [id]);

  if (!invoice) return null;

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl print:static print:h-auto print:max-h-none print:w-full print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:animate-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-3">
            Invoice {record.invoice_number}
            <StatusPill tone={statusTone(record.status)}>{record.status}</StatusPill>
          </DialogTitle>
        </DialogHeader>

        <InvoicePrintView invoice={record} lines={lines} settings={settings} />

        <div className="no-print flex justify-end gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
