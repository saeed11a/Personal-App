// Which backend signs users in.
//
// Explicit on purpose: the hosted Base44 backend stays the default because that is
// what the shipped APK/EXE builds use, and the Supabase cutover is opted into per
// environment with VITE_AUTH_BACKEND=supabase (set in the sandbox defaults and
// documented in .env.example). Nothing switches by accident.
export const AUTH_BACKEND =
  import.meta.env.VITE_AUTH_BACKEND === 'supabase' ? 'supabase' : 'base44';

export const usesSupabaseAuth = AUTH_BACKEND === 'supabase';
