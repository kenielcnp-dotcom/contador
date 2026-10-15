# Documentação técnica

Este documento serve para quem vai instalar, manter ou publicar o **A Dois**. Ele cobre:

- a arquitetura e a estrutura de pastas;
- a configuração do ambiente local e do Supabase na nuvem;
- as migrações e os testes;
- a publicação;
- as regras de contabilização e o modelo de segurança, que são o que mais importa não quebrar.

---

## 1. Arquitetura

```
Navegador (React + TanStack Query)
   │  chave pública (sb_publishable_…) + JWT do usuário
   ▼
Supabase
   ├─ Auth ............ cadastro, login, recuperação de senha
   ├─ PostgREST ....... leitura das tabelas (filtrada pelo RLS)
   ├─ RPCs (Postgres) . toda escrita financeira, atômica e validada
   ├─ Storage ......... buckets privados "comprovantes" e "avatars"
   └─ Realtime ........ avisa o outro participante que algo mudou
```

- **Não há servidor próprio.** O navegador fala direto com o Supabase. Quem autoriza cada linha é o **RLS** do Postgres, não a interface.
- **Escritas financeiras passam por RPCs** `SECURITY DEFINER`, com `search_path` vazio. Cada RPC:
  - descobre a carteira pelo usuário logado, sem confiar em `group_id` vindo do cliente;
  - valida todos os campos;
  - grava tudo numa única transação SQL.

  Movimentações, rateios, pagamentos de contas, acertos e contribuições **não aceitam INSERT/UPDATE/DELETE direto** do cliente.
- **Realtime não aplica dados na tela.** Ele só invalida o cache do TanStack Query, e a tela relê do banco. Não existe atualização otimista em operação financeira: o "salvo" aparece só depois da resposta do banco.
- **Sem conexão:** as mutações usam `networkMode: 'always'`, então falham na hora com a mensagem "nada foi salvo", em vez de ficarem numa fila fingindo sucesso. O service worker guarda só o casco do app; dados financeiros nunca vêm do cache.

### Estrutura

```
supabase/
  config.toml                 configuração do Supabase local
  migrations/                 migrações SQL versionadas (fonte da verdade do banco)
    …0100_base.sql            perfis, carteiras, membros, convites, helpers de autorização
    …0200_financeiro.sql      contas, categorias, movimentações, rateios, contas a pagar,
                              acertos, metas, orçamentos, anexos, histórico
    …0300_rls.sql             RLS e privilégios por coluna
    …0400_rpc.sql             RPCs (operações atômicas)
    …0500_storage_realtime.sql buckets privados, políticas de Storage e Realtime
src/
  domain/                     regras financeiras puras (sem React, sem Supabase)
    money.ts                  centavos, formatação R$ 1.234,56, parse sem float
    split.ts                  rateio igual / % / valores / individual, arredondamento determinístico
    ledger.ts                 totais por período — FONTE ÚNICA de dashboard e relatórios
    budget.ts                 orçamento (efetivo, previsto, comprometido, alertas)
    settlement.ts             dívidas entre o casal, mensagens
    bills.ts, period.ts, csv.ts
  data/
    api.ts                    toda a comunicação com o Supabase (recebe o cliente por parâmetro)
    queries.ts                hooks do TanStack Query + mutação padrão
    realtime.ts               assinatura do Realtime e estado da conexão
    errors.ts                 tradução de qualquer erro para português
    database.types.ts         tipos gerados do schema (npm run db:tipos)
  features/<tela>/            telas e formulários
  ui/                         componentes reutilizáveis (Sheet, campos, gráficos SVG, toasts…)
tests/
  unit/                       regras financeiras (Vitest)
  integration/                contra o Supabase local (Vitest)
  e2e/                        fluxo completo em navegador real (playwright-core + Edge/Chrome)
```

---

## 2. Requisitos

- Node.js 20 ou superior (desenvolvido com o 24) e npm.
- Docker Desktop, para o Supabase local, os testes de integração e o e2e.
- Edge ou Chrome instalados, só para `npm run test:e2e`.

---

## 3. Rodar localmente

```bash
npm install
npm run db:start      # sobe o Supabase no Docker e aplica supabase/migrations/
```

