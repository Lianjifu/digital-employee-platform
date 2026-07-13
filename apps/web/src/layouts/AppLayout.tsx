/**
 * 主布局：左侧 11 模块导航 + 顶栏（租户/搜索/通知/用户）+ 内容区
 */
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import {
  Home, MessageSquare, ListChecks, Building2, Bot, Workflow,
  BookOpen, Wrench, Brain, Send, Settings as SettingsIcon, Search, Bell,
  ChevronDown, LogOut, Menu,
} from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Avatar, Badge } from '@de/web-ui';
import { cn } from '@de/web-utils';
import { useApiQuery } from '@/services/query';
import type { Workspace } from '@de/web-types';

const NAV = [
  { to: '/home', label: '首页', icon: Home, code: 'P1' },
  { to: '/copilot', label: '会话', icon: MessageSquare, code: 'P2' },
  { to: '/tasks', label: '任务', icon: ListChecks, code: 'P3' },
  { to: '/workspaces', label: '工作区', icon: Building2, code: 'P4' },
  { to: '/agents', label: '智能体', icon: Bot, code: 'P5' },
  { to: '/workflows', label: '工作流', icon: Workflow, code: 'P6' },
  { to: '/knowledge', label: '知识', icon: BookOpen, code: 'P7' },
  { to: '/skills', label: '技能', icon: Wrench, code: 'P8' },
  { to: '/models', label: '模型', icon: Brain, code: 'P9' },
  { to: '/channels', label: '渠道', icon: Send, code: 'P10' },
  { to: '/settings', label: '设置', icon: SettingsIcon, code: 'P11' },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { user, logout } = useAuthStore();
  const { current, setCurrent, setList } = useWorkspaceStore();

  // 加载工作区列表
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg)]">
      {/* 侧边栏 */}
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)] transition-all',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--color-primary)] text-sm font-bold text-white">DE</div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <div className="text-sm font-semibold">数字员工</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">Digital Employee v3.0</div>
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">{item.code}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 折叠按钮 */}
        <button
          onClick={toggleSidebar}
          className="m-2 flex h-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
        >
          <Menu className="h-4 w-4" />
        </button>
      </aside>

      {/* 右侧主区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶栏 */}
        <header className="glass flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4">
          {/* 工作区切换 */}
          <button className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-3)]">
            <Building2 className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="font-medium">{current?.name ?? '加载中…'}</span>
            <Badge tone="info">{current?.region}</Badge>
            <ChevronDown className="h-3 w-3 text-[var(--color-text-muted)]" />
          </button>

          {/* 面包屑 */}
          <div className="text-xs text-[var(--color-text-muted)]">
            {NAV.find((n) => location.pathname.startsWith(n.to))?.label ?? '首页'}
          </div>

          {/* 搜索 */}
          <div className="ml-6 flex flex-1 max-w-md items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <input
              placeholder="搜索 Agent / 任务 / 文档..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
            />
            <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">⌘K</kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* 合规状态 */}
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              等保 3 · 98/100
            </div>

            {/* 通知 */}
            <button className="relative grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--color-surface-2)]">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
            </button>

            {/* 用户 */}
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1">
              <Avatar name={user?.name ?? '?'} size={22} />
              <div className="text-xs">
                <div className="font-medium">{user?.name}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{user?.role.toUpperCase()}</div>
              </div>
              <button onClick={onLogout} className="text-[var(--color-text-muted)] hover:text-rose-500" title="退出">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* 内容 */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}