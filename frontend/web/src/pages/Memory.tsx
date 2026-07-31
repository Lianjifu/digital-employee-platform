import { useMemo, useState } from 'react';
import { Archive, BrainCircuit, CheckCircle2, Clock3, FileUp, History, Layers3, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, Input, KpiCard, toast } from '@de/web-ui';
import type { MemoryAuditEvent, MemoryKnowledgeCandidate, MemoryLayer, MemoryPolicy, MemoryRecord } from '@de/web-types';
import { useApiMutation, useApiQuery } from '@/services/query';
import { EmptyState } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n';
import { cn } from '@de/web-utils';

type Tab = 'overview' | 'short_term' | 'working' | 'long_term' | 'candidates' | 'governance';
const TABS: Array<{ key: Tab; labelKey: string; icon: typeof BrainCircuit }> = [
  { key: 'overview', labelKey: 'module.memory.tabs.overview', icon: BrainCircuit },
  { key: 'short_term', labelKey: 'module.memory.tabs.shortTerm', icon: Clock3 },
  { key: 'working', labelKey: 'module.memory.tabs.working', icon: Layers3 },
  { key: 'long_term', labelKey: 'module.memory.tabs.longTerm', icon: Archive },
  { key: 'candidates', labelKey: 'module.memory.tabs.candidates', icon: FileUp },
  { key: 'governance', labelKey: 'module.memory.tabs.governance', icon: ShieldCheck },
];
const LAYER: Record<MemoryLayer, { label: string; tone: 'brand' | 'warn' | 'success' }> = { short_term: { label: '短期', tone: 'brand' }, working: { label: '工作', tone: 'warn' }, long_term: { label: '长期', tone: 'success' } };

