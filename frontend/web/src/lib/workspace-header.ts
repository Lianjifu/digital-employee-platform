import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** Pick a workspace id safe to send as x-workspace-id (must be in JWT membership). */
export function resolveWorkspaceHeader(): string {
  const user = useAuthStore.getState().user;
  const current = useWorkspaceStore.getState().currentWorkspaceId;
  const candidate = (current ?? user?.workspaceId ?? 'w1').trim();
  const allowed = user?.workspaceIds ?? [];
  if (allowed.length === 0) return candidate || 'w1';
  if (allowed.includes(candidate)) return candidate;
  if (allowed.includes('w1')) return 'w1';
  return allowed[0]!;
}
