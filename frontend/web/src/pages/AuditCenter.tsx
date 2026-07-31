import { useMemo, useState } from 'react';
import { Download, FileSearch, Filter, ShieldCheck, Bot, ListChecks, Workflow } from 'lucide-react';
import { Badge, Button, toast } from '@de/web-ui';
import { cn } from '@de/web-utils';
import { useApiMutation, useApiQuery } from '@/services/query';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';

type AuditRow = { id: string; time: string; actor: string; action: string; target: string; result: 'success' | 'failed'; workspaceId?: string; correlationId: string };
type Storyline = 'all' | 'employee' | 'task' | 'workflow';

function storylineOf(row: AuditRow): Exclude<Storyline, 'all'> {
  if (/数字员工|员工|上岗|评测|岗位/.test(`${row.action} ${row.target}`)) return 'employee';
  if (/工作流|流程|发布技能|workflow/i.test(`${row.action} ${row.target}`)) return 'workflow';
  if (/任务|审批|交接/.test(`${row.action} ${row.target}`)) return 'task';
  return 'employee';
}

export default function AuditCenter({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useT();
  const isAuditor = useAuthStore((state) => state.user?.role === 'auditor');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'events' | 'storyline' | 'review' | 'exports'>('events');
  const [storyline, setStoryline] = useState<Storyline>('all');
  const audit = useApiQuery<AuditRow[]>(['audit-center'], '/api/audit-center', undefined, { refetchInterval: 15_000 });
  const exportEvidence = useApiMutation<{ filename: string; recordCount: number; masked: boolean }, Record<string, never>>('/api/audit-center/export', { onSuccess: (data) => toast.success(`已生成 ${data.filename}，共 ${data.recordCount} 条脱敏记录`), onError: (error: any) => toast.error(error?.message ?? '导出失败') });
  const rows = useMemo(() => (audit.data ?? []).filter((item) => `${item.actor} ${item.action} ${item.target} ${item.correlationId}`.toLowerCase().includes(query.toLowerCase())), [audit.data, query]);
  const storyRows = useMemo(() => rows.filter((item) => storyline === 'all' || storylineOf(item) === storyline), [rows, storyline]);
  const grouped = useMemo(() => {
    const buckets: Record<string, AuditRow[]> = {};
    storyRows.forEach((item) => {
      const key = storylineOf(item);
      buckets[key] = buckets[key] ?? [];
      buckets[key].push(item);
    });
    return buckets;
  }, [storyRows]);

  const tabNav = (
    <nav className={cn('flex gap-1 rounded-md bg-[var(--bg-elevated)] p-1', embedded ? '' : 'mt-4')}>
      {([['events', '审计事件'], ['storyline', '故事线'], ['review', '合规复核'], ['exports', '导出历史']] as const).map(([key, label]) => (
        <button key={key} onClick={() => setTab(key)} className={tab === key ? 'rounded bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--brand)] shadow-sm' : 'rounded px-3 py-2 text-xs text-[var(--text-muted)]'}>{label}</button>
      ))}
    </nav>
  );
  const searchBar = (tab === 'events' || tab === 'storyline') && (
    <div className={cn('flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3', embedded ? 'mt-3' : 'mt-4')}>
      <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按操作人、资源、关联 ID 搜索" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--text-muted)]" />
    </div>
  );

  return (
    <div className={cn(embedded ? 'min-w-0' : 'mx-auto min-h-full max-w-[1480px] p-3 sm:p-4 lg:p-5')}>
      {!embedded ? (
        <header className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-base font-semibold"><FileSearch className="h-4 w-4 text-[var(--brand)]" />{t('module.audit.title')}</h1>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t('module.audit.subtitle')}</p>
              {isAuditor && <p className="mt-2 text-[11px] font-medium text-[var(--brand)]">只读复核：事件、故事线与导出证据</p>}
            </div>
            <Button size="sm" variant="secondary" loading={exportEvidence.isPending} onClick={() => exportEvidence.mutate({})}><Download className="h-3.5 w-3.5" />{t('module.audit.export')}</Button>
          </div>
          {tabNav}
          {searchBar}
        </header>
      ) : (
        <div className="mb-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {tabNav}
            <Button size="sm" variant="secondary" loading={exportEvidence.isPending} onClick={() => exportEvidence.mutate({})}><Download className="h-3.5 w-3.5" />{t('module.audit.export')}</Button>
          </div>
          {searchBar}
        </div>
      )}

      {tab === 'review' && <ComplianceReview rows={rows} />}
      {tab === 'exports' && (
        <section className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-xs">
          <strong>证据导出历史</strong>
          <p className="mt-2 text-[var(--text-muted)]">导出默认脱敏；受限知识、长期记忆与生产敏感数据需独立复核后导出。表格与审计正文保持实心，不使用毛玻璃。</p>
        </section>
      )}

      {tab === 'storyline' && (
        <section className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
            {([
              ['all', '全部故事线', FileSearch],
              ['employee', '数字员工', Bot],
              ['task', '任务协作', ListChecks],
              ['workflow', '工作流程', Workflow],
            ] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setStoryline(key)} className={storyline === key ? 'flex items-center gap-1.5 rounded-md bg-[var(--brand-light)] px-3 py-2 text-xs font-semibold text-[var(--brand)]' : 'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          {(['employee', 'task', 'workflow'] as const).filter((key) => storyline === 'all' || storyline === key).map((key) => {
            const items = grouped[key] ?? [];
            const title = key === 'employee' ? '数字员工故事线' : key === 'task' ? '任务协作故事线' : '工作流程故事线';
            const desc = key === 'employee' ? '上岗、配置、评测与运行处置证据' : key === 'task' ? '任务审批、交接与结案证据' : '流程发布、发布技能与执行记录';
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <div className="text-sm font-semibold">{title}</div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{desc} · {items.length} 条</p>
                </div>
                {items.length ? (
                  <div className="divide-y divide-[var(--border)]">
                    {items.slice(0, 12).map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
                        <span className="w-36 shrink-0 text-[var(--text-muted)]">{new Date(item.time).toLocaleString('zh-CN')}</span>
                        <span className="font-medium">{item.actor}</span>
                        <span className="min-w-0 flex-1 text-[var(--text-secondary)]">{item.action} · {item.target}</span>
                        <Badge tone={item.result === 'success' ? 'success' : 'error'}>{item.result === 'success' ? '成功' : '失败'}</Badge>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{item.correlationId}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">该故事线暂无匹配事件</div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === 'events' && (
        <section className="mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {t('module.audit.events')}
              <Badge tone="success" className="text-[10px]">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--success)]" />LIVE
              </Badge>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">{rows.length} 条授权范围内记录</span>
          </div>
          {audit.isLoading ? (
            <div className="p-10 text-center text-xs text-[var(--text-muted)]">正在读取审计证据…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">时间</th>
                    <th className="px-4 py-2.5 font-medium">操作人</th>
                    <th className="px-4 py-2.5 font-medium">事件</th>
                    <th className="px-4 py-2.5 font-medium">目标</th>
                    <th className="px-4 py-2.5 font-medium">结果</th>
                    <th className="px-4 py-2.5 font-medium">关联 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="whitespace-nowrap px-4 py-3 text-[var(--text-muted)]">{new Date(item.time).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 font-medium">{item.actor}</td>
                      <td className="px-4 py-3">{item.action}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{item.target}</td>
                      <td className="px-4 py-3"><Badge tone={item.result === 'success' ? 'success' : 'error'}>{item.result === 'success' ? '成功' : '失败'}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-muted)]">{item.correlationId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"><ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />审计视图只读；证据导出默认脱敏并记录导出行为。</p>
    </div>
  );
}

function ComplianceReview({ rows }: { rows: AuditRow[] }) {
  const blocked = rows.filter((item) => item.result === 'failed').length;
  const access = rows.filter((item) => /授权|策略|审批/.test(item.action)).length;
  const frameworks = [
    { name: '等保 3.0', status: 'pass' as const, desc: '94 项 / 91 通过' },
    { name: 'ISO 27001', status: 'pass' as const, desc: '有效至 2027-03' },
    { name: '数据出境', status: 'pass' as const, desc: '境内 94% / 出境 6%' },
    { name: 'GDPR 兼容', status: 'warn' as const, desc: '需补充协议' },
  ];
  return (
    <div className="mt-3 space-y-3">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="text-xs text-[var(--text-muted)]">合规复核范围</div>
          <strong className="mt-2 block text-xl">{rows.length}</strong>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">授权范围内审计事件</div>
        </div>
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)]/30 p-4">
          <div className="text-xs text-[var(--text-muted)]">待关注风险</div>
          <strong className="mt-2 block text-xl text-[var(--warning)]">{blocked}</strong>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">策略阻断或失败事件</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="text-xs text-[var(--text-muted)]">授权与策略证据</div>
          <strong className="mt-2 block text-xl">{access}</strong>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">可用于独立合规复核</div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {frameworks.map((item) => (
          <div key={item.name} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{item.name}</span>
              <Badge tone={item.status === 'pass' ? 'success' : 'warn'}>{item.status === 'pass' ? '通过' : '改善'}</Badge>
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{item.desc}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
