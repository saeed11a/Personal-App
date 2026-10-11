import React from "react";
import { ShieldAlert } from "lucide-react";
import { usePermissions } from "@/lib/usePermissions";

// Route guard for a module.
//
// The database is the security boundary — RLS and the posting functions check the
// same permission for every query and write, so reaching a route without access
// shows an empty screen with an error, not data. This guard turns that into a plain
// explanation instead of a failed request.
export default function RequirePermission({ module, action = "view", children }) {
  const { loading, can } = usePermissions();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-brand" />
      </div>
    );
  }

  if (!can(module, action)) {
    return (
      <div className="panel mx-auto mt-10 max-w-lg p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h2 className="mt-3 font-heading text-lg font-bold">No access to this module</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account does not have access to the <span className="font-medium text-foreground">{module.replace("_", " ")}</span> module.
          Ask an administrator to change your access level in Settings → Staff &amp; access.
        </p>
      </div>
    );
  }

  return children;
}
