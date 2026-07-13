/**
 * P8 技能 · Skill/MCP/Tool
 * 1:1 对齐 docs/01-product/mockups/p8-skills.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs, Input } from '@de/web-ui';
import {
  Wrench, Download, ShieldAlert, ShieldCheck, Settings, Plus, Search,
  AlertTriangle, CheckCircle2, Box, Star, Globe,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Skill, SkillKind } from '@de/web-types';

const KIND_META: Record<SkillKind, { label: string; tone: 'info' | 'success' | 'warn'; icon: any; exec: string }> = {
  skill: { label: 'Skill', tone: 'info', icon: Wrench, exec: 'gVisor 沙箱' },
  mcp: { label: 'MCP', tone: 'success', icon: Globe, exec: 'HTTP/JSON 外部协议' },
  tool: { label: 'Tool', tone: 'warn', icon: Box, exec: 'REST/RPC 内部 API' },
};

const INSTALLED_LIST = [
  { id: 's1', kind: 'skill' as const, name: 'redis-cli', desc: 'Redis 命令执行', version: '1.4.2', rating: 4.9, installs: 1200, risk: 'mid' as const, calls: '2.3k/日', cache: true },
  { id: 's2', kind: 'skill' as const, name: 'kubectl', desc: 'K8s 资源操作', version: '1.4.0', rating: 4.8, installs: 980, risk: 'high' as const, calls: '1.8k/日', cache: true },
  { id: 's3', kind: 'skill' as const, name: 'loki-query', desc: 'Loki 日志检索', version: '1.2.1', rating: 4.6, installs: 880, risk: 'low' as const, calls: '4.5k/日', cache: true },
  { id: 's4', kind: 'skill' as const, name: 'es-query', desc: 'OpenSearch 查询', version: '1.0.5', rating: 4.5, installs: 720, risk: 'low' as const, calls: '1.2k/日', cache: true },
  { id: 's5', kind: 'mcp' as const, name: 'prometheus-mcp', desc: 'Prometheus MCP', version: '1.1.0', rating: 4.7, installs: 940, risk: 'low' as const, calls: '5.6k/日', cache: false },
  { id: 's6', kind: 'mcp' as const, name: 'kafka-mcp', desc: 'Kafka 消息 MCP', version: '1.0.0', rating: 4.5, installs: 480, risk: 'low' as const, calls: '2.1k/日', cache: false },
  { id: 's7', kind: 'tool' as const, name: 'cmdb-tool', desc: 'CMDB 资产查询', version: '1.2.0', rating: 4.6, installs: 760, risk: 'mid' as const, calls: '3.4k/日', cache: true },
  { id: 's8', kind: 'tool' as const, name: 'jira-tool', desc: 'Jira 工单管理', version: '1.3.5', rating: 4.5, installs: 690, risk: 'mid' as const, calls: '1.1k/日', cache: true },
];

const STORE_LIST = [
  { id: 'st1', kind: 'skill' as const, name: 'mysql-cli', desc: 'MySQL 命令执行', version: '1.0.0', rating: 4.7, installs: 320, price: '免费', risk: 'mid' as const },
  { id: 'st2', kind: 'skill' as const, name: 'ansible-runner', desc: 'Ansible Playbook', version: '1.0.0', rating: 4.6, installs: 280, price: '免费', risk: 'high' as const },
  { id: 'st3', kind: 'mcp' as const, name: 'gitlab-mcp', desc: 'GitLab 集成', version: '1.0.0', rating: 4.4, installs: 180, price: '免费', risk: 'low' as const },
  { id: 'st4', kind: 'tool' as const, name: 'slack-tool', desc: 'Slack 消息推送', version: '1.0.0', rating: 4.5, installs: 240, price: '$5/月', risk: 'low' as const },
];

export default function Skills() {
  const [tab, setTab] = useState<'installed' | 'store'>('installed');
  const [filter, setFilter] = useState<SkillKind | 'all'>('all');
  const [activeId, setActiveId] = useState<string | null>('s1');

  const list = tab === 'installed' ? INSTALLED_LIST : STORE_LIST;
  const filtered = filter === 'all' ? list : list.filter((s) => s.kind === filter);
  const active = list.find((s) => s.id === activeId);
  const counts = {
    skill: list.filter((s) => s.kind === 'skill').length,
    mcp: list.filter((s) => s.kind === 'mcp').length,
    tool: list.filter((s) => s.kind === 'tool').length,
  };

  return (
    <div className="flex h-full">
      {/* 左侧分类 */}
      <aside className="w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3">分类</div>
          <FilterBtn label="全部" count={list.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterBtn label="Skill" count={counts.skill} tone="info" active={filter === 'skill'} onClick={() => setFilter('skill')} />
          <FilterBtn label="MCP" count={counts.mcp} tone="success" active={filter === 'mcp'} onClick={() => setFilter('mcp')} />
          <FilterBtn label="Tool" count={counts.tool} tone="warn" active={filter === 'tool'} onClick={() => setFilter('tool')} />
        </div>
        <div className="p-4 space-y-2">
          <div className="rounded-md border border-[var(--brand)]/30 bg-[var(--brand-light)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              gVisor 沙箱隔离
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">等保 3 · syscall 拦截</div>
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
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="page-header__title">技能 · Skill / MCP / Tool</h1>
              <p className="page-header__sub">
                12 Skill · 8 MCP · 22 Tool · 商店 62 个可安装
              </p>
            </div>
            <div className="page-header__actions">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <Input placeholder="搜索技能..." className="h-9 pl-9 w-48" />
              </div>
              <Button size="sm"><Plus className="h-3.5 w-3.5" />安装</Button>
            </div>
          </div>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'installed', label: <>已安装 <Badge tone="brand" className="ml-1">24</Badge></> },
              { key: 'store', label: <>商店 <Badge tone="neutral" className="ml-1">62</Badge></> },
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((s) => {
              const meta = KIND_META[s.kind];
              const Icon = meta.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    'tile-brandable rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-left transition-all',
                    activeId === s.id && 'card-active',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)] shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{s.name}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{s.desc}</div>
                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        <span className="text-[var(--text-muted)] font-mono">v{s.version}</span>
                        <span className="flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{s.rating}</span>
                        {s.risk === 'high' ? <Badge tone="error" className="text-[9px]"><ShieldAlert className="mr-0.5 inline h-2.5 w-2.5" />高</Badge>
                          : s.risk === 'mid' ? <Badge tone="warn" className="text-[9px]">中</Badge>
                          : <Badge tone="success" className="text-[9px]">低</Badge>}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="flex items-center gap-1"><Download className="h-3 w-3" />{s.installs.toLocaleString()}</span>
                        {'calls' in s && <span className="font-mono">{s.calls}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 右侧详情 */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto p-4">
        {active && (() => {
          const meta = KIND_META[active.kind];
          const Icon = meta.icon;
          return (
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{active.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">v{active.version}</span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{active.desc}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-xs font-semibold mb-3">属性</div>
                <div className="space-y-2 text-xs">
                  <Row label="风险等级" value={
                    active.risk === 'high' ? <Badge tone="error"><ShieldAlert className="mr-1 inline h-3 w-3" />高</Badge>
                      : active.risk === 'mid' ? <Badge tone="warn">中</Badge>
                      : <Badge tone="success">低</Badge>
                  } />
                  <Row label="执行方式" value={
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-[var(--success)]" />{meta.exec}</span>
                  } />
                  <Row label="缓存" value={
                    'cache' in active && active.cache ? <Badge tone="success">支持</Badge> : <Badge tone="neutral">不支持</Badge>
                  } />
                  <Row label="安装数" value={<span className="font-mono">{active.installs.toLocaleString()}</span>} />
                  <Row label="平均成本" value={<span className="font-mono">$0.06/次</span>} />
                  {'calls' in active && <Row label="今日调用" value={<span className="font-mono">{(active as any).calls}</span>} />}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-bg)] p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--success)]">
                  <ShieldCheck className="h-3.5 w-3.5" />gVisor 沙箱保护
                </div>
                <div className="mt-1 text-[var(--text-muted)]">所有 syscall 拦截 · 网络/文件系统隔离</div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1">
                  <Settings className="h-3.5 w-3.5" />配置
                </Button>
                {tab === 'installed' ? (
                  <Button size="sm" variant="danger" className="flex-1">卸载</Button>
                ) : (
                  <Button size="sm" className="flex-1"><Download className="h-3.5 w-3.5" />安装</Button>
                )}
              </div>
            </div>
          );
        })()}
      </aside>
    </div>
  );
}

function FilterBtn({ label, count, tone = 'neutral', active, onClick }: { label: string; count: number; tone?: 'neutral' | 'info' | 'success' | 'warn'; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs mb-1',
        active ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold' : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
      )}
    >
      <span>{label}</span>
      <Badge tone={tone} className="font-mono">{count}</Badge>
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}