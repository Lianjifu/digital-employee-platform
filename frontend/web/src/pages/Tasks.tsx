import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, Plus } from 'lucide-react';
import type { ControlledTask, Priority, TaskLifecycleStage } from '@de/web-types';
import { Input } from '@de/web-ui';
import { Drawer, RoleReadonlyBanner } from '@/components/shared';
import { useApiMutation, useApiQuery } from '@/services/query';
import { TaskActionSummary, type TaskPreset } from '@/features/tasks/TaskActionSummary';
import { TaskLifecycleBoard } from '@/features/tasks/TaskLifecycleBoard';
import { TaskToolbar, defaultTaskFilters, type TaskFilters } from '@/features/tasks/TaskToolbar';
import { employeeLabel, getStageMeta, isRiskTask, sourceLabel } from '@/features/tasks/task-ui';
import { TaskLifecycleDrawer } from '@/features/tasks/TaskLifecycleDrawer';
import { roleCanMutate, rolePageCopy, resolveAppRole, workspaceErrorMessage } from '@/features/role-nav/role-nav';
import { useAuthStore } from '@/stores/authStore';

const STORAGE_KEY = 'de-controlled-task-console-v1';
type View = 'board' | 'list';

function readPreferences(): { filters: TaskFilters; view: View } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { filters: { ...defaultTaskFilters, ...value.filters }, view: value.view === 'list' ? 'list' : 'board' };
  } catch { return { filters: defaultTaskFilters, view: 'board' }; }
}

function roleDefaultFilters(role: ReturnType<typeof resolveAppRole>, actor: string, base: TaskFilters): TaskFilters {
  if (role === 'user') {
    return { ...base, assignee: actor || base.assignee };
  }
  if (role === 'auditor') {
    return { ...base, approval: 'pending', risk: 'attention' };
  }
  return base;
}

