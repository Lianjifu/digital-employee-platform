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
  BookOpen, Wrench, Brain, Send, Settings as SettingsIcon,
  Search, Bell, Sun, Moon, Menu, Settings2, Languages, Cpu,
  History, BookOpenCheck, LogOut, ChevronDown, Sparkles,
} from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Avatar, Badge, Dot } from '@de/web-ui';
import { cn } from '@de/web-utils';
import { useApiQuery } from '@/services/query';
import type { Workspace } from '@de/web-types';

const NAV: { to: string; label: string; icon: any; code: string; group: 'main' | 'govern' }[] = [
  { to: '/home', label: '首页', icon: Home, code: 'P1', group: 'main' },
  { to: '/copilot', label: '会话', icon: MessageSquare, code: 'P2', group: 'main' },
  { to: '/tasks', label: '任务', icon: ListChecks, code: 'P3', group: 'main' },
  { to: '/workspaces', label: '工作区', icon: Building2, code: 'P4', group: 'govern' },
  { to: '/agents', label: '智能体', icon: Bot, code: 'P5', group: 'main' },
  { to: '/workflows', label: '工作流', icon: Workflow, code: 'P6', group: 'main' },
  { to: '/knowledge', label: '知识', icon: BookOpen, code: 'P7', group: 'main' },
  { to: '/skills', label: '技能', icon: Wrench, code: 'P8', group: 'main' },
  { to: '/models', label: '模型', icon: Brain, code: 'P9', group: 'main' },
  { to: '/channels', label: '渠道', icon: Send, code: 'P10', group: 'main' },
  { to: '/settings', label: '设置', icon: SettingsIcon, code: 'P11', group: 'govern' },
];

const GROUP_LABEL: Record<'main' | 'govern', string> = { main: '业务模块', govern: '治理' };

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useUiStore();
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
  const groups = (['main', 'govern'] as const).map((g) => ({
    key: g,
    items: NAV.filter((n) => n.group === g),
  }));

  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-[var(--bg-elevated)]"
      style={{ gridTemplateColumns: sidebarCollapsed ? '72px 1fr' : '260px 1fr', gridTemplateRows: '60px 1fr' }}
    >
      {/* ============ Topbar ============ */}
      <header
        className="col-span-2 flex h-[60px] items-center gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-6 shadow-[var(--shadow-xs)] sticky top-0 z-30"
        style={{ gridColumn: '1 / -1' }}
      >
        <button
          onClick={toggleSidebar}
          className="grid h-9 w-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
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
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            placeholder="搜索 Agent / 任务 / 文档..."
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] pl-11 pr-12 text-sm transition-all duration-200 placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:bg-[var(--bg)] focus:outline-none focus:shadow-[0_0_0_3px_var(--brand-light)]"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)]">
            ⌘K
          </kbd>
        </div>

        {/* Right */}
        <div className="ml-auto flex items-center gap-3">
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
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {/* 通知 */}
          <button className="relative grid h-9 w-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
          </button>
        </div>
      </header>

      {/* ============ Sidebar ============ */}
      <aside
        className={cn(
          'row-start-2 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto',
          sidebarCollapsed ? 'items-center' : '',
        )}
      >
        {/* 工作区选择器 */}
        {!sidebarCollapsed && current && (
          <div className="p-3 pb-1">
            <button className="flex w-full items-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors">
              <Building2 className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{current.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono">{current.region}</div>
              </div>
              <Badge tone="brand" className="text-[10px]">{current.plan.replace('_', ' ')}</Badge>
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
            </button>
          </div>
        )}

        {/* 主导航 */}
        <nav className="flex-1 px-3 pb-3 space-y-4 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.key}>
              {!sidebarCollapsed && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {GROUP_LABEL[g.key]}
                </div>
              )}
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md text-[13px] transition-all duration-150',
                        sidebarCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-3 py-2',
                        isActive
                          ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
                      )
                    }
                    title={sidebarCollapsed ? `${item.code} · ${item.label}` : undefined}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        'group-hover:text-[var(--brand)]',
                      )}
                    />
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
                          {item.code}
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ============ 左下角：用户触发器 + 菜单 ============ */}
        {user && (
          <div ref={userMenuRef} className={cn('relative mt-auto', sidebarCollapsed ? 'w-full' : '')}>
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

            {/* ============ 用户菜单（企业级 3 组）============ */}
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
                {/* 组 1：Gateway */}
                <div className="user-menu__group-title">GATEWAY</div>
                <UserMenuItem
                  icon={Settings2}
                  label="Settings"
                  onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                />
                <button className="user-menu__item">
                  <span className="user-menu__icon-box"><Languages className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">Language</span>
                  <kbd className="user-menu__shortcut">⌘,</kbd>
                  <span className="user-menu__value">简体中文</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </button>
                <UserMenuItem
                  icon={Cpu}
                  label="Inference configuration"
                  onClick={() => { setUserMenuOpen(false); navigate('/models'); }}
                />

                {/* 分隔 */}
                <div className="user-menu__divider" />

                {/* 组 2：资源 */}
                <button className="user-menu__item">
                  <span className="user-menu__icon-box"><History className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">View changelog</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] -rotate-90" />
                </button>
                <button className="user-menu__item">
                  <span className="user-menu__icon-box"><BookOpenCheck className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">Learn more</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] -rotate-90" />
                </button>

                {/* 分隔 */}
                <div className="user-menu__divider" />

                {/* 组 3：促销 */}
                <button
                  className="user-menu__item user-menu__item--promo"
                  onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                >
                  <span className="user-menu__icon-box"><Sparkles className="h-3.5 w-3.5" /></span>
                  <span className="user-menu__label">升级到 Enterprise Plus</span>
                  <Badge tone="brand" className="text-[10px]">新</Badge>
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