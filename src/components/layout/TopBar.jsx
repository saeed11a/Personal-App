import React, { useEffect, useState } from "react";
import { LogOut, Menu, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

export default function TopBar({ onOpenNav }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await base44.auth.logout();
    window.location.href = "/login";
  };

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
      <Button variant="ghost" size="icon" onClick={onOpenNav} aria-label="Open navigation" className="lg:hidden">
        <Menu className="h-5 w-5" />
      </Button>
      <p className="flex-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Manufacturing Control
      </p>
      <ThemeToggle />
      <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2 pr-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
          {(user?.full_name || user?.email || "H").charAt(0).toUpperCase()}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-xs font-semibold">
            {user?.full_name || "Factory User"}
          </span>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            {user?.role || "user"}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Log out"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
