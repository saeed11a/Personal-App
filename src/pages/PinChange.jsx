import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import PinKeypad, { PIN_LENGTH, PinDots } from "@/components/PinKeypad";
import { useAuth } from "@/lib/AuthContext";
import { changePin } from "@/lib/pin";
import { useToast } from "@/components/ui/use-toast";

// Changing a PIN always costs the current one — the server checks it (change_pin),
// so knowing the password alone is not enough to replace the PIN.
const TITLES = {
  current: { title: "Enter your current PIN", subtitle: "Confirm it is you before changing it" },
  next: { title: "Choose a new PIN", subtitle: "Five digits you will use from now on" },
  confirm: { title: "Confirm the new PIN", subtitle: "Enter the new five digits once more" },
};

export default function PinChange() {
  const { isAuthenticated, isLoadingAuth, authChecked, pinEnabled, pinRequired, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const restart = (message) => {
    setCurrentPin("");
    setNewPin("");
    setPin("");
    setStep("current");
    setError(message || "");
  };

  const submit = async (current, nextValue) => {
    setBusy(true);
    try {
      const result = await changePin(current, nextValue);
      if (result === "done") {
        toast({ title: "PIN changed", description: "Use the new PIN next time the app is locked." });
        navigate("/", { replace: true });
        return;
      }
      if (result === "wrong_current") restart("That is not your current PIN.");
      else if (result === "locked") restart("Too many incorrect attempts. Try again in a few minutes.");
      else if (result === "invalid_pin") restart("Use exactly five digits.");
      else restart("The PIN could not be changed. Try again.");
    } catch (err) {
      restart(err?.message || "The PIN could not be changed. Try again.");
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

    if (step === "current") {
      setCurrentPin(next);
      setPin("");
      setStep("next");
      return;
    }
    if (step === "next") {
      setNewPin(next);
      setPin("");
      setStep("confirm");
      return;
    }
    if (next !== newPin) {
      restart("Those PINs did not match. Start again.");
      return;
    }
    submit(currentPin, newPin);
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
  if (pinRequired) return <Navigate to="/unlock" replace />;
  if (!pinEnabled) return <Navigate to={user?.role === "admin" ? "/setup-pin" : "/pin-not-issued"} replace />;

  return (
    <AuthLayout
      icon={KeyRound}
      title={TITLES[step].title}
      subtitle={TITLES[step].subtitle}
      footer={
        <button
          type="button"
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Back to the app
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

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Step {step === "current" ? 1 : step === "next" ? 2 : 3} of 3
      </p>
    </AuthLayout>
  );
}
