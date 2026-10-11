import React from "react";
import { BarChart3 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StockReport from "@/components/reports/StockReport";
import PurchaseReport from "@/components/reports/PurchaseReport";
import SalesReport from "@/components/reports/SalesReport";
import PaymentReport from "@/components/reports/PaymentReport";
import RoznamchaReport from "@/components/reports/RoznamchaReport";
import KharchaReport from "@/components/reports/KharchaReport";

const TABS = [
  { value: "stock", label: "Stock", component: StockReport },
  { value: "purchases", label: "Purchases", component: PurchaseReport },
  { value: "sales", label: "Sales", component: SalesReport },
  { value: "payments", label: "Payments", component: PaymentReport },
  { value: "roznamcha", label: "Roznamcha", component: RoznamchaReport },
  { value: "kharcha", label: "Kharcha", component: KharchaReport },
];

export default function Reports() {
  return (
    <div>
      <PageHeader
        eyebrow="Reporting"
        title="Reports"
        description="Module-wise reporting with date filters, live totals and Excel / PDF export."
      />

      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            <tab.component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
