/**
 * PSSP 风格主布局
 * - 顶部 60px Topbar（Logo + Breadcrumb + Search + Status + Theme Toggle + Avatar）
 * - 左侧 260px Sidebar（11 模块分组导航）
 * - Main 流式内容
 */
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import {
  Home, MessageSquare, ListChecks, Building2, Bot, Workflow,
  BookOpen, Wrench, Brain, Send, Settings as SettingsIcon,
  Search, Bell, ChevronDown, LogOut, Sun, Moon, Menu,
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

  const { data: workspaces } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  useEffect(() => {
    if (workspaces && workspaces.length) {
      setList(workspaces);
      if (!current) setCurrent(workspaces[0]);
    }
  }, [workspaces, current, setCurrent, setList]);

  const onLogout = () => {
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
          <span>数字员工平台</span>
        </NavLink>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <span>·</span>
          <span className="text-[var(--text-secondary)]">{activeNav?.label ?? '首页'}</span>
        </div>

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

          {/* 用户 */}
          {user && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1">
              <Avatar name={user.name} size={26} />
              <div className="text-xs">
                <div className="font-semibold leading-tight">{user.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wide">{user.role}</div>
              </div>
              <button onClick={onLogout} className="ml-1 text-[var(--text-muted)] hover:text-[var(--danger)]" title="退出">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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
          <div className="m-3">
            <button className="flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left hover:bg-[var(--bg-hover)]">
              <Building2 className="h-3.5 w-3.5 text-[var(--brand)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{current.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono">{current.region}</div>
              </div>
              <Badge tone="brand">{current.plan.replace('_', ' ')}</Badge>
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
            </button>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.key} className={cn('mb-5', sidebarCollapsed ? 'w-full' : 'px-3')}>
            {!sidebarCollapsed && (
              <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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
                      'flex items-center gap-3 rounded-md text-[13px] transition-all duration-200',
                      sidebarCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-3 py-2.5',
                      isActive
                        ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
                    )
                  }
                  title={sidebarCollapsed ? `${item.code} · ${item.label}` : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">{item.code}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {!sidebarCollapsed && (
          <div className="mt-auto m-3 rounded-md border border-[var(--border)] bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] p-3">
            <div className="text-[11px] font-semibold text-[var(--text)]">💡 提示</div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">
              所有写操作触发等保 3 双签 · 数据境内合规
            </div>
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