export default function Memory() {
  const { t } = useT();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const overview = useApiQuery<any>(['memory', 'overview'], '/api/memory/overview');
  const records = useApiQuery<MemoryRecord[]>(['memory', 'records'], '/api/memory/records');
  const candidates = useApiQuery<MemoryKnowledgeCandidate[]>(['memory', 'candidates'], '/api/memory/candidates');
  const policy = useApiQuery<MemoryPolicy>(['memory', 'policy'], '/api/memory/policy');
  const audit = useApiQuery<MemoryAuditEvent[]>(['memory', 'audit'], '/api/memory/audit');
  const expire = useApiMutation<MemoryRecord, { id: string }>(({ id }) => `/api/memory/records/${id}/expire`);
  const remove = useApiMutation<{ id: string }, { id: string }>(({ id }) => `/api/memory/records/${id}`, undefined, 'DELETE');
  const candidate = useApiMutation<MemoryKnowledgeCandidate, { id: string }>(({ id }) => `/api/memory/records/${id}/candidate`);
  const review = useApiMutation<MemoryKnowledgeCandidate, { id: string; action: 'approve' | 'reject' }>(({ id, action }) => `/api/memory/candidates/${id}/${action}`);
  const updatePolicy = useApiMutation<MemoryPolicy, Partial<MemoryPolicy>>('/api/memory/policy', undefined, 'PATCH');
  const runRefinement = useApiMutation<{ scheduledFor: string; workingCreated: number; longCreated: number; candidatesCreated: number }, Record<string, never>>('/api/memory/refinement/run');

  const visible = useMemo(() => (records.data ?? []).filter((record) => {
    const matches = !query.trim() || `${record.title} ${record.content} ${record.correlationId}`.toLowerCase().includes(query.trim().toLowerCase());
    const layer = tab === 'short_term' ? 'short_term' : tab === 'working' ? 'working' : tab === 'long_term' ? 'long_term' : undefined;
    return matches && (!layer || record.layer === layer);
  }), [records.data, query, tab]);
  const report = (error: unknown) => toast.error(error instanceof Error ? error.message : '记忆操作失败');
  const visibleTabs = TABS.filter((item) => isAdmin || item.key !== 'governance');

  return (
    <div className="h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      <div className="space-y-3">
        <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
          <div className="flex items-start justify-between gap-4 px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg text-[var(--text-secondary)]">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <h1 className="text-base font-semibold text-[var(--text)]">{t('module.memory.title')}</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">{t('module.memory.subtitle')}</p>
            </div>
            <Badge tone="warn" className="shrink-0">运行记忆不等于权威知识</Badge>
          </div>
          <div className="de-employee-tabs flex overflow-x-auto px-3" role="tablist" aria-label={t('module.memory.title')}>
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cn('de-employee-tab flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs transition-colors', tab === item.key && 'is-active')}
              >
                <item.icon className="h-3.5 w-3.5" />{t(item.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="记忆摘要">
          <KpiCard label="短期记忆" value={overview.data?.totals?.shortTerm ?? 0} sub="条" icon={Clock3} tone="brand" size="comfortable" />
          <KpiCard label="工作记忆" value={overview.data?.totals?.working ?? 0} sub="条" icon={Layers3} tone="warn" size="comfortable" />
          <KpiCard label="长期记忆" value={overview.data?.totals?.longTerm ?? 0} sub="条" icon={Archive} tone="success" size="comfortable" />
          <KpiCard label="知识候选待审" value={overview.data?.totals?.pendingCandidates ?? 0} sub="条" icon={FileUp} tone="warn" size="comfortable" />
        </section>

        <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)] p-3 md:p-4">
          {tab === 'overview' && <Overview records={records.data ?? []} policy={overview.data?.policy} onOpen={(next) => setTab(next)} />}
          {(['short_term', 'working', 'long_term'] as Tab[]).includes(tab) && (
            <RecordList
              records={visible}
              layer={tab as MemoryLayer}
              query={query}
              onQuery={setQuery}
              onExpire={(id) => expire.mutate({ id }, { onSuccess: () => toast.success('记忆已失效'), onError: report })}
              onDelete={(id) => remove.mutate({ id }, { onSuccess: () => toast.success('记忆已删除'), onError: report })}
              onCandidate={(id) => candidate.mutate({ id }, { onSuccess: () => { toast.success('已提交知识候选，等待审核'); setTab('candidates'); }, onError: report })}
            />
          )}
          {tab === 'candidates' && (
            <Candidates
              items={candidates.data ?? []}
              canReview={isAdmin}
              onReview={(id, action) => review.mutate({ id, action }, { onSuccess: (item) => toast.success(action === 'approve' ? `已创建知识包草稿：${item.knowledgePackageId}` : '候选已拒绝'), onError: report })}
            />
          )}
          {tab === 'governance' && (
            <GovernanceProgressive
              policy={policy.data}
              audit={audit.data ?? []}
              onUpdate={(patch) => updatePolicy.mutate(patch, { onSuccess: () => toast.success('记忆策略已更新并写入审计'), onError: report })}
              onRun={() => runRefinement.mutate({}, { onSuccess: (result) => toast.success(`渐进提炼完成：工作 ${result.workingCreated}，长期 ${result.longCreated}，候选 ${result.candidatesCreated}`), onError: report })}
              running={runRefinement.isPending}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Overview({ records, policy, onOpen }: { records: MemoryRecord[]; policy?: MemoryPolicy; onOpen: (tab: Tab) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
      <div className="rounded-xl bg-[var(--bg)] p-3 md:p-4" style={{ boxShadow: 'var(--saas-ring)' }}>
        <h2 className="text-sm font-semibold">三层记忆边界</h2>
        <div className="mt-3 space-y-2">
          {(['short_term', 'working', 'long_term'] as MemoryLayer[]).map((layer) => {
            const item = LAYER[layer];
            const count = records.filter((record) => record.layer === layer && record.status === 'active').length;
            return (
              <button key={layer} type="button" onClick={() => onOpen(layer)} className="flex w-full items-center gap-3 rounded-lg bg-[var(--surface-1)] px-3 py-2.5 text-left hover:bg-[var(--bg-hover)]" style={{ boxShadow: 'var(--saas-ring)' }}>
                <Badge tone={item.tone}>{item.label}</Badge>
                <span className="flex-1 text-xs text-[var(--text-secondary)]">{layer === 'short_term' ? '单次会话上下文，按 TTL 自动清除' : layer === 'working' ? '任务与工作流过程证据，随执行生命周期归档' : '可复用经验，必须审核后才能转为知识'}</span>
                <strong className="font-mono text-sm">{count}</strong>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-xl bg-[var(--bg)] p-3 md:p-4" style={{ boxShadow: 'var(--saas-ring)' }}>
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--success)]" />当前策略</div>
        <dl className="mt-3 space-y-2 text-xs">
          <Row label="短期保留" value={`${policy?.shortTermTtlHours ?? 24} 小时`} />
          <Row label="工作记忆保留" value={`${policy?.workingMemoryTtlDays ?? 30} 天`} />
          <Row label="长期写入审批" value={policy?.longTermWriteApproval ? '已启用' : '未启用'} />
          <Row label="长期容量" value={`${policy?.usedCapacity ?? 0} / ${policy?.longTermCapacity ?? 0}`} />
        </dl>
      </div>
    </div>
  );
}

function RecordList({ records, layer, query, onQuery, onExpire, onDelete, onCandidate }: { records: MemoryRecord[]; layer: MemoryLayer; query: string; onQuery: (value: string) => void; onExpire: (id: string) => void; onDelete: (id: string) => void; onCandidate: (id: string) => void }) {
  const meta = LAYER[layer];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{meta.label}记忆</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">按工作区隔离，保留来源、置信度和关联链路。</p>
        </div>
        <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="检索标题、内容或关联 ID" className="h-9 w-[240px] text-xs" />
      </div>
      {records.length ? (
        <div className="space-y-2">
          {records.map((record) => (
            <article key={record.id} className="rounded-xl bg-[var(--bg)] p-3" style={{ boxShadow: 'var(--saas-ring)' }}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm">{record.title}</strong>
                    <Badge tone={meta.tone}>{Math.round(record.confidence * 100)}% 置信</Badge>
                    <Badge tone={record.classification === 'restricted' ? 'warn' : 'neutral'}>{record.classification}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{record.content}</p>
                  <p className="mt-2 font-mono text-[10px] text-[var(--text-muted)]">{record.sourceType}:{record.sourceId} · {record.correlationId}</p>
                </div>
                <div className="flex gap-1">
                  {layer === 'long_term' && record.status === 'active' && <Button size="sm" variant="secondary" onClick={() => onCandidate(record.id)}><FileUp className="h-3 w-3" />提炼</Button>}
                  {record.status === 'active' && <Button size="sm" variant="ghost" onClick={() => onExpire(record.id)}><Clock3 className="h-3 w-3" />失效</Button>}
                  <Button size="sm" variant="ghost" onClick={() => onDelete(record.id)}><Trash2 className="h-3 w-3" />删除</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Archive} title="没有匹配的记忆" description="记录将在会话、任务或工作流的受控执行中形成。" />
      )}
    </div>
  );
}

function Candidates({ items, canReview, onReview }: { items: MemoryKnowledgeCandidate[]; canReview: boolean; onReview: (id: string, action: 'approve' | 'reject') => void }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">知识候选</h2>
      <p className="mt-1 mb-3 text-xs text-[var(--text-muted)]">普通用户可提交候选；审核与知识包创建由管理员完成。</p>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl bg-[var(--bg)] p-3" style={{ boxShadow: 'var(--saas-ring)' }}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{item.title}</strong>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.summary}</p>
                  <p className="mt-2 font-mono text-[10px] text-[var(--text-muted)]">来源 {item.sourceCorrelationId}</p>
                </div>
                <Badge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'neutral' : 'warn'}>{item.status === 'pending_review' ? '待审核' : item.status === 'approved' ? '已通过' : '已拒绝'}</Badge>
                {canReview && item.status === 'pending_review' && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => onReview(item.id, 'approve')}><CheckCircle2 className="h-3 w-3" />通过</Button>
                    <Button size="sm" variant="ghost" onClick={() => onReview(item.id, 'reject')}><XCircle className="h-3 w-3" />拒绝</Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={FileUp} title="暂无待审核知识候选" description="从长期记忆提炼后将在此等待事实校验与责任人审核。" />
      )}
    </div>
  );
}

function GovernanceProgressive({ policy, audit, onUpdate, onRun, running }: { policy?: MemoryPolicy; audit: MemoryAuditEvent[]; onUpdate: (patch: Partial<MemoryPolicy>) => void; onRun: () => void; running: boolean }) {
  const [time, setTime] = useState(policy?.dailyRefinementTime ?? '02:00');
  const [confidence, setConfidence] = useState(String(policy?.minimumConfidence ?? .85));
  const stages = [
    { key: 'shortToWorkingEnabled' as const, label: '短期 → 工作', desc: '会话结束后归纳上下文，作为任务与交接的可追溯工作记忆。' },
    { key: 'workingToLongEnabled' as const, label: '工作 → 长期', desc: '每日筛选达到置信阈值的任务经验，沉淀为可复用长期记忆。' },
    { key: 'longToKnowledgeEnabled' as const, label: '长期 → 知识候选', desc: '每日提炼长期记忆为待审核候选，审核后才创建知识包草稿。' },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
      <section className="rounded-xl bg-[var(--bg)] p-3 md:p-4" style={{ boxShadow: 'var(--saas-ring)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">每日渐进提炼策略</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">生产环境由调度器每天按策略运行；此处可进行 Mock 演练。</p>
          </div>
          <Button size="sm" loading={running} onClick={onRun}>立即演练</Button>
        </div>
        <div className="mt-3 space-y-2">
          {stages.map((stage) => (
            <label key={stage.key} className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-1)] px-3 py-2.5 text-xs" style={{ boxShadow: 'var(--saas-ring)' }}>
              <span><strong>{stage.label}</strong><small className="mt-1 block text-[var(--text-muted)]">{stage.desc}</small></span>
              <input type="checkbox" checked={policy?.[stage.key] ?? true} onChange={(event) => onUpdate({ [stage.key]: event.target.checked })} />
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs">每日运行时间<Input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 h-9 text-xs" /></label>
          <label className="text-xs">最低置信度<Input type="number" min="0" max="1" step="0.05" value={confidence} onChange={(event) => setConfidence(event.target.value)} className="mt-1 h-9 text-xs" /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-2">长期写入需审核<input type="checkbox" checked={policy?.longTermWriteApproval ?? true} onChange={(event) => onUpdate({ longTermWriteApproval: event.target.checked })} /></label>
          <label className="flex items-center gap-2">敏感数据脱敏<input type="checkbox" checked={policy?.sensitiveDataMasking ?? true} onChange={(event) => onUpdate({ sensitiveDataMasking: event.target.checked })} /></label>
        </div>
        <Button className="mt-3" size="sm" onClick={() => onUpdate({ dailyRefinementTime: time, minimumConfidence: Number(confidence) })}>保存调度策略</Button>
      </section>
      <section className="rounded-xl bg-[var(--bg)] p-3 md:p-4" style={{ boxShadow: 'var(--saas-ring)' }}>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />记忆审计</h2>
        <div className="mt-3 space-y-2">
          {audit.length ? audit.map((event) => (
            <div key={event.id} className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-xs" style={{ boxShadow: 'var(--saas-ring)' }}>
              <div className="flex justify-between gap-2"><strong>{event.action}</strong><span className="text-[var(--text-muted)]">{new Date(event.time).toLocaleString('zh-CN')}</span></div>
              <p className="mt-1 text-[var(--text-secondary)]">{event.target}</p>
              <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{event.actor} · {event.correlationId}</p>
            </div>
          )) : <EmptyState icon={History} title="暂无记忆审计事件" />}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">{label}</dt><dd className="font-medium">{value}</dd></div>;
}
