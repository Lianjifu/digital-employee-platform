import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Gavel, History, Play, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import type { ControlledTask, TaskAuditEvent, TaskLifecycleStage } from '@de/web-types';
import { Badge, Button, Input } from '@de/web-ui';
import { useApiMutation, useApiQuery } from '@/services/query';
import { getPrimaryAction, getStageMeta, riskLabel, sourceLabel } from './task-ui';
import { useAuthStore } from '@/stores/authStore';

type Tab = 'overview' | 'execution' | 'governance' | 'audit';
type Props = { task: ControlledTask; onPendingChange: (pending: boolean) => void };

function time(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function TaskLifecycleDrawer({ task: summary, onPendingChange }: Props) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const actor = user?.name ?? '当前用户';
  const [tab, setTab] = useState<Tab>('overview');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<'approve' | 'reject' | 'takeover' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const { data: task = summary, error: taskError, refetch: refetchTask } = useApiQuery<ControlledTask>(['controlled-task', summary.id], `/api/tasks/${summary.id}`, undefined, { refetchInterval: 5_000 });
  const { data: audit = task.auditEvents, error: auditError, refetch: refetchAudit } = useApiQuery<TaskAuditEvent[]>(['controlled-task-audit', summary.id], `/api/tasks/${summary.id}/audit`, undefined, { refetchInterval: 5_000 });
  const mutationOptions = { onError: (error: unknown) => setActionError(error instanceof Error ? error.message : '操作失败，请重试。') };
  const transition = useApiMutation<ControlledTask, { id: string; stage: TaskLifecycleStage; actor: string }>(({ id }) => `/api/tasks/${id}/transition`, mutationOptions);
  const approve = useApiMutation<ControlledTask, { id: string; actor: string; approved: boolean; reason: string }>(({ id }) => `/api/tasks/${id}/approve`, mutationOptions);
  const takeover = useApiMutation<ControlledTask, { id: string; actor: string; reason: string }>(({ id }) => `/api/tasks/${id}/takeover`, mutationOptions);
  const retry = useApiMutation<ControlledTask, { id: string; actor: string; reason: string }>(({ id }) => `/api/tasks/${id}/retry`, mutationOptions);
  const pending = transition.isPending || approve.isPending || takeover.isPending || retry.isPending;

  useEffect(() => onPendingChange(pending), [onPendingChange, pending]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  const primary = getPrimaryAction(task.lifecycleStage, task.sla.risk);
  const requestRetry = (reason: string) => {
    const request = () => retry.mutate({ id: task.id, actor, reason });
    setRetryAction(() => request);
    request();
  };
  const requestTransition = (stage: TaskLifecycleStage) => {
    const request = () => transition.mutate({ id: task.id, stage, actor });
    setRetryAction(() => request);
    request();
  };
  const requestApproval = (approved: boolean, actionReason: string) => {
    const request = () => approve.mutate({ id: task.id, actor, approved, reason: actionReason });
    setRetryAction(() => request);
    request();
  };
  const requestTakeover = (actionReason: string) => {
    const request = () => takeover.mutate({ id: task.id, actor, reason: actionReason });
    setRetryAction(() => request);
    request();
  };
  const runPrimary = () => {
    setActionError(null);
    if (primary.key === 'retry') return requestRetry('请求重试执行');
    if (primary.key === 'takeover') return setConfirming('takeover');
    const stage: TaskLifecycleStage | null = primary.key === 'start' ? 'running' : primary.key === 'pause' ? 'human_action' : primary.key === 'archive' ? 'archived' : null;
    if (stage) requestTransition(stage);
  };
  const confirmAction = () => {
    if (!confirming || !reason.trim()) return;
    setActionError(null);
    if (confirming === 'takeover') requestTakeover(reason.trim());
    else requestApproval(confirming === 'approve', reason.trim());
    setConfirming(null);
    setReason('');
  };
  const auditEvents = useMemo(() => [...audit].sort((a, b) => b.at.localeCompare(a.at)), [audit]);

  return <div className="task-lifecycle-drawer">
    <div className="task-drawer-badges"><Badge tone={task.priority === 'P0' ? 'error' : task.priority === 'P1' ? 'warn' : 'info'}>{task.priority}</Badge><Badge tone={getStageMeta(task.lifecycleStage).tone}>{getStageMeta(task.lifecycleStage).label}</Badge></div>
    <nav className="task-drawer-tabs" aria-label="任务详情"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>概览</button><button className={tab === 'execution' ? 'active' : ''} onClick={() => setTab('execution')}>执行</button><button className={tab === 'governance' ? 'active' : ''} onClick={() => setTab('governance')}>治理</button><button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>审计</button></nav>
    {taskError && <QueryError message="无法加载任务详情" error={taskError} onRetry={() => refetchTask()} />}
    {auditError && <QueryError message="无法加载审计记录" error={auditError} onRetry={() => refetchAudit()} />}
    {actionError && <div className="task-drawer-error" role="alert"><AlertCircle size={15} />{actionError}<button type="button" onClick={() => retryAction?.()} disabled={pending || !retryAction}>重试</button></div>}
    {tab === 'overview' && <Overview task={task} />}
    {tab === 'execution' && <Execution task={task} />}
    {tab === 'governance' && <Governance task={task} pending={pending} canManage={isAdmin} onApprove={() => setConfirming('approve')} onReject={() => setConfirming('reject')} onTakeover={() => setConfirming('takeover')} onRetry={() => requestRetry('治理页请求重试')} />}
    {tab === 'audit' && <Audit events={auditEvents} />}
    {confirming && <section className="task-confirm" aria-label="确认操作"><strong>{confirming === 'approve' ? '确认批准任务' : confirming === 'reject' ? '确认拒绝任务' : '确认人工接管'}</strong><p>{confirming === 'reject' ? '拒绝原因会写入不可变审计记录。' : '请填写操作原因，系统会记录操作者和时间。'}</p><Input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请输入原因" /><div><Button size="sm" variant="secondary" disabled={pending} onClick={() => { setConfirming(null); setReason(''); }}>取消</Button><Button size="sm" disabled={pending || !reason.trim()} loading={pending} onClick={confirmAction}>确认</Button></div></section>}
    <div className="task-drawer-primary"><Button disabled={pending || primary.key === 'human_action'} loading={pending} onClick={runPrimary}>{primary.key === 'retry' && <RotateCcw size={15} />}{primary.key === 'start' && <Play size={15} />}{primary.label}</Button></div>
  </div>;
}

function QueryError({ message, error, onRetry }: { message: string; error: unknown; onRetry: () => void }) {
  return <div className="task-drawer-error" role="alert"><AlertCircle size={15} />{message}：{error instanceof Error ? error.message : '请求失败'}<button type="button" onClick={onRetry}>重试</button></div>;
}

function Overview({ task }: { task: ControlledTask }) {
  const rows = [['当前阶段', getStageMeta(task.lifecycleStage).label], ['负责人', task.assignee ?? '未分派'], ['数字员工', task.agentId ?? '未指定'], ['来源', sourceLabel(task.source)], ['进度', `${task.progress.done}/${task.progress.total}`], ['SLA', task.sla.remainingMin === undefined ? '未设 SLA' : task.sla.remainingMin < 0 ? `已超时 ${Math.abs(task.sla.remainingMin)} 分钟` : `剩余 ${task.sla.remainingMin} 分钟`], ['风险', riskLabel(task.sla.risk)]];
  return <section className="task-drawer-section"><p>{task.description ?? '未提供任务描述。'}</p><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}

function Execution({ task }: { task: ControlledTask }) {
  return <section className="task-drawer-section"><h3><ClipboardList size={16} />执行状态</h3><dl><div><dt>运行 ID</dt><dd>{task.execution.runId ?? '尚未启动'}</dd></div><div><dt>当前步骤</dt><dd>{task.execution.currentStep ?? '等待下一步'}</dd></div><div><dt>重试次数</dt><dd>{task.execution.retryCount}</dd></div><div><dt>状态</dt><dd>{task.execution.paused ? '已暂停' : '执行可继续'}</dd></div></dl>{task.execution.error && <div className="task-execution-error"><AlertCircle size={16} /><span><strong>执行错误</strong>{task.execution.error}</span></div>}</section>;
}

function Governance({ task, pending, canManage, onApprove, onReject, onTakeover, onRetry }: { task: ControlledTask; pending: boolean; canManage: boolean; onApprove: () => void; onReject: () => void; onTakeover: () => void; onRetry: () => void }) {
  const approval = task.governance.approvalStatus === 'pending' ? '待审批' : task.governance.approvalStatus === 'approved' ? '已批准' : task.governance.approvalStatus === 'rejected' ? '已拒绝' : '无需审批';
  return <section className="task-drawer-section"><h3><Gavel size={16} />治理控制</h3><dl><div><dt>审批</dt><dd>{approval}{task.governance.approvalRequired ? '（必需）' : ''}</dd></div><div><dt>策略</dt><dd>{task.governance.policyBlocked ? '策略拦截' : '策略允许'}</dd></div><div><dt>人工接管</dt><dd>{task.governance.takeoverBy ? `${task.governance.takeoverBy}：${task.governance.takeoverReason ?? '未说明'}` : '未接管'}</dd></div></dl>{canManage ? <>{task.governance.approvalStatus === 'pending' && <div className="task-governance-actions"><Button size="sm" disabled={pending} onClick={onApprove}><ShieldCheck size={15} />批准</Button><Button size="sm" variant="secondary" disabled={pending} onClick={onReject}>拒绝</Button></div>}{task.sla.risk === 'failed' && <div className="task-governance-actions"><Button size="sm" variant="secondary" disabled={pending} onClick={onTakeover}><UserRound size={15} />人工接管</Button><Button size="sm" disabled={pending} onClick={onRetry}><RotateCcw size={15} />重试执行</Button></div>}</> : <p className="mt-3 text-xs text-[var(--text-muted)]">审批、人工接管与高风险重试由管理员处理。</p>}</section>;
}

function Audit({ events }: { events: TaskAuditEvent[] }) {
  return <section className="task-drawer-section"><h3><History size={16} />时间审计</h3><ol className="task-audit-list">{events.map((event) => <li key={event.id}><Badge tone={event.tone === 'error' ? 'error' : event.tone === 'warn' ? 'warn' : event.tone === 'success' ? 'success' : 'info'}>{event.action}</Badge><span>{event.detail ?? '无附加说明'}</span><small>{time(event.at)} · {event.actor}</small></li>)}</ol>{events.length === 0 && <p>暂无审计事件。</p>}</section>;
}