Crie `.env.local` com os dados que `npx supabase status` mostra:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY ou ANON_KEY do status>
```

```bash
npm run dev           # http://localhost:5173
npm run dev:rede      # expõe na rede local para testar no celular (http://IP-DA-MAQUINA:5173)
```

> No celular pela rede local, o app também precisa alcançar o Supabase. Troque `127.0.0.1` pelo IP da máquina no `.env.local` e libere as portas 5173 e 54321 no firewall.

Locais úteis:

- E-mails de teste (confirmação, recuperação de senha): http://127.0.0.1:54324 (Mailpit).
- Parar o Supabase: `npm run db:stop`. Recriar o banco do zero: `npm run db:reset`.

---

## 4. Migrações

- Toda mudança de banco é um arquivo novo em `supabase/migrations/` (`npx supabase migration new nome`). **Nunca altere o banco pelo painel sem migração.**
- Aplicar localmente: `npm run db:reset` (recria) ou `npx supabase migration up` (só as pendentes).
- Depois de mudar o schema: `npm run db:tipos`, para regenerar `src/data/database.types.ts`, e `npm run typecheck`.

---

## 5. Testes

| Comando | O que cobre | Precisa de |
|---|---|---|
| `npm test` | dinheiro, rateio (varredura de arredondamento), saldos por período, orçamento, acertos, períodos, CSV, tradução de erros | nada |
| `npm run test:integracao` | ver lista abaixo | `npm run db:start` |
| `npm run test:e2e` | cadastro → carteira → convite → aceite → despesa de R$ 600 → realtime → acerto parcial → telas → sem conexão → reenvio sem duplicar | `db:start` + `npm run dev` |
| `npm run typecheck` | tipos de todo o projeto | nada |

O que os testes de integração verificam:

- cadastro e login, e persistência após sair e entrar de novo;
- sessão expirada e falha de rede;
- convites: uso único, expiração, cancelamento e aceite simultâneo;
- isolamento entre carteiras e bloqueio de escrita direta;
- remoção de participante;
- o cenário de R$ 600;
- acertos parciais, concorrentes e repetidos;
- edição e cancelamento de movimentações;
- saldos e transferências;
- contas recorrentes com pagamento parcial, total, repetido e concorrente;
- metas com conta-reserva;
- orçamento;
- Storage privado;
- Realtime com RLS.

Os testes de integração usam a chave `service_role` **local** só para preparar cenários em Node, por exemplo expirar um convite. Essa chave nunca entra no app.

---

## 6. Publicar

### 6.1 Projeto Supabase na nuvem

1. Crie um projeto em https://supabase.com, de preferência na região São Paulo. O plano free permite 2 projetos ativos.
2. Aplique as migrações por **um** dos caminhos:
   - **Pela CLI, no seu terminal:**
     ```bash
     npx supabase login
     npx supabase link --project-ref <ref-do-projeto>
     npx supabase db push
     ```
     O login usa o seu token pessoal. Ele fica na sua máquina; não compartilhe com ninguém.
   - **Pelo painel:** rode `npm run db:sql-unico`, abra *SQL Editor › New query*, cole o conteúdo de `supabase/tudo-em-um.sql` e execute uma vez, num projeto novo.
3. Em *Authentication › URL Configuration*:
   - **Site URL:** o endereço publicado (ex.: `https://adois.vercel.app`).
   - **Redirect URLs:** `https://adois.vercel.app/**`, para confirmação de e-mail e redefinição de senha.
4. Em *Authentication › Providers › Email*:
   - deixe **Confirm email** ligado, que é o recomendado;
   - em *Password*, defina o mínimo de **8** caracteres.
5. Opcional, mas recomendado para uso real: configure um SMTP próprio em *Authentication › SMTP*. O servidor de e-mail padrão do Supabase tem limite baixo de envios por hora.

### 6.2 Chave do app

Em *Project Settings › API Keys*, copie a chave **publicável**:

- ✅ `sb_publishable_…` (ou, no formato antigo, a `anon` que começa com `eyJ…`): é a única que vai para o navegador.
- ❌ `sb_secret_…` / `service_role`: ignora o RLS. Nunca no frontend nem no `.env` do app. O app se recusa a iniciar se detectar uma delas.
- ❌ `sbp_…` (token pessoal): controla a conta inteira. Nunca compartilhe.

### 6.3 Hospedagem do site (Vercel, Netlify ou Cloudflare Pages)

- Build: `npm run build`. Saída: `dist/`.
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- SPA: todas as rotas devem servir `index.html`. Na Vercel, o `vercel.json` do projeto já faz isso (e adiciona cabeçalhos de segurança). Em outras hospedagens, configure o equivalente ("SPA fallback").
- Depois de publicar, faça o fluxo completo com duas contas reais: cadastro, convite, uma despesa dividida e um acerto.

---

## 7. Regras de contabilização

Estas regras valem em todas as telas. Dashboard e relatórios chamam as mesmas funções de `src/domain/ledger.ts`, então os totais coincidem por construção.

