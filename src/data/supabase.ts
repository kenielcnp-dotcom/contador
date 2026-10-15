import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '@/app/config';
import type { Database } from './database.types';

// Só a chave pública vai para o navegador; quem autoriza cada linha é o RLS.
export const supabase = createClient<Database>(SUPABASE_URL || 'http://localhost:54321', SUPABASE_KEY || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
