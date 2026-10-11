import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { KeyRound, LogOut } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import PinKeypad, { PIN_LENGTH, PinDots } from "@/components/PinKeypad";
import { useAuth } from "@/lib/AuthContext";
import { setupPin } from "@/lib/pin";

// First-time PIN setup for the authenticated administrator: choose five digits,
// then confirm them. Nothing is stored in the browser — the PIN goes straight to
// setup_pin(), which hashes it in the database with a fresh salt. The account is
// left to unlock with the new PIN on /unlock, so the gate is proven to work.
export default function PinSetup() {
  const { isAuthenticated, isLoadingAuth, authChecked, logout, pinEnabled, pinSetupRequired, refreshPinStatus } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("new");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const restart = (message) => {
    setFirstPin("");
    setPin("");
    setStep("new");
    setError(message || "");
  };

  const submit = async (value) => {
    setBusy(true);
    try {
      const result = await setupPin(value);
      if (result === "done" || result === "already_set") {
        await refreshPinStatus();
        navigate("/unlock", { replace: true });
        return;
      }
      if (result === "invalid_pin") restart("Use exactly five digits.");
      else if (result === "not_allowed") restart("This account cannot set its own PIN. Ask an administrator.");
      else restart("The PIN could not be saved. Try again.");
    } catch (err) {
      restart(err?.message || "The PIN could not be saved. Try again.");
    } finally {
      setPin("");
      setBusy(false);
    }
  };

  const press = (digit) => {
    if (busy) return;
    setError("");
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length !== PIN_LENGTH) return;

    if (step === "new") {
      setFirstPin(next);
      setPin("");
      setStep("confirm");
      return;
    }

    if (next !== firstPin) {
      restart("Those PINs did not match. Start again.");
      return;
    }
    submit(next);
  };

  const backspace = () => {
    if (busy) return;
    setError("");
    setPin((current) => current.slice(0, -1));
  };

  if (isLoadingAuth || !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (pinEnabled) return <Navigate to="/unlock" replace />;
  if (!pinSetupRequired) return <Navigate to="/pin-not-issued" replace />;

  return (
    <AuthLayout
      icon={KeyRound}
      title={step === "new" ? "Create your PIN" : "Confirm your PIN"}
      subtitle={
        step === "new"
          ? "Choose five digits you will use to unlock the app"
          : "Enter the same five digits once more"
      }
      footer={
        <button
          type="button"
          onClick={() => logout()}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <LogOut className="h-3 w-3" aria-hidden="true" />
          Sign out instead
        </button>
      }
    >
      <PinDots length={pin.length} />

      {error && (
        <div role="alert" className="mb-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <PinKeypad onDigit={press} onBackspace={backspace} disabled={busy} busy={busy} canBackspace={pin.length > 0} />
    </AuthLayout>
  );
}
