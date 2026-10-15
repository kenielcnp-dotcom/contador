import { toAppError } from '@/data/errors';

describe('tradução de erros', () => {
  it('mensagens das RPCs passam direto', () => {
    const e = toAppError({ code: 'P0001', message: 'Esta conta já está paga.' });
    expect(e.message).toBe('Esta conta já está paga.');
    expect(e.kind).toBe('validation');
  });
  it('falha de rede avisa que nada foi salvo', () => {
    const e = toAppError(new TypeError('Failed to fetch'));
    expect(e.kind).toBe('network');
    expect(e.message).toMatch(/Nada foi salvo/);
  });
  it('sessão expirada', () => {
    expect(toAppError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('session');
    expect(toAppError({ code: 'refresh_token_not_found' }).kind).toBe('session');
  });
  it('erros de autenticação em português', () => {
    expect(toAppError({ code: 'invalid_credentials' }).message).toBe('E-mail ou senha incorretos.');
    expect(toAppError({ code: 'user_already_exists' }).message).toMatch(/Já existe/);
  });
  it('permissão negada pelo RLS vira mensagem genérica', () => {
    const e = toAppError({ code: '42501', message: 'new row violates row-level security policy for table "x"' });
    expect(e.message).toBe('Você não tem permissão para fazer isso.');
    expect(e.kind).toBe('permission');
  });
  it('desconhecido não vaza detalhes técnicos', () => {
    expect(toAppError({ message: 'relation "foo" does not exist' }).message).toBe('Algo deu errado. Tente de novo em instantes.');
  });
});
