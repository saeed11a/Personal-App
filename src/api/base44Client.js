import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// The Base44 backend is a hosted service. Without an app id and base URL (e.g.
// this sandbox, where no Base44 app is linked) the client cannot reach it, so
// callers check this flag and skip the requests that would only 404 and log
// errors. The Supabase migration is what removes this dependency entirely.
export const isBase44Configured = Boolean(appId && appBaseUrl);

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});
