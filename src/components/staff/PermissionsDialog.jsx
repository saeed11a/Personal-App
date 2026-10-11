import React, { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import FormDialog, { FormError } from "@/components/FormDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  ACCESS_LEVELS,
  DEPARTMENT_DEFAULTS,
  MODULES,
  departmentLabel,
  loadPermissions,
  savePermissions,
} from "@/lib/permissions";

const NO_ACCESS = Object.fromEntries(MODULES.map((module) => [module.key, "none"]));

// One employee's access levels: a preset per module, stored server-side as
// '<module>:<action>' grants that the RLS policies already enforce.
export default function PermissionsDialog({ open, onOpenChange, person, onSaved }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [levels, setLevels] = useState(NO_ACCESS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !person) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    loadPermissions(person.id)
      .then((rows) => {
        if (active) setLevels(rows);
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
  }, [open, person]);

  if (!person) return null;

  const name = person.full_name || person.email;

  // Pasts the department's starting set in; nothing is saved until "Save access".
  const applyDepartmentDefaults = () => {
    const defaults = DEPARTMENT_DEFAULTS[person.department] || {};
    setLevels(Object.fromEntries(MODULES.map((module) => [module.key, defaults[module.key] || "none"])));
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await savePermissions(person.id, levels, user?.id);
      toast({ title: "Access saved", description: `${name} now has the selected access levels.` });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Roles & access levels"
      description={`${name} · ${departmentLabel(person.department) || "No department"}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving ? "Saving…" : "Save access"}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading access levels…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              {person.department
                ? `Start from what ${departmentLabel(person.department)} normally needs.`
                : "Set a department to use its defaults."}
            </p>
            <Button variant="outline" size="sm" onClick={applyDepartmentDefaults} disabled={!person.department}>
              <Wand2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Apply department defaults
            </Button>
          </div>

          <div className="divide-y divide-border">
            {MODULES.map((module) => (
              <div key={module.key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm font-medium text-foreground">{module.label}</span>
                <Select
                  value={levels[module.key] || "none"}
                  onValueChange={(value) => setLevels((prev) => ({ ...prev, [module.key]: value }))}
                >
                  <SelectTrigger className="w-[150px]" aria-label={`${module.label} access`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </>
      )}
    </FormDialog>
  );
}
