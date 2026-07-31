import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, Plus, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, Input, toast } from '@de/web-ui';
import { cn } from '@de/web-utils';
import type { TemporaryAuthorization, ZeroTrustEvent, ZeroTrustPolicy } from '@de/web-types';
import { useApiMutation, useApiQuery } from '@/services/query';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n';

type Overview = { policies: number; blocked: number; approvals: number; masked: number; risk: 'normal' | 'attention'; updatedAt: string };
type Tab = 'overview' | 'policies' | 'authorizations' | 'events';

const decisionMeta = { allow: ['允许', 'success'], mask: ['脱敏', 'info'], approval_required: ['需审批', 'warn'], deny: ['已阻断', 'error'] } as const;

export default function ZeroTrust({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('overview');
  const [formOpen, setFormOpen] = useState(false);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const isAuditor = useAuthStore((state) => state.user?.role === 'auditor');
  const overview = useApiQuery<Overview>(['zero-trust', 'overview'], '/api/zero-trust/overview');
  const policies = useApiQuery<ZeroTrustPolicy[]>(['zero-trust', 'policies'], '/api/zero-trust/policies');
  const authorizations = useApiQuery<TemporaryAuthorization[]>(['zero-trust', 'authorizations'], '/api/zero-trust/authorizations');
  const events = useApiQuery<ZeroTrustEvent[]>(['zero-trust', 'events'], '/api/zero-trust/events', undefined, { refetchInterval: 15_000 });
  const togglePolicy = useApiMutation<ZeroTrustPolicy, { id: string; enabled: boolean }>(({ id }) => `/api/zero-trust/policies/${id}`, { onSuccess: () => toast.success('策略版本已更新并写入审计') }, 'PATCH');
  const revoke = useApiMutation<TemporaryAuthorization, { id: string }>(({ id }) => `/api/zero-trust/authorizations/${id}/revoke`, { onSuccess: () => toast.success('临时授权已回收') });
  const tabs = ([['overview', t('module.zeroTrust.tabs.overview')], ['policies', isAuditor ? '策略版本' : t('module.zeroTrust.tabs.policies')], ['authorizations', isAuditor ? '临时授权记录' : t('module.zeroTrust.tabs.authorizations')], ['events', t('module.zeroTrust.tabs.events')]] as Array<[Tab, string]>);

  return (
    <div className={cn(embedded ? 'min-w-0' : 'mx-auto min-h-full max-w-[1480px] p-3 sm:p-4 lg:p-5')}>
      {!embedded ? (
        <header className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-base font-semibold"><ShieldAlert className="h-4 w-4 text-[var(--brand)]" />{t('module.zeroTrust.title')}</h1>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t('module.zeroTrust.subtitle')}</p>
              {isAuditor && <p className="mt-2 text-[11px] font-medium text-[var(--brand)]">只读复核范围：策略版本、临时授权记录与策略事件</p>}
            </div>
            {isAdmin && <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-3.5 w-3.5" />授予临时访问</Button>}
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
            {tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn('shrink-0 rounded px-3 py-2 text-xs', tab === key ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}>{label}</button>)}
          </nav>
        </header>
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <nav className="flex gap-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
            {tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn('shrink-0 rounded px-3 py-2 text-xs', tab === key ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}>{label}</button>)}
          </nav>
          {isAdmin && <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-3.5 w-3.5" />授予临时访问</Button>}
        </div>
      )}
      <div className={cn(!embedded && 'mt-3')}>
        {tab === 'overview' && <OverviewPanel data={overview.data} events={events.data ?? []} />}
        {tab === 'policies' && <Policies rows={policies.data ?? []} editable={isAdmin} onToggle={(id, enabled) => togglePolicy.mutate({ id, enabled })} />}
        {tab === 'authorizations' && <Authorizations rows={authorizations.data ?? []} editable={isAdmin} onRevoke={(id) => revoke.mutate({ id })} />}
        {tab === 'events' && <Events rows={events.data ?? []} />}
      </div>
      {formOpen && <AuthorizationDialog onClose={() => setFormOpen(false)} />}
    </div>
  );
}

function OverviewPanel({ data, events }: { data?: Overview; events: ZeroTrustEvent[] }) { const items = [{ label: '生效策略', value: data?.policies ?? 0, icon: SlidersHorizontal, tone: 'text-[var(--brand)]' }, { label: '已阻断', value: data?.blocked ?? 0, icon: ShieldAlert, tone: 'text-[var(--danger)]' }, { label: '等待审批', value: data?.approvals ?? 0, icon: Clock3, tone: 'text-[var(--warning)]' }, { label: '已脱敏', value: data?.masked ?? 0, icon: LockKeyhole, tone: 'text-[var(--info)]' }]; return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <div key={item.label} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"><item.icon className={cn('h-4 w-4', item.tone)} /><div className="mt-4 text-2xl font-semibold">{item.value}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{item.label}</div></div>)}</div><section className="rounded-lg border border-[var(--border)] bg-[var(--bg)]"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">最近策略事件</h2></div><div className="divide-y divide-[var(--border)]">{events.slice(0, 5).map((event) => <EventRow key={event.id} event={event} />)}</div></section></div>; }
function Policies({ rows, editable, onToggle }: { rows: ZeroTrustPolicy[]; editable: boolean; onToggle: (id: string, enabled: boolean) => void }) { return <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">访问策略</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">策略按资源、动作、范围与条件决定允许、脱敏、审批或阻断；租户安全基线不可停用。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]"><tr><th className="px-4 py-2.5">策略</th><th className="px-4 py-2.5">资源 / 动作</th><th className="px-4 py-2.5">条件</th><th className="px-4 py-2.5">处置</th><th className="px-4 py-2.5">版本</th><th className="px-4 py-2.5">状态</th></tr></thead><tbody>{rows.map((row) => { const [label, tone] = decisionMeta[row.decision]; return <tr key={row.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-medium">{row.name}{row.baseline && <Badge tone="brand" className="ml-2 text-[9px]">安全基线</Badge>}<div className="mt-1 text-[10px] text-[var(--text-muted)]">{row.scope}</div></td><td className="px-4 py-3">{row.resource} / {row.action}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{row.condition}</td><td className="px-4 py-3"><Badge tone={tone as any}>{label}</Badge></td><td className="px-4 py-3 font-mono">v{row.version}</td><td className="px-4 py-3">{editable && !row.baseline ? <button type="button" onClick={() => onToggle(row.id, !row.enabled)} className={cn('rounded px-2 py-1 text-[10px]', row.enabled ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]')}>{row.enabled ? '启用' : '停用'}</button> : <Badge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? '启用' : '停用'}</Badge>}</td></tr>; })}</tbody></table></div></section>; }
function Authorizations({ rows, editable, onRevoke }: { rows: TemporaryAuthorization[]; editable: boolean; onRevoke: (id: string) => void }) { return <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">临时授权</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">仅对明确工作区、资源与动作生效，到期自动失效并保留审计记录。</p></div><div className="divide-y divide-[var(--border)]">{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><div className="min-w-[150px] flex-1"><strong className="text-xs">{row.subjectName}</strong><p className="mt-1 text-[10px] text-[var(--text-muted)]">{row.workspaceId} · {row.resource}:{row.action} · {row.reason}</p></div><span className="text-[11px] text-[var(--text-secondary)]">至 {new Date(row.expiresAt).toLocaleString('zh-CN')}</span><Badge tone={row.status === 'active' ? 'warn' : 'neutral'}>{row.status === 'active' ? '生效中' : row.status === 'revoked' ? '已回收' : '已到期'}</Badge>{editable && row.status === 'active' && <Button size="sm" variant="secondary" onClick={() => onRevoke(row.id)}>回收</Button>}</div>)}</div></section>; }
function Events({ rows }: { rows: ZeroTrustEvent[] }) { return <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">策略命中记录</h2></div><div className="divide-y divide-[var(--border)]">{rows.map((event) => <EventRow key={event.id} event={event} detail />)}</div></section>; }
function explainZeroTrustEvent(event: ZeroTrustEvent) {
  const next =
    event.decision === 'deny' ? '请调整请求范围或申请临时授权后重试'
      : event.decision === 'approval_required' ? '提交双重审批，通过后再继续'
        : event.decision === 'mask' ? '继续使用脱敏结果；如需明文请走授权流程'
          : '可继续，注意保留审计关联 ID';
  const impact =
    event.decision === 'deny' ? '操作已被阻断，未产生写副作用'
      : event.decision === 'approval_required' ? '操作暂停在审批门禁，待批准后执行'
        : event.decision === 'mask' ? '返回内容已脱敏，敏感字段不可见'
          : '策略允许本次访问';
  return { impact, next };
}

function EventRow({ event, detail = false }: { event: ZeroTrustEvent; detail?: boolean }) {
  const [label, tone] = decisionMeta[event.decision];
  const explained = explainZeroTrustEvent(event);
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span className={cn('mt-1.5 h-2 w-2 rounded-full', event.decision === 'deny' ? 'bg-[var(--danger)]' : event.decision === 'approval_required' ? 'bg-[var(--warning)]' : 'bg-[var(--success)]')} />
      <div className="min-w-[220px] flex-1">
        <div className="text-xs font-medium">{event.reason}</div>
        <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{explained.impact}</div>
        <div className="mt-1 text-[11px] text-[var(--brand)]">下一步：{explained.next}</div>
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">{event.actor} · {event.workspaceId} · {event.resource}:{event.action}{detail ? ` · ${event.classification}` : ''}</div>
      </div>
      <Badge tone={tone as any}>{label}</Badge>
      <span className="font-mono text-[10px] text-[var(--text-muted)]">{event.correlationId}</span>
    </div>
  );
}
function AuthorizationDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(''); const [reason, setReason] = useState(''); const [workspaceId, setWorkspaceId] = useState('w2'); const [environment, setEnvironment] = useState<'sandbox' | 'staging'>('staging'); const [hours, setHours] = useState('8');
  const create = useApiMutation<TemporaryAuthorization, Partial<TemporaryAuthorization>>('/api/zero-trust/authorizations', { onSuccess: () => { toast.success('临时授权已生效并写入审计'); onClose(); }, onError: (error: any) => toast.error(error?.message ?? '授权失败') });
  const duration = Math.min(24, Math.max(1, Number(hours) || 1));
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4"><div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-xl"><h2 className="text-sm font-semibold">授予临时访问</h2><p className="mt-1 text-xs text-[var(--text-muted)]">仅支持开发和测试环境，最长 24 小时；生产环境需双人审批。</p><label className="mt-4 block text-xs">成员名称<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：陈小雨" /></label><div className="mt-3 grid grid-cols-2 gap-3"><label className="block text-xs">工作区<select className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="w1">ACME 生产</option><option value="w2">ACME 预发</option><option value="w3">ACME 安全</option><option value="w4">外协沙箱</option></select></label><label className="block text-xs">环境<select className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2" value={environment} onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'staging')}><option value="sandbox">开发</option><option value="staging">测试</option></select></label></div><label className="mt-3 block text-xs">有效时长（小时）<Input type="number" min="1" max="24" className="mt-1" value={hours} onChange={(event) => setHours(event.target.value)} /></label><label className="mt-3 block text-xs">授权原因<Input className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：预发回归验证" /></label><div className="mt-5 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>取消</Button><Button size="sm" loading={create.isPending} disabled={!name.trim() || !reason.trim()} onClick={() => create.mutate({ subjectName: name, workspaceId, environment, resource: 'workflow', action: 'run', reason, expiresAt: new Date(Date.now() + duration * 3600_000).toISOString() })}>确认授权</Button></div></div></div>;
}
