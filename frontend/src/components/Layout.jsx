import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  PiggyBank,
  FolderKanban,
  Wallet,
  Tags,
  Settings,
  LogOut,
  Moon,
  Sun,
  WifiOff,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { initials } from '../utils/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/assets', label: 'Assets', icon: Wallet },
  { to: '/categories', label: 'Categories', icon: Tags },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { isOnline, pendingCount, syncPending, syncing } = useData();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">PW</div>
          <span className="brand-name">PennyWise</span>
        </div>
        <nav className="nav">
          <div className="nav-section">Finance</div>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
          <div className="nav-section">Manage</div>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <Link to="/settings" style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text)' }}>
            <div className="avatar">{initials(user?.name)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{user?.email}</span>
            </div>
          </Link>
          <button className="icon-btn" onClick={handleLogout} title="Log out" aria-label="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="main">
        {!isOnline && (
          <div className="offline-banner">
            <WifiOff size={15} />
            <span>
              You are offline. {pendingCount > 0 ? `${pendingCount} change(s) queued. ` : ''}
              Data is being served from cache.
            </span>
          </div>
        )}
        {isOnline && pendingCount > 0 && (
          <div className="offline-banner">
            <CloudUpload size={15} />
            <span style={{ flex: 1 }}>{pendingCount} offline change(s) waiting to sync.</span>
            <button
              className="btn btn-sm"
              onClick={syncPending}
              disabled={syncing}
              style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '3px 10px' }}
            >
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        )}
        <header className="topbar">
          <div className="topbar-title">PennyWise</div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
