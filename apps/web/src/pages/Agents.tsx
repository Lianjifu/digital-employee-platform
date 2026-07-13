/**
 * P5 智能体（企业级优化版）
 * Todo 1-10:
 *  1. 顶部筛选（类别/状态/评分）
 *  2. Agent 卡片：7 天调用趋势 sparkline
 *  3. 详情面板：版本历史时间线
 *  4. 配置抽屉（prompt 模板 + 工具开关）
 *  5. 商店：评分 + 评论 + 安装趋势
 *  6. 对比功能（2 个 Agent 横比）
 *  7. 性能图表（响应时间分布）
 *  8. 调用排行 Top 10
 *  9. Agent 协作推荐
 * 10. 标签 + 分类管理
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import {
  Star, Download, Settings, Bot, Zap, ShieldCheck, Plus, Filter,
  CheckCircle2, BarChart3, TrendingUp, GitCompare, History, Award, Tag as TagIcon,
  X, Sparkles, ChevronRight, MessageSquare, Wrench, AlertTriangle,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, BarChart, Bar, CartesianGrid } from 'recharts';
import { cn } from '@de/web-utils';
import type { Agent } from '@de/web-types';

interface AgentVersion {
  version: string; date: string; changelog: string[]; type: 'major' | 'minor' | 'patch';
}

const CATEGORIES = ['全部', 'AIOps', 'SecOps'] as const;
const STATUSES = ['全部', '已安装', '可安装'] as const;
const RATING_FILTERS = ['全部', '4.5+', '4.0+', '3.5+'] as const;

export default function Agents() {
  const [tab, setTab] = useState<'installed' | 'store'>('installed');
  const [cat, setCat] = useState<typeof CATEGORIES[number]>('全部');
  const [status, setStatus] = useState<typeof STATUSES[number]>('全部');
  const [rating, setRating] = useState<typeof RATING_FILTERS[number]>('全部');
  const [activeId, setActiveId] = useState<string | null>('a1');
  const [showVersions, setShowVersions] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const { data: agents } = useApiQuery<Agent[]>(['agents'], '/api/agents');
  const { data: versions = [] } = useApiQuery<AgentVersion[]>(['agent', activeId, 'versions'], `/api/agents/${activeId}/versions`);
  const { data: trend = [] } = useApiQuery<number[]>(['agent', activeId, 'trend'], `/api/agents/${activeId}/trend`);
  const { data: rank = [] } = useApiQuery<{ rank: number; id: string; name: string; calls: number; change: number }[]>(['agent', 'rank'], '/api/agents/rank');
  const { data: compareTrend = [] } = useApiQuery<number[]>(['agent', compareId, 'trend'], `/api/agents/${compareId}/trend`);

  // 应用筛选
  const filtered = useMemo(() => {
    return (agents ?? []).filter((a) => {
      if (tab === 'installed' && a.status !== 'installed') return false;
      if (tab === 'store' && a.status === 'installed') return false;
      if (cat !== '全部' && a.category !== cat) return false;
      if (status === '已安装' && a.status !== 'installed') return false;
      if (status === '可安装' && a.status === 'installed') return false;
      if (rating === '4.5+' && a.rating < 4.5) return false;
      if (rating === '4.0+' && a.rating < 4.0) return false;
      if (rating === '3.5+' && a.rating < 3.5) return false;
      return true;
    });
  }, [agents, tab, cat, status, rating]);

  const active = agents?.find((a) => a.id === activeId);
  const compare = agents?.find((a) => a.id === compareId);

  // 7 天趋势数据
  const trendData = trend.map((v, i) => ({ day: `D${i + 1}`, calls: v }));
  const compareTrendData = compareTrend.map((v, i) => ({ day: `D${i + 1}`, calls: v }));

  // 所有 tag 集合
  const allTags = useMemo(() => {
    const s = new Set<string>();
    (agents ?? []).forEach((a) => a.tools.forEach((t) => s.add(t)));
    return Array.from(s).slice(0, 8);
  }, [agents]);

  return (
    <div className="flex h-full">
      <section className="flex-1 flex flex-col overflow-hidden">
        {/* Header + 筛选 */}
        <div className="border-b border-[var(--border)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Bot className="h-5 w-5 text-[var(--brand)]" />
                智能体市场
                <Badge tone="brand" className="text-[10px]">{agents?.filter((a) => a.status === 'installed').length ?? 0} 已启用</Badge>
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                8 个领域 · 24 商用 · 5 社区 · 2 企业包
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCompare(!showCompare)}>
                <GitCompare className="h-3.5 w-3.5" />{showCompare ? '退出对比' : '对比'}
              </Button>
              <Button variant="secondary" size="sm">
                <BarChart3 className="h-3.5 w-3.5" />用量排行
              </Button>
              <Button size="sm"><Plus className="h-3.5 w-3.5" />上传 Agent</Button>
            </div>
          </div>

          {/* Todo 1: 筛选（4 维） */}
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs
              value={tab}
              onChange={(k) => setTab(k as any)}
              items={[
                { key: 'installed', label: <>已安装 <Badge tone="brand" className="ml-1">8</Badge></> },
                { key: 'store', label: <>商店 <Badge tone="neutral" className="ml-1">62</Badge></> },
              ]}
            />
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-muted)]">分类</span>
              {CATEGORIES.map((c) => (
                <FilterChip key={c} label={c} active={cat === c} onClick={() => setCat(c)} />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-muted)]">评分</span>
              {RATING_FILTERS.map((r) => (
                <FilterChip key={r} label={r} active={rating === r} onClick={() => setRating(r)} />
              ))}
            </div>
          </div>

          {/* Todo 10: 标签筛选 */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1"><TagIcon className="h-3 w-3" />标签</span>
              <FilterChip label="全部" active={!tagFilter} onClick={() => setTagFilter(null)} />
              {allTags.map((t) => (
                <FilterChip key={t} label={t} active={tagFilter === t} onClick={() => setTagFilter(t)} />
              ))}
            </div>
          )}
        </div>

        {/* Agent 网格 + Todo 2: 7 天调用趋势 sparkline */}
        <div className="flex-1 overflow-y-auto p-5">
          <SectionTitle>AIOps · 运维智能体</SectionTitle>
          <div className="mb-5 grid grid-cols-4 gap-4">
            {filtered.filter((a) => a.category === 'AIOps').map((a) => (
              <AgentCard
                key={a.id}
                a={a}
                active={a.id === activeId}
                inCompare={a.id === compareId}
                compareMode={showCompare}
                trendData={a.id === activeId ? trendData : []}
                onClick={() => setActiveId(a.id)}
                onCompare={() => setCompareId(a.id)}
              />
            ))}
          </div>
          <SectionTitle>SecOps · 安全智能体</SectionTitle>
          <div className="grid grid-cols-4 gap-4">
            {filtered.filter((a) => a.category === 'SecOps').map((a) => (
              <AgentCard
                key={a.id}
                a={a}
                active={a.id === activeId}
                inCompare={a.id === compareId}
                compareMode={showCompare}
                trendData={a.id === activeId ? trendData : []}
                onClick={() => setActiveId(a.id)}
                onCompare={() => setCompareId(a.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 右侧：详情 / 版本历史 / 对比 */}
      <aside className="w-[360px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {active ? (
          <div className="p-4 space-y-3">
            {/* 头部 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white shrink-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold">{active.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={active.category === 'AIOps' ? 'info' : 'warn'}>{active.category}</Badge>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">v{active.version}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{active.description}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border)]">
                <Stat label="评分" value={<span className="text-amber-500 flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" />{active.rating}</span>} />
                <Stat label="安装" value={active.installCount.toLocaleString()} />
                <Stat label="P95" value={`${active.p95Ms}ms`} />
              </div>
            </div>

            {/* Todo 7: 性能图表（响应时间分布柱图） */}
            {trend.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />7 天调用趋势
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    峰值 {Math.max(...trend)} 次
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={70}>
                  <BarChart data={trendData}>
                    <CartesianGrid stroke="#1a2540" strokeDasharray="3 3" />
                    <Bar dataKey="calls" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                    <XAxis dataKey="day" hide />
                    <YAxis hide />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Todo 3: 版本历史时间线 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />版本历史
                </div>
                <button onClick={() => setShowVersions(!showVersions)} className="text-[10px] text-[var(--brand)] hover:underline">
                  {showVersions ? '收起' : '查看全部'}
                </button>
              </div>
              <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                {(showVersions ? versions : versions.slice(0, 2)).map((v) => (
                  <div key={v.version} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs">v{v.version}</span>
                        <Badge tone={v.type === 'major' ? 'error' : v.type === 'minor' ? 'info' : 'neutral'} className="text-[9px]">
                          {v.type}
                        </Badge>
                        {v.version === versions[0]?.version && <Badge tone="success" className="text-[9px]">当前</Badge>}
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">{v.date}</span>
                    </div>
                    <div className="space-y-0.5 text-[11px] text-[var(--text-muted)]">
                      {v.changelog.map((c, i) => (
                        <div key={i} className={cn(
                          'leading-snug',
                          c.startsWith('+') && 'text-[var(--success)]',
                          c.startsWith('-') && 'text-[var(--danger)]',
                        )}>{c}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Todo 4: 配置（prompt 模板 + 工具开关） */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5" />配置（可编辑）
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="text-[var(--text-muted)] mb-1">Prompt 模板</div>
                  <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2 font-mono text-[10px] text-[var(--text-secondary)]">
                    你是一位 SRE 数字员工，负责处理 {active.name} 相关问题。先查 Runbook，再决策...
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] mb-1">工具开关</div>
                  <div className="space-y-1">
                    {active.tools.map((t) => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="accent-[var(--brand)]" />
                        <Wrench className="h-3 w-3 text-[var(--brand)]" />
                        <span className="font-mono">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Field label="P95 阈值" value="800ms" />
                  <Field label="缓存 TTL" value="5 min" />
                  <Field label="重试" value="3 次" />
                  <Field label="温度" value="0.7" />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1">
                <Settings className="h-3.5 w-3.5" />高级配置
              </Button>
              {active.status === 'installed' ? (
                <Button size="sm" variant="danger">停用</Button>
              ) : (
                <Button size="sm"><Download className="h-3.5 w-3.5" />安装</Button>
              )}
            </div>
          </div>
        ) : null}

        {/* Todo 9: Agent 协作推荐 */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />协作推荐
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 hover:border-[var(--brand)] cursor-pointer transition-colors">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Bot className="h-3 w-3 text-[var(--brand)]" />
                <span className="font-semibold">变更辅助</span>
                <span className="text-[10px] text-[var(--text-muted)]">↔ 故障自愈</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">故障恢复后自动触发变更验证</div>
            </div>
          </div>
        </div>

        {/* Todo 8: 调用排行 Top 10 */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-amber-500" />调用排行 Top
          </div>
          <div className="space-y-1">
            {rank.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs hover:bg-[var(--bg-hover)] rounded px-1.5 py-1">
                <span className={cn(
                  'font-mono w-5 text-center text-[10px] font-bold',
                  r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : r.rank === 3 ? 'text-amber-700' : 'text-[var(--text-muted)]',
                )}>#{r.rank}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{r.calls.toLocaleString()}</span>
                <span className={cn('text-[10px] font-mono w-10 text-right', r.change > 0 ? 'text-[var(--success)]' : r.change < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]')}>
                  {r.change > 0 ? '+' : ''}{r.change}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Todo 6: 对比 Drawer */}
      {showCompare && active && compare && (
        <div className="fixed inset-0 z-40" onClick={() => setShowCompare(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute right-0 top-0 h-full w-[640px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-[var(--brand)]" />
                <span className="text-base font-semibold">对比 · {active.name} vs {compare.name}</span>
              </div>
              <button onClick={() => setShowCompare(false)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <CompareCol a={active} trendData={trendData} />
              <CompareCol a={compare} trendData={compareTrendData} />
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-2">7 天调用对比</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={trendData.map((d, i) => ({ day: d.day, a: d.calls, b: compareTrendData[i]?.calls ?? 0 }))}>
                  <defs>
                    <linearGradient id="ca" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a2540" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="a" stroke="#4f46e5" fill="url(#ca)" strokeWidth={2} />
                  <Area type="monotone" dataKey="b" stroke="#8b5cf6" fill="url(#cb)" strokeWidth={2} />
                  <XAxis dataKey="day" hide />
                  <YAxis hide />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 子组件 ============

function AgentCard({ a, active, inCompare, compareMode, trendData, onClick, onCompare }: {
  a: Agent; active: boolean; inCompare?: boolean; compareMode: boolean; trendData: { day: string; calls: number }[];
  onClick: () => void; onCompare?: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={cn(
          'tile-brandable relative w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition-all overflow-hidden',
          active && 'card-active',
          inCompare && 'ring-2 ring-[var(--purple)]',
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-0.5">
            <Star className={cn('h-3.5 w-3.5', a.isStarred ? 'fill-amber-400 text-amber-400' : 'text-[var(--text-muted)]')} />
            <span className="text-[11px] font-mono">{a.rating}</span>
          </div>
        </div>
        <div className="text-sm font-semibold">{a.name}</div>
        <div className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-0.5 h-8">{a.description}</div>

        <div className="flex items-center gap-1.5 text-[10px] mt-2">
          <Badge tone={a.category === 'AIOps' ? 'info' : 'warn'}>{a.category}</Badge>
          <span className="font-mono text-[var(--text-muted)]">v{a.version}</span>
        </div>

        {/* Todo 2: 7 天调用趋势 sparkline */}
        {trendData.length > 0 && (
          <div className="mt-2 h-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id={`sp${a.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="calls" stroke="#4f46e5" strokeWidth={1.2} fill={`url(#sp${a.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-[var(--border)]">
          <Mini label="调用" value={a.installCount >= 1000 ? `${(a.installCount / 1000).toFixed(1)}k` : String(a.installCount)} />
          {a.cacheHitRate !== undefined && <Mini label="缓存" value={`${(a.cacheHitRate * 100).toFixed(0)}%`} />}
          {a.p95Ms !== undefined && <Mini label="P95" value={`${a.p95Ms}ms`} />}
        </div>
      </button>
      {compareMode && (
        <button
          onClick={onCompare}
          className={cn(
            'absolute top-2 right-2 z-10 grid h-6 w-6 place-items-center rounded border',
            inCompare ? 'bg-[var(--purple)] text-white border-[var(--purple)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)]',
          )}
        >
          <GitCompare className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{children}</div>;
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded text-[11px] font-mono',
        active ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)]',
      )}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="text-[9px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className="text-xs font-mono font-bold mt-0.5">{value}</div>
    </div>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className="text-[11px] font-mono">{value}</div>
    </div>
  );
}

function CompareCol({ a, trendData }: { a: Agent; trendData: { day: string; calls: number }[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white">
          <Bot className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{a.name}</div>
          <div className="text-[10px] text-[var(--text-muted)] font-mono">v{a.version}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-xs">
        <CompareRow label="评分" value={`⭐ ${a.rating}`} />
        <CompareRow label="安装" value={a.installCount.toLocaleString()} />
        <CompareRow label="P95" value={`${a.p95Ms ?? 0}ms`} />
        <CompareRow label="缓存命中" value={a.cacheHitRate !== undefined ? `${(a.cacheHitRate * 100).toFixed(0)}%` : '—'} />
        <CompareRow label="7 天总调用" value={trendData.reduce((s, d) => s + d.calls, 0)} />
        <CompareRow label="7 天峰值" value={Math.max(...trendData.map((d) => d.calls), 0)} />
      </div>
    </div>
  );
}

function CompareRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}