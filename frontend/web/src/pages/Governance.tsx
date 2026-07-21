import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Plus, RefreshCcw, Shield, UserPlus, UsersRound } from 'lucide-react';
import { Badge, Button, Input, toast } from '@de/web-ui';
import { cn } from '@de/web-utils';
import type { AccessGrant, AccessReview, ReleaseApproval, SeparationOfDutyRule, Role } from '@de/web-types';
import { useApiMutation, useApiQuery } from '@/services/query';

type GovernanceData = { grants: AccessGrant[]; reviews: AccessReview[]; rules: SeparationOfDutyRule[]; conflicts: Array<{ id: string; subjectName: string; reason: string; severity: 'medium' | 'high' }>; generatedAt: string };
type Tab = 'access' | 'approvals' | 'controls';

const roleLabel: Record<Role, string> = { user: '普通用户', admin: '管理员', auditor: '审计用户' };
const environmentLabel = { sandbox: '开发', staging: '测试', production: '生产' };

export default function Governance() {
  const [tab, setTab] = useState<Tab>('access');
  const [grantOpen, setGrantOpen] = useState(false);
  const governance = useApiQuery<GovernanceData>(['access-governance'], '/api/access/governance');
  const approvals = useApiQuery<ReleaseApproval[]>(['release-approvals'], '/api/release-approvals');
  const completeReview = useApiMutation<AccessReview, { id: string }>('/api/access/reviews/complete', { onSuccess: () => toast.success('权限复核已完成并记录审计') });
  const releaseAction = useApiMutation<ReleaseApproval, { id: string }>(({ id }) => `/api/release-approvals/${id}/approve`, { onSuccess: () => toast.success('生产发布已审批并写入审计'), onError: (error: any) => toast.error(error?.message ?? '审批失败') });
  const rejectRelease = useApiMutation<ReleaseApproval, { id: string }>(({ id }) => `/api/release-approvals/${id}/reject`, { onSuccess: () => toast.success('发布申请已驳回') });

  const pendingApprovals = useMemo(() => (approvals.data ?? []).filter((item) => item.status === 'pending'), [approvals.data]);
  const data = governance.data;

  return (
    <div className="mx-auto min-h-full max-w-[1480px] p-3 sm:p-4 lg:p-5">
      <header className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold"><Shield className="h-4 w-4 text-[var(--brand)]" />访问治理</h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">以租户、工作区和环境范围控制平台访问；高风险变更受职责分离约束。</p>
          </div>
          <Button size="sm" onClick={() => setGrantOpen(true)}><UserPlus className="h-3.5 w-3.5" />授予访问</Button>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
          {([['access', '用户与范围'], ['approvals', `发布审批${pendingApprovals.length ? ` · ${pendingApprovals.length}` : ''}`], ['controls', '职责分离与复核']] as Array<[Tab, string]>).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn('shrink-0 rounded px-3 py-2 text-xs', tab === key ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}>{label}</button>)}
        </nav>
      </header>

      <div className="mt-3">
        {governance.isLoading ? <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-10 text-center text-sm text-[var(--text-muted)]">正在加载访问治理数据…</div> : governance.error ? <ErrorPanel message="无法读取访问治理数据" onRetry={() => governance.refetch()} /> : <>
          {tab === 'access' && <AccessScope grants={data?.grants ?? []} onAdd={() => setGrantOpen(true)} />}
          {tab === 'approvals' && <Approvals rows={pendingApprovals} onApprove={(id) => releaseAction.mutate({ id })} onReject={(id) => rejectRelease.mutate({ id })} busy={releaseAction.isPending || rejectRelease.isPending} />}
          {tab === 'controls' && <Controls rules={data?.rules ?? []} reviews={data?.reviews ?? []} conflicts={data?.conflicts ?? []} onComplete={(id) => completeReview.mutate({ id })} busy={completeReview.isPending} />}
        </>}
      </div>
      {grantOpen && <GrantDialog onClose={() => setGrantOpen(false)} />}
    </div>
  );
}

