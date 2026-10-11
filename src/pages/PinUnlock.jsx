import React, { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { KeyRound, LogOut } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import PinKeypad, { PIN_LENGTH, PinDots } from "@/components/PinKeypad";
import { useAuth } from "@/lib/AuthContext";
import { getPinStatus, verifyPin } from "@/lib/pin";
import { safeReturnTo } from "@/lib/authReturnTo";

// "Locked for 12 minutes" while the server-side lockout is still running.
function lockoutMessage(lockedUntil) {
  if (!lockedUntil) return null;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  if (ms <= 0) return null;
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `Too many incorrect attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export default function PinUnlock() {
  const { isAuthenticated, isLoadingAuth, authChecked, logout, unlock, pinEnabled } = useAuth();
  const navigate = useNavigate();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);

  // An existing lockout (e.g. after a reload) is shown without asking again.
  // Only for a signed-in account: pin_status() is not callable anonymously.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    getPinStatus()
      .then((status) => setLockedUntil(status?.locked_until ?? null))
      .catch(() => {});
    return undefined;
  }, [isAuthenticated]);

  // Release the keypad the moment the lockout expires.
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const ms = new Date(lockedUntil).getTime() - Date.now();
    if (ms <= 0) {
      setLockedUntil(null);
      return undefined;
    }
    const timer = setTimeout(() => setLockedUntil(null), ms);
    return () => clearTimeout(timer);
  }, [lockedUntil]);

  const submit = useCallback(
    async (value) => {
      setChecking(true);
      setError("");
      try {
        const ok = await verifyPin(value);
        if (ok) {
          unlock();
          navigate(safeReturnTo(), { replace: true });
          return;
        }
        const status = await getPinStatus().catch(() => null);
        const locked = status?.locked_until ?? null;
        setLockedUntil(locked);
        setError(lockoutMessage(locked) || "Incorrect PIN. Try again.");
      } catch (err) {
        setError(err?.message || "The PIN could not be checked. Try again.");
      } finally {
        setPin("");
        setChecking(false);
      }
    },
    [navigate, unlock]
  );

  const press = (digit) => {
    if (checking || lockedUntil) return;
    setError("");
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next);
  };

  const backspace = () => {
    if (checking || lockedUntil) return;
    setError("");
    setPin((current) => current.slice(0, -1));
  };

  // Wait for the session to land before judging it (sign-in happens in-page now).
  if (isLoadingAuth || !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // No PIN on the account: the unlock screen has nothing to check, so send the
  // account to first-time setup (administrator) or to the "not issued" notice.
  if (!pinEnabled) return <Navigate to="/setup-pin" replace />;

  const locked = Boolean(lockoutMessage(lockedUntil));
  const disabled = checking || locked;

  return (
    <AuthLayout
      icon={KeyRound}
      title="Enter your PIN"
      subtitle="Five-digit access code"
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

      <PinKeypad onDigit={press} onBackspace={backspace} disabled={disabled} busy={checking} canBackspace={pin.length > 0} />
    </AuthLayout>
  );
}
