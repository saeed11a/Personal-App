
import React from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Factory,
  FileText,
  Layers,
  LayoutDashboard,
  PackageCheck,
  Receipt,
  Recycle,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export const MODULES = [
  { label: "Raw Stock", path: "/raw-stock", icon: Boxes, description: "Uppers, chemicals and custom categories" },
  { label: "Ready Shoes", path: "/ready-shoes", icon: PackageCheck, description: "Finished cartons in the store" },
  { label: "Articles", path: "/articles", icon: Layers, description: "Article numbers synced from Uppers" },
  { label: "Production", path: "/production", icon: Factory, description: "Issue uppers, receive ready cartons" },
  { label: "Purchase", path: "/purchases", icon: ShoppingCart, description: "Buy raw material, credit the supplier" },
  { label: "Invoices", path: "/invoices", icon: FileText, description: "Create and print customer invoices" },
  { label: "Sales", path: "/sales", icon: Receipt, description: "Every invoice and its items" },
  { label: "Customers (Kata)", path: "/customers", icon: Users, description: "Ledger, invoices and receipts" },
  { label: "Suppliers (Kata)", path: "/suppliers", icon: Truck, description: "Purchases, payments and balance" },
  { label: "Payments", path: "/payments", icon: Wallet, description: "Receive from customers, pay suppliers" },
  { label: "Roznamcha", path: "/roznamcha", icon: BookOpen, description: "Daily cash book: in, out and balance" },
  { label: "Kharcha", path: "/kharcha", icon: Wallet, description: "Daily factory expenses" },
  { label: "Reports", path: "/reports", icon: BarChart3, description: "Module-wise reporting with totals" },
  { label: "Settings", path: "/settings", icon: Settings, description: "Company, currency and alert levels" },
  { label: "Recycle Bin", path: "/recycle-bin", icon: Recycle, description: "Restore or permanently delete records" },
];

export default function ModuleGrid() {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <LayoutDashboard className="h-4 w-4 text-brand" />
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em]">Modules</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((module) => (
          <Link
            key={module.path}
            to={module.path}
            className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-brand/40 hover:shadow-sm"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <module.icon className="h-4 w-4" />
            </span>
            <p className="mt-3 font-heading text-sm font-bold">{module.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{module.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
