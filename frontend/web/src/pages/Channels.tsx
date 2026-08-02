import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Cloud, FileText, History, Plus, Route, Search, Send, ShieldAlert, ShieldCheck, Trash2, Users,
} from 'lucide-react';
import { Badge, Button, Input, toast } from '@de/web-ui';
import type { ChannelAuditEvent, ChannelDeployment, ChannelKind, DeliveryAttempt, DeliveryPolicyDraft, DeliveryPolicyVersion } from '@de/web-types';
import { useApiMutation, useApiQuery } from '@/services/query';
import { ConfirmDialog, Drawer, EmptyState } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { deliveryPolicyStatusLabel, deploymentDeletionAction } from '@/features/channels/channel-ui';
import { useT } from '@/i18n';
import { cn } from '@de/web-utils';

type Tab = 'deployments' | 'routing' | 'templates' | 'health' | 'failures' | 'audit';

const TABS: Array<{ key: Tab; labelKey: string; icon: typeof Cloud }> = [
  { key: 'deployments', labelKey: 'module.channels.tabs.deployments', icon: Cloud },
  { key: 'templates', labelKey: 'module.channels.tabs.templates', icon: FileText },
  { key: 'routing', labelKey: 'module.channels.tabs.routing', icon: Route },
  { key: 'health', labelKey: 'module.channels.tabs.health', icon: Activity },
  { key: 'failures', labelKey: 'module.channels.tabs.failures', icon: AlertTriangle },
  { key: 'audit', labelKey: 'module.channels.tabs.audit', icon: History },
];

const KIND_LABEL: Record<ChannelKind, string> = {
  feishu: '飞书',
  wecom: '企业微信',
  dingtalk: '钉钉',
  slack: 'Slack',
  email: '邮件',
  webhook: 'Webhook',
  sms: '短信',
  phone: '电话',
};

const STATUS_LABEL: Record<ChannelDeployment['status'], string> = {
  draft: '草稿',
  active: '运行中',
  disabled: '已停用',
  offline: '离线',
};

const ENV_LABEL = { production: '生产', sandbox: '沙箱' } as const;
const CLASSIFICATION_LABEL = { internal: '内部', restricted: '受限' } as const;

type ChannelTemplate = {
  id: string;
  name: string;
  kind?: ChannelKind;
  locale?: string;
  status?: 'draft' | 'published';
  tone?: string;
  desc: string;
  preview: string;
  updatedAt?: string;
};

type BlacklistItem = { id: string; type: string; value: string; reason: string; addedBy: string; expires: string };

type DeploymentHealth = {
  deploymentId: string;
  successRate: number;
  p95Ms: number;
  errorCount24h: number;
  status: 'healthy' | 'attention' | 'offline';
};

const DEPLOYMENT_HEALTH: Record<string, Omit<DeploymentHealth, 'deploymentId'>> = {
  'delivery-feishu': { successRate: 99.8, p95Ms: 120, errorCount24h: 2, status: 'healthy' },
  'delivery-email': { successRate: 97.8, p95Ms: 280, errorCount24h: 24, status: 'attention' },
};

function formatTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN');
}

function templateToneIcon(tone?: string) {
  if (tone === 'error') return { Icon: ShieldAlert, className: 'is-error' };
  if (tone === 'warn') return { Icon: AlertTriangle, className: 'is-warn' };
  return { Icon: FileText, className: 'is-info' };
}

function sanitizeTemplatePreview(preview: string) {
  return preview.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/^\s+/gm, '').trim();
}

