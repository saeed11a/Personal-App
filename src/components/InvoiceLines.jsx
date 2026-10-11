import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARTON_TYPES } from "@/lib/rawCategories";
import { money, pairs } from "@/lib/format";

// Invoice line editor: cartons x pairs per carton, priced per pair.
export default function InvoiceLines({ lines, onChange, articles = [] }) {
  const update = (index, patch) => onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  const remove = (index) => onChange(lines.filter((_, position) => position !== index));
  const add = () => onChange([...lines, { article_code: "", carton_type: CARTON_TYPES[2].label, pairs_per_carton: CARTON_TYPES[2].pairs, cartons: "", price_per_pair: "" }]);

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        const article = articles.find((entry) => entry.code === line.article_code);
        const perCarton = Number(line.pairs_per_carton) || 0;
        const cartons = Number(line.cartons) || 0;
        const linePairs = perCarton > 0 ? cartons * perCarton : Number(line.pairs) || 0;
        const lineTotal = linePairs * (Number(line.price_per_pair) || 0);

        return (
          <div key={index} className="rounded-xl border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={line.article_code}
                onValueChange={(value) => {
                  const picked = articles.find((entry) => entry.code === value);
                  update(index, {
                    article_code: value,
                    price_per_pair: picked?.selling_price || line.price_per_pair,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select article" />
                </SelectTrigger>
                <SelectContent>
                  {articles.map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>
                      {entry.code} · {entry.name} ({entry.available} prs ready)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={line.carton_type}
                onValueChange={(value) =>
                  update(index, {
                    carton_type: value,
                    pairs_per_carton: CARTON_TYPES.find((option) => option.label === value)?.pairs || line.pairs_per_carton,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARTON_TYPES.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1">
                <span className="field-label">Cartons</span>
                <Input
                  type="number"
                  value={line.cartons}
                  onChange={(event) => update(index, { cartons: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label className="space-y-1">
                <span className="field-label">Price per pair</span>
                <Input
                  type="number"
                  value={line.price_per_pair}
                  onChange={(event) => update(index, { price_per_pair: event.target.value })}
                  placeholder="0"
                />
              </label>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {cartons} carton(s) × {perCarton} pairs = <span className="font-mono font-semibold text-foreground">{pairs(linePairs)}</span>
              </span>
              <span className="font-mono font-semibold">{money(lineTotal)}</span>
            </div>
            {article && cartons > 0 && cartons * perCarton > article.available && (
              <p className="mt-1 text-xs font-medium text-destructive">
                Only {article.available} pairs of {article.code} are ready — reduce the cartons.
              </p>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={add} className="w-full">
        <Plus className="mr-2 h-4 w-4" /> Add item
      </Button>
    </div>
  );
}
