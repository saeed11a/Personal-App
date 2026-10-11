import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const DIRECTIONS = {
  up: { icon: ArrowUpRight, className: "text-emerald-600 dark:text-emerald-400" },
  down: { icon: ArrowDownRight, className: "text-destructive" },
  flat: { icon: Minus, className: "text-muted-foreground" },
};

export default function SalesCharts({ series = [], symbol = "Rs" }) {
  const hasData = series.some((point) => point.total > 0);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="panel p-5">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Sales by date</h2>
        <p className="mt-1 text-xs text-muted-foreground">Invoice value booked on each day</p>
        <div className="mt-4 h-[240px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={54} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(value) => money(value, symbol)}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="hsl(var(--brand))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No sales recorded yet
            </div>
          )}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Daily sales trend</h2>
        <p className="mt-1 text-xs text-muted-foreground">Day-on-day movement — up or down against the previous day</p>

        {series.length ? (
          <>
            <div className="mt-4 h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    formatter={(value) => money(value, symbol)}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {series.map((point) => (
                      <Cell
                        key={point.label}
                        fill={point.direction === "down" ? "hsl(var(--destructive))" : point.direction === "up" ? "hsl(160 60% 40%)" : "hsl(var(--muted-foreground))"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 max-h-[150px] space-y-1.5 overflow-y-auto pr-1">
              {series
                .slice()
                .reverse()
                .map((point) => {
                  const direction = DIRECTIONS[point.direction] || DIRECTIONS.flat;
                  const Icon = direction.icon;
                  return (
                    <div key={point.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{point.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{money(point.total, symbol)}</span>
                        <span className={cn("flex items-center gap-0.5 text-xs font-semibold", direction.className)}>
                          <Icon className="h-3.5 w-3.5" />
                          {point.delta === 0 ? "0" : money(Math.abs(point.delta), symbol)}
                        </span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Sales trend appears after the first invoice
          </div>
        )}
      </section>
    </div>
  );
}