export default function Channels() {
  const { t } = useT();
  const { user } = useAuthStore();
  const canWrite = Boolean(user?.permissions.includes('channel.write'));
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId ?? 'w1');
  const scopeKey = `${currentWorkspaceId}:${user?.id ?? 'anonymous'}`;
  const [tab, setTab] = useState<Tab>('deployments');
  const [newOpen, setNewOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [deleteDeployment, setDeleteDeployment] = useState<ChannelDeployment | null>(null);
  const [templateQuery, setTemplateQuery] = useState('');

  const deployments = useApiQuery<ChannelDeployment[]>(['channel-deployments', scopeKey], '/api/channel-control/deployments');
  const policies = useApiQuery<DeliveryPolicyDraft[]>(['delivery-policies', scopeKey], '/api/channel-control/policies');
  const overview = useApiQuery<{ activeDeployments: number; publishedPolicies: number; deadLetters: number; capacityRisk: string }>(['channel-overview', scopeKey], '/api/channel-control/overview');
  const failures = useApiQuery<DeliveryAttempt[]>(['channel-dead-letters', scopeKey], '/api/channel-control/dead-letters');
  const audit = useApiQuery<ChannelAuditEvent[]>(['channel-audit', scopeKey], '/api/channel-control/audit');
  const templates = useApiQuery<ChannelTemplate[]>(['channel-templates', scopeKey], '/api/channel-templates', undefined, { enabled: tab === 'templates' });
  const blacklist = useApiQuery<BlacklistItem[]>(['channel-blacklist', scopeKey], '/api/channel-blacklist', undefined, { enabled: tab === 'templates' });
  const activePolicy = policies.data?.find((item) => item.id === selectedPolicy);
  const versions = useApiQuery<DeliveryPolicyVersion[]>(['delivery-versions', scopeKey, selectedPolicy], `/api/channel-control/policies/${selectedPolicy ?? '__none__'}/versions`, undefined, { enabled: Boolean(selectedPolicy) });
  const create = useApiMutation<ChannelDeployment, Record<string, unknown>>('/api/channel-control/deployments');
  const verify = useApiMutation<ChannelDeployment, { id: string }>((v) => `/api/channel-control/deployments/${v.id}/verify`);
  const remove = useApiMutation<{ id: string }, { id: string }>((v) => `/api/channel-control/deployments/${v.id}`, undefined, 'DELETE');
  const validate = useApiMutation<DeliveryPolicyDraft, { id: string }>((v) => `/api/channel-control/policies/${v.id}/validate`);
  const publish = useApiMutation<DeliveryPolicyVersion, { id: string }>((v) => `/api/channel-control/policies/${v.id}/publish`);
  const simulate = useApiMutation<{ status: string; capacityRisk: string }, { id: string }>((v) => `/api/channel-control/policies/${v.id}/simulate`);
  const createTemplate = useApiMutation<ChannelTemplate, { name: string; desc: string; kind: ChannelKind }>('/api/channel-templates');

  const loading = deployments.isLoading || policies.isLoading;
  const notifyError = (e: unknown) => toast.error(e instanceof Error ? e.message : '渠道控制面操作失败');
  const policyRefs = useMemo(() => new Set((policies.data ?? []).filter((p) => p.status === 'published').flatMap((p) => [p.primaryDeploymentId, ...p.fallbackDeploymentIds])), [policies.data]);
  const deploymentMap = useMemo(() => {
    const map = new Map<string, ChannelDeployment>();
    (deployments.data ?? []).forEach((item) => map.set(item.id, item));
    return map;
  }, [deployments.data]);

  const kpis: Array<{ key: Tab; label: string; value: number; sub: string; icon: typeof Cloud; tone: string }> = [
    { key: 'deployments', label: '活跃部署', value: overview.data?.activeDeployments ?? 0, sub: '个', icon: Cloud, tone: 'brand' },
    { key: 'routing', label: '已发布策略', value: overview.data?.publishedPolicies ?? 0, sub: '个', icon: Route, tone: 'brand' },
    { key: 'failures', label: '死信待处置', value: overview.data?.deadLetters ?? 0, sub: '条', icon: AlertTriangle, tone: (overview.data?.deadLetters ?? 0) > 0 ? 'warn' : 'success' },
  ];

  return (
    <div className="de-employee-page channels-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      <div className="channels-page__stack">
        <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
          <div className="flex items-start justify-between gap-4 px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg">
                  <Send className="h-4 w-4" />
                </div>
                <h1 className="text-base font-semibold text-[var(--text)]">{t('module.channels.title')}</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">{t('module.channels.subtitle')}</p>
            </div>
            <div className="channels-guardrail shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>渠道控制面 · 服务端负责凭据与授权</span>
            </div>
          </div>
          <div className="de-employee-tabs flex overflow-x-auto px-3" role="tablist" aria-label={t('module.channels.title')}>
            {TABS.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn('de-employee-tab flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs transition-colors', tab === key && 'is-active')}
              >
                <Icon className="h-3.5 w-3.5" />{t(labelKey)}
              </button>
            ))}
          </div>
        </section>

        <section className="channels-kpis" aria-label="渠道摘要">
          {kpis.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn('channels-kpi', `channels-kpi--${item.tone}`, tab === item.key && 'is-active')}
              onClick={() => setTab(item.key)}
            >
              <span className="channels-kpi__icon"><item.icon className="h-4 w-4" /></span>
              <span className="channels-kpi__body">
                <span>{item.label}</span>
                <strong>{item.value}<small>{item.sub}</small></strong>
              </span>
            </button>
          ))}
        </section>

        <section className="de-employee-shell channels-workspace overflow-hidden rounded-xl bg-[var(--surface-1)]">
          {loading ? (
            <div className="channels-loading">正在读取渠道控制面状态…</div>
          ) : tab === 'deployments' ? (
            <Deployments
              items={deployments.data ?? []}
              canWrite={canWrite}
              refs={policyRefs}
              onNew={() => setNewOpen(true)}
              onVerify={(id) => verify.mutate({ id }, { onSuccess: () => toast.success('渠道连通性验证通过'), onError: notifyError })}
              onDelete={setDeleteDeployment}
            />
          ) : tab === 'routing' ? (
            <Routing
              policies={policies.data ?? []}
              deployments={deploymentMap}
              canWrite={canWrite}
              onOpen={setSelectedPolicy}
            />
          ) : tab === 'templates' ? (
            <Templates
              templates={templates.data ?? []}
              blacklist={blacklist.data ?? []}
              query={templateQuery}
              onQuery={setTemplateQuery}
              canWrite={canWrite}
              onCreate={(body) => createTemplate.mutate(body, { onSuccess: () => toast.success('消息模板草稿已创建'), onError: notifyError })}
            />
          ) : tab === 'health' ? (
            <Health
              overview={overview.data}
              deployments={deployments.data ?? []}
              onSimulate={() => {
                const draft = policies.data?.[0];
                if (!draft) { toast.warn('暂无策略可模拟'); return; }
                simulate.mutate({ id: draft.id }, { onSuccess: (v) => toast[v.status === 'passed' ? 'success' : 'warn'](`模拟结果：${v.status} · 容量 ${v.capacityRisk}`), onError: notifyError });
              }}
              canWrite={canWrite}
            />
          ) : tab === 'failures' ? (
            <Failures
              items={failures.data ?? []}
              deployments={deploymentMap}
              onGoRouting={() => setTab('routing')}
            />
          ) : (
            <Audit items={audit.data ?? []} />
          )}
        </section>
      </div>

      <Drawer open={newOpen} onClose={() => setNewOpen(false)} title="接入渠道部署" description="凭据只写入引用，接入后必须完成连通性验证。" width={480}>
        <DeploymentForm canWrite={canWrite} workspaceId={currentWorkspaceId} onSubmit={(body) => create.mutate(body, { onSuccess: () => { toast.success('渠道部署草稿已创建'); setNewOpen(false); }, onError: notifyError })} />
      </Drawer>
      <Drawer open={Boolean(activePolicy)} onClose={() => setSelectedPolicy(null)} title={activePolicy?.eventType} description="策略需校验后发布；发布产生不可变版本。" width={520}>
        {activePolicy && (
          <PolicyDrawer
            policy={activePolicy}
            versions={versions.data ?? []}
            deployments={deploymentMap}
            canWrite={canWrite}
            onValidate={() => validate.mutate({ id: activePolicy.id }, { onSuccess: (v) => toast[v.status === 'ready' ? 'success' : 'warn'](v.status === 'ready' ? '策略校验通过' : '策略校验未通过'), onError: notifyError })}
            onPublish={() => publish.mutate({ id: activePolicy.id }, { onSuccess: () => toast.success('投递策略已发布'), onError: notifyError })}
            onSimulate={() => simulate.mutate({ id: activePolicy.id }, { onSuccess: (v) => toast[v.status === 'passed' ? 'success' : 'warn'](`模拟结果：${v.status} · 容量 ${v.capacityRisk}`), onError: notifyError })}
          />
        )}
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteDeployment)}
        onClose={() => setDeleteDeployment(null)}
        onConfirm={() => { if (deleteDeployment) remove.mutate({ id: deleteDeployment.id }, { onSuccess: () => toast.success('渠道部署已删除'), onError: notifyError }); }}
        title="删除渠道部署？"
        description="已发布策略引用的部署将被 API 拒绝删除。"
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
}

