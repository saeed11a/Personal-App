import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { usesSupabaseAuth } from "@/lib/authMode";
import { DEPARTMENTS, ROLES, loadStaff, updateStaffProfile } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormError } from "@/components/FormDialog";
import PermissionsDialog from "@/components/staff/PermissionsDialog";
import { useToast } from "@/components/ui/use-toast";

// Administrator-only: set each employee's department and role, then their access
// levels per module. Rendered inside Settings; hidden for everyone else.
export default function StaffPermissions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const canManage = usesSupabaseAuth && user?.role === "admin";

  useEffect(() => {
    if (!canManage) return undefined;
    let active = true;
    setLoading(true);
    loadStaff()
      .then((rows) => {
        if (active) setStaff(rows);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManage]);

  if (!canManage) return null;

  const setField = async (person, patch) => {
    setError("");
    try {
      await updateStaffProfile(person.id, patch);
      setStaff((prev) => prev.map((row) => (row.id === person.id ? { ...row, ...patch } : row)));
      toast({ title: "Saved", description: `${person.full_name || person.email} updated.` });
    } catch (err) {
      setError(err.message);
    }
  };

  const isSelf = (person) => person.id === user?.id;

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Staff &amp; access</h2>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Pick a department and role for each employee, then their access levels per module. Access is enforced in the
        database, not just hidden in the menu.
      </p>

      <div className="mt-4">
        <FormError message={error} />
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading employees…</p>
      ) : staff.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          No employees yet. Create their account in Supabase (Authentication → Users), then set the department and
          access levels here.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {staff.map((person) => (
            <div key={person.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{person.full_name || person.email}</p>
                <p className="truncate text-xs text-muted-foreground">{person.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:w-[360px] lg:shrink-0">
                <Field label="Department">
                  <Select
                    value={person.department || "unset"}
                    onValueChange={(value) => setField(person, { department: value === "unset" ? "" : value })}
                  >
                    <SelectTrigger aria-label={`Department for ${person.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Not set</SelectItem>
                      {DEPARTMENTS.map((department) => (
                        <SelectItem key={department.value} value={department.value}>
                          {department.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Role">
                  <Select
                    value={person.role || "user"}
                    disabled={isSelf(person)}
                    onValueChange={(value) => setField(person, { role: value })}
                  >
                    <SelectTrigger aria-label={`Role for ${person.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Button variant="outline" className="lg:shrink-0" onClick={() => setEditing(person)}>
                Access levels
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PermissionsDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          person={editing}
        />
      )}
    </section>
  );
}
