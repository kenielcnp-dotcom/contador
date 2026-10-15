import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RequireAuth, RequireGroup, RequireGuest } from '@/auth/guards';
import { AppShell } from '@/layout/AppShell';
import { Spinner } from '@/ui/States';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { InvitePage } from '@/features/onboarding/InvitePage';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';
import { SettlementsPage } from '@/features/settlements/SettlementsPage';
import { BillsPage } from '@/features/bills/BillsPage';

// Telas menos usadas carregam sob demanda (abre mais rápido no 4G).
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage'));
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const WalletSettingsPage = lazy(() => import('@/features/settings/WalletSettingsPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));

export function FullPageSpinner() {
  return (
    <div className="center-page">
      <Spinner />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<RequireGuest />}>
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignupPage />} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/convite" element={<InvitePage />} />

        <Route element={<RequireAuth />}>
          <Route path="/configurar" element={<OnboardingPage />} />
          <Route element={<RequireGroup />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="/movimentacoes" element={<TransactionsPage />} />
              <Route path="/acertos" element={<SettlementsPage />} />
              <Route path="/contas" element={<BillsPage />} />
              <Route path="/orcamento" element={<BudgetsPage />} />
              <Route path="/metas" element={<GoalsPage />} />
              <Route path="/relatorios" element={<ReportsPage />} />
              <Route path="/carteira" element={<WalletSettingsPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
