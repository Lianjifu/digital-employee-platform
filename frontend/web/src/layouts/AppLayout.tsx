/**
 * PSSP 主布局
 * - 顶部 60px Topbar（菜单 + Logo + Breadcrumb）
 * - 左侧 200px Sidebar（业务导航 + 用户菜单）
 * - 用户信息移到左下角，菜单按 Claude 风格分 3 组
 */
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Home, MessageSquare, ListChecks, Building2, BriefcaseBusiness, Workflow,
  BookOpen, Wrench, Brain, BrainCircuit, Send,
  Menu, Settings2, Languages, Sun, Moon,
  LogOut, ChevronDown, X, CheckCircle2,
  Shield, ShieldAlert, ScrollText, Sparkles,
} from 'lucide-react';
import { useT } from '@/i18n';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Avatar, Badge } from '@de/web-ui';
import { cn } from '@de/web-utils';
import { useApiQuery } from '@/services/query';
import { OnboardingGuide } from '@/features/onboarding/OnboardingGuide';
import type { Permission, Workspace } from '@de/web-types';

// 业务导航按工作场景分组；Settings / Workspace 移到左下角用户菜单。
type NavItem = { to: string; i18n: string; icon: any; permission?: Permission; roles?: Array<'user' | 'admin' | 'auditor'> };
const NAV_GROUPS: { labelKey: string | null; items: NavItem[] }[] = [
  { labelKey: null, items: [{ to: '/home', i18n: 'nav.home', icon: Home, roles: ['user', 'admin'] }] },
  {
    labelKey: 'nav.group.operations',
    items: [
      { to: '/copilot', i18n: 'nav.copilot', icon: MessageSquare, roles: ['user', 'admin'] },
      { to: '/tasks', i18n: 'nav.tasks', icon: ListChecks, roles: ['user', 'admin'] },
    ],
  },
  {
    labelKey: 'nav.group.orchestration',
    items: [
      { to: '/agents', i18n: 'nav.agents', icon: BriefcaseBusiness, roles: ['user', 'admin'] },
      { to: '/workflows', i18n: 'nav.workflows', icon: Workflow, roles: ['user', 'admin'] },
    ],
  },
  {
    labelKey: 'nav.group.capabilities',
    items: [
      { to: '/models', i18n: 'nav.models', icon: Brain, roles: ['admin'] },
      { to: '/knowledge', i18n: 'nav.knowledge', icon: BookOpen, roles: ['user', 'admin'] },
      { to: '/skills', i18n: 'nav.skills', icon: Wrench, roles: ['user', 'admin'] },
      { to: '/memory', i18n: 'nav.memory', icon: BrainCircuit, roles: ['user', 'admin'] },
      { to: '/channels', i18n: 'nav.channels', icon: Send, roles: ['admin'] },
    ],
  },
  {
    labelKey: 'nav.group.governance',
    items: [
      { to: '/governance', i18n: 'nav.accessControl', icon: Shield, roles: ['admin'] },
      { to: '/zero-trust', i18n: 'nav.zeroTrust', icon: ShieldAlert, roles: ['admin', 'auditor'] },
      { to: '/audit-center', i18n: 'nav.auditCenter', icon: ScrollText, roles: ['admin', 'auditor'] },
    ],
  },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme, mobileDrawerOpen, openMobileDrawer, closeMobileDrawer } = useUiStore();
  const { locale, t, setLocale } = useT();
  const { user, logout } = useAuthStore();
  const { current, setCurrent, setList } = useWorkspaceStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  const { data: workspaces } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  const onboardingStorageKey = user ? `de-onboarding-completed:v1:${user.id}` : null;

  // 引导仅对每个账号的首次登录展示；刷新或后续登录不重复打扰用户。
  useEffect(() => {
    if (!onboardingStorageKey) {
      setOnboardingOpen(false);
      return;
    }
    setOnboardingOpen(localStorage.getItem(onboardingStorageKey) !== 'true');
  }, [onboardingStorageKey]);

  const closeOnboarding = () => {
    if (onboardingStorageKey) localStorage.setItem(onboardingStorageKey, 'true');
    setOnboardingOpen(false);
  };

  useEffect(() => {
    if (workspaces && workspaces.length) {
      setList(workspaces);
      if (!current) setCurrent(workspaces[0]);
    }
  }, [workspaces, current, setCurrent, setList]);

  // 点击外部关闭用户菜单与工作区切换器
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };
    if (userMenuOpen || workspaceMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen, workspaceMenuOpen]);

  const onLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const visibleNavGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !user || ((!item.permission || user.permissions.includes(item.permission)) && (!item.roles || item.roles.includes(user.role)))),
    }))
    .filter((group) => group.items.length > 0);
  const activeNav = visibleNavGroups.flatMap((group) => group.items).find((n) => location.pathname.startsWith(n.to));

  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-[var(--bg-elevated)] lg:[grid-template-columns:var(--sidebar-width)_1fr] lg:[grid-template-rows:60px_1fr]"
      style={{ '--sidebar-width': sidebarCollapsed ? '72px' : '200px', gridTemplateRows: '60px 1fr' } as CSSProperties}
    >
      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={closeMobileDrawer}
          aria-hidden="true"
        />
      )}
      {/* ============ Topbar ============ */}
      <header
        className="app-glass col-span-2 sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b px-3 shadow-[var(--shadow-xs)] md:gap-6 md:px-6"
        style={{ gridColumn: '1 / -1' }}
      >
        <button
          onClick={() => {
            if (window.innerWidth < 1024) openMobileDrawer();
            else toggleSidebar();
          }}
          className="grid h-9 w-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Logo */}
        <NavLink to="/home" className="flex items-center gap-3 text-[var(--text)] font-bold text-[17px]">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-sm font-bold text-white shadow-[0_2px_8px_rgba(79,70,229,0.3)]">
            DE
          </div>
          {!sidebarCollapsed && <span className="hidden sm:inline">{t('app.title')}</span>}
        </NavLink>

        <div ref={workspaceMenuRef} className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setWorkspaceMenuOpen((open) => !open)}
            className={cn('flex h-8 max-w-[240px] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-left text-xs transition-colors hover:border-[var(--brand)]', workspaceMenuOpen && 'border-[var(--brand)] bg-[var(--brand-light)]')}
            aria-haspopup="menu"
            aria-expanded={workspaceMenuOpen}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
            <span className="min-w-0 flex-1 truncate font-semibold">{current?.name ?? t('workspace.select')}</span>
            {current && <span className="hidden rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[9px] text-[var(--text-muted)] lg:inline">{current.region}</span>}
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform', workspaceMenuOpen && 'rotate-180')} />
          </button>
          {workspaceMenuOpen && (
            <div role="menu" className="app-glass-panel absolute left-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-lg shadow-xl">
              <div className="border-b border-[var(--border)] px-3 py-2">
                <div className="text-xs font-semibold">{t('workspace.switch')}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{t('workspace.switch.desc')}</div>
              </div>
              <div className="max-h-[280px] overflow-y-auto p-1.5">
                {(workspaces ?? []).map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={workspace.id === current?.id}
                    onClick={() => { setCurrent(workspace); setWorkspaceMenuOpen(false); }}
                    className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]', workspace.id === current?.id && 'bg-[var(--brand-light)]')}
                  >
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', workspace.id === current?.id ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]')}><Building2 className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{workspace.name}</span><span className="block text-[10px] text-[var(--text-muted)]">{workspace.region} · {workspace.memberCount} 成员 · 合规 {workspace.complianceScore}</span></span>
                    {workspace.id === current?.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--brand)]" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-[var(--border)] p-1.5">
                <button type="button" onClick={() => { setWorkspaceMenuOpen(false); navigate('/workspaces'); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-light)]"><Settings2 className="h-3.5 w-3.5" />{t('workspace.manage')}</button>
              </div>
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        {!sidebarCollapsed && (
          <div className="hidden items-center gap-2 text-[13px] text-[var(--text-muted)] sm:flex">
            <span>·</span>
            <span className="text-[var(--text-secondary)]">{t(activeNav?.i18n ?? 'nav.home')}</span>
          </div>
        )}

        {/* Right */}
        <div className="ml-auto" />
      </header>

      {/* ============ Sidebar ============ */}
      <aside
        className={cn(
          'row-start-2 flex flex-col border-r border-[var(--border)] bg-[var(--bg)]',
          'lg:relative lg:translate-x-0',
          'fixed top-0 bottom-0 left-0 z-50 w-[260px] transition-transform duration-200',
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed ? 'items-center lg:w-[72px]' : 'lg:w-[200px]',
        )}
      >
        {/* 主导航（占主要空间）*/}
        <nav className="flex-1 px-3 pt-4 pb-3 overflow-y-auto">
          {visibleNavGroups.map((group, groupIndex) => (
            <div key={group.labelKey ?? 'home'} className={cn(groupIndex > 0 && (sidebarCollapsed ? 'mt-3 pt-3 border-t border-[var(--border)]' : 'mt-4'))}>
              {!sidebarCollapsed && group.labelKey && (
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {t(group.labelKey)}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md text-[13px] transition-all duration-150',
                        sidebarCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-3 py-2.5',
                        isActive
                          ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
                      )
                    }
                    title={sidebarCollapsed ? t(item.i18n) : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0 transition-colors group-hover:text-[var(--brand)]" />
                    {!sidebarCollapsed && <span className="flex-1 truncate">{t(item.i18n)}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ============ 左下角：用户触发器 + 菜单 ============ */}
        {user && (
          <div ref={userMenuRef} className={cn('relative', sidebarCollapsed ? 'w-full' : '')}>
            {sidebarCollapsed ? (
              // 收起态：纯圆形头像
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className={cn(
                  'user-trigger justify-center h-14',
                  userMenuOpen && 'user-trigger--open',
                )}
                title={user.name}
              >
                <Avatar name={user.name} size={30} />
              </button>
            ) : (
              // 展开态：32px 头像 + 双行 + chevron
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className={cn('user-trigger', userMenuOpen && 'user-trigger--open')}
              >
                <Avatar name={user.name} size={32} />
                <div className="user-trigger__info">
                  <div className="user-trigger__name">{user.name}</div>
                  <div className="user-trigger__meta">
                    {user.role.toUpperCase()} · {current?.name ?? 'ACME 生产'}
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    'user-trigger__chevron h-4 w-4',
                    userMenuOpen && 'user-trigger__chevron--open',
                  )}
                />
              </button>
            )}

            {/* ============ 用户菜单（精简 5 项）============ */}
            {userMenuOpen && (
              <div
                className={cn(
                  'user-menu absolute z-50',
                  sidebarCollapsed
                    ? 'left-full ml-2 bottom-0'
                    : 'left-2 right-2 bottom-full mb-2',
                )}
                style={sidebarCollapsed ? { bottom: 0 } : undefined}
              >
                {/* 组 1：配置 */}
                <div className="user-menu__group-title">{t('account.preferences')}</div>
                {(user.role === 'admin') && <UserMenuItem icon={Settings2} label={t('account.platformSettings')} shortcut="⌘," onClick={() => { setUserMenuOpen(false); navigate('/settings'); }} />}
                {user.role === 'admin' && <button
                  className="user-menu__item"
                  onClick={() => { setUserMenuOpen(false); navigate('/workspaces'); }}
                >
                  <span className="user-menu__icon-box"><Building2 className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">{t('workspace.manage')}</span>
                  <span className="user-menu__value">{current?.name ?? 'ACME'}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>}
                <UserMenuItem icon={Sparkles} label="启用向导" onClick={() => { setUserMenuOpen(false); setOnboardingOpen(true); }} />
                <button
                  className="user-menu__item"
                  onClick={() => { setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN'); setUserMenuOpen(false); }}
                  title={locale === 'zh-CN' ? 'Switch to English' : '切换为简体中文'}
                >
                  <span className="user-menu__icon-box"><Languages className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">{t('account.language')}</span>
                  <span className="user-menu__value">{locale === 'zh-CN' ? t('common.lang.zh') : t('common.lang.en')}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>

                {/* 分隔 */}
                <div className="user-menu__divider" />

                {/* 组 2：偏好（主题） */}
                <button
                  className="user-menu__item"
                  onClick={() => { toggleTheme(); setUserMenuOpen(false); }}
                >
                  <span className="user-menu__icon-box">
                    {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  </span>
                  <span className="user-menu__label">{t('account.theme')}</span>
                  <span className="user-menu__value">{theme === 'light' ? t('common.theme.light') : t('common.theme.dark')}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>

                {/* 分隔 */}
                <div className="user-menu__divider" />

                <button onClick={onLogout} className="user-menu__item user-menu__item--danger">
                  <span className="user-menu__icon-box"><LogOut className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">{t('account.signOut')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ============ Main ============ */}
      <main className={cn('row-start-2 col-span-2 min-w-0 bg-[var(--bg-elevated)] lg:col-start-2 lg:col-span-1', location.pathname.startsWith('/workflows') || location.pathname.startsWith('/agents') || location.pathname.startsWith('/copilot') ? 'overflow-hidden' : 'overflow-y-auto')}>
        <Outlet />
      </main>
      <OnboardingGuide open={onboardingOpen} onClose={closeOnboarding} />
    </div>
  );
}

// ============ 菜单项（带 icon-box） ============
function UserMenuItem({
  icon: Icon, label, shortcut, onClick,
}: {
  icon: any;
  label: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="user-menu__item">
      <span className="user-menu__icon-box">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="user-menu__label">{label}</span>
      {shortcut && <kbd className="user-menu__shortcut">{shortcut}</kbd>}
    </button>
  );
}
