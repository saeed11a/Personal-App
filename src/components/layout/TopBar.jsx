import React from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import LiveClock from "@/components/layout/LiveClock";
import ConnectionStatus from "@/components/layout/ConnectionStatus";
import ProfileMenu from "@/components/layout/ProfileMenu";

// Top bar: the HIKER+ mark, the live factory clock, the backend connection
// indicator, the theme switch and the account menu. Everything that acts on the
// signed-in account lives behind ProfileMenu. All of it is screen-only chrome
// (`no-print`), and it never scrolls away.
export default function TopBar({ onOpenNav }) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-1.5 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:gap-3 sm:px-6 lg:px-10">
      <Button variant="ghost" size="icon" onClick={onOpenNav} aria-label="Open navigation" className="lg:hidden">
        <Menu className="h-5 w-5" />
      </Button>

      <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="HIKER+ home">
        {/* The mark is shown from `sm` up; on the narrowest phones the wordmark,
            the clock, the status dot and the account menu need the width more. */}
        <img src="/hiker-logo.png" alt="" className="hidden h-8 w-8 shrink-0 rounded-lg object-contain sm:block" />
        <span className="font-heading text-base font-extrabold tracking-tight sm:text-lg">
          HIKER<span className="text-brand">+</span>
        </span>
      </Link>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
        <LiveClock />
        <ConnectionStatus />
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}
