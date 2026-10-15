// Traduz qualquer erro (Postgres, PostgREST, Auth, Storage, rede) em uma
// mensagem curta em português que pode ir direto para a tela.

export type ErrorKind = 'network' | 'session' | 'permission' | 'validation' | 'conflict' | 'unknown';

export class AppError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
  details?: string;
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  email_address_invalid: 'E-mail inválido.',
  validation_failed: 'Confira os dados informados.',
  signup_disabled: 'Novos cadastros estão desativados.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  refresh_token_not_found: 'Sua sessão expirou. Entre novamente.',
  refresh_token_already_used: 'Sua sessão expirou. Entre novamente.',
  bad_jwt: 'Sua sessão expirou. Entre novamente.',
  otp_expired: 'O link expirou. Peça um novo.',
};

function isNetworkError(e: ErrorLike): boolean {
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.name === 'AuthRetryableFetchError' ||
    (e.name === 'TypeError' && /fetch|network|load failed/.test(msg)) ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(msg)
  );
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (typeof error === 'object' && error !== null ? error : { message: String(error) }) as ErrorLike;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AppError('Sem conexão com a internet. Nada foi salvo; tente de novo quando a conexão voltar.', 'network', error);
  }
  if (isNetworkError(e)) {
    return new AppError('Não foi possível falar com o servidor. Nada foi salvo; verifique a conexão e tente de novo.', 'network', error);
  }

  const code = e.code ?? '';
  if (code && AUTH_MESSAGES[code]) {
    const kind: ErrorKind = /session|token|jwt/.test(code) ? 'session' : 'validation';
    return new AppError(AUTH_MESSAGES[code]!, kind, error);
  }

  // JWT expirado/inválido (PostgREST) ou sessão ausente (Auth).
  if (code === 'PGRST301' || code === 'PGRST302' || /jwt expired|invalid jwt|auth session missing/i.test(e.message ?? '')) {
    return new AppError('Sua sessão expirou. Entre novamente.', 'session', error);
  }

  switch (code) {
    case 'P0001': // mensagens escritas nas nossas RPCs
      return new AppError(e.message ?? 'Operação recusada.', 'validation', error);
    case '42501':
      return new AppError(
        e.message && !/permission denied|row-level security/i.test(e.message)
          ? e.message
          : 'Você não tem permissão para fazer isso.',
        /sess/i.test(e.message ?? '') ? 'session' : 'permission',
        error,
      );
    case '23505':
      return new AppError('Já existe um registro com esses dados.', 'conflict', error);
    case '23503':
      return new AppError('Este registro faz referência a algo que não existe mais.', 'conflict', error);
    case '23514':
    case '22P02':
    case '22003':
    case '23502':
      return new AppError('Dados inválidos. Confira os campos e tente de novo.', 'validation', error);
    case '40001':
    case '40P01':
      return new AppError('Outra alteração aconteceu ao mesmo tempo. Tente de novo.', 'conflict', error);
  }

  // Storage
  if (e.status === 413 || /exceeded the maximum allowed size|payload too large/i.test(e.message ?? '')) {
    return new AppError('Arquivo grande demais (máximo 5 MB).', 'validation', error);
  }
  if (/mime type .* is not supported|invalid mime/i.test(e.message ?? '')) {
    return new AppError('Tipo de arquivo não permitido. Use JPG, PNG, WEBP ou PDF.', 'validation', error);
  }
  if (e.status === 401) return new AppError('Sua sessão expirou. Entre novamente.', 'session', error);
  if (e.status === 403) return new AppError('Você não tem permissão para fazer isso.', 'permission', error);

  return new AppError('Algo deu errado. Tente de novo em instantes.', 'unknown', error);
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
