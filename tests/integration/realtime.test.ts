import type { Client } from '@/data/api';
import { expense, setupCouple, signUp } from './helpers';

function listen(client: Client, groupId: string) {
  const events: string[] = [];
  let ready!: () => void;
  const subscribed = new Promise<void>((r) => (ready = r));
  const channel = client
    .channel(`teste-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `group_id=eq.${groupId}` }, (p) => {
      events.push((p.new as { description?: string }).description ?? '?');
    })
    // SUBSCRIBED chega antes de o servidor confirmar a assinatura no Postgres;
    // só depois desta mensagem os eventos começam a fluir.
    .on('system', {}, (p: { extension?: string; status?: string }) => {
      if (p.extension === 'postgres_changes' && p.status === 'ok') ready();
    })
    .subscribe();
  return { events, subscribed, stop: () => client.removeChannel(channel) };
}

async function waitFor(check: () => boolean, ms = 15000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
  return true;
}

describe('sincronização em tempo real', () => {
  it('lançamento da Ana chega ao Bruno; estranho não recebe nada', async () => {
    const c = await setupCouple();
    const eve = await signUp('Eva');
    // O Realtime precisa do JWT de cada um para aplicar o RLS.
    for (const u of [c.bruno, eve]) {
      const { data } = await u.client.auth.getSession();
      await u.client.realtime.setAuth(data.session!.access_token);
    }
    const bruno = listen(c.bruno.client, c.groupId);
    const intruder = listen(eve.client, c.groupId);
    await Promise.all([bruno.subscribed, intruder.subscribed]);

    await c.ana.api.saveTransaction(expense(c, { amountCents: 4200, description: 'Padaria' }));

    expect(await waitFor(() => bruno.events.includes('Padaria'))).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(intruder.events).toEqual([]);
    await Promise.all([bruno.stop(), intruder.stop()]);
  });
});
