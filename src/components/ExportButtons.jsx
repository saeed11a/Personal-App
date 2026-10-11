import React, { useState } from "react";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCSV, printReport } from "@/lib/reportExport";

export default function ExportButtons({ filename, title, subtitle, columns, rows = [], loadRows }) {
  const [busy, setBusy] = useState(false);

  const withRows = async (action) => {
    setBusy(true);
    try {
      const data = loadRows ? await loadRows() : rows;
      action(data || []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => withRows((data) => downloadCSV(filename, columns, data))}>
        {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />}
        Excel / CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => withRows((data) => printReport({ title, subtitle, columns, rows: data }))}
      >
        <Printer className="mr-2 h-3.5 w-3.5" />
        PDF / Print
      </Button>
    </div>
  );
}
