import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cloud, FileText, History, Plus, Route, Send, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Badge, Button, Input, toast } from '@de/web-ui';
import type { ChannelAuditEvent, ChannelDeployment, ChannelKind, DeliveryAttempt, DeliveryPolicyDraft, DeliveryPolicyVersion } from '@de/web-types';
import { useApiMutation, useApiQuery } from '@/services/query';
import { ConfirmDialog, Drawer, EmptyState } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { deliveryPolicyStatusLabel, deploymentDeletionAction } from '@/features/channels/channel-ui';

type Tab = 'deployments' | 'routing' | 'templates' | 'health' | 'failures' | 'audit';
const TABS: Array<{ key: Tab; label: string; icon: typeof Cloud }> = [
  { key: 'deployments', label: '渠道接入', icon: Cloud }, { key: 'routing', label: '投递路由', icon: Route }, { key: 'templates', label: '模板与目标', icon: FileText }, { key: 'health', label: '运行健康', icon: Activity }, { key: 'failures', label: '失败处置', icon: AlertTriangle }, { key: 'audit', label: '渠道审计', icon: History },
];

export default function Channels() {
  const { user } = useAuthStore(); const canWrite = Boolean(user?.permissions.includes('channel.write'));
  const scopeKey = `${user?.workspaceId ?? 'anonymous'}:${user?.id ?? 'anonymous'}`;
  const [tab, setTab] = useState<Tab>('deployments'); const [newOpen, setNewOpen] = useState(false); const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null); const [deleteDeployment, setDeleteDeployment] = useState<ChannelDeployment | null>(null);
  const deployments = useApiQuery<ChannelDeployment[]>(['channel-deployments', scopeKey], '/api/channel-control/deployments');
  const policies = useApiQuery<DeliveryPolicyDraft[]>(['delivery-policies', scopeKey], '/api/channel-control/policies');
  const overview = useApiQuery<{ activeDeployments: number; publishedPolicies: number; deadLetters: number; capacityRisk: string }>(['channel-overview', scopeKey], '/api/channel-control/overview');
  const failures = useApiQuery<DeliveryAttempt[]>(['channel-dead-letters', scopeKey], '/api/channel-control/dead-letters');
  const audit = useApiQuery<ChannelAuditEvent[]>(['channel-audit', scopeKey], '/api/channel-control/audit');
  const activePolicy = policies.data?.find((item) => item.id === selectedPolicy);
  const versions = useApiQuery<DeliveryPolicyVersion[]>(['delivery-versions', scopeKey, selectedPolicy], `/api/channel-control/policies/${selectedPolicy ?? '__none__'}/versions`, undefined, { enabled: Boolean(selectedPolicy) });
  const create = useApiMutation<ChannelDeployment, Record<string, unknown>>('/api/channel-control/deployments');
  const verify = useApiMutation<ChannelDeployment, { id: string }>((v) => `/api/channel-control/deployments/${v.id}/verify`);
  const remove = useApiMutation<{ id: string }, { id: string }>((v) => `/api/channel-control/deployments/${v.id}`, undefined, 'DELETE');
  const validate = useApiMutation<DeliveryPolicyDraft, { id: string }>((v) => `/api/channel-control/policies/${v.id}/validate`);
  const publish = useApiMutation<DeliveryPolicyVersion, { id: string }>((v) => `/api/channel-control/policies/${v.id}/publish`);
  const simulate = useApiMutation<{ status: string; capacityRisk: string }, { id: string }>((v) => `/api/channel-control/policies/${v.id}/simulate`);
  const loading = deployments.isLoading || policies.isLoading;
  const notifyError = (e: unknown) => toast.error(e instanceof Error ? e.message : '渠道控制面操作失败');
  const policyRefs = useMemo(() => new Set((policies.data ?? []).filter((p) => p.status === 'published').flatMap((p) => [p.primaryDeploymentId, ...p.fallbackDeploymentIds])), [policies.data]);
  return <div className="channels-page flex h-full flex-col gap-3 overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-5">
