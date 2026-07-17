import { Filter, List, Plus, Search, TableProperties, X } from 'lucide-react';
import type { ControlledTask, Priority, TaskLifecycleStage, TaskRisk } from '@de/web-types';
import { Button } from '@de/web-ui';
import { getStageMeta, riskLabel } from './task-ui';

export type TaskFilters = {
  search: string; stage: TaskLifecycleStage | 'all'; assignee: string; risk: TaskRisk | 'all' | 'attention';
  priority: Priority | 'all'; agent: string; source: ControlledTask['source'] | 'all';
  approval: ControlledTask['governance']['approvalStatus'] | 'all'; blocked: boolean; archived: boolean;
};

export const defaultTaskFilters: TaskFilters = { search: '', stage: 'all', assignee: 'all', risk: 'all', priority: 'all', agent: 'all', source: 'all', approval: 'all', blocked: false, archived: false };

const Select = ({ value, onChange, children, label }: { value: string; onChange: (value: string) => void; children: React.ReactNode; label: string }) =>
  <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>;

export function TaskToolbar({ filters, onChange, view, onViewChange, tasks, onCreate }: {
  filters: TaskFilters; onChange: (next: TaskFilters) => void; view: 'board' | 'list'; onViewChange: (view: 'board' | 'list') => void;
  tasks: ControlledTask[]; onCreate: () => void;
}) {
  const update = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => onChange({ ...filters, [key]: value });
  const assignees = Array.from(new Set(tasks.map((task) => task.assignee).filter(Boolean))) as string[];
  const agents = Array.from(new Set(tasks.map((task) => task.agentId).filter(Boolean))) as string[];
  const advancedActive = filters.priority !== 'all' || filters.agent !== 'all' || filters.source !== 'all' || filters.approval !== 'all' || filters.blocked || filters.archived;
  return <div className="task-toolbar">
    <label className="task-search"><Search size={16} /><input value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="搜索任务、编号、来源" /></label>
    <Select label="状态" value={filters.stage} onChange={(value) => update('stage', value as TaskFilters['stage'])}><option value="all">全部状态</option>{(['pending', 'running', 'human_action', 'risk', 'completed'] as TaskLifecycleStage[]).map((stage) => <option key={stage} value={stage}>{getStageMeta(stage).label}</option>)}</Select>
    <Select label="负责人" value={filters.assignee} onChange={(value) => update('assignee', value)}><option value="all">全部负责人</option>{assignees.map((name) => <option key={name}>{name}</option>)}</Select>
    <Select label="风险" value={filters.risk} onChange={(value) => update('risk', value as TaskFilters['risk'])}><option value="all">全部风险</option><option value="attention">风险异常</option>{(['warning', 'critical', 'overdue', 'failed', 'blocked'] as TaskRisk[]).map((risk) => <option key={risk} value={risk}>{riskLabel(risk)}</option>)}</Select>
    <details className="task-advanced"><summary><Filter size={15} />筛选{advancedActive && <i />}</summary><div className="task-advanced-panel">
      <Select label="优先级" value={filters.priority} onChange={(value) => update('priority', value as TaskFilters['priority'])}><option value="all">全部优先级</option>{(['P0', 'P1', 'P2', 'P3'] as Priority[]).map((value) => <option key={value}>{value}</option>)}</Select>
      <Select label="数字员工" value={filters.agent} onChange={(value) => update('agent', value)}><option value="all">全部数字员工</option>{agents.map((value) => <option key={value}>{value}</option>)}</Select>
      <Select label="来源" value={filters.source} onChange={(value) => update('source', value as TaskFilters['source'])}><option value="all">全部来源</option><option value="alert">告警</option><option value="conversation">会话</option><option value="workflow">工作流</option><option value="manual">手工创建</option></Select>
      <Select label="审批" value={filters.approval} onChange={(value) => update('approval', value as TaskFilters['approval'])}><option value="all">全部审批状态</option><option value="pending">待审批</option><option value="approved">已批准</option><option value="rejected">已拒绝</option><option value="not_required">无需审批</option></Select>
      <label><input type="checkbox" checked={filters.blocked} onChange={(event) => update('blocked', event.target.checked)} />仅阻塞</label><label><input type="checkbox" checked={filters.archived} onChange={(event) => update('archived', event.target.checked)} />包含归档</label>
      {advancedActive && <button type="button" className="task-clear-filters" onClick={() => onChange({ ...defaultTaskFilters, search: filters.search, stage: filters.stage, assignee: filters.assignee, risk: filters.risk })}><X size={14} />清除高级筛选</button>}
    </div></details>
    <div className="task-toolbar-actions"><div className="task-view-toggle"><button aria-label="看板视图" className={view === 'board' ? 'active' : ''} onClick={() => onViewChange('board')}><TableProperties size={16} /></button><button aria-label="列表视图" className={view === 'list' ? 'active' : ''} onClick={() => onViewChange('list')}><List size={16} /></button></div><Button onClick={onCreate}><Plus size={16} />新建任务</Button></div>
  </div>;
}
