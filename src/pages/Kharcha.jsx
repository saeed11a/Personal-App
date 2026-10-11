import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import DeleteDialog from "@/components/DeleteDialog";
import ExportButtons from "@/components/ExportButtons";
import DateRangeFilter from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import ExpenseForm from "@/components/forms/ExpenseForm";
import { base44 } from "@/api/base44Client";
import { ALIVE, softDelete } from "@/lib/recycle";
import { useSettings } from "@/lib/useSettings";
import { money, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";

export default function Kharcha() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const query = { ...ALIVE, source: "kharcha" };
    if (from || to) {
      query.entry_date = {};
      if (from) query.entry_date.$gte = from;
      if (to) query.entry_date.$lte = to;
    }
    const page = await base44.entities.Roznamcha.filter(query, { sort: "-entry_date", limit: 100 });
    setRows(page?.items || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const byCategory = Array.from(
    rows
      .reduce((map, row) => {
        const key = row.category || "Uncategorised";
        map.set(key, (map.get(key) || 0) + (Number(row.amount) || 0));
        return map;
      }, new Map())
      .entries()
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const columns = [
    { key: "entry_date", label: "Date", render: (row) => shortDate(row.entry_date) },
    { key: "description", label: "Expense", render: (row) => <span className="font-medium">{row.description}</span> },
    { key: "category", label: "Category", render: (row) => row.category || "—" },
    { key: "amount", label: "Amount", numeric: true, render: (row) => <span className="font-semibold">{money(row.amount, settings.currency_symbol)}</span> },
  ];

  const confirmDelete = async () => {
    await softDelete("Roznamcha", pendingDelete.id);
    toast({ title: "Moved to Recycle Bin", description: "The expense is removed from the daily total." });
    setPendingDelete(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Daily expenses"
        title="Kharcha"
        description="Simple list of daily factory expenses — every entry also flows into the roznamcha as cash out."
        actions={
          <>
            <ExportButtons
              filename="kharcha"
              title="Kharcha"
              subtitle={settings.company_name}
              columns={columns.map((column) => ({ label: column.label, key: column.key, value: (row) => column.render(row) }))}
              rows={rows}
            />
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New expense
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total spend" value={money(total, settings.currency_symbol)} accent />
        <KpiCard label="Entries" value={rows.length} />
        <KpiCard label="Categories" value={byCategory.length} />
        <KpiCard
          label="Average entry"
          value={money(rows.length ? total / rows.length : 0, settings.currency_symbol)}
        />
      </div>

      <div className="mt-6">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          emptyLabel="No expenses in this period"
          emptyHint="Log diesel, wages, transport and other daily costs."
          actions={(row) => (
            <RowActions
              onEdit={() => {
                setEditing(row);
                setFormOpen(true);
              }}
              onDelete={() => setPendingDelete(row)}
            />
          )}
        />

        <section className="panel h-fit p-5">
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Spend by category</h2>
          {(byCategory.length ? byCategory : []).length ? (
            <ul className="mt-4 space-y-2">
              {byCategory.map((entry) => (
                <li key={entry.category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{entry.category}</span>
                  <span className="font-mono font-semibold">{money(entry.amount, settings.currency_symbol)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No expenses recorded yet.</p>
          )}
        </section>
      </div>

      <ExpenseForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={load} />
      <DeleteDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Move this expense to the Recycle Bin?"
        description={pendingDelete ? `${pendingDelete.description} · ${money(pendingDelete.amount, settings.currency_symbol)} will stop counting.` : ""}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
