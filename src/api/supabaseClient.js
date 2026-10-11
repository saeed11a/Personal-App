import { createClient } from '@supabase/supabase-js';

// The single reusable Supabase client for the app.
//
// Both values are public frontend configuration read from the environment, so no
// credential is ever committed or hard-coded:
//   VITE_SUPABASE_URL              - the existing project URL
//   VITE_SUPABASE_PUBLISHABLE_KEY  - the publishable (anon) key
//
// The Supabase service_role key and the database password are privileged and must
// stay server-side (Supabase Edge Functions / trusted backend). They must never be
// referenced here, in any VITE_-prefixed variable, or in an APK/EXE build.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
