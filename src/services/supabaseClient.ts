import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Centralized Supabase client for PlantAI.
 * Configured using public client-side environment variables:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY as fallback)
 *
 * NOTE: Never expose service_role or administrative keys in frontend code.
 */

let supabaseInstance: SupabaseClient | null = null;
let hasLoggedConfigWarning = false;

export function getSupabaseUrl(): string {
  const url = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
    ''
  ).trim();
  return url;
}

export function getSupabaseKey(): string {
  const key = (
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
    (typeof process !== 'undefined' &&
      (process.env?.VITE_SUPABASE_PUBLISHABLE_KEY || process.env?.VITE_SUPABASE_ANON_KEY)) ||
    ''
  ).trim();
  return key;
}

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  isValid: boolean;
  url?: string;
  errorMessage?: string;
}

/**
 * Validates the Supabase configuration and checks for common configuration mistakes
 * (such as putting the Vercel site URL instead of the Supabase project URL).
 */
export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  if (!url || !key) {
    return {
      isConfigured: false,
      isValid: false,
      errorMessage: 'Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não configuradas no ambiente.',
    };
  }

  // Detect accidental entry of Vercel frontend URL
  if (url.includes('vercel.app') || (typeof window !== 'undefined' && url.includes(window.location.hostname))) {
    return {
      isConfigured: true,
      isValid: false,
      url,
      errorMessage: `A variável VITE_SUPABASE_URL está configurada como o domínio da Vercel ("${url}"). Ela deve ser a URL do seu projeto no Supabase (formato: https://<id-projeto>.supabase.co).`,
    };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        isConfigured: true,
        isValid: false,
        url,
        errorMessage: 'A URL do Supabase precisa utilizar o protocolo https://.',
      };
    }
  } catch {
    return {
      isConfigured: true,
      isValid: false,
      url,
      errorMessage: 'O formato da URL em VITE_SUPABASE_URL é inválido.',
    };
  }

  return {
    isConfigured: true,
    isValid: true,
    url,
  };
}

/**
 * Checks whether the required Supabase environment variables are present and syntactically valid.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().isValid;
}

/**
 * Returns the singleton Supabase client instance.
 * If environment variables are missing or misconfigured, logs a clear diagnostic message once
 * and returns null without throwing or triggering infinite retry loops.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const status = getSupabaseConfigStatus();

  if (!status.isValid) {
    if (!hasLoggedConfigWarning) {
      hasLoggedConfigWarning = true;
      console.warn(`[PlantAI / Supabase Auth] ${status.errorMessage}`);
    }
    return null;
  }

  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseInstance;
  } catch (err: any) {
    if (!hasLoggedConfigWarning) {
      hasLoggedConfigWarning = true;
      console.error(
        '[PlantAI / Supabase Auth] Falha ao instanciar o cliente Supabase:',
        err?.message || err
      );
    }
    return null;
  }
}
