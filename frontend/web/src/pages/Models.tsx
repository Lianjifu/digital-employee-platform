/**
 * P9 模型（企业级优化版）— 全交互增强
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Input } from '@de/web-ui';
import {
  Cloud, Server, Globe, Plus, Key, Settings, Activity, DollarSign,
  ShieldCheck, CheckCircle2, AlertTriangle, Zap, Globe2, RefreshCw,
  Play, ArrowRight, FileText, History, GitCompare, Settings2,
  Sparkles, BarChart3, Layers, TrendingUp, Eye, Trash2, Search,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Provider, ProviderTier } from '@de/web-types';
import { Modal, Drawer, ConfirmDialog, EmptyState, Sparkline } from '@/components/shared';

const TIER_ICON: Record<ProviderTier, any> = { official: Cloud, self_hosted: Server, connectable: Globe };
const TIER_LABEL: Record<ProviderTier, string> = { official: '官方 API', self_hosted: '自部署', connectable: '可接入' };

const INITIAL_ROUTES = [
  { level: 'P0', label: 'P0 推理', primary: 'Sonnet-4', f1: 'GPT-4o', f2: 'Opus-4', cross: true, primaryTone: 'error' as const },
  { level: 'P1', label: 'P1 摘要', primary: 'Sonnet-4', f1: 'Qwen2.5-72B', f2: '—', cross: true, primaryTone: 'warn' as const },
  { level: 'P2', label: 'P2 检索', primary: 'Qwen2.5-72B', f1: '—', f2: '—', cross: false, primaryTone: 'info' as const },
  { level: 'P3', label: 'P3 离线', primary: 'Qwen2.5-72B', f1: '—', f2: '—', cross: false, primaryTone: 'info' as const },
  { level: 'audit', label: 'Audit', primary: '审计专用通道', f1: '—', f2: '—', cross: false, primaryTone: 'neutral' as const },
];

const PROVIDER_TEMPLATES = [
  { name: 'Anthropic', tier: 'official' as const, region: 'us-west-2', model: 'Claude Sonnet-4' },
  { name: 'Azure OpenAI', tier: 'official' as const, region: 'eastasia', model: 'GPT-4o' },
  { name: 'Google Vertex', tier: 'official' as const, region: 'us-central1', model: 'Gemini 2.5 Pro' },
  { name: 'AWS Bedrock', tier: 'official' as const, region: 'ap-east-1', model: 'Claude Opus-4' },
  { name: 'Qwen2.5-72B (本地)', tier: 'self_hosted' as const, region: 'cn-east-1', model: 'Qwen2.5-72B-Instruct' },
  { name: 'DeepSeek-V3 (本地)', tier: 'self_hosted' as const, region: 'cn-north-1', model: 'DeepSeek-V3' },
  { name: 'Mistral-7B', tier: 'self_hosted' as const, region: 'eu-west-1', model: 'Mistral-7B-Instruct' },
  { name: 'Ollama (本地)', tier: 'self_hosted' as const, region: 'local', model: 'llama3.1-8b' },
];

const FULL_AUDIT_LOG = [
  { id: 'a1', time: '14:32', user: '王昊', action: '查询', model: 'Claude Sonnet-4', tokens: 1840, key: 'k-prod-001' },
  { id: 'a2', time: '14:30', user: '李婷', action: '轮转', model: 'GPT-4o', tokens: 0, key: 'k-dev-002' },
  { id: 'a3', time: '14:28', user: '张博', action: '查询', model: 'Qwen2.5-72B', tokens: 920, key: 'k-prod-001' },
  { id: 'a4', time: '14:25', user: '陈雷', action: '查询', model: 'DeepSeek-V3', tokens: 2400, key: 'k-test-003' },
  { id: 'a5', time: '14:20', user: '王昊', action: '查询', model: 'Claude Sonnet-4', tokens: 1100, key: 'k-prod-001' },
  { id: 'a6', time: '14:15', user: '李婷', action: '查询', model: 'Gemini 2.5 Pro', tokens: 3500, key: 'k-prod-002' },
  { id: 'a7', time: '14:10', user: '张博', action: '轮转', model: 'Mistral-7B', tokens: 0, key: 'k-dev-002' },
  { id: 'a8', time: '14:05', user: '王昊', action: '查询', model: 'Claude Sonnet-4', tokens: 680, key: 'k-prod-001' },
  { id: 'a9', time: '14:00', user: '陈雷', action: '查询', model: 'DeepSeek-V3', tokens: 1820, key: 'k-test-003' },
  { id: 'a10', time: '13:55', user: '李婷', action: '查询', model: 'GPT-4o', tokens: 2100, key: 'k-prod-002' },
];

const USAGE_SPARK = [42, 48, 52, 47, 56, 62, 58, 64, 70, 68, 72, 78, 82, 79, 85, 92];

type ModalKind = 'newProvider' | 'newTemplate' | 'editRoute' | 'routeFlow' | 'allAudit' | null;

export default function Models() {
  const [activeId, setActiveId] = useState('p1');
  const [showHealth, setShowHealth] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [routeToEdit, setRouteToEdit] = useState<any | null>(null);
  const [deleteRouteConfirm, setDeleteRouteConfirm] = useState<string | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  const [testSwitchResult, setTestSwitchResult] = useState<{ level: string; from: string; to: string; reason: string } | null>(null);
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [showDetails, setShowDetails] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  // 本地可写 state
  const [routes, setRoutes] = useState<any[]>(INITIAL_ROUTES);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [templates, setTemplates] = useState<any[] | null>(null);

  const { data: fetchedProviders } = useApiQuery<Provider[]>(['providers'], '/api/providers');
  const { data: health } = useApiQuery<any>(['provider-health'], '/api/provider-health');
  const { data: fetchedTemplates = [] } = useApiQuery<any[]>(['prompt-templates'], '/api/prompt-templates');
  const { data: routeFlow = [] } = useApiQuery<any[]>(['route-flow'], '/api/route-flow');
  const { data: exportRoutes } = useApiQuery<any>(['export-routes'], '/api/export-routes');
  const { data: compare = [] } = useApiQuery<any[]>(['model-compare'], '/api/model-compare');
  const { data: audit = [] } = useApiQuery<any[]>(['model-audit'], '/api/model-audit');

  // 首次填充本地 state
  useMemo(() => {
    if (fetchedProviders && !providers) setProviders(fetchedProviders);
    if (fetchedTemplates.length && !templates) setTemplates(fetchedTemplates);
  }, [fetchedProviders, fetchedTemplates, providers, templates]);

  const provs = providers ?? fetchedProviders ?? [];
  const tpls = templates ?? fetchedTemplates;
  const active = provs.find((p) => p.id === activeId);
  const filteredProviders = provs.filter((provider) => (
    !providerSearch || provider.name.toLowerCase().includes(providerSearch.toLowerCase()) || provider.models.some((model) => model.toLowerCase().includes(providerSearch.toLowerCase()))
  ));

  const groups: { tier: ProviderTier; items: Provider[] }[] = [
    { tier: 'official', items: provs.filter((p) => p.tier === 'official') },
    { tier: 'self_hosted', items: provs.filter((p) => p.tier === 'self_hosted') },
    { tier: 'connectable', items: provs.filter((p) => p.tier === 'connectable') },
  ];

  // 测试切换：随机选一个等级，把主路由换到下一档
  const handleTestSwitch = () => {
    const target = routes[Math.floor(Math.random() * routes.length)];
    if (!target || !target.f1 || target.f1 === '—') {
      setTestSwitchResult({ level: target?.level ?? 'P?', from: target?.primary ?? '?', to: '无可降级', reason: '当前路由无备选，跳过测试' });
      return;
    }
    setTestSwitchResult({
      level: target.level,
      from: target.primary,
      to: target.f1,
      reason: '模拟主 Provider 503 故障',
    });
  };

  const handleNewProvider = (form: { name: string; tier: ProviderTier; region: string; model: string }) => {
    const id = `p_${Date.now().toString(36)}`;
    setProviders((prev) => [
      ...(prev ?? fetchedProviders ?? []),
      {
        id,
        name: form.name,
        tier: form.tier,
        models: [form.model],
        region: form.region,
        status: 'standby',
        monthlyTokens: 0,
        monthlyCostUsd: 0,
      } as Provider,
    ]);
    setActiveId(id);
    setActiveModal(null);
  };

  const handleDeleteProvider = () => {
    if (!providerToDelete) return;
    setProviders((prev) => (prev ?? fetchedProviders ?? []).filter((p) => p.id !== providerToDelete));
    if (providerToDelete === activeId) setActiveId((provs[0]?.id) ?? '');
    setProviderToDelete(null);
  };

  const handleNewTemplate = (form: { name: string; category: string; preview: string }) => {
    setTemplates((prev) => [
      ...(prev ?? fetchedTemplates),
      {
        id: `tpl_${Date.now().toString(36)}`,
        name: form.name,
        category: form.category,
        preview: form.preview,
        uses: 0,
        rating: 0,
      },
    ]);
    setActiveModal(null);
  };

  const handleSaveRoute = (updated: any) => {
    setRoutes((prev) => prev.map((r) => (r.level === updated.level ? updated : r)));
    setRouteToEdit(null);
  };

  const handleDeleteRoute = () => {
    if (!deleteRouteConfirm) return;
    setRoutes((prev) => prev.filter((r) => r.level !== deleteRouteConfirm));
    setDeleteRouteConfirm(null);
  };

  const filteredAudit = useMemo(() => {
    const src = FULL_AUDIT_LOG.length > 0 ? FULL_AUDIT_LOG : audit;
    if (auditFilter === 'all') return src;
    return src.filter((a) => a.action === auditFilter);
  }, [auditFilter, audit]);

  return (
    <div className="models-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      {/* 左侧 Provider */}
      <aside className="hidden">
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)]">
          <div className="text-xs font-semibold">Provider ({provs.length})</div>
          <button
            onClick={() => setActiveModal('newProvider')}
            className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]"
            title="新增 Provider"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.tier} className="p-2">
            <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              {TIER_LABEL[g.tier]} ({g.items.length})
            </div>
            {g.items.map((p) => {
              const Icon = TIER_ICON[p.tier];
              const h = health?.[p.id];
              const isActive = p.id === activeId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-xs transition-all mb-1 cursor-pointer',
                    isActive ? 'card-active' : 'hover:bg-[var(--bg-elevated)] border border-transparent',
                  )}
                  onClick={() => setActiveId(p.id)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{p.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate font-mono">{p.models?.[0] ?? '—'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {p.status === 'active' ? (
                      <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                    ) : p.status === 'standby' ? (
                      <span className="h-2 w-2 rounded-full bg-[var(--warning)]" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" />
                    )}
                    {h && h.latency > 0 && (
                      <span className="text-[9px] text-[var(--text-muted)] font-mono">{h.latency}ms</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setProviderToDelete(p.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity grid h-5 w-5 place-items-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                    title="删除 Provider"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </aside>

      {/* 单一主面板 */}
      <section className="mx-auto w-full max-w-[1680px]">
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Cloud className="h-5 w-5 text-[var(--brand)]" />
                模型路由与 Provider 管理
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                统一管理 Provider、路由策略、模型成本与数据出境规则。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDetails(true)}>
                <Activity className="h-3.5 w-3.5" />运行详情
              </Button>
              <Button variant="secondary" size="sm" onClick={handleTestSwitch}>
                <RefreshCw className="h-3.5 w-3.5" />测试切换
              </Button>
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />自动映射已启用</Badge>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-44">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="筛选 Provider 或模型" className="h-8 pl-7 text-xs" />
              </div>
              <div className="models-provider-picker flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
                {filteredProviders.map((provider) => {
                  const ProviderIcon = TIER_ICON[provider.tier];
                  const isActive = provider.id === activeId;
                  return <button key={provider.id} onClick={() => setActiveId(provider.id)} className={cn(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors',
                    isActive ? 'border-[var(--brand)]/40 bg-[var(--brand-light)] font-semibold text-[var(--brand)]' : 'border-transparent bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                  )}>
                    <ProviderIcon className="h-3.5 w-3.5" />{provider.name}
                    <span className={cn('h-1.5 w-1.5 rounded-full', provider.status === 'active' ? 'bg-[var(--success)]' : provider.status === 'standby' ? 'bg-[var(--warning)]' : 'bg-[var(--text-muted)]')} />
                  </button>;
                })}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setActiveModal('newProvider')}><Plus className="h-3.5 w-3.5" />新增</Button>
            </div>
          </div>

          {/* 测试切换结果提示 */}
          {testSwitchResult && (
            <div className="mb-3 rounded-md border border-[var(--brand)]/40 bg-[var(--brand-light)] px-3 py-2 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-[var(--brand)]" />
                <span>
                  <strong>{testSwitchResult.level}</strong> 路由测试：
                  主 <span className="font-mono">{testSwitchResult.from}</span> → 降级到 <span className="font-mono text-[var(--brand)]">{testSwitchResult.to}</span>
                  <span className="text-[var(--text-muted)] ml-2">({testSwitchResult.reason})</span>
                </span>
              </div>
              <button onClick={() => setTestSwitchResult(null)} className="text-[var(--text-muted)] hover:text-[var(--text)] text-[10px]">关闭</button>
            </div>
          )}

          {/* 路由流程图 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 mb-3">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />路由流程图（等级 → Provider）
              <button
                onClick={() => { setRouteToEdit(routes[0]); }}
                className="ml-auto text-[10px] text-[var(--brand)] hover:underline"
              >
                <Settings className="inline h-3 w-3 mr-0.5" />配置
              </button>
            </div>
            <div className="space-y-2">
              {routeFlow.map((flow) => (
                <div key={flow.level} className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <Badge tone={flow.level === 'P0' ? 'error' : flow.level === 'P1' ? 'warn' : 'info'} className="text-[10px]">{flow.level}</Badge>
                  {flow.path.map((step: string, i: number) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className={cn(
                        'px-2 py-0.5 rounded font-mono text-[10px] cursor-pointer hover:opacity-80',
                        i === flow.path.length - 1
                          ? 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/30'
                          : i === flow.path.length - 2
                            ? 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/30'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]',
                      )} onClick={() => setActiveModal('routeFlow')}>{step}</span>
                      {i < flow.path.length - 1 && <ArrowRight className="h-3 w-3 text-[var(--text-muted)]" />}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 5 等级路由表 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />路由配置
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">点击行编辑</span>
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-2 font-semibold">等级</th>
                  <th className="text-left px-4 py-2 font-semibold">主路由</th>
                  <th className="text-left px-4 py-2 font-semibold">降级 1</th>
                  <th className="text-left px-4 py-2 font-semibold">降级 2</th>
                  <th className="text-left px-4 py-2 font-semibold">出境</th>
                  <th className="text-right px-4 py-2 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {routes.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon={Layers} title="没有路由配置" /></td></tr>
                ) : routes.map((r) => (
                  <tr
                    key={r.level}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] cursor-pointer"
                    onClick={() => setRouteToEdit(r)}
                  >
                    <td className="px-4 py-2.5"><Badge tone={r.primaryTone}>{r.level}</Badge></td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.primary}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{r.f1}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{r.f2}</td>
                    <td className="px-4 py-2.5">
                      {r.cross ? <Badge tone="warn"><Globe2 className="mr-1 inline h-3 w-3" />出境</Badge> : <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />境内</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteRouteConfirm(r.level); }}
                        className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                        title="删除"
                      >
                        <Trash2 className="inline h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Prompt 模板 + 模型对比 */}
        <div className="space-y-4 p-4 pb-8 sm:p-5 sm:pb-10">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[var(--brand)]" />Prompt 模板市场
              </h2>
              <Button size="sm" variant="secondary" onClick={() => setActiveModal('newTemplate')}>
                <Plus className="h-3 w-3" />新建模板
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {tpls.map((t) => (
                <div key={t.id} className="tile-brandable relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 overflow-hidden">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)] shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{t.name}</div>
                      <Badge tone="info" className="text-[9px] mt-0.5">{t.category}</Badge>
                    </div>
                  </div>
                  <div className="rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] p-2 text-[10px] font-mono text-[var(--text-muted)] line-clamp-2 mb-2">
                    {t.preview}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-muted)]">{t.uses} 次使用</span>
                    <span className="text-amber-500 flex items-center gap-0.5">⭐ {t.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <GitCompare className="h-4 w-4 text-[var(--brand)]" />模型对比
              </h2>
              <span className="text-[10px] text-[var(--text-muted)]">性能 / 价格 / 上下文</span>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] bg-[var(--bg-elevated)]">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">模型</th>
                    <th className="text-left px-3 py-2 font-semibold">价格 (in/out)</th>
                    <th className="text-left px-3 py-2 font-semibold">延迟 P95</th>
                    <th className="text-left px-3 py-2 font-semibold">质量</th>
                    <th className="text-left px-3 py-2 font-semibold">上下文</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]">
                      <td className="px-3 py-2 font-semibold">{c.name}</td>
                      <td className="px-3 py-2 font-mono">{c.price}</td>
                      <td className="px-3 py-2 font-mono">{c.latency}ms</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-[var(--bg-hover)] rounded overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[var(--brand)] to-[var(--purple)]" style={{ width: `${c.quality}%` }} />
                          </div>
                          <span className="font-mono">{c.quality}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono">{c.context}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 按需展开的运行详情 */}
      <Drawer
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title={active ? `${active.name} · 运行详情` : '模型运行详情'}
        description="健康度、用量、合规、配额和 API Key 审计"
        width={420}
      >
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />Provider 健康度
            </div>
            <button onClick={() => setShowHealth(!showHealth)} className="text-[10px] text-[var(--brand)] hover:underline">
              {showHealth ? '收起' : '展开'}
            </button>
          </div>
          {showHealth && (
            <div className="space-y-1.5">
              {provs.filter((p) => p.status === 'active' || p.status === 'standby').map((p) => {
                const h = health?.[p.id];
                return (
                  <div key={p.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{p.name}</span>
                      <Badge tone={h?.status === 'healthy' ? 'success' : 'warn'} className="text-[9px]">{h?.status}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-[var(--text-muted)]">
                      <span>延迟 {h?.latency ?? 0}ms</span>
                      <span>可用 {h?.uptime ?? 0}%</span>
                      <span>{h?.lastCheck ?? '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-[var(--success)]" />本月用量
            </div>
            <Badge tone="success" className="text-[9px]"><TrendingUp className="mr-0.5 inline h-2.5 w-2.5" />+18%</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Token" value="12.4M" tone="brand" />
            <KpiCard label="成本" value="$1.24k" tone="success" sub="24% / $5k" />
            <KpiCard label="P95" value="680ms" tone="info" />
            <KpiCard label="成功率" value="99.4%" tone="success" />
          </div>
          <div className="mt-3">
            <div className="text-[10px] text-[var(--text-muted)] mb-1">7 日 Token 趋势</div>
            <Sparkline data={USAGE_SPARK} stroke="var(--brand)" width={272} height={36} />
          </div>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5" />出境合规
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-3 rounded overflow-hidden flex">
                <div className="bg-[var(--success)]" style={{ width: `${exportRoutes?.cn ?? 94}%` }} />
                <div className="bg-[var(--warning)]" style={{ width: `${exportRoutes?.global ?? 6}%` }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1.5">
                <span><span className="text-[var(--success)]">●</span> 境内 {exportRoutes?.cn ?? 94}%</span>
                <span><span className="text-[var(--warning)]">●</span> 出境 {exportRoutes?.global ?? 6}%</span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[10px] text-[var(--text-muted)] leading-relaxed">
            数据默认境内 · P0/P1 可出境 5% · 出境前自动审计
          </div>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />限流配置 + 配额
          </div>
          <div className="space-y-2.5">
            <Limiter label="QPS" value="100" max="200" usage={50} />
            <Limiter label="RPM" value="3000" max="6000" usage={50} />
            <Limiter label="月 Token" value="12.4M" max="50M" usage={25} tone="success" />
            <Limiter label="成本" value="$1.24k" max="$5.0k" usage={25} tone="success" />
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />API Key 审计
            </div>
            <button onClick={() => setActiveModal('allAudit')} className="text-[10px] text-[var(--brand)] hover:underline">全部 ({filteredAudit.length})</button>
          </div>
          <div className="space-y-1.5">
            {filteredAudit.slice(0, 4).map((a) => (
              <div key={a.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">{a.time}</span>
                  <Badge tone={a.action === '轮转' ? 'info' : 'neutral'} className="text-[9px]">{a.action}</Badge>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-semibold">{a.user}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{a.tokens} tokens</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono">{a.model}</div>
              </div>
            ))}
          </div>
        </div>
      </Drawer>

      {/* ===== Modals ===== */}
      <NewProviderModal open={activeModal === 'newProvider'} onClose={() => setActiveModal(null)} onSubmit={handleNewProvider} />
      <NewTemplateModal open={activeModal === 'newTemplate'} onClose={() => setActiveModal(null)} onSubmit={handleNewTemplate} />

      <ConfirmDialog
        open={!!providerToDelete}
        onClose={() => setProviderToDelete(null)}
        onConfirm={handleDeleteProvider}
        title="删除 Provider？"
        description="删除后引用此 Provider 的路由将失败，建议先调整路由。"
        confirmText="删除"
        tone="danger"
      />

      <ConfirmDialog
        open={!!deleteRouteConfirm}
        onClose={() => setDeleteRouteConfirm(null)}
        onConfirm={handleDeleteRoute}
        title={`删除 ${deleteRouteConfirm ?? ''} 等级路由？`}
        description="删除后该等级请求将无主路由可用。"
        confirmText="删除"
        tone="danger"
      />

      <Drawer
        open={!!routeToEdit}
        onClose={() => setRouteToEdit(null)}
        title={routeToEdit ? `编辑 ${routeToEdit.level} 等级路由` : ''}
        description={routeToEdit?.label ?? ''}
        width={460}
      >
        {routeToEdit && (
          <EditRouteForm
            initial={routeToEdit}
            onCancel={() => setRouteToEdit(null)}
            onSubmit={handleSaveRoute}
          />
        )}
      </Drawer>

      <Drawer
        open={activeModal === 'routeFlow'}
        onClose={() => setActiveModal(null)}
        title="路由流程详情"
        description="等级 → Provider 链路可视化"
        width={520}
      >
        <div className="space-y-3 text-xs">
          {routeFlow.map((flow) => (
            <div key={flow.level} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge tone={flow.level === 'P0' ? 'error' : flow.level === 'P1' ? 'warn' : 'info'}>{flow.level}</Badge>
                <span className="text-[10px] text-[var(--text-muted)]">{flow.path.length} 跳链路</span>
              </div>
              <div className="space-y-1.5">
                {flow.path.map((step: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="text-[var(--text-muted)] font-mono w-4 text-right">{i + 1}.</span>
                    <span className="font-mono">{step}</span>
                    {i < flow.path.length - 1 && (
                      <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                        失败时降级 →
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Drawer>

      <Drawer
        open={activeModal === 'allAudit'}
        onClose={() => setActiveModal(null)}
        title="API Key 审计日志"
        description={`${filteredAudit.length} 条记录`}
        width={560}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            {(['all', '查询', '轮转'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAuditFilter(k)}
                className={cn(
                  'px-2 py-1 rounded text-[11px] font-medium',
                  auditFilter === k ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {k === 'all' ? '全部' : k}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {filteredAudit.length === 0 ? (
              <EmptyState icon={Search} title="没有匹配记录" />
            ) : (
              filteredAudit.map((a) => (
                <div key={a.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{a.time}</span>
                    <Badge tone={a.action === '轮转' ? 'info' : 'neutral'} className="text-[9px]">{a.action}</Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-semibold">{a.user}</span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">key: {a.key ?? '—'}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span className="font-mono">{a.model}</span>
                    <span>{a.tokens} tokens</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

/* ===== 子组件 ===== */

function KpiCard({ label, value, tone, sub }: { label: string; value: string; tone: 'brand' | 'success' | 'info'; sub?: string }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'brand' ? 'text-[var(--brand)]' : 'text-[var(--info)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-base font-mono font-bold', color)}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

function Limiter({ label, value, max, usage, tone }: { label: string; value: string; max: string; usage: number; tone?: 'success' }) {
  const barColor = usage >= 80 ? 'bg-[var(--danger)]' : usage >= 60 ? 'bg-[var(--warning)]' : tone === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--brand)]';
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-mono">{value} / {max}</span>
      </div>
      <div className="h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
        <div className={cn('h-full transition-all', barColor)} style={{ width: `${usage}%` }} />
      </div>
      <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{usage}%</div>
    </div>
  );
}

function NewProviderModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { name: string; tier: ProviderTier; region: string; model: string }) => void }) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<ProviderTier>('official');
  const [region, setRegion] = useState('cn-east-1');
  const [model, setModel] = useState('');
  const valid = name.trim() && model.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新增 Provider"
      description="配置新的大模型 Provider 并加入可用池"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ name: name.trim(), tier, region, model: model.trim() }); setName(''); setModel(''); }}>
            添加
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {PROVIDER_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => { setName(tpl.name); setTier(tpl.tier); setRegion(tpl.region); setModel(tpl.model); }}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-left text-[11px] hover:border-[var(--brand)]"
            >
              <div className="font-semibold truncate">{tpl.name}</div>
              <div className="text-[9px] text-[var(--text-muted)] truncate">{tpl.model}</div>
            </button>
          ))}
        </div>
        <Field label="Provider 名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：OpenAI Prod" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="类型">
            <select value={tier} onChange={(e) => setTier(e.target.value as ProviderTier)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
              <option value="official">官方 API</option>
              <option value="self_hosted">自部署</option>
              <option value="connectable">可接入</option>
            </select>
          </Field>
          <Field label="区域">
            <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="cn-east-1" />
          </Field>
        </div>
        <Field label="主模型" required>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="例如：Claude Sonnet-4" />
        </Field>
        <Field label="API Key">
          <Input type="password" placeholder="sk-..." />
        </Field>
        <p className="text-[10px] text-[var(--text-muted)]">提示：API Key 将加密保存在 KMS 中，仅在调用时短暂解密。</p>
      </div>
    </Modal>
  );
}

function NewTemplateModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { name: string; category: string; preview: string }) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('分析');
  const [preview, setPreview] = useState('');
  const valid = name.trim() && preview.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建 Prompt 模板"
      description="可被 Agent 或技能引用"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ name: name.trim(), category, preview: preview.trim() }); setName(''); setPreview(''); }}>
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="模板名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：日志异常分析" />
        </Field>
        <Field label="分类">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
            <option>分析</option>
            <option>检索</option>
            <option>生成</option>
            <option>安全</option>
            <option>运维</option>
          </select>
        </Field>
        <Field label="模板内容" required>
          <textarea
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            placeholder="请分析以下日志并输出关键异常点..."
            className="w-full h-32 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono resize-none"
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditRouteForm({
  initial, onCancel, onSubmit,
}: { initial: any; onCancel: () => void; onSubmit: (r: any) => void }) {
  const [primary, setPrimary] = useState(initial.primary);
  const [f1, setF1] = useState(initial.f1);
  const [f2, setF2] = useState(initial.f2);
  const [cross, setCross] = useState(initial.cross);
  return (
    <div className="space-y-3 text-xs">
      <Field label="等级">
        <div className="flex items-center gap-2"><Badge tone={initial.primaryTone}>{initial.level}</Badge><span className="text-[var(--text-muted)]">{initial.label}</span></div>
      </Field>
      <Field label="主路由 (Primary)" required>
        <Input value={primary} onChange={(e) => setPrimary(e.target.value)} />
      </Field>
      <Field label="降级 1 (Fallback 1)">
        <Input value={f1} onChange={(e) => setF1(e.target.value)} placeholder="—" />
      </Field>
      <Field label="降级 2 (Fallback 2)">
        <Input value={f2} onChange={(e) => setF2(e.target.value)} placeholder="—" />
      </Field>
      <Field label="允许出境">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} className="accent-[var(--brand)]" />
          <span>允许路由到境外 Provider</span>
        </label>
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button onClick={() => onSubmit({ ...initial, primary, f1, f2, cross })}>保存</Button>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="text-[var(--danger)]"> *</span>}
      </label>
      {children}
    </div>
  );
}
