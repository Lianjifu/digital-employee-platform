/**
 * PSSP 主布局
 * - 顶部 60px Topbar（Logo + Breadcrumb + Search + Status + Theme + Notification）
 * - 左侧 260px Sidebar（11 模块导航 + 工作区切换 + 用户菜单）
 * - 用户信息移到左下角，菜单按 Claude 风格分 3 组
 */
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  Home, MessageSquare, ListChecks, Building2, Bot, Workflow,
  BookOpen, Wrench, Brain, Send,
  Search, Bell, Sun, Moon, Menu, Settings2, Languages,
  LogOut, ChevronDown, X,
} from 'lucide-react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useT } from '@/i18n';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Avatar, Badge, Dot } from '@de/web-ui';
import { cn } from '@de/web-utils';
import { useApiQuery } from '@/services/query';
import type { Workspace } from '@de/web-types';

// 侧栏只放 9 个业务模块导航；
// Settings / Workspace 移到左下角用户菜单（避免重复）
const NAV: { to: string; label: string; i18n: string; icon: any; code: string }[] = [
  { to: '/home', label: '首页', i18n: 'nav.home', icon: Home, code: 'P1' },
  { to: '/copilot', label: '会话', i18n: 'nav.copilot', icon: MessageSquare, code: 'P2' },
  { to: '/tasks', label: '任务', i18n: 'nav.tasks', icon: ListChecks, code: 'P3' },
  { to: '/agents', label: '智能体', i18n: 'nav.agents', icon: Bot, code: 'P5' },
  { to: '/workflows', label: '工作流', i18n: 'nav.workflows', icon: Workflow, code: 'P6' },
  { to: '/knowledge', label: '知识', i18n: 'nav.knowledge', icon: BookOpen, code: 'P7' },
  { to: '/skills', label: '技能', i18n: 'nav.skills', icon: Wrench, code: 'P8' },
  { to: '/models', label: '模型', i18n: 'nav.models', icon: Brain, code: 'P9' },
  { to: '/channels', label: '渠道', i18n: 'nav.channels', icon: Send, code: 'P10' },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme, mobileDrawerOpen, openMobileDrawer, closeMobileDrawer } = useUiStore();
  const { t, locale, setLocale } = useT();
  const { user, logout } = useAuthStore();
  const { current, setCurrent, setList } = useWorkspaceStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: workspaces } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  useEffect(() => {
    if (workspaces && workspaces.length) {
      setList(workspaces);
      if (!current) setCurrent(workspaces[0]);
    }
  }, [workspaces, current, setCurrent, setList]);

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const onLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const activeNav = NAV.find((n) => location.pathname.startsWith(n.to));

  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-[var(--bg-elevated)] lg:[grid-template-columns:260px_1fr] lg:[grid-template-rows:60px_1fr]"
      style={{ gridTemplateColumns: sidebarCollapsed ? '72px 1fr' : '260px 1fr', gridTemplateRows: '60px 1fr' }}
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
        className="col-span-2 flex h-[60px] items-center gap-3 md:gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-4 md:px-6 shadow-[var(--shadow-xs)] sticky top-0 z-30"
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
          {!sidebarCollapsed && <span>数字员工平台</span>}
        </NavLink>

        {/* Breadcrumb */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <span>·</span>
            <span className="text-[var(--text-secondary)]">{activeNav?.label ?? '首页'}</span>
          </div>
        )}

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <GlobalSearch />
        </div>

        {/* Right */}
        <div className="ml-auto flex items-center gap-3">
          {/* 语言切换 */}
          <button
            onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
            className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] text-xs hover:bg-[var(--bg-hover)] transition-colors"
            aria-label={locale === 'zh-CN' ? '切换到 English' : 'Switch to 简体中文'}
            title={locale === 'zh-CN' ? 'EN' : '中'}
          >
            <Languages className="h-3.5 w-3.5" />
            <span className="font-mono font-semibold">{locale === 'zh-CN' ? '中' : 'EN'}</span>
          </button>

          {/* 合规徽章 */}
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--success)]/30 bg-[var(--success-bg)] px-2.5 py-1 text-[11px] text-[var(--success)]">
            <Dot tone="success" />
            <span className="font-mono">等保 3 · 98/100</span>
          </div>

          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="grid h-9 w-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors"
            title={theme === 'light' ? '切换到深色' : '切换到浅色'}
            aria-label={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {/* 通知 */}
          <button
            className="relative grid h-9 w-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            aria-label="通知（1 条未读）"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
          </button>
        </div>
      </header>

      {/* ============ Sidebar ============ */}
      <aside
        className={cn(
          'row-start-2 flex flex-col border-r border-[var(--border)] bg-[var(--bg)]',
          'lg:relative lg:translate-x-0',
          'fixed top-0 bottom-0 left-0 z-50 w-[260px] transition-transform duration-200',
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed ? 'items-center lg:w-[72px]' : '',
        )}
      >
        {/* 主导航（占主要空间）*/}
        <nav className="flex-1 px-3 pt-4 pb-3 overflow-y-auto">
          {!sidebarCollapsed && (
            <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <span>业务模块</span>
              <span className="text-[9px] font-mono normal-case bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">
                {NAV.length} 个
              </span>
            </div>
          )}
          {NAV.map((item) => (
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
              title={sidebarCollapsed ? `${item.code} · ${t(item.i18n)}` : undefined}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  'group-hover:text-[var(--brand)]',
                )}
              />
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 truncate">{t(item.i18n)}</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
                    {item.code}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ============ 左下角：工作区指示器 + 用户触发器 ============ */}
        {!sidebarCollapsed && current && (
          <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)]">
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
              title="切换工作区"
            >
              <Building2 className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">当前工作区</div>
                <div className="text-xs font-semibold truncate">{current.name}</div>
              </div>
              <Badge tone="brand" className="text-[9px] shrink-0">
                {current.plan === 'enterprise_plus' ? 'EP' : current.plan === 'enterprise' ? 'E' : 'S'}
              </Badge>
            </button>
          </div>
        )}

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
                  <span className="user-menu__label">Workspace</span>
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
      <main className="row-start-2 overflow-y-auto bg-[var(--bg-elevated)]">
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