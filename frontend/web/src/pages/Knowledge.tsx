/**
 * P7 知识库（企业级优化版）
 * 增强：所有按钮接入交互，纯前端 state 化演示。
 */
import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, useEdgesState, useNodesState, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Input } from '@de/web-ui';
import {
  Database, FileText, Brain, Layers, Search, Upload, ShieldCheck, Zap,
  Plus, Filter, Star, History, Eye, RefreshCw, Tag as TagIcon, X, Download,
  ExternalLink, TrendingUp, Activity, BookOpen, Hash, ChevronRight,
  Sparkles, Trash2, CheckCircle2, Clock3, Link2, RotateCcw, ShieldAlert,
  SlidersHorizontal, Users, Network, Boxes, GitFork, PlayCircle, Pencil,
} from 'lucide-react';
import type { KnowledgeAuditEvent, KnowledgeConsumerBinding, KnowledgeDoc, KnowledgeEvaluation, KnowledgeGovernancePolicy, KnowledgeGraphEntity, KnowledgeGraphRelation, KnowledgePackage, KnowledgeProcessingJob, KnowledgeRetrievalProfile, KnowledgeRetrievalResult, KnowledgeSourceConnection } from '@de/web-types';
import { cn } from '@de/web-utils';
import { Modal, Drawer, ConfirmDialog, EmptyState } from '@/components/shared';

const PIPELINE: { key: string; label: string; icon: any; tool: string; count: string }[] = [
  { key: 'ingest', label: 'Ingest', icon: Upload, tool: 'Tika + PaddleOCR', count: '1.2 GB/日' },
  { key: 'chunk', label: 'Chunk', icon: FileText, tool: '512 tokens · 64 overlap', count: '247k 段' },
  { key: 'embed', label: 'Embed', icon: Brain, tool: 'BGE-M3 · 1024 维', count: '124k 向量' },
  { key: 'index', label: 'Index', icon: Layers, tool: 'Milvus HNSW', count: '12 GB' },
  { key: 'retrieve', label: 'Retrieve', icon: Search, tool: 'Top-K=8 + Rerank', count: '320ms P95' },
];

const KB_TYPE_OPTIONS = ['Runbook', 'CMDB', 'CVE', 'SIEM', 'Postmortem', '变更方案', '合规文档'];
const CONTENT_PAGE_SIZE = 10;

