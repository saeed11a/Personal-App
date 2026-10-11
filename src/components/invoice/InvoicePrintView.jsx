import React from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import { money, num, pairs, shortDate } from "@/lib/format";

// The printable invoice: a teal letterhead with a curved wave, the party details,
// the line table and the totals, then the payment/terms block and a teal contact
// strip (the design the factory asked for).
//
// Every value on it is real data — the invoice, its stored lines and the company
// settings. The colours are fixed (not theme colours) so the screen preview and the
// printed page look the same in light and dark mode, and `print-color-adjust: exact`
// (see index.css) keeps the teal blocks from being dropped by the print dialog.
//
// Sizes follow the page rules in index.css: A4 by default, and adding `.print-receipt`
// to the root (`receipt` prop) switches to 80mm receipt paper.

const TEAL = "#008080";

// The curved edge that closes the teal header: white sweeping up through the teal band.
function Wave({ color = "#ffffff", className = "" }) {
  return (
    <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      <path d="M0 60 C 380 4, 1060 4, 1440 60 Z" fill={color} />
    </svg>
  );
}

export default function InvoicePrintView({ invoice, lines = [], settings = {}, receipt = false }) {
  const symbol = settings.currency_symbol || "Rs";
  const tax = num(invoice.tax);
  const balance = num(invoice.balance);
  const contact = [
    settings.phone && { icon: Phone, text: settings.phone },
    settings.email && { icon: Mail, text: settings.email },
    settings.address && { icon: MapPin, text: settings.address },
  ].filter(Boolean);

  const paymentRows = [
    ["Account No", settings.bank_account_no],
    ["A/C Name", settings.bank_account_name],
    ["Branch Name", settings.bank_branch],
  ];
  const terms = String(settings.terms || settings.footer_note || "").split("\n").filter(Boolean);

  return (
    <article
      className={`invoice-print mx-auto w-full bg-white text-[13px] leading-relaxed text-neutral-900 ${receipt ? "print-receipt" : ""}`}
    >
      {/* Letterhead */}
      <header className="relative overflow-hidden px-6 pb-10 pt-7 text-white" style={{ backgroundColor: TEAL }}>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[30px] font-extrabold uppercase leading-none tracking-[0.18em]">Invoice</p>
            <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/80">
              {invoice.invoice_number || "—"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <img src="/hiker-logo.png" alt="" className="h-12 w-12 rounded-full bg-white/95 object-contain" />
            <div>
              <p className="text-base font-extrabold uppercase leading-tight tracking-wide">{settings.company_name}</p>
              <p className="text-[11px] text-white/80">{settings.tagline || "Shoes Factory ERP"}</p>
            </div>
          </div>
        </div>
        <Wave className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-7 w-full" />
      </header>

      {/* Party and invoice details */}
      <section className="grid gap-4 px-6 pt-6 sm:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: TEAL }}>
            Invoice To
          </p>
          <p className="mt-1 text-base font-bold">{invoice.customer_name || "—"}</p>
          <dl className="mt-2 space-y-0.5 text-[12px] text-neutral-600">
            <div className="flex gap-2">
              <dt className="w-4 font-semibold text-neutral-900">P :</dt>
              <dd>{invoice.customer_phone || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-4 font-semibold text-neutral-900">E :</dt>
              <dd>{invoice.customer_email || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-4 font-semibold text-neutral-900">A :</dt>
              <dd>{invoice.customer_address || "—"}</dd>
            </div>
          </dl>
        </div>
        <dl className="space-y-1 text-[12px] sm:text-right print:text-right">
          <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
            <dt className="font-semibold text-neutral-500">Invoice No :</dt>
            <dd className="font-semibold">{invoice.invoice_number || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
            <dt className="font-semibold text-neutral-500">Date :</dt>
            <dd>{shortDate(invoice.invoice_date)}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
            <dt className="font-semibold text-neutral-500">Time :</dt>
            <dd>{invoice.invoice_time || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
            <dt className="font-semibold text-neutral-500">Due Date :</dt>
            <dd>{invoice.due_date ? shortDate(invoice.due_date) : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Lines */}
      <section className="mt-6 overflow-hidden px-6">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="text-white" style={{ backgroundColor: TEAL }}>
              <th className="w-10 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider">SL</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider">Item Description</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider">Price</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider">Qty.</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id || index} className={index % 2 === 1 ? "bg-neutral-100" : "bg-white"}>
                <td className="px-3 py-2 text-center font-mono text-neutral-500">
                  {String(index + 1).padStart(2, "0")}
                </td>
                <td className="px-3 py-2">
                  <p className="font-semibold">{line.article_code || line.article_name}</p>
                  <p className="text-[11px] text-neutral-500">
                    {line.article_name}
                    {line.cartons ? ` · ${num(line.cartons)} ctn × ${num(line.pairs_per_carton)} prs` : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-right font-mono">{money(line.price_per_pair, symbol)}</td>
                <td className="px-3 py-2 text-right font-mono">{num(line.pairs)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{money(line.line_total, symbol)}</td>
              </tr>
            ))}
            {!lines.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                  No items on this invoice.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Payment info, terms and signature — with the totals alongside */}
      <section className="mt-6 grid gap-6 px-6 sm:grid-cols-2 print:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: TEAL }}>
              Payment Info
            </p>
            <dl className="mt-2 space-y-1 text-[12px]">
              {paymentRows.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="font-semibold text-neutral-500">{label} :</dt>
                  <dd>{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: TEAL }}>
              Terms &amp; Conditions
            </p>
            <div className="mt-2 space-y-1 text-[11px] text-neutral-600">
              {terms.length ? (
                terms.slice(0, 4).map((line, index) => <p key={index}>{line}</p>)
              ) : (
                <p>Payment is due within 15 days of the invoice date.</p>
              )}
            </div>
          </div>
          <div className="pt-6">
            <p className="font-[cursive] text-lg text-neutral-800" style={{ fontFamily: "cursive" }}>
              {invoice.customer_name || ""}
            </p>
            <p className="mt-1 w-40 border-t border-neutral-400 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Signature
            </p>
          </div>
        </div>

        <div className="print-avoid-break">
          <dl className="space-y-2 text-[12px]">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Sub Total :</dt>
              <dd className="font-mono">{money(invoice.subtotal, symbol)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Discount :</dt>
              <dd className="font-mono">{money(invoice.discount, symbol)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Tax (0%) :</dt>
              <dd className="font-mono">{money(tax, symbol)}</dd>
            </div>
          </dl>
          <div
            className="mt-3 flex items-center justify-between gap-4 px-4 py-3 text-white"
            style={{ backgroundColor: TEAL }}
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Total</span>
            <span className="font-mono text-lg font-bold">{money(invoice.total, symbol)}</span>
          </div>
          <dl className="mt-3 space-y-2 text-[12px]">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Received :</dt>
              <dd className="font-mono">{money(invoice.received, symbol)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <dt>Remaining :</dt>
              <dd className="font-mono">{money(balance, symbol)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-right text-[11px] text-neutral-500">
            {num(invoice.total_cartons)} carton(s) · {pairs(invoice.total_pairs)}
          </p>
        </div>
      </section>

      {/* Contact strip */}
      <footer className="mt-8 px-6 py-5 text-white" style={{ backgroundColor: TEAL }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em]">Get in Touch</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
          {contact.length ? (
            contact.map((entry, index) => (
              <span key={index} className="flex items-center gap-1.5">
                <entry.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {entry.text}
              </span>
            ))
          ) : (
            <span className="text-white/80">Add your phone, email and address in Settings.</span>
          )}
        </div>
      </footer>
    </article>
  );
}
