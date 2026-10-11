import { useCallback, useEffect, useState } from "react";
import { createSettings, loadSettings, updateSettings } from "@/lib/settingsApi";

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
  bank_account_no: "",
  bank_account_name: "",
  bank_branch: "",
  terms: "",
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const record = await loadSettings();
      if (record) {
        setRecordId(record.id);
        setSettings({ ...DEFAULT_SETTINGS, ...record });
      } else {
        setRecordId(null);
        setSettings(DEFAULT_SETTINGS);
      }
    } catch {
      // Settings are presentation defaults, not business data: a backend that
      // cannot answer (no record yet, or no permission to read the row) must not
      // take the screen down. The shipped defaults already cover every field.
      setRecordId(null);
      setSettings(DEFAULT_SETTINGS);
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
        await updateSettings(recordId, values);
      } else {
        const created = await createSettings({ ...DEFAULT_SETTINGS, ...values });
        setRecordId(created.id);
      }
      await load();
    },
    [recordId, load]
  );

  return { settings, loading, save, reload: load };
}
