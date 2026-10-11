import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Settings2, Shuffle, Wallet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import RowActions from "@/components/RowActions";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import PaymentForm from "@/components/forms/PaymentForm";
import {
  CategoryManager,
  CompleteDialog,
  LabourForm,
  MoveStageDialog,
  ProductionDialog,
  StatementDialog,
} from "@/components/labour/LabourDialogs";
import { useSettings } from "@/lib/useSettings";
import { money, pairs, shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { reversePayment } from "@/lib/accounting";
import { listLabourAccounts, listLabourBalances, listLabourCategories, listProduction } from "@/lib/labour";

// Labour module: who works in which stage, what they were given, what is still
// pending, what they earned, and what they have been paid. Quantities, rates and
// money are all decided by the database functions (0006) — this screen asks and shows.
export default function Labour() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const currency = settings.currency_symbol || "Rs";

  const [balances, setBalances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [production, setProduction] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [completeEntry, setCompleteEntry] = useState(null);
  const [moveEntry, setMoveEntry] = useState(null);
  const [statementFor, setStatementFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [reverseFor, setReverseFor] = useState(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, labourAccounts, stageCategories, entries] = await Promise.all([
        listLabourBalances(),
        listLabourAccounts(),
        listLabourCategories({ includeInactive: true }),
        listProduction({ limit: 200 }),
      ]);
      setBalances(rows || []);
      setAccounts(labourAccounts || []);
      setCategories(stageCategories || []);
      setProduction(entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categoryName = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const labourName = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  const totals = useMemo(
    () =>
      balances.reduce(
        (sum, row) => ({
          earned: sum.earned + Number(row.earned || 0),
          paid: sum.paid + Number(row.paid || 0),
          advance: sum.advance + Number(row.advance || 0),
          pending: sum.pending + Number(row.pending_pairs || 0),
          outstanding: sum.outstanding + Math.max(Number(row.outstanding || 0), 0),
        }),
        { earned: 0, paid: 0, advance: 0, pending: 0, outstanding: 0 }
      ),
    [balances]
  );

  const confirmReverse = async () => {
    setReversing(true);
    try {
      await reversePayment(reverseFor.raw_id, reverseReason);
      toast({ title: "Payment reversed", description: "A linked opposite entry now sits in the labour ledger and the cash book." });
      setReverseFor(null);
      setReverseReason("");
      await load();
      setStatementFor((current) => (current ? { ...current } : current));
    } catch (err) {
      toast({ title: "Could not reverse", description: err.message, variant: "destructive" });
    } finally {
      setReversing(false);
    }
  };

  const accountColumns = [
    {
      key: "name",
      label: "Labour",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.categories || "No stage assigned"}</p>
        </div>
      ),
    },
    { key: "phone", label: "Phone", render: (row) => row.phone || "—" },
    { key: "earned", label: "Earned", numeric: true, render: (row) => money(row.earned, currency) },
    { key: "paid", label: "Paid", numeric: true, render: (row) => money(row.paid, currency) },
    {
      key: "balance",
      label: "Balance",
      numeric: true,
      render: (row) =>
        Number(row.advance) > 0 ? (
          <StatusPill tone="warning">Advance {money(row.advance, currency)}</StatusPill>
        ) : (
          <span className="font-semibold">{money(row.outstanding, currency)}</span>
        ),
    },
    { key: "pending_pairs", label: "Pending", numeric: true, render: (row) => pairs(row.pending_pairs) },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <StatusPill tone={row.status === "active" ? "success" : "muted"}>{row.status === "active" ? "Active" : "Inactive"}</StatusPill>
      ),
    },
  ];

  const productionColumns = [
    { key: "production_date", label: "Date", render: (row) => shortDate(row.production_date) },
    { key: "labour", label: "Labour", render: (row) => labourName.get(row.labour_id) || "—" },
    { key: "category", label: "Stage", render: (row) => categoryName.get(row.category_id) || "—" },
    { key: "article_code", label: "Article", render: (row) => row.article_code || "—" },
    { key: "pairs_received", label: "Received", numeric: true, render: (row) => pairs(row.pairs_received) },
    { key: "pairs_completed", label: "Completed", numeric: true, render: (row) => pairs(row.pairs_completed) },
    {
      key: "pairs_pending",
      label: "Pending",
      numeric: true,
      render: (row) =>
        Number(row.pairs_pending) > 0 ? <StatusPill tone="warning">{pairs(row.pairs_pending)}</StatusPill> : <span className="text-muted-foreground">Done</span>,
    },
    { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Workforce"
        title="Labour"
        description="Stages, per-pair rates, work received and completed, earnings, advances and payments — with every payment posting to the roznamcha."
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" /> Categories
            </Button>
            <Button variant="outline" onClick={() => setProductionOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Record production
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New labour
            </Button>
          </>
        }
      />

      <p className="mb-3 text-xs text-muted-foreground">
        Default stages: {categories.filter((category) => category.active).map((category) => category.name).join(" · ") || "—"}
      </p>

      <FormError message={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Earned" value={money(totals.earned, currency)} hint="From completed work" accent />
        <KpiCard label="Paid" value={money(totals.paid, currency)} hint="Including advances" />
        <KpiCard label="Outstanding" value={money(totals.outstanding, currency)} hint="Owed to labour" />
        <KpiCard label="Advances" value={money(totals.advance, currency)} hint="Paid ahead of earnings" />
        <KpiCard label="Pairs pending" value={pairs(totals.pending)} hint="Still in a stage" />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-[0.14em]">Labour accounts</h2>
        <DataTable
          columns={accountColumns}
          rows={balances}
          loading={loading}
          emptyLabel="No labour accounts yet"
          emptyHint="Add a labour, pick the stages they work in and set their per-pair rate."
          actions={(row) => (
            <RowActions
              onEdit={() => {
                setEditing(accounts.find((account) => account.id === row.labour_id) || { id: row.labour_id, name: row.name });
                setFormOpen(true);
              }}
              extra={
                <>
                  <Button size="sm" variant="ghost" onClick={() => setStatementFor({ id: row.labour_id, name: row.name })}>
                    Statement
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    aria-label="Record payment"
                    onClick={() => setPayFor({ id: row.labour_id, name: row.name })}
                  >
                    <Wallet className="h-3.5 w-3.5" />
                  </Button>
                </>
              }
            />
          )}
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-[0.14em]">Production and stage movement</h2>
        <DataTable
          columns={productionColumns}
          rows={production}
          loading={loading}
          emptyLabel="No production recorded"
          emptyHint="Record the pairs handed to a labour for a stage."
          actions={(row) => (
            <RowActions
              extra={
                <>
                  {Number(row.pairs_pending) > 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Complete production"
                      onClick={() => setCompleteEntry(row)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {Number(row.pairs_pending) > 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Move to next stage"
                      onClick={() => setMoveEntry(row)}
                    >
                      <Shuffle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              }
            />
          )}
        />
      </section>

      <LabourForm
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        categories={categories}
        onSaved={() => {
          toast({ title: "Labour saved" });
          load();
        }}
      />

      <CategoryManager
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
        onSaved={load}
      />

      <ProductionDialog
        open={productionOpen}
        onOpenChange={setProductionOpen}
        accounts={accounts}
        categories={categories}
        onSaved={(result) => {
          toast({
            title: result?.duplicate ? "Already recorded" : "Production recorded",
            description: result?.duplicate ? "That entry already existed — nothing was added twice." : undefined,
          });
          load();
        }}
      />

      <CompleteDialog
        open={!!completeEntry}
        onOpenChange={(open) => !open && setCompleteEntry(null)}
        entry={completeEntry}
        categoryName={categoryName.get(completeEntry?.category_id)}
        onSaved={(result) => {
          toast({
            title: `Completed ${pairs(result?.pairs)}`,
            description: result?.amount ? `Earned ${money(result.amount, currency)} at ${money(result.rate, currency)} per pair.` : undefined,
          });
          load();
        }}
      />

      <MoveStageDialog
        open={!!moveEntry}
        onOpenChange={(open) => !open && setMoveEntry(null)}
        entry={moveEntry}
        categories={categories}
        categoryName={categoryName.get(moveEntry?.category_id)}
        onSaved={() => {
          toast({ title: "Work moved", description: "Pending pairs are now in the next stage — no extra earning was created." });
          load();
        }}
      />

      <StatementDialog
        open={!!statementFor}
        onOpenChange={(open) => !open && setStatementFor(null)}
        account={statementFor}
        currency={currency}
        onPay={(account) => {
          setStatementFor(null);
          setPayFor(account);
        }}
        onReversed={(row) => setReverseFor(row)}
      />

      <PaymentForm
        open={!!payFor}
        onOpenChange={(open) => !open && setPayFor(null)}
        initial={payFor ? { account_type: "labour", account_id: payFor.id, account_name: payFor.name } : undefined}
        onSaved={() => {
          toast({ title: "Labour payment posted", description: "The labour ledger and the roznamcha were updated together." });
          load();
        }}
      />

      <FormDialog
        open={!!reverseFor}
        onOpenChange={(open) => !open && setReverseFor(null)}
        title="Reverse this payment?"
        description="The payment stays in the ledger, marked reversed, and an opposite entry is posted to the cash book. Nothing is deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setReverseFor(null)} disabled={reversing}>
              Cancel
            </Button>
            <Button onClick={confirmReverse} disabled={reversing}>
              {reversing ? "Reversing…" : "Confirm reversal"}
            </Button>
          </>
        }
      >
        <Field label="Reason (kept with the reversal)">
          <Input value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder="e.g. wrong amount entered" />
        </Field>
      </FormDialog>
    </div>
  );
}
