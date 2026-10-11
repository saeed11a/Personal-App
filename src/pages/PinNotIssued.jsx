import React from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";

// Signed in, but no PIN has been issued for this account. It cannot self-activate:
// PINs are administrator-issued (set_pin), so the account is held here instead of
// being let into the app without a gate.
export default function PinNotIssued() {
  const { isAuthenticated, isLoadingAuth, authChecked, logout, pinEnabled, pinSetupRequired, user } = useAuth();

  if (isLoadingAuth || !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (pinEnabled) return <Navigate to="/unlock" replace />;
  // An administrator without a PIN sets their own: this notice is only for accounts
  // that have to wait for one to be issued.
  if (pinSetupRequired) return <Navigate to="/setup-pin" replace />;

  return (
    <AuthLayout
      icon={ShieldAlert}
      title="Access not activated"
      subtitle="No PIN has been issued for this account"
      footer={
        <button type="button" onClick={() => logout()} className="font-medium text-primary hover:underline">
          Sign out
        </button>
      }
    >
      <p className="text-center text-sm text-muted-foreground">
        A five-digit PIN has to be issued before this account can open the app.
        {user?.email ? ` Ask an administrator to set one for ${user.email}.` : " Ask an administrator to set one."}
      </p>
    </AuthLayout>
  );
}
