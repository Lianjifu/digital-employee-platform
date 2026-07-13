/**
 * P5 智能体
 * 1:1 对齐 docs/01-product/mockups/p5-agents.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import { Star, Download, Settings, Bot, Zap, ShieldCheck, AlertTriangle, Plus, CheckCircle2, BarChart3 } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Agent } from '@de/web-types';

export default function Agents() {
  const [tab, setTab] = useState<'installed' | 'store'>('installed');
  const { data: agents } = useApiQuery<Agent[]>(['agents'], '/api/agents');
  const [activeId, setActiveId] = useState<string | null>('a1');

  const list = (agents ?? []).filter((a) => (tab === 'installed' ? a.status === 'installed' : a.status !== 'installed'));
  const active = agents?.find((a) => a.id === activeId);

  return (
    <div className="flex h-full">
      <section className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="page-header__title">智能体市场</h1>
              <p className="page-header__sub">8 个领域 · 24 商用 · 5 社区 · 2 企业包</p>
            </div>
            <div className="page-header__actions">
              <Button variant="secondary" size="sm">
                <BarChart3 className="h-3.5 w-3.5" />用量排行
              </Button>
              <Button size="sm"><Plus className="h-3.5 w-3.5" />上传 Agent</Button>
            </div>
          </div>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'installed', label: <>已安装 <Badge tone="brand" className="ml-1">8</Badge></> },
              { key: 'store', label: <>商店 <Badge tone="neutral" className="ml-1">62</Badge></> },
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <SectionTitle>AIOps · 运维智能体</SectionTitle>
          <div className="mb-6 grid grid-cols-4 gap-4">
            {list.filter((a) => a.category === 'AIOps').map((a) => (
              <AgentCard key={a.id} a={a} active={a.id === activeId} onClick={() => setActiveId(a.id)} />
            ))}
          </div>
          <SectionTitle>SecOps · 安全智能体</SectionTitle>
          <div className="grid grid-cols-4 gap-4">
            {list.filter((a) => a.category === 'SecOps').map((a) => (
              <AgentCard key={a.id} a={a} active={a.id === activeId} onClick={() => setActiveId(a.id)} />
            ))}
          </div>
        </div>
      </section>

      {/* 右侧详情 */}
      <aside className="w-[360px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto p-5">
        {active ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-semibold">{active.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={active.category === 'AIOps' ? 'info' : 'warn'}>{active.category}</Badge>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">v{active.version}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-[var(--warning)] ml-auto">
                      <Star className="h-3 w-3 fill-current" />{active.rating}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">{active.description}</div>
                </div>
              </div>
            </div>

            {/* 性能指标 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                性能指标
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="调用次数" value={active.installCount.toLocaleString()} />
                {active.cacheHitRate !== undefined && (
                  <Stat label="缓存命中" value={`${(active.cacheHitRate * 100).toFixed(0)}%`} tone="success" />
                )}
                {active.p95Ms !== undefined && (
                  <Stat label="P95 响应" value={`${active.p95Ms}ms`} tone="warn" />
                )}
              </div>
            </div>

            {/* 版本说明 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                版本说明
              </div>
              <div className="space-y-1.5 text-[11px] text-[var(--text-muted)] font-mono">
                <div className="text-[var(--text-secondary)] font-sans font-semibold">v{active.version} · 当前版本</div>
                <div>+ 新增智能重试机制</div>
                <div>+ 支持自定义 prompt 模板</div>
                <div className="text-[var(--success)]">+ 缓存命中率 +8%</div>
                <div className="text-[var(--warning)]">- 修复内存泄漏</div>
              </div>
            </div>

            {/* 工具 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-2 flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                工具
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(active.tools.length ? active.tools : ['—']).map((t) => (
                  <span key={t} className="nav-pill text-[10px]">{t}</span>
                ))}
              </div>
            </div>

            {/* 操作 */}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1">
                <Settings className="h-3.5 w-3.5" />配置
              </Button>
              {active.status === 'installed' ? (
                <Button size="sm" variant="danger" className="flex-1">停用</Button>
              ) : (
                <Button size="sm" className="flex-1"><Download className="h-3.5 w-3.5" />安装</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-xs text-[var(--text-muted)] py-12">
            选择左侧卡片查看详情
          </div>
        )}
      </aside>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{children}</div>;
}

function AgentCard({ a, active, onClick }: { a: Agent; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition-all tile-topbrand overflow-hidden',
        active && 'card-active',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1">
          <Star className={cn('h-3.5 w-3.5', a.isStarred ? 'fill-amber-400 text-amber-400' : 'text-[var(--text-muted)]')} />
          <span className="text-[11px] font-mono">{a.rating}</span>
        </div>
      </div>
      <div className="text-sm font-semibold mb-1">{a.name}</div>
      <div className="text-[11px] text-[var(--text-muted)] line-clamp-2 mb-3 h-8">{a.description}</div>

      <div className="flex items-center gap-2 text-[10px] mb-3">
        <Badge tone={a.category === 'AIOps' ? 'info' : 'warn'}>{a.category}</Badge>
        <span className="text-[var(--text-muted)] font-mono">v{a.version}</span>
      </div>

      {/* 性能条 */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border)]">
        <Mini label="调用" value={a.installCount >= 1000 ? `${(a.installCount / 1000).toFixed(1)}k` : String(a.installCount)} />
        {a.cacheHitRate !== undefined && (
          <Mini label="缓存" value={`${(a.cacheHitRate * 100).toFixed(0)}%`} />
        )}
        {a.p95Ms !== undefined && <Mini label="P95" value={`${a.p95Ms}ms`} />}
      </div>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className="text-[11px] font-mono font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warn' }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className={cn('text-base font-mono font-bold', tone === 'success' ? 'text-[var(--success)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--text)]')}>
        {value}
      </div>
    </div>
  );
}