function AccessScope({ grants, onAdd }: { grants: AccessGrant[]; onAdd: () => void }) {
  return <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><h2 className="text-sm font-semibold">用户与访问范围</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">角色定义动作范围，工作区与环境定义其生效边界。</p></div><Button size="sm" variant="secondary" onClick={onAdd}><Plus className="h-3.5 w-3.5" />新增授权</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]"><tr><th className="px-4 py-2.5 font-medium">成员</th><th className="px-4 py-2.5 font-medium">平台角色</th><th className="px-4 py-2.5 font-medium">工作区范围</th><th className="px-4 py-2.5 font-medium">环境范围</th><th className="px-4 py-2.5 font-medium">状态</th><th className="px-4 py-2.5 font-medium">授权来源</th></tr></thead><tbody>{grants.map((grant) => <tr key={grant.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-medium">{grant.subjectName}</td><td className="px-4 py-3"><Badge tone={grant.role === 'admin' ? 'brand' : grant.role === 'auditor' ? 'warn' : 'neutral'}>{roleLabel[grant.role]}</Badge></td><td className="px-4 py-3 text-[var(--text-secondary)]">{grant.workspaceIds.join('、')}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{grant.environmentScopes.map((item) => environmentLabel[item]).join('、')}</td><td className="px-4 py-3"><Badge tone={grant.status === 'active' ? 'success' : grant.status === 'expiring' ? 'warn' : 'neutral'}>{grant.status === 'active' ? '生效中' : grant.status === 'expiring' ? '即将到期' : '已失效'}</Badge>{grant.expiresAt && <span className="ml-2 text-[10px] text-[var(--text-muted)]">至 {new Date(grant.expiresAt).toLocaleDateString('zh-CN')}</span>}</td><td className="px-4 py-3 text-[var(--text-muted)]">{grant.grantedBy}</td></tr>)}</tbody></table></div></section>;
}

function Approvals({ rows, onApprove, onReject, busy }: { rows: ReleaseApproval[]; onApprove: (id: string) => void; onReject: (id: string) => void; busy: boolean }) {
  return <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">生产发布审批</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">创建者不可审批自己的变更；审批动作自动产生关联审计事件。</p></div><div className="divide-y divide-[var(--border)]">{rows.length ? rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className={cn('h-2 w-2 rounded-full', row.risk === 'high' ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]')} /><div className="min-w-[200px] flex-1"><div className="text-xs font-semibold">{row.resourceName}</div><div className="mt-1 text-[10px] text-[var(--text-muted)]">{row.resourceType} · {row.workspaceId} · {environmentLabel[row.environment]} · 提交人 {row.submittedBy}</div></div><Badge tone={row.risk === 'high' ? 'error' : 'warn'}>{row.risk === 'high' ? '高风险' : '中风险'}</Badge><span className="font-mono text-[10px] text-[var(--text-muted)]">{row.correlationId}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => onReject(row.id)}>驳回</Button><Button size="sm" disabled={busy} onClick={() => onApprove(row.id)}>审批</Button></div></div>) : <div className="px-4 py-12 text-center text-xs text-[var(--text-muted)]">没有待处理的发布申请</div>}</div></section>;
}

function Controls({ rules, reviews, conflicts, onComplete, busy }: { rules: SeparationOfDutyRule[]; reviews: AccessReview[]; conflicts: Array<{ id: string; subjectName: string; reason: string; severity: 'medium' | 'high' }>; onComplete: (id: string) => void; busy: boolean }) {
  return <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]"><section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"><h2 className="text-sm font-semibold">职责分离规则</h2><div className="mt-3 space-y-2">{rules.map((rule) => <div key={rule.id} className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', rule.enabled ? 'text-[var(--success)]' : 'text-[var(--text-muted)]')} /><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{rule.title}</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">{rule.description}</p></div><Badge tone={rule.violations ? 'warn' : 'success'}>{rule.violations ? `${rule.violations} 项待处理` : '已执行'}</Badge></div>)}</div></section><div className="space-y-3"><section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-[var(--brand)]" />权限复核</h2><div className="mt-3 space-y-2">{reviews.map((review) => <div key={review.id} className="rounded-md border border-[var(--border)] p-3"><div className="flex justify-between gap-2"><strong className="text-xs">{review.title}</strong><Badge tone={review.status === 'completed' ? 'success' : 'warn'}>{review.status === 'completed' ? '已完成' : '待复核'}</Badge></div><p className="mt-1 text-[11px] text-[var(--text-muted)]">{review.scope} · {review.reviewed}/{review.total} 已完成</p>{review.status !== 'completed' && <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => onComplete(review.id)}>完成复核</Button>}</div>)}</div></section><section className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)]/30 p-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-[var(--warning)]" />权限风险提示</h2><div className="mt-3 space-y-2">{conflicts.map((item) => <div key={item.id} className="text-[11px]"><strong>{item.subjectName}</strong><p className="mt-0.5 text-[var(--text-secondary)]">{item.reason}</p></div>)}</div></section></div></div>;
}

function GrantDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(''); const [role, setRole] = useState<Role>('user'); const [workspaceId, setWorkspaceId] = useState('w1'); const [production, setProduction] = useState(false);
  const create = useApiMutation<AccessGrant, Partial<AccessGrant>>('/api/access/grants', { onSuccess: () => { toast.success('访问范围已授予并写入审计'); onClose(); }, onError: (error: any) => toast.error(error?.message ?? '授权失败') });
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-xl"><h2 className="text-sm font-semibold">授予访问范围</h2><p className="mt-1 text-xs text-[var(--text-muted)]">最小权限原则：按工作区与环境授予，临时访问应设置到期时间。</p><label className="mt-4 block text-xs">成员名称<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：陈小雨" /></label><label className="mt-3 block text-xs">平台角色<select className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="user">普通用户</option><option value="admin">管理员</option><option value="auditor">审计用户</option></select></label><label className="mt-3 block text-xs">工作区<select className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="w1">ACME 生产</option><option value="w2">ACME 预发</option><option value="w3">ACME 安全</option><option value="w4">外协沙箱</option></select></label><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={production} onChange={(event) => setProduction(event.target.checked)} />包含生产环境</label><div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>取消</Button><Button size="sm" loading={create.isPending} onClick={() => create.mutate({ subjectName: name, role, workspaceIds: [workspaceId], environmentScopes: production ? ['sandbox', 'staging', 'production'] : ['sandbox', 'staging'] })}>确认授权</Button></div></div></div>;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--bg)] p-8 text-center"><AlertTriangle className="mx-auto h-5 w-5 text-[var(--danger)]" /><p className="mt-2 text-sm font-medium">{message}</p><Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}><RefreshCcw className="h-3.5 w-3.5" />重试</Button></div>; }
