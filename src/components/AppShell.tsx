import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ArrowDownToLine,
  TrendingUp,
  Bell,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Chip } from './ui/Chip';
import { Button } from './ui/Button';
import { UserRole } from '../types/database';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/',
    icon: <LayoutDashboard size={17} />,
  },
  {
    label: 'Products',
    to: '/products',
    icon: <Package size={17} />,
  },
  {
    label: 'Sales',
    to: '/sales',
    icon: <ShoppingCart size={17} />,
  },
  {
    label: 'Stock In',
    to: '/stock-in',
    icon: <ArrowDownToLine size={17} />,
  },
  {
    label: 'Forecast',
    to: '/forecast',
    icon: <TrendingUp size={17} />,
    roles: ['manager'],
  },
  {
    label: 'Alerts',
    to: '/alerts',
    icon: <Bell size={17} />,
  },
  {
    label: 'AI Assistant',
    to: '/ai-assistant',
    icon: <Sparkles size={17} />,
    roles: ['manager'],
  },
];

export const AppShell: React.FC = () => {
  const { profile, user, signOut } = useAuth();
  const currentRole: UserRole = profile?.role ?? 'clerk';

  // Hide manager-only navigation items from clerks
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(currentRole)
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div>
          <div className="sidebar-brand">
            <div
              className="text-label-lg"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Kigali Fresh Market
            </div>
            <div
              className="text-label-sm"
              style={{
                color: 'var(--color-secondary)',
                marginTop: '4px',
              }}
            >
              Stock &amp; Profit System
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-link text-label-lg ${
                    isActive ? 'sidebar-link--active' : ''
                  }`.trim()
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-xs)',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div
                className="text-label-md"
                style={{
                  color: 'var(--color-on-surface)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {profile?.full_name || user?.email || 'Staff Member'}
              </div>
              <div
                className="text-label-sm"
                style={{
                  color: 'var(--color-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.email}
              </div>
            </div>
            <Chip variant={currentRole === 'manager' ? 'active' : 'default'}>
              {currentRole === 'manager' ? 'Manager' : 'Clerk'}
            </Chip>
          </div>

          <Button
            variant="secondary"
            onClick={signOut}
            style={{ width: '100%' }}
          >
            <LogOut size={15} />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

