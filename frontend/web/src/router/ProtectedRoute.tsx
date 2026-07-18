/**
 * 路由守卫 — 鉴权 + 权限
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { Permission, Role } from '@de/web-types';

interface Props {
  children: ReactNode;
  permission?: Permission;
  roles?: Role[];
}

export function ProtectedRoute({ children, permission, roles }: Props) {
  const { isAuthed, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthed || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permission && !user.permissions.includes(permission)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="text-5xl">🔒</div>
        <div className="text-lg font-semibold">无权访问</div>
        <div className="text-sm text-[var(--color-text-muted)]">
          当前角色 <b>{user.role.toUpperCase()}</b> 缺少权限 <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5">{permission}</code>
        </div>
      </div>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="text-5xl">🚫</div>
        <div className="text-lg font-semibold">角色受限</div>
        <div className="text-sm text-[var(--color-text-muted)]">
          该页面仅限 {roles.map((r) => r.toUpperCase()).join(' / ')} 角色访问
        </div>
      </div>
    );
  }

  return <>{children}</>;
}