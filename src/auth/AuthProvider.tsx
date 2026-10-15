import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/data/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Veio de um link de redefinição de senha. */
  recovering: boolean;
  /** Motivo da última saída forçada (sessão expirada), para avisar no login. */
  signedOutReason: string | null;
  clearRecovering: () => void;
  handleSessionExpired: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [signedOutReason, setReason] = useState<string | null>(null);
  const userInitiated = useRef(false);
  const hadSession = useRef(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      hadSession.current = !!data.session;
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        // Saída que a pessoa não pediu = sessão expirou ou foi revogada.
        if (hadSession.current && !userInitiated.current) setReason('Sua sessão expirou. Entre novamente.');
        userInitiated.current = false;
        qc.clear(); // nenhum dado financeiro fica na memória depois de sair
      }
      if (event === 'SIGNED_IN') setReason(null);
      hadSession.current = !!next;
      setSession(next);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  const signOut = useCallback(async () => {
    userInitiated.current = true;
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const handleSessionExpired = useCallback(() => {
    setReason('Sua sessão expirou. Entre novamente.');
    void supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
      signedOutReason,
      clearRecovering: () => setRecovering(false),
      handleSessionExpired,
      signOut,
    }),
    [session, loading, recovering, signedOutReason, handleSessionExpired, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
