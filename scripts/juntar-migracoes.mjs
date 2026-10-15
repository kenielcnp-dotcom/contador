// Junta as migrações em um único arquivo para colar no SQL Editor do painel do
// Supabase (alternativa ao "supabase db push"). Gerado sob demanda, para nunca
// ficar diferente das migrações versionadas.
//
//   npm run db:sql-unico   →   supabase/tudo-em-um.sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const body = files.map((f) => `-- >>> ${f}\n${readFileSync(dir + f, 'utf8').trim()}\n`).join('\n');
const out = fileURLToPath(new URL('../supabase/tudo-em-um.sql', import.meta.url));
writeFileSync(out, `-- Gerado por scripts/juntar-migracoes.mjs — não edite à mão.\n-- Rode UMA vez, num projeto novo.\n\n${body}`);
console.log(`${files.length} migrações → ${out}`);
