import React, { useEffect, useState } from "react";
import { Banknote, BookOpen, Boxes, Factory, PackageCheck, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import ModuleGrid from "@/components/dashboard/ModuleGrid";
import SalesCharts from "@/components/dashboard/SalesCharts";
import StockAlerts from "@/components/dashboard/StockAlerts";
import { useSettings } from "@/lib/useSettings";
import { articleStockMap, cashStats, invoiceStats, salesSeries, trendWithDeltas, lowStockAlerts } from "@/lib/analytics";
import { money, pairs } from "@/lib/format";

export default function Dashboard() {
  const { settings } = useSettings();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      invoiceStats().catch(() => null),
      cashStats().catch(() => null),
      articleStockMap().catch(() => new Map()),
      salesSeries({ unit: "day" }).catch(() => []),
    ]).then(([invoices, cash, stock, series]) => {
      if (!active) return;
      let uppers = 0;
      let ready = 0;
      stock.forEach((entry) => {
        uppers += entry.uppers_available;
        ready += entry.ready_available;
      });
      setStats({
        invoices,
        cash,
        uppers,
        ready,
        series: trendWithDeltas(series.slice(-14)).map((point) => ({ ...point, label: String(point.date).slice(5) })),
        alerts: [],
        stock,
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!stats) return;
    lowStockAlerts(settings.low_stock_threshold, stats.stock).then((alerts) =>
      setStats((prev) => (prev ? { ...prev, alerts } : prev))
    );
  }, [settings.low_stock_threshold, stats?.stock]);

  const symbol = settings.currency_symbol || "Rs";
  const invoices = stats?.invoices;
  const cash = stats?.cash;

  return (
    <div>
      <PageHeader
        eyebrow={settings.company_name}
        title="Factory dashboard"
        description="Live position of stock, production, sales and cash across every module."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sales invoiced" value={money(invoices?.total || 0, symbol)} hint={`${invoices?.count || 0} invoice(s)`} icon={Receipt} accent />
        <KpiCard label="Receivable" value={money(invoices?.balance || 0, symbol)} hint="Outstanding from customers" icon={TrendingUp} />
        <KpiCard label="Cash in hand" value={money(cash?.remaining || 0, symbol)} hint={`In ${money(cash?.cashIn || 0, symbol)} · Out ${money(cash?.cashOut || 0, symbol)}`} icon={Banknote} />
        <KpiCard label="Kharcha" value={money(cash?.kharcha || 0, symbol)} hint="Daily expenses paid" icon={TrendingDown} />
        <KpiCard label="Uppers in factory" value={pairs(stats?.uppers || 0)} hint="Available for production" icon={Boxes} />
        <KpiCard label="Ready shoes" value={pairs(stats?.ready || 0)} hint="Available to invoice" icon={PackageCheck} />
        <KpiCard label="Pairs sold" value={pairs(invoices?.pairs || 0)} hint="Through invoices" icon={Factory} />
        <KpiCard label="Cash book entries" value={cash?.rows?.length || 0} hint="Roznamcha directions recorded" icon={BookOpen} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SalesCharts series={stats?.series || []} symbol={symbol} />
        <StockAlerts alerts={stats?.alerts || []} threshold={settings.low_stock_threshold} />
      </div>

      <div className="mt-6">
        <ModuleGrid />
      </div>

      {loading && <p className="mt-4 text-center text-xs text-muted-foreground">Refreshing figures…</p>}
    </div>
  );
}
