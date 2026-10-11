import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("hiker-theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-[264px]">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Outlet />
        </main>
        <footer className="no-print px-4 pb-6 text-center text-[11px] tracking-wide text-muted-foreground sm:px-6 lg:px-10">
          HIKER Shoes Factory ERP · Stock · Production · Sales · Accounts
        </footer>
      </div>
    </div>
  );
}
