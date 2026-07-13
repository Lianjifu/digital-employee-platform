/**
 * P8 技能（企业级优化版）
 * Todo 1-10:
 *  1. 4 Tab（已安装/商店/自定义/沙箱）
 *  2. 执行 trace + 输入输出样例
 *  3. 风险等级可视化（图标+色）
 *  4. 版本历史 + changelog
 *  5. 性能监控（24h 调用/错误率/P95）
 *  6. 沙箱状态显示（gVisor runsc）
 *  7. 测试运行器（在线调用 + 模拟输入）
 *  8. 依赖关系图
 *  9. 权限矩阵（按角色）
 * 10. 批量安装 + 升级
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs, Input } from '@de/web-ui';
import {
  Wrench, Download, ShieldAlert, ShieldCheck, Settings, Plus, Search,
  AlertTriangle, CheckCircle2, Box, Star, Globe, Activity, History,
  Play, RefreshCw, Network, Lock, Cpu, Container, Eye, Terminal,
  Sparkles, Layers, ChevronRight, Upload,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Skill } from '@de/web-types';

const KIND_META: Record<string, { label: string; tone: 'info' | 'success' | 'warn'; icon: any; exec: string }> = {
  skill: { label: 'Skill', tone: 'info', icon: Wrench, exec: 'gVisor 沙箱' },
  mcp: { label: 'MCP', tone: 'success', icon: Globe, exec: 'HTTP/JSON 外部协议' },
  tool: { label: 'Tool', tone: 'warn', icon: Box, exec: 'REST/RPC 内部 API' },
};

const INSTALLED_LIST = [
  { id: 's1', kind: 'skill' as const, name: 'redis-cli', version: '1.4.2', description: 'Redis 命令执行', rating: 4.9, installCount: 1200, riskLevel: 'mid' as const, calls: '2.3k/日', cacheable: true, perf: { calls24h: 2300, errorRate: 0.4, p95Ms: 80 } },
  { id: 's2', kind: 'skill' as const, name: 'kubectl', version: '1.4.0', description: 'K8s 资源操作', rating: 4.8, installCount: 980, riskLevel: 'high' as const, calls: '1.8k/日', cacheable: true, perf: { calls24h: 1820, errorRate: 1.2, p95Ms: 220 } },
  { id: 's3', kind: 'skill' as const, name: 'loki-query', version: '1.2.1', description: 'Loki 日志检索', rating: 4.6, installCount: 880, riskLevel: 'low' as const, calls: '4.5k/日', cacheable: true, perf: { calls24h: 4500, errorRate: 0.1, p95Ms: 45 } },
  { id: 's4', kind: 'skill' as const, name: 'es-query', version: '1.0.5', description: 'OpenSearch 查询', rating: 4.5, installCount: 720, riskLevel: 'low' as const, calls: '1.2k/日', cacheable: true, perf: { calls24h: 1200, errorRate: 0.2, p95Ms: 60 } },
  { id: 's5', kind: 'mcp' as const, name: 'prometheus-mcp', version: '1.1.0', description: 'Prometheus MCP', rating: 4.7, installCount: 940, riskLevel: 'low' as const, calls: '5.6k/日', cacheable: false, perf: { calls24h: 5600, errorRate: 0.05, p95Ms: 30 } },
  { id: 's6', kind: 'mcp' as const, name: 'kafka-mcp', version: '1.0.0', description: 'Kafka 消息 MCP', rating: 4.5, installCount: 480, riskLevel: 'low' as const, calls: '2.1k/日', cacheable: false, perf: { calls24h: 2100, errorRate: 0.1, p95Ms: 50 } },
  { id: 's7', kind: 'tool' as const, name: 'cmdb-tool', version: '1.2.0', description: 'CMDB 资产查询', rating: 4.6, installCount: 760, riskLevel: 'mid' as const, calls: '3.4k/日', cacheable: true, perf: { calls24h: 3400, errorRate: 0.3, p95Ms: 70 } },
  { id: 's8', kind: 'tool' as const, name: 'jira-tool', version: '1.3.5', description: 'Jira 工单管理', rating: 4.5, installCount: 690, riskLevel: 'mid' as const, calls: '1.1k/日', cacheable: true, perf: { calls24h: 1100, errorRate: 0.6, p95Ms: 150 } },
];

const CUSTOM_TAB_LIST = [
  { id: 'cu1', kind: 'skill' as const, name: 'my-redis-tool', version: '0.3.0', description: '自定义 Redis 工具（团队）', rating: 4.5, installCount: 12, riskLevel: 'mid' as const, calls: '180/日', cacheable: true },
  { id: 'cu2', kind: 'tool' as const, name: 'jenkins-deploy', version: '0.1.0', description: 'Jenkins 部署触发', rating: 4.2, installCount: 5, riskLevel: 'high' as const, calls: '45/日', cacheable: false },
];

// Skill 类型简化（mock 用）
type SkillRow = {
  id: string;
  kind: 'skill' | 'mcp' | 'tool';
  name: string;
  version: string;
  description: string;
  rating: number;
  installCount: number;
  riskLevel: 'low' | 'mid' | 'high';
  calls: string;
  cacheable: boolean;
  perf: { calls24h: number; errorRate: number; p95Ms: number };
};

function asRow(s: any): SkillRow { return s; }

const DEP_GRAPH = [
  { id: 's1', name: 'redis-cli', deps: [] },
  { id: 's2', name: 'kubectl', deps: [] },
  { id: 's3', name: 'loki-query', deps: [] },
  { id: 's5', name: 'prometheus-mcp', deps: ['s3'] },
  { id: 's7', name: 'cmdb-tool', deps: [] },
  { id: 'a1', name: '故障自愈', deps: ['s1', 's2', 's5', 's7'] },
  { id: 'a3', name: '变更辅助', deps: ['s2', 's7'] },
];

export default function Skills() {
  const [tab, setTab] = useState<'installed' | 'store' | 'custom' | 'sandbox'>('installed');
  const [filter, setFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<string | null>('s1');
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const list = tab === 'installed' ? INSTALLED_LIST : tab === 'custom' ? CUSTOM_TAB_LIST : INSTALLED_LIST;
  const filtered = filter === 'all' ? list : list.filter((s) => s.kind === filter);
  const active = list.find((s) => s.id === activeId);

  const { data: trace } = useApiQuery<any>(['skill', activeId, 'trace'], activeId ? `/api/skills/${activeId}/trace` : '');
  const { data: versions = [] } = useApiQuery<any[]>(['skill', activeId, 'versions'], activeId ? `/api/skills/${activeId}/versions` : '');
  const { data: perms = [] } = useApiQuery<any[]>(['skill-perms'], '/api/skills/perms');

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const riskIcon = (risk: string) => {
    if (risk === 'high') return <ShieldAlert className="h-3 w-3" />;
    if (risk === 'mid') return <AlertTriangle className="h-3 w-3" />;
    return <ShieldCheck className="h-3 w-3" />;
  };

  return (
    <div className="flex h-full">
      {/* Todo 1: 左侧分类 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3">分类</div>
          {(['all', 'skill', 'mcp', 'tool'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs mb-1',
                filter === k ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold' : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              )}
            >
              <span>{k === 'all' ? '全部' : k === 'skill' ? 'Skill' : k === 'mcp' ? 'MCP' : 'Tool'}</span>
              <Badge tone={k === 'skill' ? 'info' : k === 'mcp' ? 'success' : k === 'tool' ? 'warn' : 'neutral'} className="text-[10px] font-mono">
                {k === 'all' ? list.length : list.filter((s) => s.kind === k).length}
              </Badge>
            </button>
          ))}
        </div>
        {/* Todo 6: 沙箱状态 */}
        <div className="p-3 space-y-2">
          <div className="rounded-md border border-[var(--success)]/30 bg-[var(--success-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--success)]">
              <Container className="h-3.5 w-3.5" />
              gVisor 沙箱
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">8 沙箱运行中 · 0 异常</div>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="text-xs font-semibold">本月调用</div>
            <div className="mt-0.5 text-lg font-mono font-bold text-[var(--brand)]">8.2k</div>
            <div className="text-[10px] text-[var(--text-muted)]">次/日 · $0.06/次</div>
          </div>
        </div>
      </aside>

      {/* 中间 */}
      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[var(--brand)]" />
                技能 · Skill / MCP / Tool
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                12 Skill · 8 MCP · 22 Tool · 商店 62 个可安装
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Todo 10: 批量操作 */}
              {selected.size > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] text-xs">
                  <span>已选 {selected.size}</span>
                  <Button size="sm" variant="secondary">
                    <Download className="h-3 w-3" />批量安装
                  </Button>
                  <Button size="sm" variant="secondary">
                    <RefreshCw className="h-3 w-3" />批量升级
                  </Button>
                </div>
              )}
              <Button variant="secondary" size="sm">
                <Upload className="h-3.5 w-3.5" />导入
              </Button>
              <Button size="sm"><Plus className="h-3.5 w-3.5" />新建技能</Button>
            </div>
          </div>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'installed', label: <>已安装 <Badge tone="brand" className="ml-1">8</Badge></> },
              { key: 'store', label: <>商店 <Badge tone="neutral" className="ml-1">62</Badge></> },
              { key: 'custom', label: <>自定义 <Badge tone="purple" className="ml-1">2</Badge></> },
              { key: 'sandbox', label: <>沙箱 <Badge tone="info" className="ml-1">8</Badge></> },
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((s) => {
              const meta = KIND_META[s.kind];
              const Icon = meta.icon;
              const isActive = s.id === activeId;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    'tile-brandable relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 cursor-pointer',
                    isActive && 'card-active',
                  )}
                >
                  {/* 多选 + 顶部 */}
                  <div className="flex items-start gap-3 mb-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                      className="accent-[var(--brand)] mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className={cn('grid h-10 w-10 place-items-center rounded-md shrink-0',
                      s.kind === 'skill' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                      s.kind === 'mcp' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                      'bg-[var(--warning-bg)] text-[var(--warning)]',
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{s.name}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{s.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {/* Todo 3: 风险等级可视化 */}
                    {s.riskLevel === 'high' ? (
                      <Badge tone="error">
                        <ShieldAlert className="mr-0.5 inline h-2.5 w-2.5" />高风险
                      </Badge>
                    ) : s.riskLevel === 'mid' ? (
                      <Badge tone="warn">
                        <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />中风险
                      </Badge>
                    ) : (
                      <Badge tone="success">
                        <ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" />低风险
                      </Badge>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">v{s.version}</span>
                    <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-current" />{s.rating}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-[var(--border)] text-[10px]">
                    <Mini label="调用" value={s.calls ?? '—'} />
                    <Mini label="安装" value={s.installCount?.toLocaleString() ?? '—'} />
                    <Mini label="缓存" value={s.cacheable ? <span className="text-[var(--success)]">支持</span> : <span className="text-[var(--text-muted)]">无</span>} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 右侧详情 */}
      <aside className="w-[360px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto p-4 space-y-3">
        {active ? (
          <>
            {/* Header */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-start gap-3">
                <div className={cn('grid h-10 w-10 place-items-center rounded-md shrink-0',
                  active.kind === 'skill' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                  active.kind === 'mcp' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                  'bg-[var(--warning-bg)] text-[var(--warning)]',
                )}>
                  {(() => {
                    const Icon = KIND_META[active.kind].icon;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{active.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge tone={KIND_META[active.kind].tone}>{KIND_META[active.kind].label}</Badge>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">v{active.version}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Todo 6: 沙箱状态显示 */}
            <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-bg)] p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--success)]">
                <Container className="h-3.5 w-3.5" />gVisor 沙箱保护
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)] font-mono">
                runsc · gvisor 20240603 · 网络隔离 · sys 拦截
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                所有 syscall 拦截 · 网络命名空间隔离 · 文件只读挂载
              </div>
            </div>

            {/* Todo 5: 性能监控 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />24h 性能
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="调用" value={(active as any).perf?.calls24h ?? 2300} />
                <Stat label="错误率" value={`${(active as any).perf?.errorRate ?? 0.4}%`} tone={(active as any).perf?.errorRate > 1 ? 'error' : 'success'} />
                <Stat label="P95" value={`${(active as any).perf?.p95Ms ?? 80}ms`} />
              </div>
              {/* 错误率进度条 */}
              <div className="mt-3">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[var(--text-muted)]">缓存命中</span>
                  <span className="text-[var(--success)] font-mono">32%</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[var(--success)] to-[var(--brand)]" style={{ width: '32%' }} />
                </div>
              </div>
            </div>

            {/* Todo 7: 测试运行器 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />测试运行器
                </div>
                <Button size="sm" variant="secondary" onClick={() => setTestRunnerOpen(!testRunnerOpen)}>
                  {testRunnerOpen ? '收起' : '打开'}
                </Button>
              </div>
              {testRunnerOpen && (
                <div className="space-y-2">
                  <Input
                    placeholder={`${active.name} 命令...`}
                    className="font-mono text-xs h-8"
                    defaultValue={active.kind === 'skill' ? 'CONFIG SET maxmemory 16GB' : 'query: rate(redis_oom)'}
                  />
                  <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2 font-mono text-[10px]">
                    <span className="text-[var(--text-muted)]">→ 输出:</span>
                    <span className="text-[var(--success)]"> +OK (45ms)</span>
                  </div>
                  <Button size="sm" className="w-full">
                    <Play className="h-3 w-3" />执行（沙箱隔离）
                  </Button>
                </div>
              )}
            </div>

            {/* Todo 2: 执行 trace + 输入输出样例 */}
            {trace && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />最近执行 trace
                </div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono text-[10px]">
                  {trace.trace?.map((line: any, i: number) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[var(--text-muted)] shrink-0">{line.ts}</span>
                      <span className={cn(
                        line.level === 'info' ? 'text-[var(--info)]' :
                        line.level === 'debug' ? 'text-[var(--text-muted)]' :
                        'text-[var(--text-secondary)]',
                      )}>
                        [{line.level}] {line.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-2">测试用例</div>
                  <div className="space-y-1.5">
                    {trace.testCases?.map((tc: any, i: number) => (
                      <div key={i} className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2 text-[10px]">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-semibold">{tc.name}</span>
                          <Badge tone={tc.status === 'success' ? 'success' : 'error'} className="text-[9px]">
                            {tc.status === 'success' ? <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" /> : <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
                            {tc.durationMs}ms
                          </Badge>
                        </div>
                        <div className="font-mono text-[var(--text-muted)]">→ {tc.input}</div>
                        <div className={cn('font-mono', tc.status === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
                          ← {tc.output}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Todo 4: 版本历史 */}
            {versions.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />版本历史
                </div>
                <div className="space-y-1.5">
                  {versions.slice(0, 3).map((v: any) => (
                    <div key={v.version} className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs">v{v.version}</span>
                          <Badge tone={v.type === 'major' ? 'error' : v.type === 'minor' ? 'info' : 'neutral'} className="text-[9px]">{v.type}</Badge>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">{v.date}</span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-[10px] text-[var(--text-muted)]">
                        {v.notes?.map((n: string, i: number) => (
                          <div key={i} className={cn(
                            n.startsWith('+') ? 'text-[var(--success)]' : 'text-[var(--danger)]',
                          )}>{n}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Todo 9: 权限矩阵 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />权限矩阵
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="text-left py-1">角色</th>
                    <th className="px-2">调用</th>
                    <th className="px-2">配置</th>
                  </tr>
                </thead>
                <tbody>
                  {perms.map((p: any) => (
                    <tr key={p.role} className="border-t border-[var(--border)]">
                      <td className="py-1 font-semibold">{p.role}</td>
                      <td className="px-2 text-center">
                        {p.canCall ? <CheckCircle2 className="inline h-3 w-3 text-[var(--success)]" /> : <X className="inline h-3 w-3 text-[var(--text-muted)]" />}
                      </td>
                      <td className="px-2 text-center">
                        {p.canConfig ? <CheckCircle2 className="inline h-3 w-3 text-[var(--success)]" /> : <X className="inline h-3 w-3 text-[var(--text-muted)]" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1">
                <Settings className="h-3.5 w-3.5" />配置
              </Button>
              <Button size="sm" variant="danger" className="flex-1">卸载</Button>
            </div>
          </>
        ) : null}

        {/* Todo 8: 依赖关系图（仅 sandbox tab 显示） */}
        {tab === 'sandbox' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />依赖关系图
            </div>
            <div className="space-y-1.5 text-[11px]">
              {DEP_GRAPH.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <Badge tone={d.id.startsWith('a') ? 'brand' : 'info'} className="text-[10px] shrink-0">
                    {d.id.startsWith('a') ? 'Agent' : 'Skill'}
                  </Badge>
                  <span className="font-mono text-[11px]">{d.name}</span>
                  {d.deps.length > 0 && (
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                      ← {d.deps.length} dep{d.deps.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[9px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className="text-[11px] font-mono font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: 'success' | 'error' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-center">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-base font-mono font-bold', color)}>{value}</div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}