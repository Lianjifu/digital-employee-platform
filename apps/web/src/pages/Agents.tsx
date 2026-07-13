import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Tabs, Empty, Progress } from '@de/web-ui';
import { Star, Download, Settings, Bot, Zap, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Agent } from '@de/web-types';

export default function Agents() {
  const [tab, setTab] = useState<'installed' | 'store'>('installed');
  const { data: agents } = useApiQuery<Agent[]>(['agents'], '/api/agents');
  const [activeId, setActiveId] = useState<string | null>('a1');

  const list = (agents ?? []).filter((a) => (tab === 'installed' ? a.status === 'installed' : a.status !== 'installed'));
  const active = agents?.find((a) => a.id === activeId);

  return (
    <div className="grid h-full grid-cols-[1fr_360px] divide-x divide-[var(--border)]">
      <section className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">智能体市场</h1>
              <p className="text-xs text-[var(--text-muted)]">8 个领域 · 24 商用 · 5 社区 · 2 企业包</p>
            </div>
            <Button>上传自定义 Agent</Button>
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

        <div className="flex-1 overflow-y-auto p-4">
          <SectionTitle>AIOps · 运维智能体</SectionTitle>
          <div className="mb-6 grid grid-cols-4 gap-3">
            {(list ?? []).filter((a) => a.category === 'AIOps').map((a) => (
              <AgentCard key={a.id} a={a} active={a.id === activeId} onClick={() => setActiveId(a.id)} />
            ))}
          </div>

          <SectionTitle>SecOps · 安全智能体</SectionTitle>
          <div className="grid grid-cols-4 gap-3">
            {(list ?? []).filter((a) => a.category === 'SecOps').map((a) => (
              <AgentCard key={a.id} a={a} active={a.id === activeId} onClick={() => setActiveId(a.id)} />
            ))}
          </div>

          {list.length === 0 && <Empty title="暂无 Agent" description="切换到商店 Tab 安装" />}
        </div>
      </section>

      {/* 右侧详情 */}
      <aside className="overflow-y-auto p-4">
        {active ? (
          <div className="space-y-3">
            <Card>
              <CardBody className="flex items-start gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand)]">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{active.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    <Badge tone={active.category === 'AIOps' ? 'info' : 'warn'}>{active.category}</Badge>
                    <span>v{active.version}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{active.rating}</span>
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">{active.description}</div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-xs">性能指标</CardTitle></CardHeader>
              <CardBody className="space-y-3 text-xs">
                <Stat label="调用次数" value={active.installCount.toLocaleString()} />
                {active.cacheHitRate !== undefined && (
                  <div>
                    <div className="mb-1 flex justify-between"><span>缓存命中</span><span>{(active.cacheHitRate * 100).toFixed(0)}%</span></div>
                    <Progress value={active.cacheHitRate * 100} tone="success" />
                  </div>
                )}
                {active.p95Ms !== undefined && <Stat label="P95 响应" value={`${active.p95Ms}ms`} />}
                <Stat label="工具" value={active.tools.join(', ') || '—'} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-xs">版本说明</CardTitle></CardHeader>
              <CardBody className="space-y-1 text-xs text-[var(--text-muted)]">
                <div>v{active.version} · 当前版本</div>
                <div>+ 新增智能重试机制</div>
                <div>+ 支持自定义 prompt 模板</div>
                <div>- 修复内存泄漏问题</div>
              </CardBody>
            </Card>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1"><Settings className="h-3.5 w-3.5" />配置</Button>
              <Button size="sm" variant="outline" className="flex-1">回滚</Button>
              {active.status === 'installed' ? (
                <Button size="sm" variant="danger" className="flex-1">停用</Button>
              ) : (
                <Button size="sm" className="flex-1"><Download className="h-3.5 w-3.5" />安装</Button>
              )}
            </div>
          </div>
        ) : (
          <Empty title="选择一个 Agent" description="左侧卡片查看详情" icon={<Bot className="h-8 w-8" />} />
        )}
      </aside>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-xs font-semibold text-[var(--text-muted)]">{children}</div>;
}

function AgentCard({ a, active, onClick }: { a: Agent; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-left transition-all hover:border-[var(--brand)]',
        active && 'border-[var(--brand)] ring-2 ring-[var(--brand)]/30',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--brand)]/15 text-[var(--brand)]">
          <Bot className="h-4 w-4" />
        </div>
        <Star className={cn('h-3.5 w-3.5', a.isStarred ? 'fill-amber-400 text-amber-400' : 'text-[var(--text-muted)]')} />
      </div>
      <div className="text-sm font-semibold">{a.name}</div>
      <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{a.description}</div>
      <div className="mt-2 flex items-center gap-2 text-[10px]">
        <Badge tone={a.category === 'AIOps' ? 'info' : 'warn'}>{a.category}</Badge>
        <span className="text-[var(--text-muted)]">v{a.version}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{a.rating}</span>
        <span className="flex items-center gap-0.5"><Download className="h-3 w-3" />{a.installCount}</span>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}