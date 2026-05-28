import { SupabaseProvider, NullProvider } from './supabase';
import { LocalApiProvider } from './local';
import type { AttendanceProvider } from './interface';
import { setState } from '@/state/index';

// Choose provider:
// 1) Local API if VITE_USE_LOCAL_API='true' or VITE_LOCAL_API_URL is set
// 2) Supabase if VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are provided
// 3) NullProvider otherwise

export function createProvider(): AttendanceProvider {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const localApiUrl = import.meta.env.VITE_LOCAL_API_URL;
  let useLocal = import.meta.env.VITE_USE_LOCAL_API === 'true';

  // At runtime, prefer the local API when running on localhost for dev/E2E.
  if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '0.0.0.0')) {
    useLocal = true;
  }

  if (useLocal || localApiUrl) {
    // When using the local API provider, mark the online-queue UI as available
    setState({ supabaseConfigured: true });
    // eslint-disable-next-line no-console
    console.log('[provider] Using LocalApiProvider', localApiUrl ?? '/api');
    return new LocalApiProvider(localApiUrl ?? '/api');
  }

  if (url && key && url.startsWith('https://')) {
    setState({ supabaseConfigured: true });
    // eslint-disable-next-line no-console
    console.log('[provider] Using SupabaseProvider', url);
    return new SupabaseProvider(url, key);
  }

  // ensure UI reflects lack of remote provider
  // eslint-disable-next-line no-console
  console.log('[provider] Using NullProvider');
  setState({ supabaseConfigured: false });
  return new NullProvider();
}

// singleton
let _provider: AttendanceProvider = createProvider();

export function getProvider(): AttendanceProvider {
  return _provider;
}

export function reinitProvider(): void {
  _provider = createProvider();
}

export type { AttendanceProvider };
