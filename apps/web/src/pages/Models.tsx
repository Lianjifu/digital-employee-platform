/**
 * P9 模型 · Provider + 5 等级路由
 * 1:1 对齐 docs/01-product/mockups/p9-models.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import {
  Cloud, Server, Globe, Plus, Key, Settings, Activity, DollarSign,
  ShieldCheck, CheckCircle2, AlertTriangle, Zap, Globe2,
} from 'lucide-react';
import { cn, formatNumber } from '@de/web-utils';
import type { ModelRoute, Provider, ProviderTier } from '@de/web-types';

const TIER_ICON: Record<ProviderTier, any> = { official: Cloud, self_hosted: Server, connectable: Globe };
const TIER_LABEL: Record<ProviderTier, string> = { official: '官方 API', self_hosted: '自部署', connectable: '可接入' };
const TIER_DESC: Record<ProviderTier, string> = { official: '出境 · 主力 P0/P1', self_hosted: '境内 · P2/P3', connectable: '未配置' };

const PROVIDERS = [
  { id: 'p1', name: 'Anthropic', tier: 'official' as const, model: 'Claude Sonnet-4', region: 'global', status: 'active' as const, tokens: 8400000, cost: 980, primary: true },
  { id: 'p2', name: 'Azure OpenAI', tier: 'official' as const, model: 'GPT-4o', region: 'global', status: 'standby' as const, tokens: 0, cost: 0 },
  { id: 'p3', name: 'Google Vertex', tier: 'official' as const, model: 'Gemini 2.0', region: 'global', status: 'standby' as const, tokens: 200000, cost: 24 },
  { id: 'p4', name: 'AWS Bedrock', tier: 'official' as const, model: 'Claude 3.5 / Titan', region: 'global', status: 'standby' as const, tokens: 0, cost: 0 },
  { id: 'p5', name: 'Qwen2.5-72B', tier: 'self_hosted' as const, model: 'Qwen2.5-72B', region: 'cn', status: 'active' as const, tokens: 3200000, cost: 180 },
  { id: 'p6', name: 'DeepSeek-V3', tier: 'self_hosted' as const, model: 'DeepSeek-V3', region: 'cn', status: 'active' as const, tokens: 600000, cost: 60 },
  { id: 'p7', name: 'Mistral', tier: 'connectable' as const, model: '—', region: 'global', status: 'offline' as const, tokens: 0, cost: 0 },
  { id: 'p8', name: 'Ollama', tier: 'connectable' as const, model: '—', region: 'global', status: 'offline' as const, tokens: 0, cost: 0 },
];

const ROUTES = [
  { level: 'P0', label: 'P0 推理', primary: 'Sonnet-4', f1: 'GPT-4o', f2: 'Opus-4', cross: true, primaryTone: 'brand' as const },
  { level: 'P1', label: 'P1 摘要', primary: 'Sonnet-4', f1: 'Qwen2.5-72B', f2: '—', cross: true, primaryTone: 'brand' as const },
  { level: 'P2', label: 'P2 检索', primary: 'Qwen2.5-72B', f1: '—', f2: '—', cross: false, primaryTone: 'info' as const },
  { level: 'P3', label: 'P3 离线', primary: 'Qwen2.5-72B', f1: '—', f2: '—', cross: false, primaryTone: 'info' as const },
  { level: 'audit', label: 'Audit', primary: '审计专用通道', f1: '—', f2: '—', cross: false, primaryTone: 'neutral' as const },
];

const STATS = [
  { label: '本月 Token', value: '12.4M', tone: 'brand' as const },
  { label: '月成本', value: '$1.24k', sub: '/ $5k (24%)', tone: 'success' as const },
  { label: 'P95', value: '680ms', tone: 'info' as const },
  { label: '成功率', value: '99.4%', tone: 'success' as const },
];

export default function Models() {
  const [activeId, setActiveId] = useState('p1');
  const active = PROVIDERS.find((p) => p.id === activeId);

  const groups: { tier: ProviderTier; items: typeof PROVIDERS }[] = [
    { tier: 'official', items: PROVIDERS.filter((p) => p.tier === 'official') },
    { tier: 'self_hosted', items: PROVIDERS.filter((p) => p.tier === 'self_hosted') },
    { tier: 'connectable', items: PROVIDERS.filter((p) => p.tier === 'connectable') },
  ];

  return (
    <div className="flex h-full">
      {/* 左侧 Provider 列表 */}
      <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)]">
          <div className="text-xs font-semibold">Provider (8)</div>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.tier} className="p-2">
            <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              {TIER_LABEL[g.tier]} · {TIER_DESC[g.tier]}
            </div>
            {g.items.map((p) => {
              const Icon = TIER_ICON[p.tier];
              const isActive = p.id === activeId;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md p-2.5 text-left transition-all mb-1',
                    isActive ? 'card-active' : 'hover:bg-[var(--bg-elevated)] border border-transparent',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{p.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate font-mono">{p.model}</div>
                  </div>
                  {p.status === 'active' ? (
                    <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                  ) : p.status === 'standby' ? (
                    <span className="h-2 w-2 rounded-full bg-[var(--warning)]" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* 中间 */}
      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="page-header__title">模型 · Provider + 5 等级路由</h1>
              <p className="page-header__sub">
                8 家 Provider · 24 模型 · 失败自动切换 · 出境合规
              </p>
            </div>
            <div className="page-header__actions">
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />自动映射已启用</Badge>
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
                  <th className="text-left px-4 py-2 font-semibold">状态</th>
                </tr>
              </thead>
              <tbody>
                {ROUTES.map((r) => (
                  <tr key={r.level} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                    <td className="px-4 py-2.5">
                      <Badge tone={r.level === 'P0' ? 'error' : r.level === 'P1' ? 'warn' : r.level === 'audit' ? 'neutral' : 'info'}>{r.level}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.primary}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{r.f1}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{r.f2}</td>
                    <td className="px-4 py-2.5">
                      {r.cross ? <Badge tone="warn"><Globe2 className="mr-1 inline h-3 w-3" />出境</Badge> : <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />境内</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />健康</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 配置编辑器 */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs
            value="basic"
            onChange={() => {}}
            items={[
              { key: 'basic', label: '基础' },
              { key: 'apikey', label: 'API Key' },
              { key: 'mapping', label: '模型映射' },
              { key: 'advanced', label: '高级' },
            ]}
          />
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-[var(--text-muted)]" />
                Provider 配置 · {active?.name}
              </div>
              <Button size="sm">保存</Button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <Field label="名称" value={active?.name ?? ''} />
              <Field label="Base URL" value={active?.tier === 'official' ? 'https://api.anthropic.com' : active?.tier === 'self_hosted' ? 'http://qwen.internal:8080' : '—'} />
              <Field label="区域" value={<Badge tone={active?.region === 'cn' ? 'success' : 'info'}>{active?.region}</Badge>} />
              <Field label="模型" value={
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="brand">{active?.model}</Badge>
                </div>
              } />
              <Field label="API Key" value={
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-[var(--success)]" />
                  <span className="text-[var(--success)]">已配置 · 下次轮转 18d</span>
                </div>
              } />
              <Field label="超时" value="30s" />
              <Field label="重试策略" value="指数退避 · 最多 3 次" />
              <Field label="缓存 TTL" value="5 min · 命中率 32%" />
            </div>
          </div>
        </div>
      </section>

      {/* 右侧：用量 + 合规 + 排行 */}
      <aside className="w-[300px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />本月统计
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STATS.map((s) => (
              <div key={s.label} className={cn('kpi-card !p-3', `kpi-card--${s.tone}`)}>
                <div className="kpi-card__label !text-[10px]">{s.label}</div>
                <div className="text-base font-mono font-bold">{s.value}</div>
                {s.sub && <div className="text-[10px] text-[var(--text-muted)]">{s.sub}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-[var(--success)]" />本月排行
          </div>
          <div className="space-y-1.5 text-xs">
            {PROVIDERS.filter((p) => p.tokens > 0).sort((a, b) => b.tokens - a.tokens).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md bg-[var(--bg-elevated)] px-2 py-1.5">
                <span className="font-semibold">{p.name}</span>
                <span className="font-mono text-[var(--text-muted)]">{formatNumber(p.tokens)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />合规
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>数据出境</span><Badge tone="success">已配置</Badge></div>
            <div className="flex justify-between"><span>Key 轮转</span><Badge tone="success">30d 自动</Badge></div>
            <div className="flex justify-between"><span>字段权限</span><Badge tone="success">白名单</Badge></div>
            <div className="flex justify-between"><span>失败切换</span><Badge tone="success">已启用</Badge></div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
      <div className="text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-xs">{value}</div>
    </div>
  );
}