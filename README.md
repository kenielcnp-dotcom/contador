# A Dois — finanças do casal

Aplicativo web (PWA) para duas pessoas administrarem juntas o dinheiro da casa:
receitas, despesas divididas, contas a pagar, acertos entre o casal, orçamento,
metas e relatórios. Cada pessoa tem a própria conta e as duas compartilham uma
carteira.

- **Interface:** React 19 + Vite + TypeScript
- **Backend:** Supabase (Auth, Postgres com RLS, Storage privado, Realtime) — sem servidor próprio
- **Dinheiro:** sempre centavos inteiros (`bigint` no banco, inteiros no TypeScript)

## Começo rápido (local)

```bash
npm install
npm run db:start        # Supabase local no Docker (aplica as migrações)
npm run dev             # http://localhost:5173
```

O arquivo `.env.local` precisa apontar para o Supabase. Veja `.env.example`.

## Testes

```bash
npm test                # unitários (regras financeiras)
npm run test:integracao # contra o Supabase local: RLS, convites, concorrência, realtime
npm run test:e2e        # navegador real (Edge/Chrome), com npm run dev rodando
```

Documentação completa — instalação, migrações, publicação, regras de
contabilização e modelo de segurança: **[docs/TECNICO.md](docs/TECNICO.md)**.
