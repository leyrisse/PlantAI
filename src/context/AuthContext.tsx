import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  getSupabaseConfigStatus,
} from '../services/supabaseClient';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  userId: string | null;
  isAnonymous: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  retryAuth: () => Promise<void>;
  dismissError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Module-level lock to prevent concurrent anonymous user creations across StrictMode mounts
let globalInitPromise: Promise<void> | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isConfigured] = useState<boolean>(() => isSupabaseConfigured());
  const [isLoading, setIsLoading] = useState<boolean>(() => isSupabaseConfigured());
  const [error, setError] = useState<string | null>(() => {
    const status = getSupabaseConfigStatus();
    return !status.isValid && status.isConfigured ? status.errorMessage || null : null;
  });

  const isMountedRef = useRef<boolean>(true);

  /**
   * Initializes or restores the user session:
   * 1. If Supabase is misconfigured or missing, reports status and aborts cleanly without loops.
   * 2. Checks for an existing valid session (anonymous or permanent).
   * 3. Reuses the session if present.
   * 4. If no session exists, creates an anonymous visitor session via signInAnonymously().
   * 5. Catches and exposes network/configuration errors without crashing local functionality.
   */
  const initializeAuth = useCallback(async () => {
    const configStatus = getSupabaseConfigStatus();

    if (!configStatus.isValid) {
      if (isMountedRef.current) {
        setIsLoading(false);
        if (configStatus.isConfigured && configStatus.errorMessage) {
          setError(configStatus.errorMessage);
        }
      }
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      return;
    }

    if (globalInitPromise) {
      await globalInitPromise;
      return;
    }

    globalInitPromise = (async () => {
      try {
        if (isMountedRef.current) {
          setIsLoading(true);
        }

        // Step 1: Check for existing session
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) {
          console.warn('[PlantAI / Supabase Auth] Aviso ao verificar sessão existente:', sessionError.message);
        }

        if (sessionData?.session?.user) {
          if (isMountedRef.current) {
            setSession(sessionData.session);
            setUser(sessionData.session.user);
            setError(null);
            setIsLoading(false);
          }
          return;
        }

        // Step 2: No existing session found -> create anonymous session
        const { data: anonData, error: anonError } = await client.auth.signInAnonymously();

        if (anonError) {
          console.warn('[PlantAI / Supabase Auth] Não foi possível autenticar anonimamente:', anonError.message);
          if (isMountedRef.current) {
            setError(
              `Falha na autenticação anônima do Supabase: ${anonError.message}. Verifique se "Anonymous Sign-Ins" está ativado no Supabase (Authentication > Providers > Anonymous).`
            );
            setIsLoading(false);
          }
          return;
        }

        if (anonData?.session && isMountedRef.current) {
          setSession(anonData.session);
          setUser(anonData.user ?? anonData.session.user ?? null);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro de conexão com o serviço de autenticação.';
        console.warn('[PlantAI / Supabase Auth] Falha ao comunicar com Supabase Auth:', message);
        if (isMountedRef.current) {
          setError(`Não foi possível conectar ao Supabase Auth (${message}). O aplicativo continuará em modo local.`);
          setIsLoading(false);
        }
      } finally {
        globalInitPromise = null;
      }
    })();

    await globalInitPromise;
  }, []);

  /**
   * Controlled retry function for transient errors or network reconnection.
   */
  const retryAuth = useCallback(async () => {
    globalInitPromise = null;
    setError(null);
    await initializeAuth();
  }, [initializeAuth]);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const client = getSupabaseClient();

    if (!client) {
      setIsLoading(false);
      return;
    }

    // Set up auth state change observer
    const { data: authListener } = client.auth.onAuthStateChange((_event, currentSession) => {
      if (isMountedRef.current) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setIsLoading(false);
      }
    });

    // Run auth initialization
    initializeAuth();

    return () => {
      isMountedRef.current = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [initializeAuth]);

  // Derived state: identity flags
  const userId = user?.id ?? null;
  const isAnonymous = Boolean(
    user?.is_anonymous ||
    user?.app_metadata?.provider === 'anonymous' ||
    user?.identities?.some((id) => id.provider === 'anonymous')
  );

  const value: AuthContextValue = {
    session,
    user,
    userId,
    isAnonymous,
    isLoading,
    isConfigured,
    error,
    retryAuth,
    dismissError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to consume Supabase Auth state anywhere in the application.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um <AuthProvider>');
  }
  return context;
}
