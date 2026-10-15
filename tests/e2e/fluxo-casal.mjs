// Teste ponta a ponta num navegador real (Edge ou Chrome já instalados):
// cadastro → carteira → convite → aceite → despesa de R$ 600 → realtime →
// acerto parcial → telas → sem conexão (nada é salvo) → reenvio sem duplicar.
//
// Pré-requisitos: npm run db:start  e  npm run dev  (em outro terminal).
// Uso: npm run test:e2e        (capturas em tests/e2e/capturas/)
// Variáveis: E2E_URL (padrão http://localhost:5173), E2E_BROWSER (msedge | chrome)
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./capturas', import.meta.url));
const BASE = process.env.E2E_URL ?? 'http://localhost:5173';
const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? 'msedge', headless: true });
const errors = [];
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };
const desktop = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };

function watch(page, who) {
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${who}] console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${who}] pageerror: ${e.message}`));
}
const shot = (page, name, full = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const stamp = Date.now();

// ---- Ana (celular)
const ctxA = await browser.newContext(mobile);
const a = await ctxA.newPage();
watch(a, 'ana');
await a.goto(`${BASE}/cadastro`);
await shot(a, '01-cadastro-mobile', false);
await a.getByLabel('Seu nome').fill('Ana Souza');
await a.getByLabel('E-mail').fill(`ana-${stamp}@teste.local`);
await a.getByLabel('Senha', { exact: true }).fill('SenhaForte123');
await a.getByLabel('Confirme a senha').fill('SenhaForte123');
await a.getByRole('button', { name: 'Criar conta' }).click();
await a.getByRole('heading', { name: /Olá/ }).waitFor();
await shot(a, '02-onboarding-carteira', false);
await a.getByRole('button', { name: 'Criar carteira' }).click();
await a.getByRole('heading', { name: 'Onde está o dinheiro?' }).waitFor();
await a.getByRole('button', { name: 'Adicionar conta' }).click();
await a.getByLabel('Nome', { exact: true }).fill('Conta conjunta');
await a.getByLabel('Saldo inicial').fill('250000');
await shot(a, '03-nova-conta', false);
await a.getByRole('button', { name: 'Salvar' }).click();
await a.getByText('Conta conjunta').first().waitFor();
await a.getByRole('button', { name: 'Continuar' }).click();
await a.getByRole('button', { name: 'Gerar link de convite' }).click();
const link = (await a.locator('.token-box').innerText()).trim();
await shot(a, '04-convite', false);
await a.getByRole('button', { name: 'Ir para o início' }).click();
await a.getByRole('heading', { name: /Olá, Ana/ }).waitFor();

// ---- Bruno (desktop) aceita o convite
const ctxB = await browser.newContext(desktop);
const b = await ctxB.newPage();
watch(b, 'bruno');
await b.goto(link);
await b.getByRole('heading', { name: 'Você foi convidado(a)' }).waitFor();
await shot(b, '05-convite-deslogado', false);
await b.getByRole('link', { name: 'Criar minha conta' }).click();
await b.getByLabel('Seu nome').fill('Bruno Lima');
await b.getByLabel('E-mail').fill(`bruno-${stamp}@teste.local`);
await b.getByLabel('Senha', { exact: true }).fill('SenhaForte123');
await b.getByLabel('Confirme a senha').fill('SenhaForte123');
await b.getByRole('button', { name: 'Criar conta' }).click();
await b.getByRole('button', { name: 'Aceitar e entrar' }).waitFor();
await shot(b, '06-aceitar-convite', false);
await b.getByRole('button', { name: 'Aceitar e entrar' }).click();
await b.getByRole('heading', { name: /Olá, Bruno/ }).waitFor();

// ---- Ana lança o mercado de R$ 600 pelo botão principal (celular)
await a.reload();
await a.getByRole('heading', { name: /Olá, Ana/ }).waitFor();
await a.getByRole('button', { name: 'Nova movimentação' }).last().click();
await a.getByLabel('Valor').fill('60000');
await a.getByLabel('Descrição').fill('Mercado do mês');
await a.getByLabel('Categoria').selectOption({ label: 'Mercado' });
await a.getByLabel('Saiu da conta').selectOption({ label: 'Fora das contas cadastradas' });
await shot(a, '07-form-despesa', false);
await a.getByRole('button', { name: 'Salvar' }).click();
await a.getByText('Movimentação salva.').waitFor();
await a.waitForTimeout(1200);
await shot(a, '08-dashboard-mobile');

// ---- Bruno vê sem recarregar (realtime) e acerta parcialmente
await b.getByText('Mercado do mês').first().waitFor({ timeout: 15000 });
await shot(b, '09-dashboard-desktop');
await b.locator('svg.chart').first().screenshot({ path: `${OUT}/09b-grafico.png` });
await b.goto(`${BASE}/acertos`);
await b.getByText(/Você tem R\$ 300,00 para acertar com Ana/).waitFor();
await shot(b, '10-acertos-desktop');
await b.getByRole('button', { name: 'Registrar acerto' }).click();
await b.getByLabel('Valor').fill('12000');
await b.getByRole('button', { name: 'Registrar pagamento parcial' }).click();
await b.getByText(/Você tem R\$ 180,00 para acertar com Ana/).waitFor();
await shot(b, '11-acertos-parcial');

// ---- Outras telas
await b.goto(`${BASE}/movimentacoes`);
await b.getByText('Mercado do mês').first().waitFor();
await shot(b, '12-movimentacoes-desktop');
await b.goto(`${BASE}/relatorios`);
await b.getByRole('heading', { name: 'Relatórios', exact: true }).waitFor();
await b.waitForTimeout(800);
await shot(b, '13-relatorios-desktop');
await a.goto(`${BASE}/contas`);
await a.getByRole('heading', { name: 'Contas a pagar e receber' }).waitFor();
await shot(a, '14-contas-mobile');
await a.goto(`${BASE}/orcamento`);
await a.getByRole('heading', { name: 'Orçamento', exact: true }).waitFor();
await shot(a, '15-orcamento-mobile');
await a.goto(`${BASE}/acertos`);
await a.getByText(/Bruno Lima tem R\$ 180,00 para acertar com você/).waitFor();
await shot(a, '16-acertos-mobile');

// ---- Sem conexão: aviso aparece e salvar falha sem fingir sucesso
await ctxA.setOffline(true);
await a.evaluate(() => window.dispatchEvent(new Event('offline')));
await a.getByText(/Sem conexão/).first().waitFor();
await a.getByRole('button', { name: 'Nova movimentação' }).last().click();
await a.getByLabel('Valor').fill('1000');
await a.getByLabel('Descrição').fill('Teste offline');
await a.getByLabel('Categoria').selectOption({ label: 'Lazer' });
await a.getByRole('button', { name: 'Salvar' }).click();
await a.getByText(/Nada foi salvo/).first().waitFor();
await shot(a, '17-offline', false);
await ctxA.setOffline(false);
await a.evaluate(() => window.dispatchEvent(new Event('online')));
// Mesmo formulário, mesmo id de requisição: reenviar depois que a rede volta salva uma vez só.
await a.getByRole('button', { name: 'Salvar' }).click();
await a.getByText('Movimentação salva.').waitFor();
await a.getByRole('button', { name: 'Nova movimentação' }).last().click();
await a.waitForTimeout(400);
await shot(a, '18-form-mobile-corrigido', false);
await a.keyboard.press('Escape');
await a.getByRole('button', { name: 'Mais' }).click();
await shot(a, '19-mais', false);

// O único erro aceitável no console é a falha de rede provocada de propósito.
const unexpected = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));
fs.writeFileSync(`${OUT}/erros-console.txt`, errors.join('\n') || 'sem erros');
await browser.close();
if (!link.includes('/convite#')) throw new Error('O link de convite deveria levar o token no fragmento (#).');
if (unexpected.length) throw new Error(`Erros no console do navegador:\n${unexpected.join('\n')}`);
console.log(`✓ Fluxo completo OK. Capturas em ${OUT}`);
