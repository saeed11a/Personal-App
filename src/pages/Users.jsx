import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Mail, Pencil, Plus, ShieldCheck, UserCog, UserX } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import StatusPill from "@/components/StatusPill";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { listAdminUsers, sendPasswordReset } from "@/lib/adminApi";
import { departmentLabel, roleLabel, updateStaffProfile } from "@/lib/permissions";
import PermissionsDialog from "@/components/staff/PermissionsDialog";
import { CreateStaffDialog, EditStaffDialog, PinDialog } from "@/components/users/StaffDialogs";
import { formatAppStamp } from "@/lib/datetime";

// Administrator-only staff account management: create accounts, edit their details,
// assign per-module access, activate or deactivate, and issue or reset PINs. Every
// write goes through a server-side function that re-checks the caller is an
// administrator and writes an audit row.
export default function Users() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [accounts, setAccounts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [permitting, setPermitting] = useState(null);
  const [pinning, setPinning] = useState(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminUsers();
      setAccounts(rows);
      const { data } = await supabase
        .from("audit_logs")
        .select("id, actor_email, action, entity_id, details, success, created_date")
        .eq("module", "users")
        .order("created_date", { ascending: false })
        .limit(15);
      setActivity(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) {
    return (
      <div className="panel mx-auto mt-10 max-w-lg p-6 text-center">
        <ShieldCheck className="mx-auto h-5 w-5 text-muted-foreground" />
        <h2 className="mt-3 font-heading text-lg font-bold">Administrators only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff accounts and permissions can only be managed by an administrator. This is enforced on the server, not
          just by hiding the menu.
        </p>
      </div>
    );
  }

  const saveAccount = async (id, patch) => {
    await updateStaffProfile(id, patch);
    toast({ title: "Saved", description: "Account updated." });
    await load();
  };

  const toggleStatus = async (person) => {
    const next = person.status === "active" ? "disabled" : "active";
    try {
      await updateStaffProfile(person.id, { status: next });
      toast({
        title: next === "active" ? "Account activated" : "Account deactivated",
        description: `${person.full_name || person.email} is now ${next}.`,
      });
      await load();
    } catch (err) {
      toast({ title: "Could not change status", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Create staff accounts, set their department, role and module access, and issue their PINs. Passwords and PINs are never stored in plain text."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New staff account
          </Button>
        }
      />

      {error && <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading accounts…
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((person) => {
            const self = person.id === user?.id;
            return (
              <div key={person.id} className="panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{person.full_name || person.email}</p>
                    <StatusPill tone={person.role === "admin" ? "brand" : "muted"}>{roleLabel(person.role)}</StatusPill>
                    <StatusPill tone={person.status === "active" ? "success" : "danger"}>
                      {person.status === "active" ? "Active" : "Deactivated"}
                    </StatusPill>
                    {person.has_pin ? <StatusPill tone="muted">PIN set</StatusPill> : <StatusPill tone="warning">No PIN</StatusPill>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {person.email} · {departmentLabel(person.department) || "No department"}
                    {person.last_login_at ? ` · last signed in ${formatAppStamp(person.last_login_at)}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 lg:shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setPermitting(person)}>
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Access
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPinning(person)}>
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> PIN
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(person)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await sendPasswordReset(person.email);
                        toast({ title: "Reset link sent", description: `Emailed ${person.email}.` });
                      } catch (err) {
                        toast({ title: "Could not send link", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Reset password
                  </Button>
                  <Button
                    variant={person.status === "active" ? "outline" : "default"}
                    size="sm"
                    disabled={self}
                    title={self ? "You cannot deactivate your own account" : undefined}
                    onClick={() => toggleStatus(person)}
                  >
                    <UserX className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {person.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            );
          })}

          {accounts.length === 0 && (
            <p className="panel p-5 text-sm text-muted-foreground">
              No staff accounts yet. Create one above, or invite someone from Supabase Authentication.
            </p>
          )}
        </div>
      )}

      <section className="panel mt-6 p-5">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-brand" aria-hidden="true" />
          <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Recent account activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No account changes recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {activity.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="text-foreground">
                  <span className="font-medium">{row.action}</span>
                  {row.actor_email ? ` · ${row.actor_email}` : ""}
                </span>
                <span className="text-muted-foreground">{formatAppStamp(row.created_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateStaffDialog open={creating} onOpenChange={setCreating} onCreated={load} />
      {editing && <EditStaffDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} person={editing} onSave={saveAccount} />}
      {permitting && (
        <PermissionsDialog open={Boolean(permitting)} onOpenChange={(open) => !open && setPermitting(null)} person={permitting} onSaved={load} />
      )}
      {pinning && <PinDialog open={Boolean(pinning)} onOpenChange={(open) => !open && setPinning(null)} person={pinning} onDone={load} />}
    </>
  );
}
