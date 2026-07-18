/**
 * PSSP 主布局
 * - 顶部 60px Topbar（菜单 + Logo + Breadcrumb）
 * - 左侧 200px Sidebar（业务导航 + 用户菜单）
 * - 用户信息移到左下角，菜单按 Claude 风格分 3 组
 */
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Home, MessageSquare, ListChecks, Building2, Bot, Workflow,
  BookOpen, Wrench, Brain, Send,
  Menu, Settings2, Languages, Sun, Moon,
  LogOut, ChevronDown, X, CheckCircle2,
} from 'lucide-react';
import { useT } from '@/i18n';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Avatar, Badge } from '@de/web-ui';
import { cn } from '@de/web-utils';
import { useApiQuery } from '@/services/query';
import type { Workspace } from '@de/web-types';

// 业务导航按工作场景分组；Settings / Workspace 移到左下角用户菜单。
type NavItem = { to: string; label: string; i18n: string; icon: any };
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ to: '/home', label: '首页', i18n: 'nav.home', icon: Home }] },
  {
    label: '协同运营',
    items: [
      { to: '/copilot', label: '会话', i18n: 'nav.copilot', icon: MessageSquare },
      { to: '/tasks', label: '任务', i18n: 'nav.tasks', icon: ListChecks },
    ],
  },
  {
    label: '智能编排',
    items: [
      { to: '/agents', label: '智能体', i18n: 'nav.agents', icon: Bot },
      { to: '/workflows', label: '工作流', i18n: 'nav.workflows', icon: Workflow },
    ],
  },
  {
    label: '能力中心',
    items: [
      { to: '/knowledge', label: '知识', i18n: 'nav.knowledge', icon: BookOpen },
      { to: '/skills', label: '技能', i18n: 'nav.skills', icon: Wrench },
      { to: '/models', label: '模型', i18n: 'nav.models', icon: Brain },
      { to: '/channels', label: '渠道', i18n: 'nav.channels', icon: Send },
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((group) => group.items);

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme, mobileDrawerOpen, openMobileDrawer, closeMobileDrawer } = useUiStore();
  const { t } = useT();
  const { user, logout } = useAuthStore();
  const { current, setCurrent, setList } = useWorkspaceStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  const { data: workspaces } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
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

  const activeNav = NAV.find((n) => location.pathname.startsWith(n.to));

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
        className="col-span-2 flex h-[60px] items-center gap-2 md:gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-3 md:px-6 shadow-[var(--shadow-xs)] sticky top-0 z-30"
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
          {!sidebarCollapsed && <span className="hidden sm:inline">数字员工平台</span>}
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
            <span className="min-w-0 flex-1 truncate font-semibold">{current?.name ?? '选择工作区'}</span>
            {current && <span className="hidden rounded bg-[var(--bg-elevated)] px-1 py-0.5 font-mono text-[9px] text-[var(--text-muted)] lg:inline">{current.region}</span>}
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform', workspaceMenuOpen && 'rotate-180')} />
          </button>
          {workspaceMenuOpen && (
            <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl">
              <div className="border-b border-[var(--border)] px-3 py-2">
                <div className="text-xs font-semibold">切换工作区</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">切换后会更新当前资源、成员权限与运行范围。</div>
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
                <button type="button" onClick={() => { setWorkspaceMenuOpen(false); navigate('/workspaces'); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-light)]"><Settings2 className="h-3.5 w-3.5" />工作区管理</button>
              </div>
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        {!sidebarCollapsed && (
          <div className="hidden items-center gap-2 text-[13px] text-[var(--text-muted)] sm:flex">
            <span>·</span>
            <span className="text-[var(--text-secondary)]">{activeNav?.label ?? '首页'}</span>
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
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label ?? 'home'} className={cn(groupIndex > 0 && (sidebarCollapsed ? 'mt-3 pt-3 border-t border-[var(--border)]' : 'mt-4'))}>
              {!sidebarCollapsed && group.label && (
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {group.label}
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
                <div className="user-menu__group-title">设置</div>
                <UserMenuItem
                  icon={Settings2}
                  label="Settings"
                  shortcut="⌘,"
                  onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                />
                <button
                  className="user-menu__item"
                  onClick={() => { setUserMenuOpen(false); navigate('/workspaces'); }}
                >
                  <span className="user-menu__icon-box"><Building2 className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">工作区管理</span>
                  <span className="user-menu__value">{current?.name ?? 'ACME'}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>
                <button className="user-menu__item">
                  <span className="user-menu__icon-box"><Languages className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">Language</span>
                  <span className="user-menu__value">简体中文</span>
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
                  <span className="user-menu__label">主题</span>
                  <span className="user-menu__value">{theme === 'light' ? '浅色' : '深色'}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>

                {/* 分隔 */}
                <div className="user-menu__divider" />

                {/* Sign out (红) */}
                <button onClick={onLogout} className="user-menu__item user-menu__item--danger">
                  <span className="user-menu__icon-box"><LogOut className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">Sign out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ============ Main ============ */}
      <main className="row-start-2 col-span-2 lg:col-start-2 lg:col-span-1 overflow-y-auto bg-[var(--bg-elevated)] min-w-0">
        <Outlet />
      </main>
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
