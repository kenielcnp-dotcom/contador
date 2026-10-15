export const APP_NAME = 'A Dois';
export const APP_TAGLINE = 'Finanças do casal, sem planilha e sem dúvida sobre quem pagou o quê.';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const SUPABASE_URL = url ?? '';
export const SUPABASE_KEY = key ?? '';

/** Mensagem de configuração ausente (mostrada no lugar do app). */
export function configProblem(): string | null {
  if (!url || !key) {
    return 'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local. Veja docs/TECNICO.md.';
  }
  // Defesa contra o erro mais perigoso: colocar uma chave administrativa no navegador.
  if (/^sb_secret_/.test(key) || /^sbp_/.test(key) || isServiceRoleJwt(key)) {
    return 'A chave configurada é ADMINISTRATIVA (ignora o RLS) e não pode ir para o navegador. Use a chave sb_publishable_… e revogue a chave exposta no painel do Supabase.';
  }
  return null;
}

function isServiceRoleJwt(token: string): boolean {
  const part = token.split('.')[1];
  if (!part) return false;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
