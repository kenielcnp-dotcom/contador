import {
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  Ellipsis,
  Goal,
  Handshake,
  House,
  Plus,
  PiggyBank,
  Settings,
  UserRound,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { APP_NAME } from '@/app/config';
import { useGroup } from '@/data/queries';
import { useOnline, useRealtimeSync } from '@/data/realtime';
import { TransactionForm, type TransactionFormInitial } from '@/features/transactions/TransactionForm';
import { Avatar } from '@/ui/Avatar';
import { Sheet } from '@/ui/Sheet';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Início', icon: House },
  { to: '/movimentacoes', label: 'Movimentações', icon: ArrowLeftRight },
  { to: '/acertos', label: 'Acertos', icon: Handshake },
  { to: '/contas', label: 'Contas a pagar', icon: CalendarClock },
];

const PLANNING: NavItem[] = [
  { to: '/orcamento', label: 'Orçamento', icon: PiggyBank },
  { to: '/metas', label: 'Metas', icon: Goal },
  { to: '/relatorios', label: 'Relatórios', icon: ChartColumn },
];

const MORE: NavItem[] = [
  { to: '/contas', label: 'Contas a pagar', icon: CalendarClock },
  ...PLANNING,
  { to: '/carteira', label: 'Carteira', icon: Settings },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
];

interface QuickActions {
  /** Abre o formulário de nova movimentação (ou de edição, com initial.id). */
  openTransaction: (initial?: TransactionFormInitial) => void;
}

const QuickActionsContext = createContext<QuickActions | null>(null);

export function useQuickActions(): QuickActions {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) throw new Error('useQuickActions fora do AppShell');
  return ctx;
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="12" r="5.5" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="15" cy="12" r="5.5" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      </span>
      {APP_NAME}
    </span>
  );
}

export function AppShell() {
  const { group, me } = useGroup();
  const online = useOnline();
  const realtime = useRealtimeSync(group.id);
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [txForm, setTxForm] = useState<{ key: number; initial?: TransactionFormInitial } | null>(null);

  const openTransaction = useCallback((initial?: TransactionFormInitial) => {
    setTxForm({ key: Date.now(), initial });
  }, []);
  const actions = useMemo(() => ({ openTransaction }), [openTransaction]);

  const moreActive = MORE.some((i) => location.pathname.startsWith(i.to));

  return (
    <QuickActionsContext.Provider value={actions}>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={16} aria-hidden /> Sem conexão. Os dados podem estar desatualizados e nada pode ser salvo agora.
        </div>
      )}
      <div className="shell">
        <aside className="sidebar" aria-label="Navegação principal">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Brand />
          </Link>
          <button type="button" className="btn btn-primary btn-block" onClick={() => openTransaction()}>
            <Plus size={18} aria-hidden /> Nova movimentação
          </button>
          <nav className="nav">
            {PRIMARY.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'}>
                <i.icon size={18} aria-hidden /> {i.label}
              </NavLink>
            ))}
            <span className="nav-label">Planejamento</span>
            {PLANNING.map((i) => (
              <NavLink key={i.to} to={i.to}>
                <i.icon size={18} aria-hidden /> {i.label}
              </NavLink>
            ))}
            <span className="nav-label">Carteira</span>
            <NavLink to="/carteira">
              <Settings size={18} aria-hidden /> {group.name}
            </NavLink>
          </nav>
          <div className="sidebar-footer">
            {realtime === 'offline' && online && (
              <span className="small muted" role="status">
                Atualização automática pausada — as telas recarregam ao voltar.
              </span>
            )}
            <Link to="/perfil" className="user-chip">
              <Avatar name={me.name} path={me.avatarPath} />
              <span style={{ minWidth: 0 }}>
                <span className="list-title" style={{ display: 'block' }}>
                  {me.name}
                </span>
                <span className="small muted">Meu perfil</span>
              </span>
            </Link>
          </div>
        </aside>

        <header className="topbar">
          <Link to="/" style={{ textDecoration: 'none', flex: 1 }}>
            <Brand />
          </Link>
          <Link to="/perfil" aria-label="Meu perfil">
            <Avatar name={me.name} path={me.avatarPath} />
          </Link>
        </header>

        <main id="conteudo" className="main" tabIndex={-1}>
          <Outlet />
        </main>

        <nav className="bottomnav" aria-label="Navegação principal">
          <NavLink to="/" end>
            <House size={22} aria-hidden />
            Início
          </NavLink>
          <NavLink to="/movimentacoes">
            <ArrowLeftRight size={22} aria-hidden />
            Lançamentos
          </NavLink>
          <button type="button" className="fab" onClick={() => openTransaction()} aria-label="Nova movimentação">
            <Plus size={26} aria-hidden />
          </button>
          <NavLink to="/acertos">
            <Handshake size={22} aria-hidden />
            Acertos
          </NavLink>
          <button type="button" onClick={() => setMoreOpen(true)} style={moreActive ? { color: 'var(--green-900)' } : undefined} aria-haspopup="dialog">
            <Ellipsis size={22} aria-hidden />
            Mais
          </button>
        </nav>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais opções">
        <div className="more-grid">
          {MORE.map((i) => (
            <Link key={i.to + i.label} to={i.to} onClick={() => setMoreOpen(false)}>
              <i.icon size={22} aria-hidden />
              {i.label}
            </Link>
          ))}
        </div>
      </Sheet>

      {txForm && <TransactionForm key={txForm.key} initial={txForm.initial} onClose={() => setTxForm(null)} />}
    </QuickActionsContext.Provider>
  );
}
