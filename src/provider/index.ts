import { SupabaseProvider, NullProvider } from './supabase';
import type { AttendanceProvider } from './interface';

// To swap providers, change this function to return a different implementation.
// Firebase: import { FirebaseProvider } from './firebase'; return new FirebaseProvider(config);
// REST API: import { RestProvider } from './rest'; return new RestProvider(baseUrl, apiKey);
// The rest of the codebase never changes — only this file.

export function createProvider(): AttendanceProvider {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && key && url.startsWith('https://')) {
    return new SupabaseProvider(url, key);
  }

  return new NullProvider();
}

// Singleton — created once at startup, reused throughout the app.
// Re-create via reinitProvider() if credentials change in Settings.
let _provider: AttendanceProvider = createProvider();

export function getProvider(): AttendanceProvider {
  return _provider;
}

/**
 * Reinitialize the provider after credentials are updated in Settings.
 * Call this after saving new Supabase URL/key values.
 */
export function reinitProvider(): void {
  _provider = createProvider();
}

export type { AttendanceProvider };
