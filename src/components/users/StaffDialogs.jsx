import React, { useState } from "react";
import FormDialog, { Field, FormError } from "@/components/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCESS_LEVELS, DEPARTMENTS, MODULES, ROLES } from "@/lib/permissions";
import { createStaffAccount, issuePin, sendPasswordReset } from "@/lib/adminApi";
import { useToast } from "@/components/ui/use-toast";

const NO_ACCESS = Object.fromEntries(MODULES.map((module) => [module.key, "none"]));

// Create a staff account: the Auth user, its profile and its initial access levels.
// The password is only ever sent to the server-side function — it is never stored in
// this browser or in the repository.
export function CreateStaffDialog({ open, onOpenChange, onCreated }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", fullName: "", phone: "", department: "store", role: "user", password: "" });
  const [levels, setLevels] = useState(NO_ACCESS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      if (!form.email.trim()) throw new Error("An email address is required");
      if (form.password && form.password.length < 8) throw new Error("The password must be at least 8 characters");
      await createStaffAccount({ ...form, levels });
      toast({
        title: "Account created",
        description: form.password
          ? `${form.email} can sign in with the password you set.`
          : `${form.email} was created — send them a password reset link to choose a password.`,
      });
      onCreated?.();
      onOpenChange(false);
      setForm({ email: "", fullName: "", phone: "", department: "store", role: "user", password: "" });
      setLevels(NO_ACCESS);
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
      title="New staff account"
      description="Create the account and choose what the employee may access."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create account"}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <Input value={form.email} onChange={(event) => set("email", event.target.value)} type="email" placeholder="name@factory.com" />
        </Field>
        <Field label="Full name">
          <Input value={form.fullName} onChange={(event) => set("fullName", event.target.value)} placeholder="Employee name" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Department">
          <Select value={form.department} onValueChange={(value) => set("department", value)}>
            <SelectTrigger aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((department) => (
                <SelectItem key={department.value} value={department.value}>
                  {department.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={form.role} onValueChange={(value) => set("role", value)}>
            <SelectTrigger aria-label="Role">
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
        <Field label="Initial password (optional)">
          <Input
            value={form.password}
            onChange={(event) => set("password", event.target.value)}
            type="password"
            placeholder="Leave blank to send a reset link"
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border bg-muted/40 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Module access</p>
        </div>
        <div className="max-h-[320px] divide-y divide-border overflow-y-auto px-3">
          {MODULES.map((module) => (
            <div key={module.key} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm font-medium text-foreground">{module.label}</span>
              <Select value={levels[module.key] || "none"} onValueChange={(value) => setLevels((prev) => ({ ...prev, [module.key]: value }))}>
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
      </div>
    </FormDialog>
  );
}

// Edit the permitted profile details of an account.
export function EditStaffDialog({ open, onOpenChange, person, onSave }) {
  const [form, setForm] = useState({
    full_name: person?.full_name || "",
    phone: person?.phone || "",
    department: person?.department || "unset",
    role: person?.role || "user",
    status: person?.status || "active",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (!person) return;
    setForm({
      full_name: person.full_name || "",
      phone: person.phone || "",
      department: person.department || "unset",
      role: person.role || "user",
      status: person.status || "active",
    });
    setError("");
  }, [person]);

  if (!person) return null;

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(person.id, {
        full_name: form.full_name,
        phone: form.phone,
        department: form.department === "unset" ? "" : form.department,
        role: form.role,
        status: form.status,
      });
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
      title="Edit account"
      description={person.email}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
        </Field>
        <Field label="Department">
          <Select value={form.department} onValueChange={(value) => setForm((prev) => ({ ...prev, department: value }))}>
            <SelectTrigger aria-label="Department">
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
          <Select value={form.role} onValueChange={(value) => setForm((prev) => ({ ...prev, role: value }))}>
            <SelectTrigger aria-label="Role">
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
        <Field label="Status">
          <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </FormDialog>
  );
}

// Issue or reset another account's five-digit PIN. The PIN is hashed server-side and
// never read back — an existing PIN can never be displayed.
export function PinDialog({ open, onOpenChange, person, onDone }) {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!person) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!/^[0-9]{5}$/.test(pin)) {
      setError("The PIN must be exactly five digits.");
      return;
    }
    setSaving(true);
    try {
      await issuePin(person.id, pin);
      toast({ title: "PIN set", description: `${person.full_name || person.email} can now unlock with the new PIN.` });
      setPin("");
      onDone?.();
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
      title="Issue or reset PIN"
      description={`${person.full_name || person.email} · ${person.has_pin ? "replace the existing five-digit PIN" : "set a first PIN"}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Set PIN"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <Field label="Five-digit PIN">
          <Input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="•••••"
            className="tracking-[0.5em]"
          />
        </Field>
        <p className="mt-2 text-xs text-muted-foreground">
          Only the salted hash is stored. The PIN can never be read back once set.
        </p>
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto p-0 text-xs"
          onClick={async () => {
            try {
              await sendPasswordReset(person.email);
              toast({ title: "Reset link sent", description: `A password reset link was emailed to ${person.email}.` });
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Send a password reset link instead
        </Button>
      </form>
    </FormDialog>
  );
}
