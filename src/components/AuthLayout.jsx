import React from "react";
import { Footprints } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-lg">
            <Footprints className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="font-heading text-lg font-extrabold tracking-tight">HIKER</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Shoes Factory ERP
            </p>
          </div>
        </div>

        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-border bg-card p-3">
            <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>

        {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </div>
  );
}