export default function Tasks() {
  const user = useAuthStore((state) => state.user);
  const actor = user?.name ?? '当前用户';
  const role = resolveAppRole(user?.role);
  const canMutate = roleCanMutate(user?.role);
  const copy = rolePageCopy('tasks', user?.role);
  const [preferences] = useState(readPreferences);
  const taskQuery = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const taskCodeFromHome = taskQuery.get('task');
  const [filters, setFilters] = useState<TaskFilters>(() => {
    const seeded = {
      ...preferences.filters,
      search: taskCodeFromHome ?? preferences.filters.search,
      risk: taskQuery.get('risk') === 'attention' ? 'attention' as const : preferences.filters.risk,
    };
    return roleDefaultFilters(role, actor, seeded);
  });
  const [view, setView] = useState<View>(preferences.view);
  const [selected, setSelected] = useState<ControlledTask | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [drawerPending, setDrawerPending] = useState(false);
  const { data: apiTasks = [], isLoading, error, refetch } = useApiQuery<ControlledTask[]>(['controlled-tasks'], '/api/tasks', undefined, { refetchInterval: 5_000 });
  const transition = useApiMutation<ControlledTask, { id: string; stage: TaskLifecycleStage; actor: string }>(({ id }) => `/api/tasks/${id}/transition`, { onSuccess: () => setMessage('任务状态已更新。'), onError: (err) => setMessage(err instanceof Error ? err.message : '状态流转失败，请重试。') });
  const create = useApiMutation<ControlledTask, { title: string; priority: Priority; actor: string }>('/api/tasks', { onSuccess: (task) => { setNewTaskOpen(false); setNewTitle(''); setSelected(task); setMessage('已创建任务。'); }, onError: (err) => setMessage(err instanceof Error ? err.message : '创建任务失败，请重试。') });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, view })); }, [filters, view]);

  const tasks = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return apiTasks.filter((task) => {
      if (!filters.archived && task.lifecycleStage === 'archived') return false;
      if (filters.stage !== 'all' && task.lifecycleStage !== filters.stage) return false;
      if (filters.assignee !== 'all' && task.assignee !== filters.assignee) return false;
      if (filters.risk === 'attention') {
        const riskHit = task.lifecycleStage === 'risk' || isRiskTask(task.sla);
        const approvalHit = task.governance.approvalStatus === 'pending' || task.lifecycleStage === 'human_action';
        if (role === 'auditor') {
          if (!riskHit && !approvalHit) return false;
        } else if (!riskHit) {
          return false;
        }
      } else if (filters.risk !== 'all' && task.sla.risk !== filters.risk) {
        return false;
      }
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (filters.agent !== 'all' && task.digitalEmployeeId !== filters.agent && task.digitalEmployeeName !== filters.agent) return false;
      if (filters.source !== 'all' && task.source !== filters.source) return false;
      if (role !== 'auditor' && filters.approval !== 'all' && task.governance.approvalStatus !== filters.approval) return false;
      if (filters.blocked && !task.links.blockedBy && task.sla.risk !== 'blocked') return false;
      if (query && !`${task.title} ${task.code} ${employeeLabel(task)} ${sourceLabel(task.source)}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [apiTasks, filters, role]);
  const counts = useMemo(() => ({
    pending: apiTasks.filter((task) => task.lifecycleStage === 'pending').length,
    human_action: apiTasks.filter((task) => task.lifecycleStage === 'human_action' || task.governance.approvalStatus === 'pending').length,
    risk: apiTasks.filter((task) => task.lifecycleStage === 'risk' || isRiskTask(task.sla)).length,
    conversation: apiTasks.filter((task) => task.source === 'conversation' || Boolean(task.links.conversationId)).length,
  }), [apiTasks]);
  const applyPreset = (preset: TaskPreset) => setFilters({
    ...defaultTaskFilters,
    stage: preset === 'pending' ? 'pending' : preset === 'human_action' ? 'human_action' : 'all',
    risk: preset === 'risk' ? 'attention' : 'all',
    source: preset === 'conversation' ? 'conversation' : 'all',
    assignee: role === 'user' ? actor : 'all',
  });
  const openTask = (task: ControlledTask) => { setSelected(task); setMessage(null); };
  const moveTask = (task: ControlledTask, stage: TaskLifecycleStage) => {
    if (!canMutate) {
      setMessage('审计只读模式，无法变更任务状态。');
      return;
    }
    transition.mutate({ id: task.id, stage, actor });
  };
  const selectedCurrent = selected ? apiTasks.find((task) => task.id === selected.id) ?? selected : null;
  const mutationPending = transition.isPending || drawerPending;

  useEffect(() => {
    if (!taskCodeFromHome || selected) return;
    const task = apiTasks.find((item) => item.code === taskCodeFromHome);
    if (task) setSelected(task);
  }, [apiTasks, selected, taskCodeFromHome]);

  const errorText = error instanceof Error ? workspaceErrorMessage(error.message) : '请求失败';

  return <main className="task-console px-3 py-3 md:px-4 md:py-4 lg:p-5">
    <div className="task-console-header-panel"><header className="task-console-header"><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div></header></div>
    <div className="task-console-content-panel">
    <RoleReadonlyBanner />
    <TaskActionSummary counts={counts} onPreset={applyPreset} />
    <TaskToolbar filters={filters} onChange={setFilters} view={view} onViewChange={setView} tasks={apiTasks} onCreate={canMutate ? () => setNewTaskOpen(true) : undefined} />
    {message && <div className="task-feedback" role="status">{message}<button type="button" onClick={() => setMessage(null)}>关闭</button></div>}
    {isLoading ? <div className="task-loading"><LoaderCircle className="animate-spin" />正在加载协同任务…</div> : error ? <div className="task-loading error" role="alert"><AlertCircle />无法加载任务：{errorText}<button type="button" onClick={() => refetch()}>重试</button></div> : <TaskLifecycleBoard tasks={tasks} view={view} disabled={mutationPending || !canMutate} onOpen={openTask} onTransition={moveTask} />}
    </div>
    <Drawer open={!!selectedCurrent} onClose={() => setSelected(null)} title={selectedCurrent?.title} description={selectedCurrent ? `${selectedCurrent.code} · ${getStageMeta(selectedCurrent.lifecycleStage).label}` : undefined} width={520} className="task-detail-drawer" flush>
      {selectedCurrent && <div className="task-detail-drawer-body"><TaskLifecycleDrawer task={selectedCurrent} onPendingChange={setDrawerPending} /></div>}
    </Drawer>
    {canMutate && (
      <Drawer open={newTaskOpen} onClose={() => setNewTaskOpen(false)} title="新建任务" description="创建后由任务台统一记录状态与审计。" width={440} footer={<button type="button" className="task-create-btn" disabled={!newTitle.trim() || create.isPending} onClick={() => create.mutate({ title: newTitle.trim(), priority: 'P1', actor })}><Plus size={16} />{create.isPending ? '创建中…' : '创建任务'}</button>}><label className="task-new-label">任务标题<Input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="描述需要与数字员工协同处置的事项" /></label></Drawer>
    )}
  </main>;
}
