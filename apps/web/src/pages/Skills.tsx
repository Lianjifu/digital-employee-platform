import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Tabs, Progress } from '@de/web-ui';
import { Wrench, Download, ShieldAlert, ShieldCheck, Settings } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Skill, SkillKind } from '@de/web-types';

const KIND_LABELS: Record<SkillKind, string> = { skill: 'Skill', mcp: 'MCP', tool: 'Tool' };
const KIND_TONE: Record<SkillKind, 'info' | 'success' | 'warn'> = { skill: 'info', mcp: 'success', tool: 'warn' };

export default function Skills() {
  const [tab, setTab] = useState<'installed' | 'store'>('installed');
  const [filter, setFilter] = useState<SkillKind | 'all'>('all');
  const { data: skills } = useApiQuery<Skill[]>(['skills'], '/api/skills');
  const [activeId, setActiveId] = useState<string | null>('s1');

  const list = (skills ?? []).filter((s) => filter === 'all' || s.kind === filter);
  const active = skills?.find((s) => s.id === activeId);
  const counts = {
    skill: (skills ?? []).filter((s) => s.kind === 'skill').length,
    mcp: (skills ?? []).filter((s) => s.kind === 'mcp').length,
    tool: (skills ?? []).filter((s) => s.kind === 'tool').length,
  };

  return (
    <div className="grid h-full grid-cols-[200px_1fr_320px] divide-x divide-[var(--border)]">
      {/* 左侧分类 */}
      <aside className="overflow-y-auto p-3">
        <div className="mb-2 text-xs font-semibold">分类</div>
        <FilterBtn label="全部" count={(skills ?? []).length} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterBtn label="Skill" count={counts.skill} tone="info" active={filter === 'skill'} onClick={() => setFilter('skill')} />
        <FilterBtn label="MCP" count={counts.mcp} tone="success" active={filter === 'mcp'} onClick={() => setFilter('mcp')} />
        <FilterBtn label="Tool" count={counts.tool} tone="warn" active={filter === 'tool'} onClick={() => setFilter('tool')} />

        <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[10px]">
          <div className="mb-1 font-semibold">沙箱隔离</div>
          <div className="text-[var(--text-muted)]">gVisor runsc · 等保 3</div>
        </div>
      </aside>

      {/* 中间卡片 */}
      <section className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-4">
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'installed', label: <>已安装 <Badge tone="brand" className="ml-1">24</Badge></> },
              { key: 'store', label: <>商店 <Badge tone="neutral" className="ml-1">62</Badge></> },
            ]}
          />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4">
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                'rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-left transition-all hover:border-[var(--brand)]',
                activeId === s.id && 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30',
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--brand)]/15 text-[var(--brand)]">
                  <Wrench className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">v{s.version} · ⭐ {s.rating}</div>
                </div>
                <Badge tone={KIND_TONE[s.kind]}>{KIND_LABELS[s.kind]}</Badge>
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">{s.description}</div>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-[var(--text-muted)]">
                  <Download className="h-3 w-3" />{s.installCount}
                </span>
                {s.riskLevel === 'high' ? (
                  <Badge tone="error"><ShieldAlert className="mr-1 inline h-3 w-3" />高风险</Badge>
                ) : s.riskLevel === 'mid' ? (
                  <Badge tone="warn">中风险</Badge>
                ) : (
                  <Badge tone="success">低风险</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 右侧详情 */}
      <aside className="overflow-y-auto p-4">
        {active ? (
          <div className="space-y-3">
            <Card>
              <CardBody>
                <div className="flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brand)]/15 text-[var(--brand)]">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{active.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                      <Badge tone={KIND_TONE[active.kind]}>{KIND_LABELS[active.kind]}</Badge>
                      <span className="text-[var(--text-muted)]">v{active.version}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-[var(--text-muted)]">{active.description}</div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-xs">属性</CardTitle></CardHeader>
              <CardBody className="space-y-2 text-xs">
                <Row label="风险等级" value={
                  active.riskLevel === 'high' ? <Badge tone="error">高</Badge>
                    : active.riskLevel === 'mid' ? <Badge tone="warn">中</Badge>
                    : <Badge tone="success">低</Badge>
                } />
                <Row label="可缓存" value={active.cacheable ? <Badge tone="success">是</Badge> : <Badge tone="neutral">否</Badge>} />
                <Row label="调用次数" value={active.installCount.toLocaleString()} />
                <Row label="平均成本" value={active.costPerCall ?? '$0.06/次'} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-xs">执行方式</CardTitle></CardHeader>
              <CardBody className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  {active.kind === 'skill' ? <><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />gVisor 沙箱</> : null}
                  {active.kind === 'mcp' ? <>HTTP / JSON · 外部协议</> : null}
                  {active.kind === 'tool' ? <>REST / RPC · 内部 API</> : null}
                </div>
              </CardBody>
            </Card>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1"><Settings className="h-3.5 w-3.5" />配置</Button>
              <Button size="sm" variant="danger" className="flex-1">卸载</Button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function FilterBtn({ label, count, tone = 'neutral', active, onClick }: { label: string; count: number; tone?: 'neutral' | 'info' | 'success' | 'warn'; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs',
        active ? 'bg-[var(--brand)]/15 text-[var(--brand)]' : 'hover:bg-[var(--surface-2)]',
      )}
    >
      <span>{label}</span>
      <Badge tone={tone}>{count}</Badge>
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