| Regra | Como é garantida |
|---|---|
| Dinheiro em centavos inteiros | `bigint` no banco; `private.cents()` recusa `12.5`; no TS, `assertCents` e máscara de centavos nos campos |
| Despesa dividida conta **uma vez**, pelo total | a despesa é 1 linha em `transactions`; `expense_splits` guarda só a responsabilidade |
| Soma do rateio = valor exato | gatilho de restrição adiado (`check_split_sum`) e validação na RPC |
| Arredondamento determinístico | centavos que sobram vão para a maior fração descartada, com desempate pelo menor `user_id` (`split.ts`) |
| Previsto ≠ efetivo | `status` `planned` / `effective` / `cancelled`; efetiva exige `paid_at`; o ledger separa os campos |
| Data que define o período | efetiva: data do pagamento/recebimento; prevista: data de competência/vencimento |
| Transferência não é receita nem despesa | `kind = 'transfer'`, sem categoria e sem rateio; só move saldo entre contas |
| Saldo da conta | saldo inicial confirmado + movimentações efetivas a partir da data desse saldo |
| Saldo inicial não informado | `opening_balance_cents = null`; o app avisa "saldo incompleto" e não inventa valor |
| Conta a pagar recorrente | gera ocorrências (`bill_occurrences`), sem duplicar (`unique(bill_id, scheduled_date)`); só o pagamento vira despesa efetiva |
| Pagamento de conta é atômico e idempotente | `pay_bill_occurrence` trava a ocorrência, recusa valor acima do pendente e devolve a mesma transação se o `client_request_id` se repetir |
| Dívida entre o casal | `private.member_nets`: líquido = pago − responsabilidade + acertos enviados − acertos recebidos. Despesas pagas pela conta conjunta não geram dívida |
| Acerto não cria receita nem relança a despesa | `settlement_payments` não toca em `transactions` nem em contas |
| Dois acertos simultâneos não passam do devido | `register_settlement_payment` trava a carteira (`FOR UPDATE`) antes de checar a dívida |
| Meta: guardado × alvo | guardado = soma das contribuições; com conta-reserva, cada contribuição é uma **transferência** real |
| Exclusão preserva histórico | movimentações são canceladas (`cancelled_at`, `cancelled_by`, motivo), nunca apagadas; contas e categorias são arquivadas |
| Reenvio de formulário não duplica | cada formulário abre com um `client_request_id`, e `unique(group_id, client_request_id)` faz o banco devolver o registro existente |

---

## 8. Modelo de segurança

- **RLS em todas as tabelas.** Para ler, a pessoa precisa ser **membro ativo** da carteira (`private.is_member`). Essa função é `SECURITY DEFINER`, o que evita política recursiva em `group_members`.
- **`anon` não recebe nenhum privilégio.** Usuário deslogado não lê nada nem chama RPC.
- **Privilégios por coluna.** Onde há escrita direta (contas, categorias, orçamentos, metas, perfil, ocorrências pendentes), o cliente só altera as colunas liberadas. Não dá para trocar `group_id`, autoria ou status por fora.
- **FKs compostas `(id, group_id)`.** Nenhuma linha aponta para uma conta, categoria ou membro de outra carteira, mesmo que alguém forje um id.
- **Convites:**
  - o token tem 192 bits aleatórios e só o hash SHA-256 fica no banco (a coluna nem é legível pelo cliente);
  - vale 72 horas, é de uso único e gerar um novo cancela o anterior;
  - o aceite trava o convite contra aceites simultâneos;
  - o link leva o token no fragmento `#`, que o navegador não envia ao servidor.
- **Uma carteira ativa por pessoa**, por índice único parcial. Ninguém se adiciona a uma carteira: só a RPC de aceite insere membros.
- **Remoção de participante** muda o status para `removed`. O acesso acaba na hora (inclusive no Realtime e no Storage), e as movimentações da pessoa ficam no histórico.
- **Storage:**
  - os buckets `comprovantes` (5 MB; JPG, PNG, WEBP e PDF) e `avatars` (2 MB) são privados;
  - as políticas exigem ser membro da carteira dona da pasta;
  - os arquivos abrem por URL assinada de 5 minutos.
- **Histórico de atividades** (`activity_logs`): gatilhos registram quem criou, alterou ou cancelou cada registro relevante.

Para conferir rapidamente depois de qualquer mudança no banco, rode `npm run test:integracao`. Os testes de isolamento e de RLS falham se uma política abrir demais.

---

## 9. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Configuração incompleta" ao abrir | falta o `.env.local` (ou as variáveis na hospedagem) |
| "A chave configurada é ADMINISTRATIVA" | foi usada `sb_secret_`, `service_role` ou `sbp_`. Troque pela publicável e **revogue** a exposta no painel |
| Link de confirmação ou de redefinição cai em página errada | *Site URL* e *Redirect URLs* não conferem com o endereço publicado |
| `npm run test:integracao` diz que o Supabase não está rodando | rode `npm run db:start` com o Docker Desktop aberto |
| O parceiro não vê a mudança na hora | a atualização automática pausou (aviso na barra lateral). As telas recarregam ao voltar o foco ou a conexão |
