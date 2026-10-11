import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical, Layers, Plus, Boxes } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import CategoryForm from "@/components/forms/CategoryForm";
import { base44 } from "@/api/base44Client";
import { ALIVE } from "@/lib/recycle";
import { BUILTIN_CATEGORIES } from "@/lib/rawCategories";
import { rawStockByCategory } from "@/lib/analytics";
import { money, num } from "@/lib/format";

const ICONS = { uppers: Layers, chemicals: FlaskConical };

export default function RawStock() {
  const [custom, setCustom] = useState([]);
  const [totals, setTotals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [categories, stats] = await Promise.all([
      base44.entities.RawCategory.filter(ALIVE, { sort: "sort_order", limit: 100 }),
      rawStockByCategory().catch(() => []),
    ]);
    setCustom(categories?.items || []);
    setTotals(stats);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const statFor = (slug) => totals.find((row) => row.category === slug) || {};
  const categories = [
    ...BUILTIN_CATEGORIES,
    ...custom.map((category) => ({ ...category, builtin: false })),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Raw material"
        title="Raw Stock"
        description="Each category has its own page. Quantities convert into pairs automatically where the material is packed."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New category
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const Icon = ICONS[category.slug] || Boxes;
          const stat = statFor(category.slug);
          return (
            <Link
              key={category.slug}
              to={`/raw-stock/${category.slug}`}
              className="group panel p-5 transition-all hover:border-brand/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                {category.builtin && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Built in
                  </span>
                )}
              </div>
              <p className="mt-3 font-heading text-lg font-bold">{category.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{category.description || `${category.unit_label || "units"}`}</p>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                <div>
                  <p className="eyebrow">Lines</p>
                  <p className="mt-1 font-mono text-sm font-semibold">{num(stat.count)}</p>
                </div>
                <div>
                  <p className="eyebrow">Quantity</p>
                  <p className="mt-1 font-mono text-sm font-semibold">{num(stat.sum_quantity)}</p>
                </div>
                <div>
                  <p className="eyebrow">{category.uses_pairs ? "Pairs" : "Value"}</p>
                  <p className="mt-1 font-mono text-sm font-semibold">
                    {category.uses_pairs ? num(stat.sum_total_pairs) : money(stat.sum_amount)}
                  </p>
                </div>
              </div>

              <p className="mt-4 flex items-center gap-1 text-xs font-semibold text-brand">
                Open {category.name} <ChevronRight className="h-3.5 w-3.5" />
              </p>
            </Link>
          );
        })}
      </div>

      {loading && <p className="mt-4 text-center text-xs text-muted-foreground">Loading categories…</p>}
      {!loading && !categories.length && <p className="mt-4 text-sm text-muted-foreground">No categories yet.</p>}

      <CategoryForm open={formOpen} onOpenChange={setFormOpen} onSaved={load} />
    </div>
  );
}
