import { debtMessage, netBalance, resolveDebts, validateSettlementAmount } from '@/domain/settlement';
import { ANA, BRUNO } from './fixtures';

const names = (id: string) => (id === ANA ? 'Ana' : 'Bruno');

describe('acertos', () => {
  it('saldo líquido = pago − parte + enviado − recebido', () => {
    expect(netBalance({ paidCents: 60000, shareCents: 30000, sentCents: 0, receivedCents: 0 })).toBe(30000);
    expect(netBalance({ paidCents: 0, shareCents: 30000, sentCents: 0, receivedCents: 0 })).toBe(-30000);
  });
  it('pagamento parcial reduz a dívida sem criar receita', () => {
    const ana = netBalance({ paidCents: 60000, shareCents: 30000, sentCents: 0, receivedCents: 10000 });
    const bruno = netBalance({ paidCents: 0, shareCents: 30000, sentCents: 10000, receivedCents: 0 });
    expect(
      resolveDebts([
        { userId: ANA, netCents: ana },
        { userId: BRUNO, netCents: bruno },
      ]),
    ).toEqual([{ fromUserId: BRUNO, toUserId: ANA, amountCents: 20000 }]);
  });
  it('quitação integral zera a dívida', () => {
    const ana = netBalance({ paidCents: 60000, shareCents: 30000, sentCents: 0, receivedCents: 30000 });
    const bruno = netBalance({ paidCents: 0, shareCents: 30000, sentCents: 30000, receivedCents: 0 });
    expect(
      resolveDebts([
        { userId: ANA, netCents: ana },
        { userId: BRUNO, netCents: bruno },
      ]),
    ).toEqual([]);
  });
  it('mensagens do ponto de vista de quem olha', () => {
    const debts = [{ fromUserId: BRUNO, toUserId: ANA, amountCents: 12000 }];
    expect(debtMessage(BRUNO, debts, names)).toBe('Você tem R$ 120,00 para acertar com Ana.');
    expect(debtMessage(ANA, debts, names)).toBe('Bruno tem R$ 120,00 para acertar com você.');
    expect(debtMessage(ANA, [], names)).toBe('Vocês estão quites.');
  });
  it('três pessoas: casa devedores e credores', () => {
    expect(
      resolveDebts([
        { userId: 'a', netCents: 500 },
        { userId: 'b', netCents: -300 },
        { userId: 'c', netCents: -200 },
      ]),
    ).toEqual([
      { fromUserId: 'b', toUserId: 'a', amountCents: 300 },
      { fromUserId: 'c', toUserId: 'a', amountCents: 200 },
    ]);
  });
  it('validação de valor do acerto', () => {
    expect(validateSettlementAmount(30001, 30000)).toMatch(/maior que o pendente/);
    expect(validateSettlementAmount(0, 30000)).toMatch(/maior que zero/);
    expect(validateSettlementAmount(100, 0)).toMatch(/Não há valor/);
    expect(validateSettlementAmount(30000, 30000)).toBeNull();
  });
});
