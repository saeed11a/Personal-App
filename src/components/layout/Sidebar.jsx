import React from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Coins,
  Database,
  Factory,
  FileText,
  HardDriveDownload,
  Layers,
  LayoutDashboard,
  PackageCheck,
  Receipt,
  Recycle,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/usePermissions";

// Every entry names the module whose access level hides it. The level comes from the
// database (user_permissions, read by usePermissions) — the menu matches what RLS
// will allow, it is not the thing that secures it. The same module gates the route
// in App.jsx, so a typed-in URL cannot reach a module the menu hides.
const GROUPS = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard, module: "dashboard" }],
  },
  {
    label: "Stock",
    items: [
      { label: "Raw Stock", path: "/raw-stock", icon: Boxes, module: "raw_stock" },
      { label: "Ready Shoes", path: "/ready-shoes", icon: PackageCheck, module: "ready_shoes" },
      { label: "Articles", path: "/articles", icon: Layers, module: "articles" },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Production", path: "/production", icon: Factory, module: "production" },
      { label: "Labour", path: "/labour", icon: Wrench, module: "labour" },
      { label: "Purchase", path: "/purchases", icon: ShoppingCart, module: "purchase" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Invoices", path: "/invoices", icon: FileText, module: "invoices" },
      { label: "Sales", path: "/sales", icon: Receipt, module: "sales" },
      { label: "Customers", path: "/customers", icon: Users, module: "customers" },
    ],
  },
  {
    label: "Accounts",
    items: [
      { label: "Suppliers", path: "/suppliers", icon: Truck, module: "suppliers" },
      { label: "Payments", path: "/payments", icon: Wallet, module: "payments" },
      { label: "Roznamcha", path: "/roznamcha", icon: BookOpen, module: "roznamcha" },
      { label: "Kharcha", path: "/kharcha", icon: Coins, module: "kharcha" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Reports", path: "/reports", icon: BarChart3, module: "reports" },
      { label: "Settings", path: "/settings", icon: Settings, module: "settings" },
      { label: "Recycle Bin", path: "/recycle-bin", icon: Recycle, module: "recycle_bin" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Database Center", path: "/database-center", icon: Database, module: "database_center" },
      { label: "Backup & Restore", path: "/database-center?tab=backup", icon: HardDriveDownload, module: "backup" },
      { label: "Users", path: "/users", icon: UserCog, module: "users" },
    ],
  },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { can } = usePermissions();

  // A module the account cannot view is not offered; an empty group disappears with it.
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.module || can(item.module)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col overflow-y-auto bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-6">
          <div className="flex items-center gap-3">
            <img
              src="/hiker-logo.png"
              alt="HIKER+"
              className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain shadow-lg"
            />
            
            <div className="leading-tight">
              <p className="font-heading text-lg font-extrabold tracking-tight text-white">HIKER</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/60">
                Shoes Factory ERP
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation"
            className="h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-4 px-3 pb-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand text-brand-foreground shadow-sm"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-4 pb-5">
          <div className="rounded-xl bg-sidebar-accent/70 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
              Automatic postings
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Stock · Kata · Roznamcha</p>
            <p className="text-xs text-sidebar-foreground/60">
              Production, purchases, invoices and payments update every module.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