function Deployments({
  items,
  canWrite,
  refs,
  onNew,
  onVerify,
  onDelete,
}: {
  items: ChannelDeployment[];
  canWrite: boolean;
  refs: Set<string>;
  onNew: () => void;
  onVerify: (id: string) => void;
  onDelete: (d: ChannelDeployment) => void;
}) {
  return (
    <div className="channels-panel">
      <div className="channels-section-head">
        <div>
          <h2>渠道接入 · {items.length}</h2>
          <p>受管部署、凭据引用、连通性验证与生命周期；删除受已发布策略引用保护。</p>
        </div>
        <Button size="sm" disabled={!canWrite} onClick={onNew}><Plus className="h-3.5 w-3.5" />接入渠道</Button>
      </div>
      {items.length ? (
        <div className="channels-deploy-grid">
          {items.map((d) => {
            const deletion = deploymentDeletionAction(!refs.has(d.id));
            return (
              <article key={d.id} className="channels-card">
                <div className="channels-card__top">
                  <div className="min-w-0">
                    <strong>{d.name}</strong>
                    <p>{KIND_LABEL[d.kind] ?? d.kind} · {ENV_LABEL[d.environment]} · {d.owner}</p>
                  </div>
                  <Badge tone={d.status === 'active' ? 'success' : d.status === 'disabled' || d.status === 'offline' ? 'error' : 'neutral'}>
                    {STATUS_LABEL[d.status]}
                  </Badge>
                </div>
                <div className="channels-card__meta">
                  <span className="font-mono">{d.credentialMasked}</span>
                  <span>{d.lastVerifiedAt ? `已验证 ${formatTime(d.lastVerifiedAt)}` : '待连通性验证'}</span>
                </div>
                <div className="channels-card__actions">
                  <button type="button" className="channels-action channels-action--primary" disabled={!canWrite} onClick={() => onVerify(d.id)}>
                    <ShieldCheck className="h-3.5 w-3.5" />验证
                  </button>
                  <button type="button" className="channels-action channels-action--danger" disabled={!canWrite || deletion.disabled} onClick={() => onDelete(d)}>
                    <Trash2 className="h-3.5 w-3.5" />{deletion.label}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Cloud} title="暂无渠道部署" description="接入飞书、企微或邮件等投递通道后，数字员工通知与告警才能出站。" action={canWrite ? <Button size="sm" onClick={onNew}><Plus className="h-3.5 w-3.5" />接入渠道</Button> : undefined} />
      )}
    </div>
  );
}

function Routing({
  policies,
  deployments,
  canWrite,
  onOpen,
}: {
  policies: DeliveryPolicyDraft[];
  deployments: Map<string, ChannelDeployment>;
  canWrite: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="channels-panel">
      <div className="channels-section-head">
        <div>
          <h2>投递路由 · {policies.length}</h2>
          <p>事件、目标组、主渠道与降级链通过版本化发布生效；供数字员工告警与任务通知引用。</p>
        </div>
      </div>
      {policies.length ? (
        <div className="channels-table-wrap">
          <table className="channels-table">
            <thead>
              <tr>
                <th>事件</th>
                <th>目标</th>
                <th>主渠道</th>
                <th>降级链</th>
                <th>数据等级</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const primary = deployments.get(p.primaryDeploymentId);
                const fallbacks = p.fallbackDeploymentIds.map((id) => deployments.get(id)?.name ?? id).join(' → ');
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.eventType}</strong>
                      <small>数字员工 / 告警协同</small>
                    </td>
                    <td>{p.audience}</td>
                    <td>{primary?.name ?? p.primaryDeploymentId}</td>
                    <td className="channels-table__muted">{fallbacks || '—'}</td>
                    <td>{CLASSIFICATION_LABEL[p.dataClassification]}</td>
                    <td>
                      <Badge tone={p.status === 'published' ? 'success' : p.status === 'ready' ? 'warn' : 'neutral'}>
                        {deliveryPolicyStatusLabel(p.status)}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <button type="button" className="channels-action channels-action--primary" disabled={!canWrite} onClick={() => onOpen(p.id)}>
                        管理
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Route} title="暂无投递策略" description="创建事件到目标组的路由草稿后，校验并发布方可投递。" />
      )}
    </div>
  );
}

function Templates({
  templates,
  blacklist,
  query,
  onQuery,
  canWrite,
  onCreate,
}: {
  templates: ChannelTemplate[];
  blacklist: BlacklistItem[];
  query: string;
  onQuery: (value: string) => void;
  canWrite: boolean;
  onCreate: (body: { name: string; desc: string; kind: ChannelKind }) => void;
}) {
  const [name, setName] = useState('');
  const visible = templates.filter((item) => !query.trim() || `${item.name} ${item.desc}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="channels-panel">
      <div className="channels-section-head">
        <div>
          <h2>消息模板 · {templates.length}</h2>
          <p>版本化模板、多语言与变量白名单；投递前脱敏。目标治理控制值班组与黑名单。</p>
        </div>
        <label className="channels-search">
          <Search className="h-3.5 w-3.5" />
          <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="检索模板" className="h-9 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0" />
        </label>
      </div>

      <div className="channels-templates-grid">
        <section className="channels-subpanel">
          <div className="channels-subpanel__head">
            <h3><FileText className="h-4 w-4 text-[var(--brand)]" />模板资产</h3>
            {canWrite && (
              <div className="channels-inline-create">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="新模板名称" className="h-8 w-36 text-xs" />
                <Button
                  size="sm"
                  disabled={!name.trim()}
                  onClick={() => { onCreate({ name: name.trim(), desc: '新建模板草稿', kind: 'feishu' }); setName(''); }}
                >
                  <Plus className="h-3.5 w-3.5" />新建
                </Button>
              </div>
            )}
          </div>
          {visible.length ? (
            <div className="channels-template-list">
              {visible.map((item) => {
                  const tone = templateToneIcon(item.tone);
                  return (
                <article key={item.id} className="channels-template-card">
                  <div className="channels-card__top">
                    <div className="channels-template-card__title">
                      <span className={cn('channels-template-icon', tone.className)}>
                        <tone.Icon className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.desc}</p>
                      </div>
                    </div>
                    <Badge tone={item.status === 'published' ? 'success' : 'neutral'}>{item.status === 'published' ? '已发布' : '草稿'}</Badge>
                  </div>
                  <pre className="channels-template-preview">{sanitizeTemplatePreview(item.preview)}</pre>
                  <div className="channels-card__meta">
                    <span>{item.kind ? KIND_LABEL[item.kind] : '通用'}</span>
                    <span>{item.locale ?? 'zh-CN'}</span>
                    {item.updatedAt && <span>更新 {formatTime(item.updatedAt)}</span>}
                  </div>
                </article>
                  );
                })}
            </div>
          ) : (
            <EmptyState icon={FileText} title="没有匹配的模板" />
          )}
        </section>

        <section className="channels-subpanel">
          <div className="channels-subpanel__head">
            <h3><Users className="h-4 w-4 text-[var(--brand)]" />目标治理</h3>
          </div>
          <p className="channels-subpanel__desc">策略仅可引用已批准目标组；黑名单阻止异常收件人接收生产告警。</p>
          {blacklist.length ? (
            <div className="channels-blacklist">
              {blacklist.map((item) => (
                <div key={item.id} className="channels-blacklist__row">
                  <div>
                    <strong>{item.value}</strong>
                    <p>{item.type} · {item.reason}</p>
                  </div>
                  <div className="channels-blacklist__meta">
                    <span>{item.addedBy}</span>
                    <span>至 {item.expires}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title="暂无黑名单条目" />
          )}
        </section>
      </div>
    </div>
  );
}

function Health({
  overview,
  deployments,
  onSimulate,
  canWrite,
}: {
  overview?: { capacityRisk: string; activeDeployments?: number; deadLetters?: number };
  deployments: ChannelDeployment[];
  onSimulate: () => void;
  canWrite: boolean;
}) {
  const rows = deployments.map((item) => {
    const health = DEPLOYMENT_HEALTH[item.id] ?? {
      successRate: item.status === 'active' ? 99 : 0,
      p95Ms: item.status === 'active' ? 150 : 0,
      errorCount24h: 0,
      status: item.status === 'active' ? 'healthy' as const : 'offline' as const,
    };
    return { ...item, ...health };
  });
  const capacity = overview?.capacityRisk ?? 'unknown';

  return (
    <div className="channels-panel">
      <div className="channels-section-head">
        <div>
          <h2>运行健康</h2>
          <p>按部署查看成功率、P95 与错误；容量风险可走策略模拟预检。</p>
        </div>
        <Button size="sm" variant="secondary" disabled={!canWrite} onClick={onSimulate}>容量模拟</Button>
      </div>

      <div className="channels-health-summary">
        <div className="channels-health-stat">
          <span>容量风险</span>
          <strong className={capacity === 'normal' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{capacity}</strong>
        </div>
        <div className="channels-health-stat">
          <span>活跃部署</span>
          <strong>{overview?.activeDeployments ?? deployments.filter((d) => d.status === 'active').length}</strong>
        </div>
        <div className="channels-health-stat">
          <span>死信水位</span>
          <strong>{overview?.deadLetters ?? 0}</strong>
        </div>
      </div>

      <div className="channels-health-grid">
        {rows.map((row) => (
          <article key={row.id} className="channels-card">
            <div className="channels-card__top">
              <div>
                <strong>{row.name}</strong>
                <p>{KIND_LABEL[row.kind]} · {ENV_LABEL[row.environment]}</p>
              </div>
              <Badge tone={row.status === 'healthy' ? 'success' : row.status === 'attention' ? 'warn' : 'neutral'}>
                {row.status === 'healthy' ? '健康' : row.status === 'attention' ? '关注' : '离线'}
              </Badge>
            </div>
            <div className="channels-health-metrics">
              <div><span>成功率</span><strong>{row.successRate}%</strong></div>
              <div><span>P95</span><strong>{row.p95Ms}<small>ms</small></strong></div>
              <div><span>24h 错误</span><strong>{row.errorCount24h}</strong></div>
            </div>
          </article>
        ))}
        <article className="channels-card channels-card--soft">
          <div className="channels-card__top">
            <div>
              <strong>隔离演练</strong>
              <p>在 sandbox / canary 验证投递链路，不影响生产目标组。</p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-[var(--brand)]" />
          </div>
          <p className="channels-card__hint">建议在策略发布前执行模拟，确认降级链容量充足。</p>
        </article>
      </div>
    </div>
  );
}

function Failures({
  items,
  deployments,
  onGoRouting,
}: {
  items: DeliveryAttempt[];
  deployments: Map<string, ChannelDeployment>;
  onGoRouting: () => void;
}) {
  return (
    <div className="channels-panel">
      <div className="channels-section-head">
        <div>
          <h2>失败处置 · {items.length}</h2>
          <p>失败自动重试、降级后进入死信；载荷与目标均脱敏，可回溯关联链路。</p>
        </div>
        <button type="button" className="channels-text-link" onClick={onGoRouting}>检查投递路由</button>
      </div>
      {items.length ? (
        <div className="channels-failure-list">
          {items.map((item) => (
            <article key={item.id} className="channels-failure">
              <div className="channels-card__top">
                <div>
                  <strong>死信 · {item.targetMasked}</strong>
                  <p>{deployments.get(item.deploymentId)?.name ?? item.deploymentId} · 尝试 {item.attempts} 次</p>
                </div>
                <Badge tone="error">死信</Badge>
              </div>
              <p className="channels-failure__payload">{item.payloadSummary}</p>
              <div className="channels-card__meta">
                <span>{formatTime(item.createdAt)}</span>
                <span className="font-mono">{item.correlationId}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="channels-empty">
          <EmptyState
            icon={CheckCircle2}
            title="没有待处置死信"
            description="当前队列清空。若出现投递失败，将在此保留脱敏证据并支持人工复盘。"
          />
        </div>
      )}
    </div>
  );
}

function Audit({ items }: { items: ChannelAuditEvent[] }) {
  return (
    <div className="channels-panel">
      <div className="channels-section-head">
        <div>
          <h2>渠道审计 · {items.length}</h2>
          <p>接入、验证、发布、投递与失败处置均保留关联证据，供合规与排障。</p>
        </div>
      </div>
      {items.length ? (
        <div className="channels-audit-list">
          {items.map((item) => (
            <article key={item.id} className="channels-audit">
              <div>
                <div className="channels-card__top">
                  <strong>{item.action}</strong>
                  <Badge tone={item.result === 'success' ? 'success' : 'error'}>{item.result === 'success' ? '成功' : '失败'}</Badge>
                </div>
                <p>{item.target}{item.reason ? ` · ${item.reason}` : ''}</p>
                <div className="channels-card__meta">
                  <span>{item.actor}</span>
                  <span className="font-mono">{item.correlationId}</span>
                </div>
              </div>
              <time>{formatTime(item.time)}</time>
            </article>
          ))}
        </div>
      ) : (
        <div className="channels-empty">
          <EmptyState icon={History} title="暂无渠道审计事件" description="完成接入验证或策略发布后，证据将出现在此。" />
        </div>
      )}
    </div>
  );
}

function PolicyDrawer({
  policy,
  versions,
  deployments,
  canWrite,
  onValidate,
  onPublish,
  onSimulate,
}: {
  policy: DeliveryPolicyDraft;
  versions: DeliveryPolicyVersion[];
  deployments: Map<string, ChannelDeployment>;
  canWrite: boolean;
  onValidate: () => void;
  onPublish: () => void;
  onSimulate: () => void;
}) {
  const primary = deployments.get(policy.primaryDeploymentId);
  const fallbacks = policy.fallbackDeploymentIds.map((id) => deployments.get(id)?.name ?? id);
  return (
    <div className="channels-drawer space-y-4 text-xs">
      <div className="channels-drawer-block">
        <h3>策略范围</h3>
        <p>{policy.eventType} → {policy.audience}</p>
        <div className="channels-card__meta mt-2">
          <span>密级 {CLASSIFICATION_LABEL[policy.dataClassification]}</span>
          <span>主渠道 {primary?.name ?? policy.primaryDeploymentId}</span>
          <span>降级 {fallbacks.join(' → ') || '—'}</span>
        </div>
      </div>
      {policy.validationIssues.length > 0 && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] p-3 text-[var(--danger)]">
          {policy.validationIssues.join('；')}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!canWrite} onClick={onValidate}>校验草稿</Button>
        <Button size="sm" disabled={!canWrite || policy.status !== 'ready'} onClick={onPublish}>发布版本</Button>
        <Button size="sm" variant="ghost" disabled={!canWrite} onClick={onSimulate}>容量模拟</Button>
      </div>
      <div className="channels-drawer-block">
        <h3>版本历史</h3>
        {versions.length
          ? versions.map((v) => <p key={v.id} className="mt-2">v{v.version} · {formatTime(v.publishedAt)} · {v.publishedBy}</p>)
          : <p className="mt-2 text-[var(--text-muted)]">暂无已发布版本</p>}
      </div>
    </div>
  );
}

function DeploymentForm({ canWrite, workspaceId, onSubmit }: { canWrite: boolean; workspaceId: string; onSubmit: (v: Record<string, unknown>) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('feishu');
  const [credential, setCredential] = useState('');
  return (
    <div className="space-y-3">
      <Field label="部署名称"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="渠道类型">
        <select value={kind} onChange={(e) => setKind(e.target.value as ChannelKind)} className="h-9 w-full rounded-md border border-[var(--border)] px-2 text-xs">
          <option value="feishu">飞书</option>
          <option value="wecom">企业微信</option>
          <option value="email">邮件</option>
          <option value="webhook">Webhook</option>
        </select>
      </Field>
      <Field label="一次性凭据"><Input type="password" value={credential} onChange={(e) => setCredential(e.target.value)} /></Field>
      <p className="text-xs text-[var(--text-muted)]">凭据只生成引用；生产环境由 KMS/Vault 托管。</p>
      <div className="flex justify-end">
        <Button disabled={!canWrite || !name || !credential} onClick={() => onSubmit({ name, kind, credential, workspaceId })}>创建草稿</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-medium text-[var(--text-secondary)]"><span>{label}</span>{children}</label>;
}
