import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export const DEFAULT_SETTINGS = {
  company_name: "HIKER Shoes Factory",
  tagline: "Manufacturing & Trading",
  currency: "PKR",
  currency_symbol: "Rs",
  invoice_prefix: "INV",
  low_stock_threshold: 50,
  default_pairs_per_bag: 100,
  default_pairs_per_carton: 24,
  opening_cash: 0,
  address: "",
  phone: "",
  email: "",
  footer_note: "",
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Settings.filter({}, { limit: 1 });
      const record = page?.items?.[0];
      if (record) {
        setRecordId(record.id);
        setSettings({ ...DEFAULT_SETTINGS, ...record });
      } else {
        setRecordId(null);
        setSettings(DEFAULT_SETTINGS);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (values) => {
      if (recordId) {
        await base44.entities.Settings.update(recordId, values);
      } else {
        const created = await base44.entities.Settings.create({ ...DEFAULT_SETTINGS, ...values });
        setRecordId(created.id);
      }
      await load();
    },
    [recordId, load]
  );

  return { settings, loading, save, reload: load };
}