// Markdown → HTML（mock 简单渲染）
function MarkdownView({ text }: { text: string }) {
  const html = useMemo(() => {
    return text
      .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-4 mb-2 pb-1 border-b border-[var(--border)]">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text)] font-semibold">$1</strong>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-xs text-[var(--text-secondary)]">$1</li>')
      .replace(/\n\n/g, '<br/><br/>');
  }, [text]);
  return (
    <div
      className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

type ModalKind = 'upload' | 'reindex' | 'citationAgents' | 'connectSource' | 'newPackage' | null;
type KnowledgeWorkspace = 'assets' | 'processing' | 'retrieval' | 'graph' | 'governance';

export default function Knowledge() {
  const [workspace, setWorkspace] = useState<KnowledgeWorkspace>('assets');
  const [docPreviewId, setDocPreviewId] = useState<string | null>('k1');
  const [chunkDrawer, setChunkDrawer] = useState<any | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [reindexConfirm, setReindexConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'indexing'>('all');
  const [contentPage, setContentPage] = useState(1);
  const [selectedGraphEntityId, setSelectedGraphEntityId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [governanceNotice, setGovernanceNotice] = useState('所有知识资产均处于可追溯治理范围内');

  const { data: docs = [] } = useApiQuery<KnowledgeDoc[]>(['knowledge', 'docs'], '/api/knowledge/docs');
  const { data: docDetail } = useApiQuery<any>(['doc', docPreviewId], `/api/knowledge/doc/${docPreviewId ?? 'k1'}`);
  const { data: searchHistory = [] } = useApiQuery<any[]>(['search-history'], '/api/knowledge/search-history');
  const { data: citationTrace = [] } = useApiQuery<any[]>(['citation-trace'], '/api/knowledge/citation-trace');
  const { data: evalMetrics } = useApiQuery<any>(['eval'], '/api/knowledge/eval');
  const { data: topChunks = [] } = useApiQuery<KnowledgeRetrievalResult[]>(['knowledge', 'chunks', 'top'], '/api/knowledge/chunks/top');
  const { data: sourceConnections = [] } = useApiQuery<KnowledgeSourceConnection[]>(['knowledge', 'sources'], '/api/knowledge/sources');
  const { data: governance } = useApiQuery<KnowledgeGovernancePolicy>(['knowledge', 'governance'], '/api/knowledge/governance');
  const { data: knowledgeAudit = [] } = useApiQuery<KnowledgeAuditEvent[]>(['knowledge', 'audit'], '/api/knowledge/audit');
  const { data: knowledgePackages = [] } = useApiQuery<KnowledgePackage[]>(['knowledge', 'packages'], '/api/knowledge/packages');
  const { data: processingJobs = [] } = useApiQuery<KnowledgeProcessingJob[]>(['knowledge', 'processing-jobs'], '/api/knowledge/processing-jobs');
  const { data: retrievalProfiles = [] } = useApiQuery<KnowledgeRetrievalProfile[]>(['knowledge', 'retrieval-profiles'], '/api/knowledge/retrieval-profiles');
  const { data: evaluations = [] } = useApiQuery<KnowledgeEvaluation[]>(['knowledge', 'evaluations'], '/api/knowledge/evaluations');
  const { data: graphEntities = [] } = useApiQuery<KnowledgeGraphEntity[]>(['knowledge', 'graph-entities'], '/api/knowledge/graph/entities');
  const { data: graphRelations = [] } = useApiQuery<KnowledgeGraphRelation[]>(['knowledge', 'graph-relations'], '/api/knowledge/graph/relations');
  const { data: consumerBindings = [] } = useApiQuery<KnowledgeConsumerBinding[]>(['knowledge', 'bindings'], '/api/knowledge/bindings');

  const uploadMutation = useApiMutation<KnowledgeDoc, { title: string; source: string; tags: string }>('/api/knowledge/docs', { onSuccess: (doc) => { setActiveModal(null); setGovernanceNotice(`文档「${doc.title}」已进入解析与索引队列。`); } });
  const reindexMutation = useApiMutation<{ status: string; affected: number }, { kb: string }>('/api/knowledge/reindex', { onSuccess: (result) => { setReindexConfirm(false); setGovernanceNotice(`索引重建任务已创建，影响 ${result.affected} 项资产。`); } });
  const reviewMutation = useApiMutation<{ ids: string[] }, { ids: string[] }>('/api/knowledge/docs/review', { onSuccess: (result) => { setSelectedDocumentIds([]); setGovernanceNotice(`已发起 ${result.ids.length} 项知识资产复核。`); } });
  const retrieveMutation = useApiMutation<{ results: KnowledgeRetrievalResult[]; metrics: unknown }, { query: string; kb: string }>('/api/knowledge/retrieve', { onSuccess: (result, vars) => setGovernanceNotice(`已完成「${vars.query}」检索验证，返回 ${result.results.length} 条证据。`) });
  const rescoreMutation = useApiMutation<KnowledgeRetrievalResult[], Record<string, never>>('/api/knowledge/chunks/rescore', { onSuccess: () => setGovernanceNotice('证据重新评分完成，已刷新 Top-K 结果。') });
  const sourceMutation = useApiMutation<KnowledgeSourceConnection, { name: string; kind: string; schedule: string }>('/api/knowledge/sources', { onSuccess: (source) => { setActiveModal(null); setWorkspace('processing'); setGovernanceNotice(`数据源「${source.name}」已接入，等待首次同步。`); } });
  const sourceSyncMutation = useApiMutation<KnowledgeSourceConnection, { id: string }>(({ id }) => `/api/knowledge/sources/${id}/sync`, { onSuccess: (source) => setGovernanceNotice(`数据源「${source.name}」同步完成。`) });
  const governanceMutation = useApiMutation<KnowledgeGovernancePolicy, Partial<KnowledgeGovernancePolicy>>('/api/knowledge/governance', { onSuccess: (policy) => setGovernanceNotice(policy.versionRetention ? '版本保留策略已启用并写入审计。' : '版本保留策略已暂停，请确认合规风险。') }, 'PATCH');
  const createPackageMutation = useApiMutation<KnowledgePackage, { name: string; description: string; domain: string; classification: KnowledgePackage['classification'] }>('/api/knowledge/packages', { onSuccess: (item) => { setActiveModal(null); setWorkspace('assets'); setGovernanceNotice(`知识包「${item.name}」已创建，请完成加工与评测后发布。`); } });
  const publishPackageMutation = useApiMutation<KnowledgePackage, { id: string }>(({ id }) => `/api/knowledge/packages/${id}/publish`, { onSuccess: (item) => setGovernanceNotice(`知识包「${item.name}」${item.currentVersion.version} 已发布，可供智能体与工作流引用。`) });
  const processPackageMutation = useApiMutation<KnowledgeProcessingJob, { id: string; strategy: KnowledgeProcessingJob['strategy'] }>(({ id }) => `/api/knowledge/packages/${id}/process`, { onSuccess: (job) => setGovernanceNotice(`已启动 ${job.strategy} 切片与 ${job.indexVersion} 索引构建。`) });
  const retryJobMutation = useApiMutation<KnowledgeProcessingJob, { id: string }>(({ id }) => `/api/knowledge/processing-jobs/${id}/retry`, { onSuccess: (job) => setGovernanceNotice(`加工任务「${job.source}」已重新进入队列。`) });
  const evaluationMutation = useApiMutation<KnowledgeEvaluation, { packageId: string; profileId: string }>('/api/knowledge/evaluations/run', { onSuccess: (item) => setGovernanceNotice(`评测完成：Recall@K ${(item.recallAtK * 100).toFixed(0)}%，引用正确率 ${(item.citationAccuracy * 100).toFixed(0)}%。`) });

  // 检索测试 query
  const [testQuery, setTestQuery] = useState('');

  // 标签筛选
  const allTags = useMemo(() => {
    const s = new Set<string>();
    docs.forEach((d) => s.add(d.source));
    return Array.from(s);
  }, [docs]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const filteredDocs = useMemo(() => {
    return docs.filter((d) => {
      if (tagFilter && d.source !== tagFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (searchQ && !d.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [docs, statusFilter, tagFilter, searchQ]);
  const contentPageCount = Math.max(1, Math.ceil(filteredDocs.length / CONTENT_PAGE_SIZE));
  const activeContentPage = Math.min(contentPage, contentPageCount);
  const paginatedDocs = filteredDocs.slice((activeContentPage - 1) * CONTENT_PAGE_SIZE, activeContentPage * CONTENT_PAGE_SIZE);

  const searchResults = retrieveMutation.data?.results ?? [];

  const isReindexing = reindexMutation.isPending;

  // Handlers
  const handleUploadDoc = (form: { title: string; source: string; tags: string }) => uploadMutation.mutate(form);
  // 单一知识目录下的重建始终覆盖全部可用资产，而不是某个空间子集。
  const handleReindex = () => reindexMutation.mutate({ kb: 'all' });
  const handleRescore = () => rescoreMutation.mutate({});

  const activeCitation = citationTrace[0] ?? null;
  const selectedCount = selectedDocumentIds.length;

  const toggleDocument = (id: string) => setSelectedDocumentIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  const openDocument = (id: string) => {
    setDocPreviewId(id);
    setEditingContent(false);
    setShowDetails(true);
  };
  const downloadOriginal = () => {
    if (!docDetail) return;
    const blob = new Blob([docDetail.content ?? ''], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `${docDetail.title ?? 'knowledge-content'}.md`; link.click(); URL.revokeObjectURL(link.href);
  };
  const syncSource = (id: string) => sourceSyncMutation.mutate({ id });
  const connectSource = (form: { name: string; kind: string; schedule: string }) => sourceMutation.mutate(form);

  return (
    <div className="knowledge-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      <section className="knowledge-shell">
        <header className="knowledge-header-panel knowledge-workbench-header px-4 py-4 sm:px-5">
          <div className="knowledge-header-main">
            <div className="knowledge-header-copy">
              <div className="knowledge-workbench-eyebrow">企业知识运营</div>
              <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5 text-[var(--brand)]" />知识库中心</h1>
              <p className="mt-1 text-xs text-[var(--text-muted)]">统一管理企业知识内容、接入加工、检索评测、图谱关联与引用治理。</p>
            </div>
          </div>

          <nav className="knowledge-workbench-tabs mt-4" aria-label="知识运营分区">
            {[
              { key: 'assets' as const, label: '知识资产', icon: FileText }, { key: 'processing' as const, label: '接入与加工', icon: Layers },
              { key: 'retrieval' as const, label: '检索与评测', icon: Search }, { key: 'graph' as const, label: '图谱与关联', icon: Network },
              { key: 'governance' as const, label: '引用治理', icon: ShieldCheck },
            ].map((item) => <button key={item.key} type="button" onClick={() => setWorkspace(item.key)} className={cn('knowledge-workbench-tab', workspace === item.key && 'is-active')}><item.icon className="h-3.5 w-3.5" />{item.label}</button>)}
          </nav>
        </header>

        <main className="knowledge-content-panel knowledge-workspace p-4 sm:p-5">
          {workspace === 'assets' && <>
            <div className="knowledge-metrics-grid">
              <KnowledgeMetric label="受管文档" value={`${docs?.length ?? 0}`} meta="覆盖全部知识资产" icon={FileText} tone="brand" />
              <KnowledgeMetric label="待处理索引" value={isReindexing ? '1' : '0'} meta={isReindexing ? '当前重建进行中' : '当前无阻塞任务'} icon={RefreshCw} tone="warning" />
              <KnowledgeMetric label="检索健康度" value={`${evalMetrics?.recall ?? 92}%`} meta={`${evalMetrics?.p95Latency ?? 320}ms P95 · 可用`} icon={Activity} tone="success" />
              <KnowledgeMetric label="智能体引用" value={`${citationTrace.reduce((total: number, item: any) => total + (item.citeCount ?? 0), 0)}`} meta="可追溯到引用方" icon={Users} tone="info" />
            </div>

            <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-sm font-semibold"><Boxes className="h-4 w-4 text-[var(--brand)]" />已发布知识包</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">以稳定版本、检索策略和权限范围向智能体与工作流交付知识能力。</p></div><Button size="sm" variant="secondary" onClick={() => setActiveModal('newPackage')}><Plus className="h-3.5 w-3.5" />新建知识包</Button></div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">{knowledgePackages.map((item) => <article key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--brand)]/35"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-semibold">{item.name}</div><div className="mt-1 flex flex-wrap gap-1"><Badge tone={item.status === 'published' ? 'success' : item.status === 'review' ? 'warn' : 'neutral'}>{item.status === 'published' ? '已发布' : item.status === 'review' ? '待审核' : '草稿'}</Badge><Badge tone="neutral">{item.currentVersion.version}</Badge><Badge tone="info">{item.classification === 'restricted' ? '受限' : item.classification === 'confidential' ? '机密' : '内部'}</Badge></div></div><Boxes className="h-4 w-4 shrink-0 text-[var(--brand)]" /></div><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--text-secondary)]">{item.description}</p><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><span><strong className="block font-mono text-xs">{item.documentCount}</strong><small className="text-[var(--text-muted)]">资产</small></span><span><strong className="block font-mono text-xs">{item.currentVersion.qualityScore || '—'}%</strong><small className="text-[var(--text-muted)]">质量</small></span><span><strong className="block font-mono text-xs">{item.consumers}</strong><small className="text-[var(--text-muted)]">引用方</small></span></div><div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2"><span className="truncate text-[10px] text-[var(--text-muted)]">{item.owner} · {item.currentVersion.indexVersion}</span>{item.status === 'published' ? <button type="button" className="text-[11px] text-[var(--brand)] hover:underline" onClick={() => setWorkspace('governance')}>查看引用</button> : <button type="button" disabled={publishPackageMutation.isPending} className="text-[11px] text-[var(--brand)] hover:underline disabled:text-[var(--text-muted)]" onClick={() => publishPackageMutation.mutate({ id: item.id })}>发布版本</button>}</div></article>)}</div>
            </section>

            <div className="knowledge-toolbar mt-5">
              <div><div className="text-sm font-semibold">内容列表</div><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">按来源、生命周期与检索影响持续运营企业知识内容。</div></div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" onClick={() => setActiveModal('upload')}><Upload className="h-3.5 w-3.5" />上传内容</Button>
                <div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><Input placeholder="搜索标题、来源…" value={searchQ} onChange={(event) => { setSearchQ(event.target.value); setContentPage(1); }} className="h-8 w-52 pl-8 text-xs" /></div>
                <div className="knowledge-filter-group"><SlidersHorizontal className="h-3.5 w-3.5 text-[var(--text-muted)]" />{(['all', 'ready', 'indexing'] as const).map((status) => <button key={status} type="button" onClick={() => { setStatusFilter(status); setContentPage(1); }} className={cn(statusFilter === status && 'is-active')}>{status === 'all' ? '全部状态' : status === 'ready' ? '已就绪' : '索引中'}</button>)}</div>
              </div>
            </div>
            <div className="knowledge-source-filter mt-3">{allTags.map((source) => <button key={source} type="button" onClick={() => { setTagFilter(tagFilter === source ? null : source); setContentPage(1); }} className={cn(tagFilter === source && 'is-active')}><TagIcon className="h-3 w-3" />{source}</button>)}</div>
            {selectedCount > 0 && <div className="knowledge-bulk-bar mt-3"><span>已选择 {selectedCount} 项资产</span><Button size="sm" variant="secondary" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ ids: selectedDocumentIds })}><ShieldCheck className="h-3 w-3" />{reviewMutation.isPending ? '提交中…' : '发起复核'}</Button><Button size="sm" variant="secondary" onClick={() => setSelectedDocumentIds([])}>取消选择</Button></div>}

            {filteredDocs.length === 0 ? <EmptyState icon={FileText} title="没有匹配的内容" description="尝试清除筛选条件，或上传新的企业知识文档。" action={<Button size="sm" onClick={() => setActiveModal('upload')}><Upload className="h-3.5 w-3.5" />上传文档</Button>} /> : <><div className="knowledge-asset-table mt-4"><div className="knowledge-asset-table__head"><span /><span>内容</span><span>来源与状态</span><span>质量与规模</span><span>影响范围</span><span>更新时间</span><span /></div>{paginatedDocs.map((doc) => <div key={doc.id} className={cn('knowledge-asset-row', doc.id === docPreviewId && 'is-selected')} onClick={() => openDocument(doc.id)} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && openDocument(doc.id)}><span><input type="checkbox" checked={selectedDocumentIds.includes(doc.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleDocument(doc.id)} aria-label={`选择 ${doc.title}`} /></span><span className="min-w-0"><span className="flex items-center gap-2"><span className="knowledge-doc-icon"><FileText className="h-3.5 w-3.5" /></span><strong className="truncate">{doc.title}</strong></span><small>责任人：李婷 · v3.2</small></span><span><Badge tone="info">{doc.source}</Badge><Badge tone={doc.status === 'ready' ? 'success' : 'warn'} className="ml-1">{doc.status === 'ready' ? '已就绪' : '索引中'}</Badge></span><span><strong className="font-mono text-xs">{doc.chunks}</strong><small>{doc.sizeKb} KB · {doc.status === 'ready' ? '质量正常' : '等待构建'}</small></span><span><strong className="font-mono text-xs">{doc.citeCount}</strong><small>智能体引用</small></span><span><small>{doc.updatedAt.slice(0, 10)}</small></span><span><button type="button" className="knowledge-row-action" onClick={(event) => { event.stopPropagation(); openDocument(doc.id); }}><Eye className="h-3 w-3" />详情</button></span></div>)}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]"><span>共 {filteredDocs.length} 条，每页 {CONTENT_PAGE_SIZE} 条</span><div className="flex items-center gap-1"><Button size="sm" variant="ghost" disabled={activeContentPage === 1} onClick={() => setContentPage((page) => Math.max(1, page - 1))}>上一页</Button><span className="min-w-16 text-center font-mono text-[var(--text-secondary)]">{activeContentPage} / {contentPageCount}</span><Button size="sm" variant="ghost" disabled={activeContentPage === contentPageCount} onClick={() => setContentPage((page) => Math.min(contentPageCount, page + 1))}>下一页</Button></div></div></>}
          </>}

          {workspace === 'retrieval' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">检索验证台</div><p>验证数字员工在真实问题下的证据覆盖、相关度与响应性能。</p></div><Badge tone="success"><CheckCircle2 className="mr-1 h-3 w-3" />检索服务可用</Badge></div>
            <div className="knowledge-retrieval-query mt-4"><Search className="h-4 w-4 text-[var(--brand)]" /><Input placeholder="输入业务问题，例如：Redis OOM 如何安全处置？" value={testQuery} onChange={(event) => setTestQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && testQuery.trim() && retrieveMutation.mutate({ query: testQuery, kb: 'all' })} className="border-0 bg-transparent text-sm shadow-none focus-visible:ring-0" /><Button size="sm" disabled={!testQuery.trim() || retrieveMutation.isPending} onClick={() => retrieveMutation.mutate({ query: testQuery, kb: 'all' })}>{retrieveMutation.isPending ? '验证中…' : '执行验证'}</Button></div>
            <div className="knowledge-retrieval-layout mt-4"><section className="knowledge-retrieval-results"><div className="knowledge-section-title"><Search className="h-3.5 w-3.5 text-[var(--brand)]" />证据结果 <Badge tone="neutral">{testQuery.trim() ? searchResults.length : topChunks.length} 条</Badge></div><div className="mt-3 space-y-2">{(testQuery.trim() ? searchResults : topChunks.slice(0, 4)).map((chunk) => <button key={chunk.idx} type="button" onClick={() => setChunkDrawer(chunk)} className="knowledge-evidence-card"><span className="font-mono text-[var(--brand)]">[{chunk.idx}]</span><span className="min-w-0 flex-1"><strong>{chunk.source}</strong><small>{chunk.text}</small></span><span className="font-mono text-[var(--success)]">{(chunk.score * 100).toFixed(0)}%</span></button>)}</div></section><section className="knowledge-retrieval-health"><div className="knowledge-section-title"><Activity className="h-3.5 w-3.5 text-[var(--brand)]" />质量与性能</div><div className="mt-3 grid grid-cols-2 gap-2"><EvalCard label="召回率" value={`${evalMetrics?.recall ?? 92}%`} tone="success" /><EvalCard label="准确率" value={`${evalMetrics?.precision ?? 88}%`} tone="info" /><EvalCard label="P95 延迟" value={`${evalMetrics?.p95Latency ?? 320}ms`} tone="primary" /><EvalCard label="缓存命中" value={`${evalMetrics?.hitRate ?? 32}%`} tone="purple" /></div><button type="button" className="knowledge-text-action mt-4" onClick={handleRescore}><RotateCcw className="h-3 w-3" />重新评分并查看差异</button></section></div>
            <div className="knowledge-pipeline mt-4">{PIPELINE.map((stage, index) => <div key={stage.key}><span className="knowledge-pipeline__step">{index + 1}</span><stage.icon className="h-3.5 w-3.5 text-[var(--brand)]" /><strong>{stage.label}</strong><small>{stage.tool} · {stage.count}</small></div>)}</div>
            <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-[var(--brand)]" />评测与发布门禁</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">以标准问题集验证混合召回、重排质量、引用正确性与延迟，再决定是否发布版本。</p></div><Button size="sm" variant="secondary" disabled={!knowledgePackages[0] || evaluationMutation.isPending} onClick={() => { const target = knowledgePackages.find((item) => item.status === 'published') ?? knowledgePackages[0]; const profile = retrievalProfiles.find((item) => item.packageId === target?.id); if (target && profile) evaluationMutation.mutate({ packageId: target.id, profileId: profile.id }); }}><Activity className="h-3.5 w-3.5" />运行评测</Button></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{evaluations.slice(0, 2).map((item) => { const packageItem = knowledgePackages.find((record) => record.id === item.packageId); return <article key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{packageItem?.name ?? item.packageId}</span><Badge tone={item.status === 'passed' ? 'success' : item.status === 'needs_review' ? 'warn' : 'error'}>{item.status === 'passed' ? '通过' : item.status === 'needs_review' ? '需复核' : '未通过'}</Badge></div><div className="mt-3 grid grid-cols-5 gap-2 text-[10px]"><MetricCell label="Recall@K" value={`${(item.recallAtK * 100).toFixed(0)}%`} /><MetricCell label="MRR" value={item.mrr.toFixed(2)} /><MetricCell label="nDCG" value={item.ndcg.toFixed(2)} /><MetricCell label="引用正确" value={`${(item.citationAccuracy * 100).toFixed(0)}%`} /><MetricCell label="P95" value={`${item.p95LatencyMs}ms`} /></div><div className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-muted)]">{item.baselineVersion} → {item.evaluatedVersion} · {new Date(item.evaluatedAt).toLocaleString('zh-CN')}</div></article>; })}</div></section>
          </>}

          {workspace === 'processing' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">接入与加工</div><p>接入企业数据源，按切片策略加工为可发布、可检索、可追溯的知识资产。</p></div><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" onClick={() => setReindexConfirm(true)}><RefreshCw className={cn('h-3.5 w-3.5', isReindexing && 'animate-spin')} />重建索引</Button><Button size="sm" onClick={() => setActiveModal('connectSource')}><Plus className="h-3.5 w-3.5" />接入数据源</Button></div></div>
            <div className="knowledge-source-list mt-4">{sourceConnections.map((source) => { const syncing = sourceSyncMutation.isPending && sourceSyncMutation.variables?.id === source.id; return <article key={source.id} className="knowledge-source-card"><div className="knowledge-source-card__icon"><Database className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{source.name}</strong><Badge tone={syncing || source.status === 'syncing' ? 'brand' : source.status === 'healthy' ? 'success' : 'warn'}>{syncing || source.status === 'syncing' ? '同步中' : source.status === 'healthy' ? '健康' : '需关注'}</Badge></div><p>{source.kind} · {source.documents} 个资产 · {source.schedule}</p><small><Clock3 className="mr-1 inline h-3 w-3" />最近同步：{source.lastSync}</small></div><Button size="sm" variant="secondary" disabled={syncing} onClick={() => syncSource(source.id)}>{syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}{source.status === 'attention' ? '重试同步' : '立即同步'}</Button></article>; })}</div>
            <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold">加工与索引任务</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">切片策略、索引版本和失败样本与发布版本一一对应。</p></div><div className="flex gap-2">{knowledgePackages.filter((item) => item.status !== 'published').slice(0, 1).map((item) => <Button key={item.id} size="sm" variant="secondary" disabled={processPackageMutation.isPending} onClick={() => processPackageMutation.mutate({ id: item.id, strategy: 'semantic' })}><PlayCircle className="h-3.5 w-3.5" />加工待审知识包</Button>)}</div></div><div className="mt-3 overflow-x-auto"><div className="min-w-[720px] divide-y divide-[var(--border)] text-xs"><div className="grid grid-cols-[1.25fr_.8fr_.8fr_.8fr_.8fr_auto] gap-3 px-2 py-2 text-[10px] text-[var(--text-muted)]"><span>任务来源</span><span>切片策略</span><span>状态</span><span>切片 / 文档</span><span>索引版本</span><span /></div>{processingJobs.map((job) => <div key={job.id} className="grid grid-cols-[1.25fr_.8fr_.8fr_.8fr_.8fr_auto] items-center gap-3 px-2 py-3"><span><strong className="block">{job.source}</strong><small className="text-[var(--text-muted)]">{new Date(job.startedAt).toLocaleString('zh-CN')}</small></span><span><Badge tone="info">{job.strategy === 'structured' ? '结构切片' : job.strategy === 'semantic' ? '语义切片' : job.strategy === 'table' ? '表格切片' : '固定窗口'}</Badge></span><span><Badge tone={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'error' : 'brand'}>{job.status === 'succeeded' ? '已完成' : job.status === 'failed' ? '失败' : job.status === 'running' ? '加工中' : '排队中'}</Badge></span><span className="font-mono">{job.chunkCount || '—'} / {job.documentCount}</span><span className="font-mono text-[10px] text-[var(--text-secondary)]">{job.indexVersion}</span><span>{job.status === 'failed' ? <button type="button" onClick={() => retryJobMutation.mutate({ id: job.id })} className="text-[11px] text-[var(--brand)] hover:underline">重试</button> : <span className="text-[10px] text-[var(--text-muted)]">{job.error ?? '可追溯'}</span>}</span></div>)}</div></div></section>
          </>}

          {workspace === 'graph' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">图谱与关联</div><p>从原始文档中抽取实体与关系，为影响分析和混合召回提供可回溯的业务上下文。</p></div><Badge tone="brand">证据溯源已启用</Badge></div>
            <KnowledgeGraphCanvas entities={graphEntities} relations={graphRelations} selectedEntityId={selectedGraphEntityId} onSelect={(id) => { setSelectedGraphEntityId(id); const entity = graphEntities.find((item) => item.id === id); if (entity) setGovernanceNotice(`实体「${entity.name}」来自文档 ${entity.sourceDocId} · ${entity.sourceVersion}。`); }} />
          </>}

          {workspace === 'governance' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">引用治理</div><p>管理权限、版本、风险策略，并追踪知识包对智能体和工作流的变更影响。</p></div><Badge tone="brand">审计已启用</Badge></div>
            <div className="knowledge-governance-grid mt-4"><section className="knowledge-governance-card"><div className="knowledge-section-title"><ShieldCheck className="h-3.5 w-3.5 text-[var(--brand)]" />访问与保留策略</div><div className="mt-3 space-y-2 text-xs"><div className="knowledge-policy-row"><span><strong>敏感数据检测</strong><small>上传后识别凭据、个人数据与机密内容</small></span><Badge tone={governance?.sensitiveDataDetection ? 'success' : 'warn'}>{governance?.sensitiveDataDetection ? '已启用' : '已暂停'}</Badge></div><label className="knowledge-policy-row"><span><strong>版本保留</strong><small>保留 {governance?.retentionDays ?? 365} 天版本，可审计和回滚</small></span><input type="checkbox" checked={governance?.versionRetention ?? true} disabled={governanceMutation.isPending} onChange={(event) => governanceMutation.mutate({ versionRetention: event.target.checked })} /></label><div className="knowledge-policy-row"><span><strong>高风险操作</strong><small>归档、删除和共享需责任人复核</small></span><Badge tone={governance?.highRiskChangeApproval ? 'warn' : 'error'}>{governance?.highRiskChangeApproval ? '受控' : '未受控'}</Badge></div></div></section><section className="knowledge-governance-card"><div className="knowledge-section-title"><Users className="h-3.5 w-3.5 text-[var(--brand)]" />智能体影响范围</div><div className="mt-3 space-y-2">{citationTrace.length ? citationTrace.slice(0, 3).map((citation) => <button key={citation.docId} type="button" onClick={() => setActiveModal('citationAgents')} className="knowledge-impact-row"><span className="min-w-0"><strong>{citation.title}</strong><small>最后引用：{citation.lastUsed}</small></span><span className="font-mono text-[var(--brand)]">{citation.citeCount} 次</span><ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" /></button>) : <EmptyState icon={Users} title="暂无引用影响" description="智能体使用知识后将在此追踪" />}</div></section></div>
            <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex items-center justify-between"><div className="knowledge-section-title"><Link2 className="h-3.5 w-3.5 text-[var(--brand)]" />已发布知识包引用</div><Badge tone="neutral">{consumerBindings.length} 个运行时绑定</Badge></div><div className="mt-3 overflow-x-auto"><div className="min-w-[720px] divide-y divide-[var(--border)] text-xs"><div className="grid grid-cols-[1.2fr_.9fr_.8fr_.8fr_.9fr] gap-3 px-2 py-2 text-[10px] text-[var(--text-muted)]"><span>知识包 / 版本</span><span>引用方</span><span>环境</span><span>无结果策略</span><span>检索配置</span></div>{consumerBindings.map((binding) => <div key={binding.id} className="grid grid-cols-[1.2fr_.9fr_.8fr_.8fr_.9fr] gap-3 px-2 py-3"><span><strong className="block">{binding.packageName}</strong><small className="font-mono text-[var(--text-muted)]">{binding.packageVersion}</small></span><span><Badge tone={binding.consumerType === 'agent' ? 'brand' : 'info'}>{binding.consumerType === 'agent' ? '智能体' : '工作流'}</Badge><small className="ml-1 text-[var(--text-muted)]">{binding.consumerName}</small></span><span>{binding.environment === 'production' ? '生产' : binding.environment === 'staging' ? '预发' : '沙箱'}</span><span>{binding.noResultPolicy === 'block' ? '阻断执行' : binding.noResultPolicy === 'handoff' ? '人工接管' : '请求澄清'}</span><span className="font-mono text-[10px]">{binding.profileId}</span></div>)}</div></div></section>
            <div className="knowledge-audit-note mt-4"><ShieldAlert className="h-4 w-4 text-[var(--warning)]" /><span>{knowledgeAudit[0] ? `${knowledgeAudit[0].time} · ${knowledgeAudit[0].action} · ${knowledgeAudit[0].target}` : governanceNotice}</span><button type="button" onClick={() => setWorkspace('assets')}>返回内容资产</button></div>
          </>}
        </main>
      </section>

      {/* 文档阅读器：阅读与检索运营分离，避免正文在工具抽屉中被截断。 */}
      <Modal
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title={docDetail ? `内容详情 · ${docDetail.title}` : '内容详情'}
        description={docDetail ? `${docDetail.source} · ${docDetail.version ?? 'v1.0'} · ${docDetail.author ?? '未指定责任人'}` : '加载文档内容中'}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setShowDetails(false)}>关闭</Button><Button variant="secondary" onClick={() => setEditingContent((editing) => !editing)}><Pencil className="h-3.5 w-3.5" />{editingContent ? '退出编辑' : '编辑内容'}</Button><Button variant="secondary" onClick={downloadOriginal}><Download className="h-3.5 w-3.5" />下载原文</Button><Button variant="secondary" disabled={!topChunks.length} onClick={() => { setShowDetails(false); setChunkDrawer(topChunks[0]); }}><Hash className="h-3.5 w-3.5" />查看关联切片</Button></>}
      >
        {docDetail && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
            <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3"><span className="flex items-center gap-2 text-xs font-semibold"><FileText className="h-4 w-4 text-[var(--brand)]" />文档正文</span><span className="font-mono text-[10px] text-[var(--text-muted)]">{docDetail.size} · {docDetail.chunks} chunks</span></div>
              <div className="h-[46vh] min-h-[320px] overflow-y-auto px-5 py-4">{editingContent ? <textarea defaultValue={docDetail.content} className="h-full w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 font-mono text-xs leading-6 outline-none focus:border-[var(--brand)]" onBlur={() => setGovernanceNotice(`内容「${docDetail.title}」编辑草稿已更新，发布前需完成复核。`)} /> : <MarkdownView text={docDetail.content} />}</div>
            </section>
            <aside className="space-y-3"><section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">文档信息</div><dl className="mt-3 space-y-2 text-[11px]"><div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">来源</dt><dd>{docDetail.source}</dd></div><div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">版本</dt><dd className="font-mono">{docDetail.version ?? 'v1.0'}</dd></div><div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">责任人</dt><dd>{docDetail.author ?? '—'}</dd></div><div className="flex justify-between gap-2"><dt className="text-[var(--text-muted)]">更新时间</dt><dd>{docDetail.updatedAt?.slice(0, 10) ?? '—'}</dd></div></dl></section><section className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand-light)]/35 p-3 text-[11px]"><div className="flex items-center gap-1.5 font-semibold text-[var(--brand)]"><TrendingUp className="h-3.5 w-3.5" />引用影响</div><p className="mt-2 leading-5 text-[var(--text-secondary)]">当前被 {docDetail.citeCount ?? 0} 个运行请求引用。版本变更前请在引用治理中确认影响范围。</p></section><button type="button" className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-left text-[11px] text-[var(--text-secondary)] hover:border-[var(--brand)]/35" onClick={() => { setShowDetails(false); setWorkspace('retrieval'); }}><span>前往检索与评测</span><ChevronRight className="h-3.5 w-3.5 text-[var(--brand)]" /></button></aside>
          </div>
        )}
        {docDetail && <section className="mt-4 grid gap-3 sm:grid-cols-3"><DetailInsight title="内容质量" items={[`完整度 ${docDetail.quality?.completeness ?? 96}%`, `时效性 ${docDetail.quality?.freshness ?? 92}%`, `引用正确率 ${docDetail.quality?.citationAccuracy ?? 97}%`]} /><DetailInsight title="加工与权限" items={[`策略：${docDetail.chunkStrategy ?? '结构切片'}`, `分级：${docDetail.classification ?? '内部'}`, `状态：${docDetail.status === 'ready' ? '已就绪' : '索引中'}`]} /><DetailInsight title="标签与版本" items={[...(docDetail.tags ?? []).map((tag: string) => `#${tag}`), ...(docDetail.versions ?? []).slice(0, 1).map((version: any) => `${version.version} · ${version.note}`)]} /></section>}

        {false && <>
        {/* 检索测试 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />检索测试
            </div>
            <button onClick={() => setSearchHistoryOpen(!searchHistoryOpen)} className="text-[10px] text-[var(--brand)] hover:underline">
              历史 ({searchHistory.length})
            </button>
          </div>
          <Input
            placeholder="输入测试问题..."
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testQuery.trim() && retrieveMutation.mutate({ query: testQuery, kb: 'all' })}
          />
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="flex-1" disabled={!testQuery.trim() || retrieveMutation.isPending} onClick={() => retrieveMutation.mutate({ query: testQuery, kb: 'all' })}>
              <Search className="h-3.5 w-3.5" />{retrieveMutation.isPending ? '检索中…' : '检索'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setTestQuery('')} title="清空">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* 当前检索结果 */}
          {testQuery.trim() && (
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1.5">
                <span>匹配 {searchResults.length} 个 Chunk</span>
                {searchResults.length > 0 && <Badge tone="brand">Top {(searchResults[0].score * 100).toFixed(0)}%</Badge>}
              </div>
              {searchResults.length === 0 ? (
                <EmptyState icon={Search} title="无匹配结果" description="尝试换个关键词" />
              ) : (
                <div className="space-y-1.5">
                  {searchResults.slice(0, 3).map((c) => (
                    <div
                      key={c.idx}
                      onClick={() => setChunkDrawer(c)}
                      className="cursor-pointer rounded border border-[var(--border)] bg-[var(--bg)] p-1.5 text-[11px] hover:border-[var(--brand)]"
                    >
                      <div className="font-mono text-[var(--brand)] text-[10px]">[{c.idx}] {c.source}</div>
                      <div className="line-clamp-2 text-[10px] text-[var(--text-muted)] mt-0.5">{c.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* 历史记录 */}
          {searchHistoryOpen && (
            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {searchHistory.map((h) => (
                <div
                  key={h.id}
                  onClick={() => setTestQuery(h.query)}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px] hover:border-[var(--brand)] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{h.time}</span>
                    <Badge tone="info" className="text-[9px]">{h.kb}</Badge>
                  </div>
                  <div className="mt-0.5 truncate">{h.query}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{h.results} 条 · Top {(h.topScore * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top-K Chunks */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              Top-5 Chunks
              <Badge tone="success" className="ml-1 text-[10px]">实时</Badge>
            </div>
            <button onClick={handleRescore} className="text-[10px] text-[var(--brand)] hover:underline">重新评分</button>
          </div>
          <div className="space-y-2">
            {topChunks.slice(0, 5).map((c) => (
              <button
                key={c.idx}
                onClick={() => setChunkDrawer(c)}
                className="block w-full text-left rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 hover:border-[var(--brand)] transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-mono text-[var(--brand)] text-[10px] font-bold">[{c.idx}]</span>
                  <span className="font-semibold text-[11px] truncate flex-1">{c.source}</span>
                  {c.page && <Badge tone="info" className="text-[9px]">p.{c.page}</Badge>}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] line-clamp-2">{c.text}</div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="font-mono text-[var(--text-muted)]">相关度</span>
                  <span className="text-[var(--success)] font-bold font-mono">{(c.score * 100).toFixed(0)}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 引用追踪 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />引用追踪（最热）
            </div>
            {activeCitation && (
              <button
                onClick={() => setActiveModal('citationAgents')}
                className="text-[10px] text-[var(--brand)] hover:underline flex items-center gap-0.5"
              >
                <Sparkles className="h-3 w-3" />关联智能体
              </button>
            )}
          </div>
          {citationTrace.length === 0 ? (
            <EmptyState icon={TrendingUp} title="暂无引用" description="当智能体引用文档时将出现在此" />
          ) : (
            <div className="space-y-2">
              {citationTrace.map((c) => (
                <div key={c.docId} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold truncate flex-1">{c.title}</span>
                    <Badge tone="brand" className="text-[9px]">{c.citeCount}</Badge>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">最后引用: {c.lastUsed}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.usedBy.map((u: string) => (
                      <span key={u} className="px-1.5 py-0.5 bg-[var(--bg)] rounded text-[9px] font-mono text-[var(--text-secondary)]">{u}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 评估指标 */}
        <div className="p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />评估指标
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EvalCard label="召回率" value={`${evalMetrics?.recall ?? 92}%`} tone="success" />
            <EvalCard label="准确率" value={`${evalMetrics?.precision ?? 88}%`} tone="info" />
            <EvalCard label="P95 延迟" value={`${evalMetrics?.p95Latency ?? 320}ms`} tone="primary" />
            <EvalCard label="缓存命中" value={`${evalMetrics?.hitRate ?? 32}%`} tone="purple" />
          </div>
        </div>
        </>}
      </Modal>

      {/* ====== Modals ====== */}

      <NewKnowledgePackageModal
        open={activeModal === 'newPackage'}
        onClose={() => setActiveModal(null)}
        onSubmit={(form) => createPackageMutation.mutate(form)}
      />

      <ConnectSourceModal
        open={activeModal === 'connectSource'}
        onClose={() => setActiveModal(null)}
        onSubmit={connectSource}
      />

      <UploadDocModal
        open={activeModal === 'upload'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleUploadDoc}
      />

      <ConfirmDialog
        open={reindexConfirm}
        onClose={() => setReindexConfirm(false)}
        onConfirm={handleReindex}
        title="重新索引"
        description="将对全部知识内容重新执行 Embed + Index，预计耗时 5-10 分钟，期间检索仍可使用旧索引。"
        confirmText="开始重建"
      />

      <CitationAgentsModal
        open={activeModal === 'citationAgents'}
        onClose={() => setActiveModal(null)}
        citation={activeCitation}
      />

      {/* Chunk 详情 Drawer */}
      <Drawer
        open={!!chunkDrawer}
        onClose={() => setChunkDrawer(null)}
        title={chunkDrawer ? `Chunk [${chunkDrawer.idx}] · 详情` : ''}
        description={chunkDrawer ? `相关度 ${(chunkDrawer.score * 100).toFixed(0)}%` : ''}
        width={520}
      >
        {chunkDrawer && (
          <div className="space-y-3 text-xs">
            <DrawerField label="来源" value={chunkDrawer.source} />
            {chunkDrawer.page && <DrawerField label="页码" value={`p.${chunkDrawer.page}`} mono />}
            <DrawerField label="相关度" value={<Badge tone="success">{(chunkDrawer.score * 100).toFixed(0)}%</Badge>} />
            <DrawerField label="所属文档" value="Redis 故障 Runbook v3.2" />
            <DrawerField label="Token 数" value="128" mono />
            <DrawerField label="Embedding 模型" value="BGE-M3" mono />
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">原文片段</div>
              <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-3 text-[11px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                {chunkDrawer.text}
              </div>
            </div>
            <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
              <Button size="sm" variant="secondary" className="flex-1" onClick={handleRescore}>
                <RefreshCw className="h-3 w-3" />重新评分
              </Button>
              <Button size="sm" className="flex-1">
                <ExternalLink className="h-3 w-3" />查看原文
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ===== 子组件 ===== */

function KnowledgeMetric({ label, value, meta, icon: Icon, tone }: { label: string; value: string; meta: string; icon: any; tone: 'brand' | 'warning' | 'success' | 'info' }) {
  const toneClass = tone === 'success' ? 'knowledge-metric__icon--success' : tone === 'warning' ? 'knowledge-metric__icon--warning' : tone === 'info' ? 'knowledge-metric__icon--info' : 'knowledge-metric__icon--brand';
  return <div className="knowledge-metric"><span className={cn('knowledge-metric__icon', toneClass)}><Icon className="h-4 w-4" /></span><span><small>{label}</small><strong>{value}</strong><em>{meta}</em></span></div>;
}

function EvalCard({ label, value, tone }: { label: string; value: string; tone: 'success' | 'info' | 'primary' | 'purple' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'info' ? 'text-[var(--info)]' : tone === 'primary' ? 'text-[var(--brand)]' : 'text-[var(--purple)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-bold font-mono', color)}>{value}</div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return <span><small className="block truncate text-[var(--text-muted)]">{label}</small><strong className="mt-0.5 block font-mono text-[11px]">{value}</strong></span>;
}

function DetailInsight({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</div><div className="mt-2 space-y-1.5">{items.map((item) => <div key={item} className="truncate text-[11px] text-[var(--text-secondary)]">{item}</div>)}</div></section>;
}

const GRAPH_NODE_POSITIONS: Record<string, [number, number]> = {
  'kge-api': [135, 96], 'kge-redis': [368, 125], 'kge-runbook': [600, 96], 'kge-owner': [604, 268], 'kge-cve': [138, 266],
};

function KnowledgeGraphCanvas({ entities, relations, selectedEntityId, onSelect }: { entities: KnowledgeGraphEntity[]; relations: KnowledgeGraphRelation[]; selectedEntityId: string | null; onSelect: (id: string) => void }) {
  const [activeType, setActiveType] = useState<KnowledgeGraphEntity['type'] | 'all'>('all');
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const visibleEntities = activeType === 'all' ? entities : entities.filter((entity) => entity.type === activeType);
  const entityIds = new Set(visibleEntities.map((entity) => entity.id));
  const visibleRelations = relations.filter((relation) => entityIds.has(relation.fromId) && entityIds.has(relation.toId));
  const selectedRelation = relations.find((relation) => relation.id === selectedRelationId);
  useEffect(() => {
    if (!selectedEntityId) return;
    const related = relations.find((relation) => relation.fromId === selectedEntityId || relation.toId === selectedEntityId);
    setSelectedRelationId(related?.id ?? null);
  }, [selectedEntityId, relations]);
  const typeOptions: Array<{ key: KnowledgeGraphEntity['type'] | 'all'; label: string }> = [{ key: 'all', label: '全部实体' }, { key: 'service', label: '服务' }, { key: 'asset', label: '资产' }, { key: 'runbook', label: 'Runbook' }, { key: 'vulnerability', label: '漏洞' }, { key: 'owner', label: '责任团队' }];
  const relationFrom = selectedRelation ? entities.find((entity) => entity.id === selectedRelation.fromId) : null;
  const relationTo = selectedRelation ? entities.find((entity) => entity.id === selectedRelation.toId) : null;
  return <><div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2"><div className="flex flex-wrap gap-1">{typeOptions.map((option) => <button key={option.key} type="button" onClick={() => { setActiveType(option.key); setSelectedRelationId(null); }} className={cn('rounded-md px-2.5 py-1.5 text-[11px] transition-colors', activeType === option.key ? 'bg-[var(--surface-1)] font-semibold text-[var(--brand)] shadow-[0_1px_2px_rgba(15,23,42,.06)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-1)]')}>{option.label}</button>)}</div><span className="text-[10px] text-[var(--text-muted)]">显示 {visibleEntities.length} 个实体 / {visibleRelations.length} 条关系</span></div><KnowledgeGraphCanvasReadonly entities={visibleEntities} relations={visibleRelations} selectedEntityId={selectedEntityId} onSelect={onSelect} /><section className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex items-center justify-between"><div className="text-xs font-semibold">关系证据</div><span className="text-[10px] text-[var(--text-muted)]">点击关系查看来源</span></div><div className="mt-2 flex flex-wrap gap-2">{visibleRelations.map((relation) => <button key={relation.id} type="button" onClick={() => setSelectedRelationId(relation.id)} className={cn('rounded-md border px-2.5 py-1.5 text-[11px] transition-colors', selectedRelationId === relation.id ? 'border-[var(--brand)]/30 bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]/30')}><span>{entities.find((entity) => entity.id === relation.fromId)?.name}</span><span className="mx-1 text-[var(--text-muted)]">{relation.type}</span><span>{entities.find((entity) => entity.id === relation.toId)?.name}</span></button>)}</div>{selectedRelation && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-[11px]"><strong>{relationFrom?.name} → {relationTo?.name}</strong><span className="text-[var(--text-muted)]">关系：{selectedRelation.type}</span><span className="text-[var(--text-muted)]">来源：{selectedRelation.sourceDocId} · {selectedRelation.sourceVersion}</span><span className="font-mono text-[var(--success)]">置信度 {(selectedRelation.confidence * 100).toFixed(0)}%</span></div>}</section></>;
}

function GraphViewport({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const updateZoom = (next: number) => setZoom(Math.min(1.5, Math.max(.7, Number(next.toFixed(2)))));
  const style = { '--knowledge-graph-zoom': String(zoom), '--knowledge-graph-x': `${offset.x}px`, '--knowledge-graph-y': `${offset.y}px` } as CSSProperties;
  return <div className="knowledge-graph-viewport" style={style} onPointerDown={(event) => { if (!(event.target as Element).closest('.knowledge-graph-canvas')) return; dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const drag = dragRef.current; if (!drag) return; setOffset({ x: drag.offsetX + event.clientX - drag.x, y: drag.offsetY + event.clientY - drag.y }); }} onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); }} onPointerCancel={() => { dragRef.current = null; }} onWheel={(event) => { if (!(event.target as Element).closest('.knowledge-graph-canvas')) return; event.preventDefault(); updateZoom(zoom + (event.deltaY > 0 ? -.1 : .1)); }}><div className="knowledge-graph-viewport__controls"><Button size="sm" variant="ghost" disabled={zoom <= .7} onClick={() => updateZoom(zoom - .1)}>−</Button><Button size="sm" variant="ghost" disabled={zoom >= 1.5} onClick={() => updateZoom(zoom + .1)}>＋</Button><Button size="sm" variant="ghost" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>复位</Button><span>{Math.round(zoom * 100)}%</span></div>{children}</div>;
}

function KnowledgeGraphCanvasReadonly({ entities, relations, selectedEntityId, onSelect }: { entities: KnowledgeGraphEntity[]; relations: KnowledgeGraphRelation[]; selectedEntityId: string | null; onSelect: (id: string) => void }) {
  return <KnowledgeGraphCanvasStatic entities={entities} relations={relations} selectedEntityId={selectedEntityId} onSelect={onSelect} />;
}

function KnowledgeGraphNode({ data, selected }: { data: { entity: KnowledgeGraphEntity }; selected: boolean }) {
  const { entity } = data;
  const palette = entity.type === 'asset' ? ['#eef2ff', '#818cf8', '#4f46e5'] : entity.type === 'service' ? ['#eff6ff', '#60a5fa', '#2563eb'] : entity.type === 'runbook' ? ['#ecfdf5', '#34d399', '#047857'] : entity.type === 'vulnerability' ? ['#fff7ed', '#fb923c', '#c2410c'] : ['#f5f3ff', '#a78bfa', '#7c3aed'];
  return <><Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--brand)]" /><div className="min-w-[130px] rounded-[10px] border px-3 py-2" style={{ borderColor: selected ? '#4f46e5' : palette[1], borderWidth: selected ? 2 : 1, background: palette[0], boxShadow: selected ? '0 0 0 3px rgba(79,70,229,.12)' : '0 1px 2px rgba(15,23,42,.05)' }}><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-md bg-white/80 text-[10px] font-bold" style={{ color: palette[2] }}>{entity.type.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-[11px] text-[var(--text)]">{entity.name}</strong><small className="block text-[9px] text-[var(--text-muted)]">{entity.type} · {(entity.confidence * 100).toFixed(0)}%</small></span></div></div><Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--brand)]" /></>;
}
const KNOWLEDGE_GRAPH_NODE_TYPES = { knowledgeGraph: KnowledgeGraphNode };

function KnowledgeGraphCanvasStatic({ entities, relations, selectedEntityId, onSelect }: { entities: KnowledgeGraphEntity[]; relations: KnowledgeGraphRelation[]; selectedEntityId: string | null; onSelect: (id: string) => void }) {
  const initialNodes = useMemo<Node[]>(() => entities.map((entity, index) => { const [x, y] = GRAPH_NODE_POSITIONS[entity.id] ?? [80 + (index % 4) * 180, 50 + Math.floor(index / 4) * 130]; return { id: entity.id, type: 'knowledgeGraph', position: { x, y }, data: { entity } }; }), [entities]);
  const initialEdges = useMemo<Edge[]>(() => relations.map((relation) => ({ id: relation.id, source: relation.fromId, target: relation.toId, label: relation.type, animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 1.5 }, labelStyle: { fill: '#64748b', fontSize: 10 }, labelBgStyle: { fill: 'var(--surface-1)', fillOpacity: 1 }, updatable: true })), [relations]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);
  return <div className="knowledge-reactflow-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={KNOWLEDGE_GRAPH_NODE_TYPES} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => onSelect(node.id)} nodesDraggable edgesUpdatable elementsSelectable defaultViewport={{ x: 0, y: 0, zoom: 1 }} minZoom={.55} maxZoom={1.8} proOptions={{ hideAttribution: true }}><Background gap={18} size={1} color="#e2e8f0" /><Controls showInteractive={false} /></ReactFlow></div>;
}

function KnowledgeGraphCanvasLegacy({ entities, relations, selectedEntityId, onSelect }: { entities: KnowledgeGraphEntity[]; relations: KnowledgeGraphRelation[]; selectedEntityId: string | null; onSelect: (id: string) => void }) {
  const positionFor = (entity: KnowledgeGraphEntity, index: number): [number, number] => GRAPH_NODE_POSITIONS[entity.id] ?? [130 + (index % 4) * 170, 90 + Math.floor(index / 4) * 150];
  const selected = entities.find((entity) => entity.id === selectedEntityId) ?? entities[0];
  const toneFor = (type: KnowledgeGraphEntity['type']) => type === 'asset' ? { fill: '#eef2ff', stroke: '#818cf8', text: '#4f46e5' } : type === 'service' ? { fill: '#eff6ff', stroke: '#60a5fa', text: '#2563eb' } : type === 'runbook' ? { fill: '#ecfdf5', stroke: '#34d399', text: '#047857' } : type === 'vulnerability' ? { fill: '#fff7ed', stroke: '#fb923c', text: '#c2410c' } : { fill: '#f5f3ff', stroke: '#a78bfa', text: '#7c3aed' };
  const typeLabel = (type: KnowledgeGraphEntity['type']) => ({ service: '服务', asset: '资产', runbook: 'Runbook', alert: '告警', vulnerability: '漏洞', owner: '责任团队' }[type]);
  return <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="knowledge-section-title"><Network className="h-3.5 w-3.5 text-[var(--brand)]" />知识关系图谱 <Badge tone="neutral">{entities.length} 个实体 · {relations.length} 条关系</Badge></div><p className="mt-1 text-[11px] text-[var(--text-muted)]">选择节点查看来源证据；关系边表示已抽取且可追溯的业务依赖。</p></div><div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-muted)]"><span>● 服务</span><span>● 资产</span><span>● Runbook</span><span>● 漏洞</span><span>● 责任团队</span></div></div><div className="knowledge-graph-canvas mt-4"><svg viewBox="0 0 740 360" role="img" aria-label="知识图谱实体与关系" preserveAspectRatio="xMidYMid meet"><defs><marker id="knowledge-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs><g>{relations.map((relation) => { const fromIndex = entities.findIndex((entity) => entity.id === relation.fromId); const toIndex = entities.findIndex((entity) => entity.id === relation.toId); const from = entities[fromIndex]; const to = entities[toIndex]; if (!from || !to) return null; const [x1, y1] = positionFor(from, fromIndex); const [x2, y2] = positionFor(to, toIndex); return <g key={relation.id}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#knowledge-graph-arrow)" /><rect x={(x1 + x2) / 2 - 30} y={(y1 + y2) / 2 - 11} width="60" height="18" rx="9" fill="var(--surface-1)" stroke="#e2e8f0" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 3.5} textAnchor="middle" fontSize="9" fill="#64748b">{relation.type}</text></g>; })}</g><g>{entities.map((entity, index) => { const [x, y] = positionFor(entity, index); const tone = toneFor(entity.type); const active = entity.id === selected?.id; return <g key={entity.id} transform={`translate(${x} ${y})`} className="knowledge-graph-node" onClick={() => onSelect(entity.id)} role="button" tabIndex={0} aria-label={`选择实体 ${entity.name}`} onKeyDown={(event) => event.key === 'Enter' && onSelect(entity.id)}><rect x="-74" y="-30" width="148" height="60" rx="10" fill={tone.fill} stroke={active ? '#4f46e5' : tone.stroke} strokeWidth={active ? 2.2 : 1.2} /><circle cx="-54" cy="0" r="11" fill="var(--surface-1)" stroke={tone.stroke} /><circle cx="-54" cy="0" r="4" fill={tone.text} /><text x="-35" y="-4" fontSize="11" fontWeight="600" fill="#1e293b">{entity.name.length > 16 ? `${entity.name.slice(0, 15)}…` : entity.name}</text><text x="-35" y="14" fontSize="9" fill="#64748b">{typeLabel(entity.type)} · {(entity.confidence * 100).toFixed(0)}%</text></g>; })}</g></svg></div>{selected && <div className="mt-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><span className="min-w-0"><strong className="block text-xs">{selected.name}</strong><small className="mt-1 block text-[10px] text-[var(--text-muted)]">{typeLabel(selected.type)} · 来自 {selected.sourceDocId} · {selected.sourceVersion}</small></span><span className="text-[11px]"><small className="block text-[var(--text-muted)]">抽取置信度</small><strong className="font-mono text-[var(--success)]">{(selected.confidence * 100).toFixed(0)}%</strong></span><span className="text-[11px]"><small className="block text-[var(--text-muted)]">关联关系</small><strong>{relations.filter((relation) => relation.fromId === selected.id || relation.toId === selected.id).length} 条</strong></span><button type="button" className="text-left text-[11px] text-[var(--brand)] hover:underline" onClick={() => setTimeout(() => document.getElementById('knowledge-graph-evidence')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)}>查看证据</button></div>}<div id="knowledge-graph-evidence" className="mt-3 rounded-lg bg-[var(--brand-light)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"><Brain className="mr-1 inline h-3.5 w-3.5 text-[var(--brand)]" />图谱用于扩展候选证据；实际回答仍需完成权限过滤、混合召回与引用校验。</div></section>;
}

function DrawerField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}

function NewKnowledgePackageModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (form: { name: string; description: string; domain: string; classification: KnowledgePackage['classification'] }) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('SRE');
  const [classification, setClassification] = useState<KnowledgePackage['classification']>('internal');
  return <Modal open={open} onClose={onClose} title="新建知识包" description="知识包是供智能体和工作流引用的版本化知识能力。创建后需经过加工、评测和发布才可被绑定。" size="md" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), description: description.trim(), domain, classification })}>创建知识包</Button></>}><div className="space-y-3"><Field label="知识包名称" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：生产故障处置知识包" /></Field><Field label="业务域"><Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="例如：SRE、安全、财务" /></Field><Field label="说明"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明适用范围、主要来源与使用边界" /></Field><Field label="数据分级"><select value={classification} onChange={(event) => setClassification(event.target.value as KnowledgePackage['classification'])} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"><option value="internal">内部</option><option value="confidential">机密</option><option value="restricted">受限</option></select></Field><div className="rounded-lg border border-[var(--brand)]/20 bg-[var(--brand-light)] p-3 text-[11px] text-[var(--text-secondary)]"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-[var(--brand)]" />发布前将检查加工索引、检索评测和引用影响；本地环境为 Mock 流程演示。</div></div></Modal>;
}

function ConnectSourceModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (form: { name: string; kind: string; schedule: string }) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('REST API');
  const [schedule, setSchedule] = useState('每 1 小时');
  return <Modal open={open} onClose={onClose} title="接入数据源" description="接入后的首次同步、字段校验和访问策略将被记录到知识审计。" size="md" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), kind, schedule })}>确认接入</Button></>}><div className="space-y-3"><Field label="数据源名称" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：生产变更记录库" /></Field><Field label="连接类型"><select value={kind} onChange={(event) => setKind(event.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"><option>REST API</option><option>Git / Markdown</option><option>Webhook</option><option>数据库只读连接</option></select></Field><Field label="同步策略"><select value={schedule} onChange={(event) => setSchedule(event.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"><option>每 30 分钟</option><option>每 1 小时</option><option>每 6 小时</option><option>手动同步</option></select></Field><div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-3 text-[11px] text-[var(--text-secondary)]"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />本页面为本地 mock 接入；生产环境应由连接器凭据、权限校验与同步任务 API 承接。</div></div></Modal>;
}

function UploadDocModal({
  open, onClose, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { title: string; source: string; tags: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState(KB_TYPE_OPTIONS[0]);
  const [tags, setTags] = useState('');
  const [dragging, setDragging] = useState(false);
  const valid = title.trim().length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="上传文档"
      description="支持 PDF / Word / Markdown / 纯文本，自动提取并切片"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ title: title.trim(), source, tags }); setTitle(''); setTags(''); }}>
            开始上传
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); setTitle((t) => t || e.dataTransfer.files?.[0]?.name || ''); }}
          className={cn(
            'rounded-lg border-2 border-dashed py-8 text-center transition-colors',
            dragging ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]',
          )}
        >
          <Upload className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-2 text-xs text-[var(--text)]">拖拽文件到此处，或点击下方输入文件名</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">最大 50MB · 多文件请打包为 zip</p>
        </div>
        <Field label="文件名" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：redis-runbook-v3.3.md" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="文档分类">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"
            >
              {KB_TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="标签 (逗号分隔)">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="redis, oom, l2" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function CitationAgentsModal({
  open, onClose, citation,
}: {
  open: boolean;
  onClose: () => void;
  citation: any;
}) {
  return (
    <Modal open={open} onClose={onClose} title="引用此文档的智能体" size="md">
      {!citation ? (
        <EmptyState icon={Sparkles} title="暂无数据" />
      ) : (
        <div className="space-y-2">
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
            <div className="font-semibold text-sm">{citation.title}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">最近引用 {citation.lastUsed} · 累计 {citation.citeCount} 次</div>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-2 mb-1">引用方</div>
          <div className="grid grid-cols-2 gap-2">
            {(citation.usedBy ?? []).map((u: string) => (
              <div key={u} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs flex items-center justify-between">
                <span className="font-mono">{u}</span>
                <Badge tone="brand" className="text-[9px]">{Math.floor(Math.random() * 30) + 5} 次</Badge>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">提示：升级文档版本时，所有引用方将在下次检索时自动切换到新版本。</p>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="text-[var(--danger)]"> *</span>}
      </label>
      {children}
    </div>
  );
}
