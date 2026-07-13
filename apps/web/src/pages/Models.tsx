/**
 * P9 模型（企业级优化版）
 * Todo 1-10:
 *  1. Provider 健康度仪表
 *  2. 模型路由可视化（等级 → Provider 流向）
 *  3. 用量仪表（成本 + Token 实时）
 *  4. 失败切换测试按钮
 *  5. 出境合规：流向地图（境内/出境占比）
 *  6. Prompt 模板市场
 *  7. 模型对比（性能/价格）
 *  8. 限流配置
 *  9. 配额预警
 * 10. 审计日志（API Key 使用）
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import {
  Cloud, Server, Globe, Plus, Key, Settings, Activity, DollarSign,
  ShieldCheck, CheckCircle2, AlertTriangle, Zap, Globe2, RefreshCw,
  Play, ArrowRight, FileText, History, GitCompare, Settings2,
  Sparkles, BarChart3, Layers, TrendingUp, Eye,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Provider, ProviderTier } from '@de/web-types';

const TIER_ICON: Record<ProviderTier, any> = { official: Cloud, self_hosted: Server, connectable: Globe };
const TIER_LABEL: Record<ProviderTier, string> = { official: '官方 API', self_hosted: '自部署', connectable: '可接入' };

const ROUTES = [
  { level: 'P0', label: 'P0 推理', primary: 'Sonnet-4', f1: 'GPT-4o', f2: 'Opus-4', cross: true, primaryTone: 'error' as const },
  { level: 'P1', label: 'P1 摘要', primary: 'Sonnet-4', f1: 'Qwen2.5-72B', f2: '—', cross: true, primaryTone: 'warn' as const },
  { level: 'P2', label: 'P2 检索', primary: 'Qwen2.5-72B', f1: '—', f2: '—', cross: false, primaryTone: 'info' as const },
  { level: 'P3', label: 'P3 离线', primary: 'Qwen2.5-72B', f1: '—', f2: '—', cross: false, primaryTone: 'info' as const },
  { level: 'audit', label: 'Audit', primary: '审计专用通道', f1: '—', f2: '—', cross: false, primaryTone: 'neutral' as const },
];

export default function Models() {
  const [activeId, setActiveId] = useState('p1');
  const [showHealth, setShowHealth] = useState(true);

  const { data: providers } = useApiQuery<Provider[]>(['providers'], '/api/providers');
  const { data: health } = useApiQuery<any>(['provider-health'], '/api/provider-health');
  const { data: templates = [] } = useApiQuery<any[]>(['prompt-templates'], '/api/prompt-templates');
  const { data: routeFlow = [] } = useApiQuery<any[]>(['route-flow'], '/api/route-flow');
  const { data: exportRoutes } = useApiQuery<any>(['export-routes'], '/api/export-routes');
  const { data: compare = [] } = useApiQuery<any[]>(['model-compare'], '/api/model-compare');
  const { data: audit = [] } = useApiQuery<any[]>(['model-audit'], '/api/model-audit');

  const active = providers?.find((p) => p.id === activeId);
  const groups: { tier: ProviderTier; items: Provider[] }[] = [
    { tier: 'official', items: (providers ?? []).filter((p) => p.tier === 'official') },
    { tier: 'self_hosted', items: (providers ?? []).filter((p) => p.tier === 'self_hosted') },
    { tier: 'connectable', items: (providers ?? []).filter((p) => p.tier === 'connectable') },
  ];

  return (
    <div className="flex h-full">
      {/* 左侧 Provider */}
      <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)]">
          <div className="text-xs font-semibold">Provider ({providers?.length ?? 0})</div>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.tier} className="p-2">
            <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              {TIER_LABEL[g.tier]}
            </div>
            {g.items.map((p) => {
              const Icon = TIER_ICON[p.tier];
              const h = health?.[p.id];
              const isActive = p.id === activeId;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-xs transition-all mb-1',
                    isActive ? 'card-active' : 'hover:bg-[var(--bg-elevated)] border border-transparent',
                  )}
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
                    {/* Todo 1: 健康度延迟 */}
                    {h && h.latency > 0 && (
                      <span className="text-[9px] text-[var(--text-muted)] font-mono">{h.latency}ms</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* 中间 */}
      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Cloud className="h-5 w-5 text-[var(--brand)]" />
                模型 · Provider + 5 等级路由
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                8 家 Provider · 24 模型 · 失败自动切换 · 出境合规
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Todo 4: 失败切换测试 */}
              <Button variant="secondary" size="sm">
                <RefreshCw className="h-3.5 w-3.5" />测试切换
              </Button>
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />自动映射已启用</Badge>
            </div>
          </div>

          {/* Todo 2: 路由可视化 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 mb-3">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />路由流程图（等级 → Provider）
            </div>
            <div className="space-y-2">
              {routeFlow.map((flow) => (
                <div key={flow.level} className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <Badge tone={flow.level === 'P0' ? 'error' : flow.level === 'P1' ? 'warn' : 'info'} className="text-[10px]">{flow.level}</Badge>
                  {flow.path.map((step: string, i: number) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className={cn(
                        'px-2 py-0.5 rounded font-mono text-[10px]',
                        i === flow.path.length - 1
                          ? 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/30'
                          : i === flow.path.length - 2
                            ? 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/30'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]',
                      )}>{step}</span>
                      {i < flow.path.length - 1 && <ArrowRight className="h-3 w-3 text-[var(--text-muted)]" />}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 5 等级路由表 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                  <th className="text-left px-4 py-2 font-semibold">等级</th>
                  <th className="text-left px-4 py-2 font-semibold">主路由</th>
                  <th className="text-left px-4 py-2 font-semibold">降级 1</th>
                  <th className="text-left px-4 py-2 font-semibold">降级 2</th>
                  <th className="text-left px-4 py-2 font-semibold">出境</th>
                </tr>
              </thead>
              <tbody>
                {ROUTES.map((r) => (
                  <tr key={r.level} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                    <td className="px-4 py-2.5"><Badge tone={r.primaryTone}>{r.level}</Badge></td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.primary}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{r.f1}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{r.f2}</td>
                    <td className="px-4 py-2.5">
                      {r.cross ? <Badge tone="warn"><Globe2 className="mr-1 inline h-3 w-3" />出境</Badge> : <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />境内</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Todo 6: Prompt 模板市场 + Todo 7: 模型对比 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Prompt 模板 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[var(--brand)]" />Prompt 模板市场
              </h2>
              <Button size="sm" variant="secondary"><Plus className="h-3 w-3" />新建模板</Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {templates.map((t) => (
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

          {/* Todo 7: 模型对比 */}
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

      {/* 右侧：健康度 + 用量 + 出境 + 配额 + 审计 */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {/* Todo 1: 健康度仪表 */}
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
              {(providers ?? []).filter((p) => p.status === 'active' || p.status === 'standby').map((p) => {
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

        {/* Todo 3: 用量仪表 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-[var(--success)]" />本月用量
          </div>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Token" value="12.4M" tone="brand" />
            <KpiCard label="成本" value="$1.24k" tone="success" sub="24% / $5k" />
            <KpiCard label="P95" value="680ms" tone="info" />
            <KpiCard label="成功率" value="99.4%" tone="success" />
          </div>
        </div>

        {/* Todo 5: 出境合规 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5" />出境合规
          </div>
          <div className="flex items-center gap-3">
            {/* 境内 / 出境 双色进度条 */}
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

        {/* Todo 8 + 9: 限流 + 配额预警 */}
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

        {/* Todo 10: 审计日志 */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />API Key 审计
            </div>
            <button className="text-[10px] text-[var(--brand)] hover:underline">全部</button>
          </div>
          <div className="space-y-1.5">
            {audit.slice(0, 4).map((a) => (
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
      </aside>
    </div>
  );
}

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