<header className="channels-top-panel mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6">
<div className="flex flex-wrap justify-between gap-3">
<div>
<h1 className="flex items-center gap-2 text-lg font-semibold">
<Send className="h-5 w-5 text-[var(--brand)]" />渠道中心</h1>
<p className="mt-1 text-xs text-[var(--text-muted)]">统一管理企业消息投递接入、路由、健康、失败处置与审计证据。</p>
</div>
<Badge tone="warn">Mock 控制面演示 · 服务端负责真实凭据与授权</Badge>
</div>
<div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-[var(--bg-elevated)] p-1" role="tablist">{TABS.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium ${tab === key ? 'bg-white text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'} `}>
<Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
</header>
<main className="channels-content-panel mx-auto w-full max-w-[1440px] overflow-hidden">
<section className="grid gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4 sm:grid-cols-3">
<Metric label="活跃部署" value={overview.data?.activeDeployments ?? 0} />
<Metric label="已发布策略" value={overview.data?.publishedPolicies ?? 0} />
<Metric label="死信待处置" value={overview.data?.deadLetters ?? 0} tone="warn" />
</section>
<section className="p-4 sm:p-6">{loading ? <div className="py-16 text-center text-sm text-[var(--text-muted)]">正在读取渠道控制面状态…</div> : tab === 'deployments' ? <Deployments items={deployments.data ?? []} canWrite={canWrite} refs={policyRefs} onNew={() => setNewOpen(true)} onVerify={(id) => verify.mutate({ id }, { onSuccess: () => toast.success('渠道连通性验证通过'), onError: notifyError })} onDelete={setDeleteDeployment} /> : tab === 'routing' ? <Routing policies={policies.data ?? []} canWrite={canWrite} onOpen={setSelectedPolicy} /> : tab === 'templates' ? <Templates /> : tab === 'health' ? <Health overview={overview.data} /> : tab === 'failures' ? <Failures items={failures.data ?? []} /> : <Audit items={audit.data ?? []} />}</section>
</main>
<Drawer open={newOpen} onClose={() => setNewOpen(false)} title="接入渠道部署" description="凭据只写入引用，接入后必须完成连通性验证。" width={480}>
<DeploymentForm canWrite={canWrite} onSubmit={(body) => create.mutate(body, { onSuccess: () => { toast.success('渠道部署草稿已创建'); setNewOpen(false); }, onError: notifyError })} />
</Drawer>
<Drawer open={Boolean(activePolicy)} onClose={() => setSelectedPolicy(null)} title={activePolicy?.eventType} description="策略需校验后发布；发布产生不可变版本。" width={520}>{activePolicy && <PolicyDrawer policy={activePolicy} versions={versions.data ?? []} canWrite={canWrite} onValidate={() => validate.mutate({ id: activePolicy.id }, { onSuccess: (v) => toast[v.status === 'ready' ? 'success' : 'warn'](v.status === 'ready' ? '策略校验通过' : '策略校验未通过'), onError: notifyError })} onPublish={() => publish.mutate({ id: activePolicy.id }, { onSuccess: () => toast.success('投递策略已发布'), onError: notifyError })} onSimulate={() => simulate.mutate({ id: activePolicy.id }, { onSuccess: (v) => toast[v.status === 'passed' ? 'success' : 'warn'](`模拟结果：${v.status} · 容量 ${v.capacityRisk}`), onError: notifyError })} />}</Drawer>
<ConfirmDialog open={Boolean(deleteDeployment)} onClose={() => setDeleteDeployment(null)} onConfirm={() => { if (deleteDeployment) remove.mutate({ id: deleteDeployment.id }, { onSuccess: () => toast.success('渠道部署已删除'), onError: notifyError }); }} title="删除渠道部署？" description="已发布策略引用的部署将被 API 拒绝删除。" confirmText="删除" tone="danger" />
</div>;
}
function Deployments({ items, canWrite, refs, onNew, onVerify, onDelete }: { items: ChannelDeployment[]; canWrite: boolean; refs: Set<string>; onNew: () => void; onVerify: (id: string) => void; onDelete: (d: ChannelDeployment) => void }) { return <div>
<div className="mb-4 flex justify-between">
<div>
<h2 className="text-sm font-semibold">渠道接入</h2>
<p className="mt-1 text-xs text-[var(--text-muted)]">受管部署、凭据引用、连通性与生命周期。</p>
</div>
<Button size="sm" disabled={!canWrite} onClick={onNew}>
<Plus className="h-3.5 w-3.5" />接入渠道</Button>
</div>
<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((d) => { const deletion = deploymentDeletionAction(!refs.has(d.id)); return <article key={d.id} className="rounded-lg border border-[var(--border)] p-4">
<div className="flex justify-between">
<div>
<strong>{d.name}</strong>
<p className="mt-1 text-xs text-[var(--text-muted)]">{d.kind} · {d.environment} · {d.owner}</p>
</div>
<Badge tone={d.status === 'active' ? 'success' : d.status === 'disabled' ? 'error' : 'neutral'}>{d.status}</Badge>
</div>
<p className="mt-4 font-mono text-[11px] text-[var(--text-muted)]">{d.credentialMasked} · {d.lastVerifiedAt ? '已验证' : '待验证'}</p>
<div className="mt-3 flex gap-2">
<Button size="sm" variant="secondary" disabled={!canWrite} onClick={() => onVerify(d.id)}>
<ShieldCheck className="h-3 w-3" />验证</Button>
<Button size="sm" variant="ghost" disabled={!canWrite || deletion.disabled} onClick={() => onDelete(d)}>
<Trash2 className="h-3 w-3" />{deletion.label}</Button>
</div>
</article>; })}</div>
</div>; }
function Routing({ policies, canWrite, onOpen }: { policies: DeliveryPolicyDraft[]; canWrite: boolean; onOpen: (id: string) => void }) { return <div>
<h2 className="text-sm font-semibold">投递路由</h2>
<p className="mt-1 mb-4 text-xs text-[var(--text-muted)]">事件、目标组、主渠道与降级链通过版本化发布生效。</p>
<div className="overflow-x-auto rounded-lg border border-[var(--border)]">
<table className="min-w-[700px] w-full text-xs">
<thead className="bg-[var(--bg-elevated)]">
<tr>
<th className="px-4 py-3 text-left">事件</th>
<th className="text-left">目标</th>
<th className="text-left">数据等级</th>
<th className="text-left">状态</th>
<th className="px-4 text-right">操作</th>
</tr>
</thead>
<tbody>{policies.map((p) => <tr key={p.id} className="border-t border-[var(--border)]">
<td className="px-4 py-3 font-semibold">{p.eventType}</td>
<td>{p.audience}</td>
<td>{p.dataClassification}</td>
<td>
<Badge tone={p.status === 'published' ? 'success' : p.status === 'ready' ? 'warn' : 'neutral'}>{deliveryPolicyStatusLabel(p.status)}</Badge>
</td>
<td className="px-4 text-right">
<Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => onOpen(p.id)}>管理</Button>
</td>
</tr>)}</tbody>
</table>
</div>
</div>; }
function Templates() { return <div className="grid gap-3 md:grid-cols-2">
<Panel title="消息模板" icon={FileText} text="模板、多语言、变量白名单和内容审核由版本化资产管理；敏感字段在投递前脱敏。" />
<Panel title="目标治理" icon={Users} text="管理值班组、收件人组、退订与黑名单；策略仅引用已批准的目标组。" />
</div>; }
function Health({ overview }: { overview?: { capacityRisk: string } }) { return <div className="grid gap-3 md:grid-cols-3">
<Panel title="投递 SLO" icon={Activity} text="按渠道和环境查看成功率、P95 延迟与限流状态。" />
<Panel title="容量风险" icon={AlertTriangle} text={`当前容量评估：${overview?.capacityRisk ?? 'unknown'}。策略模拟可预检降级链容量。`} />
<Panel title="隔离演练" icon={CheckCircle2} text="在 sandbox/canary 中验证投递链路，不影响生产目标。" />
</div>; }
function Failures({ items }: { items: DeliveryAttempt[] }) { return <div>
<h2 className="text-sm font-semibold">失败处置</h2>
<p className="mt-1 mb-4 text-xs text-[var(--text-muted)]">失败消息自动重试、降级后进入死信队列；载荷与目标均脱敏显示。</p>{items.length ? <div className="space-y-2">{items.map((i) => <div key={i.id} className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 text-xs">
<strong>死信 · {i.targetMasked}</strong>
<p className="mt-1">尝试 {i.attempts} 次 · {i.payloadSummary}</p>
<p className="mt-1 font-mono text-[10px]">{i.correlationId}</p>
</div>)}</div> : <EmptyState icon={CheckCircle2} title="没有待处置死信" />}</div>; }
function Audit({ items }: { items: ChannelAuditEvent[] }) { return <div>
<h2 className="text-sm font-semibold">渠道审计</h2>
<p className="mt-1 mb-4 text-xs text-[var(--text-muted)]">接入、验证、发布、投递和失败处置均保留关联证据。</p>{items.length ? <div className="space-y-2">{items.map((i) => <article key={i.id} className="rounded-lg border border-[var(--border)] p-3 text-xs">
<div className="flex justify-between">
<strong>{i.action}</strong>
<Badge tone={i.result === 'success' ? 'success' : 'error'}>{i.result}</Badge>
</div>
<p className="mt-1">{i.target}{i.reason ? ` · ${i.reason}` : ''}</p>
<p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{i.actor} · {i.correlationId}</p>
</article>)}</div> : <EmptyState icon={History} title="暂无渠道审计事件" />}</div>; }
function PolicyDrawer({ policy, versions, canWrite, onValidate, onPublish, onSimulate }: { policy: DeliveryPolicyDraft; versions: DeliveryPolicyVersion[]; canWrite: boolean; onValidate: () => void; onPublish: () => void; onSimulate: () => void }) { return <div className="space-y-4 text-xs">
<Panel title="策略范围" icon={Route} text={`${policy.eventType} → ${policy.audience} · ${policy.dataClassification}`} />{policy.validationIssues.length > 0 && <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 text-[var(--danger)]">{policy.validationIssues.join('；')}</div>}<div className="flex flex-wrap gap-2">
<Button size="sm" variant="secondary" disabled={!canWrite} onClick={onValidate}>校验草稿</Button>
<Button size="sm" disabled={!canWrite || policy.status !== 'ready'} onClick={onPublish}>发布版本</Button>
<Button size="sm" variant="ghost" disabled={!canWrite} onClick={onSimulate}>P2 策略模拟</Button>
</div>
<div className="border-t pt-3">
<strong>版本历史</strong>{versions.length ? versions.map((v) => <p key={v.id} className="mt-2">v{v.version} · {new Date(v.publishedAt).toLocaleString('zh-CN')}</p>) : <p className="mt-2 text-[var(--text-muted)]">暂无已发布版本</p>}</div>
</div>; }
function DeploymentForm({ canWrite, onSubmit }: { canWrite: boolean; onSubmit: (v: Record<string, unknown>) => void }) { const [name, setName] = useState(''); const [kind, setKind] = useState<ChannelKind>('feishu'); const [credential, setCredential] = useState(''); return <div className="space-y-3">
<Field label="部署名称">
<Input value={name} onChange={(e) => setName(e.target.value)} />
</Field>
<Field label="渠道类型">
<select value={kind} onChange={(e) => setKind(e.target.value as ChannelKind)} className="h-9 w-full rounded-md border border-[var(--border)] px-2 text-xs">
<option value="feishu">飞书</option>
<option value="wecom">企业微信</option>
<option value="email">邮件</option>
<option value="webhook">Webhook</option>
</select>
</Field>
<Field label="一次性凭据">
<Input type="password" value={credential} onChange={(e) => setCredential(e.target.value)} />
</Field>
<p className="text-xs text-[var(--text-muted)]">凭据只生成引用；生产环境由 KMS/Vault 托管。</p>
<div className="flex justify-end">
<Button disabled={!canWrite || !name || !credential} onClick={() => onSubmit({ name, kind, credential, workspaceId: 'w1' })}>创建草稿</Button>
</div>
</div>; }
function Panel({ title, icon: Icon, text }: { title: string; icon: typeof Activity; text: string }) { return <div className="rounded-lg border border-[var(--border)] p-4">
<div className="flex items-center gap-2 font-semibold">
<Icon className="h-4 w-4 text-[var(--brand)]" />{title}</div>
<p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{text}</p>
</div>; }
function Metric({ label, value, tone = 'brand' }: { label: string; value: number; tone?: 'brand' | 'warn' }) { return <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
<div className="text-xs text-[var(--text-muted)]">{label}</div>
<div className={tone === 'warn' ? 'mt-1 text-lg font-semibold text-[var(--warning)]' : 'mt-1 text-lg font-semibold text-[var(--brand)]'}>{value}</div>
</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium">
<span className="mb-1 block">{label}</span>{children}</label>; }
