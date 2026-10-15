import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string;
    anonKey: string;
    serviceKey: string;
  }
}

/**
 * Lê URL e chaves do Supabase LOCAL (npm run db:start). A chave service_role
 * é usada só aqui nos testes, em Node, para montar cenários (ex.: expirar um
 * convite) — nunca no app.
 */
export default async function setup(project: TestProject) {
  let env: Record<string, string> = {};
  try {
    const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    env = Object.fromEntries(
      out
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => [m[1]!, m[2]!]),
    );
  } catch {
    /* tratado abaixo */
  }
  const url = env.API_URL;
  const anon = env.PUBLISHABLE_KEY || env.ANON_KEY;
  const service = env.SECRET_KEY || env.SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error('Supabase local não está rodando. Rode "npm run db:start" (precisa do Docker) e tente de novo.');
  }
  const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } }).catch(() => null);
  if (!health?.ok) throw new Error(`Supabase local não respondeu em ${url}.`);

  project.provide('supabaseUrl', url);
  project.provide('anonKey', anon);
  project.provide('serviceKey', service);
}
