import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cloud, FileKey2, FlaskConical, History, Network, Plus, RefreshCw, Route, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Input, toast } from '@de/web-ui';
import type { ModelAuditEvent, ModelProvider, ProviderImpact, ProviderTier, RoutingPolicyDraft, RoutingPolicyVersion } from '@de/web-types';
import { useApiMutation, useApiQuery } from '@/services/query';
import { ConfirmDialog, Drawer, EmptyState } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { modelQueryState, policyStatusLabel, providerLifecycleAction } from '@/features/models/model-ui';

type Workspace = 'access' | 'routing' | 'governance' | 'audit';

const WORKSPACES: Array<{ key: Workspace; label: string; icon: typeof Cloud }> = [
  { key: 'access', label: '模型接入', icon: Cloud },
  { key: 'routing', label: '模型路由', icon: Route },
  { key: 'governance', label: '模型治理', icon: Activity },
  { key: 'audit', label: '模型审计', icon: History },
];

const TIER_LABEL: Record<ProviderTier, string> = { official: '官方 API', self_hosted: '自部署', connectable: '可接入' };

export default function Models() {
  const { user } = useAuthStore();
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId ?? 'w1');
  const canWrite = Boolean(user?.permissions.includes('model.write'));
  const scopeKey = `${currentWorkspaceId}:${user?.id ?? 'anonymous'}`;
  const [workspace, setWorkspace] = useState<Workspace>('access');
  const [providerDrawer, setProviderDrawer] = useState<'new' | string | null>(null);
  const [policyDrawer, setPolicyDrawer] = useState<string | null>(null);
  const [publishPolicy, setPublishPolicy] = useState<RoutingPolicyDraft | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<ModelProvider | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'success' | 'failed'>('all');

  const providersQuery = useApiQuery<ModelProvider[]>(['model-providers', scopeKey], '/api/model-providers');
  const policiesQuery = useApiQuery<RoutingPolicyDraft[]>(['model-routing-policies', scopeKey], '/api/model-routing/policies');
  const governanceQuery = useApiQuery<{ activeProviders: number; publishedRoutes: number; budgetRisk: string; updatedAt: string }>(['model-governance', scopeKey], '/api/model-governance/overview');
  const auditQuery = useApiQuery<ModelAuditEvent[]>(['model-audit', scopeKey], '/api/model-audit');
  const activeProvider = providerDrawer && providerDrawer !== 'new' ? providersQuery.data?.find((item) => item.id === providerDrawer) : undefined;
  const impactQuery = useApiQuery<ProviderImpact>(['model-provider-impact', scopeKey, activeProvider?.id], `/api/model-providers/${activeProvider?.id ?? '__none__'}/impact`, undefined, { enabled: Boolean(activeProvider) });
  const versionsQuery = useApiQuery<RoutingPolicyVersion[]>(['model-policy-versions', scopeKey, policyDrawer], `/api/model-routing/policies/${policyDrawer ?? '__none__'}/versions`, undefined, { enabled: Boolean(policyDrawer) });

  const createProvider = useApiMutation<ModelProvider, Record<string, unknown>>('/api/model-providers');
  const testProvider = useApiMutation<{ status: string }, { id: string; reason: string }>((value) => `/api/model-providers/${value.id}/test`);
  const disableProvider = useApiMutation<ModelProvider, { id: string; reason: string }>((value) => `/api/model-providers/${value.id}/disable`);
  const removeProvider = useApiMutation<{ id: string }, { id: string; reason: string }>((value) => `/api/model-providers/${value.id}`, undefined, 'DELETE');
  const updatePolicy = useApiMutation<RoutingPolicyDraft, Record<string, unknown>>((value: any) => `/api/model-routing/policies/${value.id}/draft`, undefined, 'PATCH');
  const validatePolicy = useApiMutation<RoutingPolicyDraft, { id: string }>((value) => `/api/model-routing/policies/${value.id}/validate`);
  const publish = useApiMutation<RoutingPolicyVersion, { id: string; reason: string }>((value) => `/api/model-routing/policies/${value.id}/publish`);
  const rollback = useApiMutation<RoutingPolicyVersion, { id: string; versionId: string; reason: string }>((value) => `/api/model-routing/policies/${value.id}/rollback`);
  const runDrill = useApiMutation<{ status: string }, { policyId: string; scope: 'sandbox'; reason: string }>('/api/model-routing/failover-tests');

  const models = useMemo(() => providersQuery.data?.flatMap((provider) => provider.models) ?? [], [providersQuery.data]);
  const selectedPolicy = policiesQuery.data?.find((item) => item.id === policyDrawer);
  const filteredAudit = (auditQuery.data ?? []).filter((event) => auditFilter === 'all' || event.result === auditFilter);
  const queryState = modelQueryState({ isLoading: providersQuery.isLoading || policiesQuery.isLoading, isError: providersQuery.isError || policiesQuery.isError || governanceQuery.isError || auditQuery.isError, data: [...(providersQuery.data ?? []), ...(policiesQuery.data ?? [])] });
  const reportError = (error: unknown) => toast.error(error instanceof Error ? error.message : '模型控制面操作失败');
  const refetchControlPlane = () => { void providersQuery.refetch(); void policiesQuery.refetch(); void governanceQuery.refetch(); void auditQuery.refetch(); };

  return (
    <div className="models-page h-full overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-5">
      <main className="mx-auto max-w-[1440px] rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow-xs)]" aria-label="模型中心">
        <header className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold"><Cloud className="h-5 w-5 text-[var(--brand)]" />模型中心</h1>
              <p className="mt-1 text-xs text-[var(--text-muted)]">统一管理企业模型接入、路由策略、运行治理与审计追溯。</p>
            </div>
            <Badge tone="warn"><AlertTriangle className="mr-1 h-3 w-3" />当前为 Mock 治理演示，真实授权与 KMS 由服务端执行</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-[var(--bg-elevated)] p-1" role="tablist" aria-label="模型控制面工作区">
            {WORKSPACES.map(({ key, label, icon: Icon }) => <button key={key} id={`model-workspace-tab-${key}`} type="button" role="tab" aria-controls={`model-workspace-${key}`} aria-selected={workspace === key} onClick={() => setWorkspace(key)} className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${workspace === key ? 'bg-white text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>
        </header>

        <section className="grid gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4 sm:grid-cols-3 sm:px-6">
          <Metric label="可用 Provider" value={String(governanceQuery.data?.activeProviders ?? 0)} tone="brand" />
          <Metric label="已发布路由" value={String(governanceQuery.data?.publishedRoutes ?? 0)} tone="success" />
          <Metric label="预算状态" value={governanceQuery.data?.budgetRisk === 'normal' ? '正常' : '关注'} tone={governanceQuery.data?.budgetRisk === 'normal' ? 'success' : 'warn'} />
        </section>

        <section id={`model-workspace-${workspace}`} role="tabpanel" aria-labelledby={`model-workspace-tab-${workspace}`} className="p-4 sm:p-6">
          {queryState.kind === 'loading' ? <div className="py-16 text-center text-sm text-[var(--text-muted)]">{queryState.label}…</div> : queryState.kind === 'error' ? <div className="py-16 text-center"><AlertTriangle className="mx-auto h-6 w-6 text-[var(--danger)]" /><p className="mt-3 text-sm font-medium">{queryState.label}</p><Button className="mt-4" size="sm" variant="secondary" onClick={refetchControlPlane}>重新读取</Button></div> : workspace === 'access' ? (
            <AccessWorkspace providers={providersQuery.data ?? []} canWrite={canWrite} onNew={() => setProviderDrawer('new')} onSelect={setProviderDrawer} />
          ) : workspace === 'routing' ? (
            <RoutingWorkspace policies={policiesQuery.data ?? []} models={models} canWrite={canWrite} onOpen={setPolicyDrawer} />
          ) : workspace === 'governance' ? (
            <GovernanceWorkspace canWrite={canWrite} policies={policiesQuery.data ?? []} onDrill={(policyId) => runDrill.mutate({ policyId, scope: 'sandbox', reason: '控制面隔离演练' }, { onSuccess: () => toast.success('sandbox 故障切换演练通过'), onError: reportError })} />
          ) : <AuditWorkspace events={filteredAudit} filter={auditFilter} onFilter={setAuditFilter} />}
        </section>
      </main>

      <Drawer open={providerDrawer === 'new'} onClose={() => setProviderDrawer(null)} title="接入 Provider" description="凭据仅在提交时写入 Mock 凭据引用，成功后不会回显。" width={520}>
        <ProviderForm canWrite={canWrite} workspaceId={currentWorkspaceId} onSubmit={(payload) => createProvider.mutate(payload, { onSuccess: () => { toast.success('Provider 已接入，等待连通性验证'); setProviderDrawer(null); }, onError: reportError })} />
      </Drawer>
      <Drawer open={Boolean(activeProvider)} onClose={() => setProviderDrawer(null)} title={activeProvider?.name} description="Provider 详情、连通性和退役影响" width={520}>
        {activeProvider && <ProviderDetail provider={activeProvider} impact={impactQuery.data} canWrite={canWrite} onTest={() => testProvider.mutate({ id: activeProvider.id, reason: '人工连通性验证' }, { onSuccess: () => toast.success('Provider 连通性验证通过'), onError: reportError })} onDisable={() => disableProvider.mutate({ id: activeProvider.id, reason: '停止新流量' }, { onSuccess: () => toast.success('Provider 已停止新流量'), onError: reportError })} onDelete={() => setDeleteProvider(activeProvider)} />}
      </Drawer>
      <Drawer open={Boolean(selectedPolicy)} onClose={() => setPolicyDrawer(null)} title={selectedPolicy ? `${selectedPolicy.level} 路由策略` : ''} description="草稿校验通过后才能发布；版本快照不可改写。" width={600}>
        {selectedPolicy && <PolicyDetail policy={selectedPolicy} models={models} versions={versionsQuery.data ?? []} canWrite={canWrite} onSave={(draft) => updatePolicy.mutate(draft, { onSuccess: () => toast.success('路由草稿已保存'), onError: reportError })} onValidate={() => validatePolicy.mutate({ id: selectedPolicy.id }, { onSuccess: (policy) => toast[policy.status === 'ready' ? 'success' : 'warn'](policy.status === 'ready' ? '路由草稿校验通过' : '路由草稿未通过校验'), onError: reportError })} onPublish={() => setPublishPolicy(selectedPolicy)} onRollback={(versionId) => rollback.mutate({ id: selectedPolicy.id, versionId, reason: '人工确认回滚' }, { onSuccess: () => toast.success('已创建回滚版本'), onError: reportError })} />}
      </Drawer>
      <ConfirmDialog open={Boolean(publishPolicy)} onClose={() => setPublishPolicy(null)} onConfirm={() => { if (publishPolicy) publish.mutate({ id: publishPolicy.id, reason: '人工确认发布' }, { onSuccess: () => toast.success('路由版本已发布'), onError: reportError }); }} title="发布路由版本？" description={publishPolicy ? `${publishPolicy.level} 将生成不可变版本快照，并记录审计证据。` : ''} confirmText="确认发布" />
      <ConfirmDialog open={Boolean(deleteProvider)} onClose={() => setDeleteProvider(null)} onConfirm={() => { if (deleteProvider) removeProvider.mutate({ id: deleteProvider.id, reason: '人工确认删除' }, { onSuccess: () => toast.success('Provider 已删除'), onError: reportError }); }} title="删除未被引用的 Provider？" description="已被已发布路由引用的 Provider 将被 API 拒绝删除。" confirmText="删除" tone="danger" />
    </div>
  );
}

function AccessWorkspace({ providers, canWrite, onNew, onSelect }: { providers: ModelProvider[]; canWrite: boolean; onNew: () => void; onSelect: (id: string) => void }) {
  return <div><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Provider 与凭据引用</h2><p className="mt-1 text-xs text-[var(--text-muted)]">接入、验证、停用和退役均通过受控 API。</p></div><Button size="sm" disabled={!canWrite} onClick={onNew}><Plus className="h-3.5 w-3.5" />接入 Provider</Button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{providers.map((provider) => <button type="button" key={provider.id} onClick={() => onSelect(provider.id)} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition-colors hover:border-[var(--brand)]"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{provider.name}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{TIER_LABEL[provider.tier]} · {provider.cloudRegion}</div></div><Badge tone={provider.status === 'active' ? 'success' : provider.status === 'disabled' ? 'error' : 'neutral'}>{provider.status}</Badge></div><div className="mt-4 text-xs text-[var(--text-secondary)]">{provider.models.map((model) => model.name).join(' · ')}</div><div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><FileKey2 className="h-3 w-3" />{provider.credentialMasked} · {provider.lastVerifiedAt ? '已验证' : '待验证'}</div></button>)}</div></div>;
}

function RoutingWorkspace({ policies, models, canWrite, onOpen }: { policies: RoutingPolicyDraft[]; models: ModelProvider['models']; canWrite: boolean; onOpen: (id: string) => void }) {
  const byId = new Map(models.map((model) => [model.id, model.name]));
  return <div><div className="mb-4"><h2 className="text-sm font-semibold">版本化路由策略</h2><p className="mt-1 text-xs text-[var(--text-muted)]">模型目标必须是已准入部署，草稿须校验后发布。</p></div><div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="min-w-[720px] w-full text-xs"><thead className="bg-[var(--bg-elevated)] text-left text-[11px] text-[var(--text-muted)]"><tr><th className="px-4 py-3">等级</th><th>主模型</th><th>降级链</th><th>数据范围</th><th>状态</th><th className="px-4 text-right">操作</th></tr></thead><tbody>{policies.map((policy) => <tr key={policy.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-semibold">{policy.level}</td><td>{byId.get(policy.primaryModelId) ?? '未配置'}</td><td>{policy.fallbackModelIds.map((id) => byId.get(id) ?? '不可用').join(' → ') || '—'}</td><td>{policy.dataScope === 'restricted' ? '受限 · 禁止出境' : policy.egressAllowed ? '内部 · 可出境' : '内部 · 境内'}</td><td><Badge tone={policy.status === 'published' ? 'success' : policy.status === 'ready' ? 'warn' : 'neutral'}>{policyStatusLabel(policy.status)}</Badge></td><td className="px-4 text-right"><Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => onOpen(policy.id)}>管理</Button></td></tr>)}</tbody></table></div></div>;
}

function GovernanceWorkspace({ canWrite, policies, onDrill }: { canWrite: boolean; policies: RoutingPolicyDraft[]; onDrill: (id: string) => void }) {
  const drillTarget = policies.find((policy) => policy.fallbackModelIds.length > 0);
  return <div className="max-w-2xl"><h2 className="text-sm font-semibold">运行治理与隔离演练</h2><p className="mt-1 text-xs text-[var(--text-muted)]">演练只允许 sandbox 或 canary 范围，不会切换生产流量。</p><div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4 text-[var(--brand)]" />故障切换演练</div><p className="mt-1 text-xs text-[var(--text-muted)]">验证指定策略的主模型降级链、审计链路与隔离范围。</p></div><Button size="sm" variant="secondary" disabled={!canWrite || !drillTarget} onClick={() => drillTarget && onDrill(drillTarget.id)}><RefreshCw className="h-3.5 w-3.5" />执行 sandbox 演练</Button></div></div></div>;
}

function AuditWorkspace({ events, filter, onFilter }: { events: ModelAuditEvent[]; filter: 'all' | 'success' | 'failed'; onFilter: (value: 'all' | 'success' | 'failed') => void }) {
  return <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">模型控制面审计</h2><p className="mt-1 text-xs text-[var(--text-muted)]">记录接入、校验、发布、回滚、退役及演练结果。</p></div><div className="flex gap-1">{(['all', 'success', 'failed'] as const).map((item) => <Button key={item} size="sm" variant={filter === item ? 'secondary' : 'ghost'} onClick={() => onFilter(item)}>{item === 'all' ? '全部' : item === 'success' ? '成功' : '失败'}</Button>)}</div></div>{events.length === 0 ? <EmptyState icon={History} title="暂无模型控制面审计事件" /> : <div className="space-y-2">{events.map((event) => <article key={event.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge tone={event.result === 'success' ? 'success' : 'error'}>{event.result === 'success' ? '成功' : '失败'}</Badge><strong className="text-xs">{event.action}</strong></div><time className="font-mono text-[11px] text-[var(--text-muted)]">{new Date(event.time).toLocaleString('zh-CN')}</time></div><div className="mt-2 text-xs text-[var(--text-secondary)]">目标：{event.target}{event.reason ? ` · 原因：${event.reason}` : ''}</div><div className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">关联 {event.correlationId}{event.policyVersion ? ` · 版本 ${event.policyVersion}` : ''}</div></article>)}</div>}</div>;
}

function ProviderForm({ canWrite, workspaceId, onSubmit }: { canWrite: boolean; workspaceId: string; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [name, setName] = useState(''); const [model, setModel] = useState(''); const [region, setRegion] = useState('cn-east-1'); const [credential, setCredential] = useState('');
  return <div className="space-y-4"><Field label="Provider 名称"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：企业 Azure OpenAI" /></Field><Field label="模型部署"><Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如：gpt-4o-enterprise" /></Field><Field label="云区域"><Input value={region} onChange={(event) => setRegion(event.target.value)} /></Field><Field label="一次性凭据"><Input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder="仅用于创建凭据引用，不会回显" /></Field><p className="text-xs text-[var(--text-muted)]">演示模式仅模拟 write-only 凭据引用；生产环境必须由 KMS/Vault 接收和托管密钥。</p><div className="flex justify-end"><Button disabled={!canWrite || !name.trim() || !model.trim() || !credential.trim()} onClick={() => { onSubmit({ name, model, region, credential, tier: 'official', workspaceId }); setCredential(''); }}>创建受管接入</Button></div></div>;
}

function ProviderDetail({ provider, impact, canWrite, onTest, onDisable, onDelete }: { provider: ModelProvider; impact?: ProviderImpact; canWrite: boolean; onTest: () => void; onDisable: () => void; onDelete: () => void }) {
  const deletion = providerLifecycleAction(impact ?? { deletionAllowed: false });
  return <div className="space-y-4"><div className="rounded-lg border border-[var(--border)] p-3 text-xs"><div className="font-medium">凭据引用</div><div className="mt-1 font-mono text-[var(--text-muted)]">{provider.credentialRef} · {provider.credentialMasked}</div></div><div className="rounded-lg border border-[var(--border)] p-3 text-xs"><div className="font-medium">退役影响</div><p className="mt-1 text-[var(--text-muted)]">{impact?.blockedReason ?? '未发现已发布路由引用，可执行删除。'}</p>{impact?.routeReferences.map((item) => <div key={item.versionId} className="mt-2 flex items-center gap-1"><Network className="h-3 w-3" />{item.level} · {item.versionId}</div>)}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!canWrite} onClick={onTest}><ShieldCheck className="h-3.5 w-3.5" />验证连通性</Button><Button size="sm" variant="outline" disabled={!canWrite || provider.status === 'disabled'} onClick={onDisable}>停止新流量</Button><Button size="sm" variant="ghost" disabled={!canWrite || deletion.disabled} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" />{deletion.label}</Button></div></div>;
}

function PolicyDetail({ policy, models, versions, canWrite, onSave, onValidate, onPublish, onRollback }: { policy: RoutingPolicyDraft; models: ModelProvider['models']; versions: RoutingPolicyVersion[]; canWrite: boolean; onSave: (value: Record<string, unknown>) => void; onValidate: () => void; onPublish: () => void; onRollback: (versionId: string) => void }) {
  const [primaryModelId, setPrimary] = useState(policy.primaryModelId); const [fallbackModelId, setFallback] = useState(policy.fallbackModelIds[0] ?? ''); const [egressAllowed, setEgress] = useState(policy.egressAllowed); const [budgetLimitUsd, setBudget] = useState(String(policy.budgetLimitUsd));
  return <div className="space-y-4"><Field label="主模型"><select value={primaryModelId} onChange={(event) => setPrimary(event.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs">{models.map((model) => <option key={model.id} value={model.id} disabled={model.status !== 'available'}>{model.name}</option>)}</select></Field><Field label="降级模型"><select value={fallbackModelId} onChange={(event) => setFallback(event.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="">不配置降级</option>{models.filter((model) => model.id !== primaryModelId).map((model) => <option key={model.id} value={model.id} disabled={model.status !== 'available'}>{model.name}</option>)}</select></Field><Field label="月度预算上限 (USD)"><Input inputMode="numeric" value={budgetLimitUsd} onChange={(event) => setBudget(event.target.value)} /></Field><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={egressAllowed} onChange={(event) => setEgress(event.target.checked)} disabled={policy.dataScope === 'restricted'} />允许路由至境外部署</label>{policy.validationIssues.length > 0 && <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger)]">{policy.validationIssues.join('；')}</div>}<div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4"><Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => onSave({ id: policy.id, primaryModelId, fallbackModelIds: fallbackModelId ? [fallbackModelId] : [], egressAllowed, budgetLimitUsd: Number(budgetLimitUsd) })}>保存草稿</Button><Button size="sm" variant="secondary" disabled={!canWrite} onClick={onValidate}><CheckCircle2 className="h-3.5 w-3.5" />校验</Button><Button size="sm" disabled={!canWrite || policy.status !== 'ready'} onClick={onPublish}>发布版本</Button></div><div className="border-t border-[var(--border)] pt-4"><div className="mb-2 text-xs font-semibold">版本历史</div>{versions.length === 0 ? <p className="text-xs text-[var(--text-muted)]">暂无已发布版本</p> : <div className="space-y-2">{versions.map((version) => <div key={version.id} className="flex items-center justify-between rounded-md border border-[var(--border)] p-2 text-xs"><span>v{version.version} · {new Date(version.publishedAt).toLocaleString('zh-CN')}</span><Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => onRollback(version.id)}>以此回滚</Button></div>)}</div>}</div></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'success' | 'warn' }) { const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--brand)]'; return <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"><div className="text-xs text-[var(--text-muted)]">{label}</div><div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-[var(--text-secondary)]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
