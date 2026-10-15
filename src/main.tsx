import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/App';
import { configProblem } from './app/config';
import { AuthProvider } from './auth/AuthProvider';
import { toAppError } from './data/errors';
import { ConfirmProvider } from './ui/Confirm';
import { ToastProvider } from './ui/Toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Erro de sessão/permissão não melhora tentando de novo.
      retry: (count, error) => {
        const kind = toAppError(error).kind;
        return kind !== 'session' && kind !== 'permission' && count < 2;
      },
    },
  },
});

const root = createRoot(document.getElementById('root')!);
const problem = configProblem();

if (problem) {
  root.render(
    <div className="auth-page">
      <div className="auth-card">
        <div className="card">
          <h1>Configuração incompleta</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {problem}
          </p>
        </div>
      </div>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
