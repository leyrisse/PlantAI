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

/**
 * Normalizes raw Supabase URL inputs from environment variables.
 * Handles common copy-paste artifacts such as:
 * - Surrounding quotes ("https://..." or 'https://...')
 * - Accidental angle brackets (<https://...> or https://<...>)
 * - Missing protocol (adds https:// if domain provided e.g. "xyz.supabase.co")
 * - Trailing slashes
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  let cleaned = (rawUrl || '').trim();

  // Strip surrounding quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip surrounding angle brackets <...>
  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // If user entered only domain without protocol, e.g. "abcdef.supabase.co"
  if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');

  return cleaned;
}

export function normalizeSupabaseKey(rawKey: string): string {
  let cleaned = (rawKey || '').trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function getSupabaseUrl(): string {
  const raw = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
    ''
  );
  return normalizeSupabaseUrl(raw);
}

export function getSupabaseKey(): string {
  const raw = (
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
       import.meta.env?.VITE_SUPABASE_ANON_KEY ||
       import.meta.env?.SUPABASE_ANON_KEY)) ||
    (typeof process !== 'undefined' &&
      (process.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
       process.env?.VITE_SUPABASE_ANON_KEY ||
       process.env?.SUPABASE_ANON_KEY)) ||
    ''
  );
  return normalizeSupabaseKey(raw);
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

    const host = parsed.hostname.toLowerCase();
    const isVercelDomain =
      host.includes('vercel.app') ||
      host.includes('vercel.dev') ||
      host.includes('now.sh') ||
      (typeof window !== 'undefined' && window.location.hostname && host === window.location.hostname.toLowerCase());

    if (isVercelDomain) {
      return {
        isConfigured: true,
        isValid: false,
        url,
        errorMessage: `A variável VITE_SUPABASE_URL está configurada com o endereço da Vercel ("${url}"). Ela deve ser a URL do seu projeto no Supabase (formato: https://<id-projeto>.supabase.co, disponível no Supabase em Project Settings > API).`,
      };
    }

    const isSupabaseCloud = host.endsWith('.supabase.co');
    const isLocalDevelopment = host === 'localhost' || host === '127.0.0.1';

    if (!isSupabaseCloud && !isLocalDevelopment) {
      return {
        isConfigured: true,
        isValid: false,
        url,
        errorMessage: `A URL configurada ("${url}") não pertence ao Supabase. O domínio do projeto Supabase deve terminar com ".supabase.co" (formato esperado: https://<id-projeto>.supabase.co).`,
      };
    }
  } catch {
    return {
      isConfigured: true,
      isValid: false,
      url,
      errorMessage: `O formato da URL em VITE_SUPABASE_URL ("${url}") é inválido. Esperado: https://<id-do-projeto>.supabase.co`,
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
