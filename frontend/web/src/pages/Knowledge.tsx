/**
 * P7 知识库（企业级优化版）
 * 增强：所有按钮接入交互，纯前端 state 化演示。
 */
import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, useEdgesState, useNodesState, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Input, KpiCard } from '@de/web-ui';
import {
  Database, FileText, Brain, Layers, Search, Upload, ShieldCheck, BookOpen,
  Plus, Eye, RefreshCw, Tag as TagIcon, Download,
  CheckCircle2, Clock3, Link2, RotateCcw, ShieldAlert,
  Users, Network, Boxes, PlayCircle, Pencil, TrendingUp, Activity, Hash, ChevronRight,
  ExternalLink, Sparkles,
} from 'lucide-react';
import type { KnowledgeAuditEvent, KnowledgeConsumerBinding, KnowledgeDoc, KnowledgeEvaluation, KnowledgeGovernancePolicy, KnowledgeGraphEntity, KnowledgeGraphRelation, KnowledgePackage, KnowledgeProcessingJob, KnowledgeRetrievalProfile, KnowledgeRetrievalResult, KnowledgeSourceConnection } from '@de/web-types';
import { cn } from '@de/web-utils';
import { Modal, ConfirmDialog, EmptyState } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useT } from '@/i18n';

type PipelineTarget = 'sources' | 'jobs' | 'retrieval';
type PipelineTone = 'default' | 'active' | 'attention';

const PIPELINE: Array<{
  key: string;
  label: string;
  icon: typeof Upload;
  capability: string;
  target: PipelineTarget;
}> = [
  { key: 'ingest', label: '接入', icon: Upload, capability: 'Tika + PaddleOCR', target: 'sources' },
  { key: 'chunk', label: '切片', icon: FileText, capability: '512 tokens · 64 overlap', target: 'jobs' },
  { key: 'embed', label: '向量化', icon: Brain, capability: 'BGE-M3 · 1024 维', target: 'jobs' },
  { key: 'index', label: '索引', icon: Layers, capability: 'Milvus HNSW', target: 'jobs' },
  { key: 'retrieve', label: '检索', icon: Search, capability: 'Top-K=8 + Rerank', target: 'retrieval' },
];

const OWNER_LABEL: Record<string, string> = { u1: '平台管理员', u2: '业务构建者', u3: '合规审计员' };

function docVersionFromTitle(title: string) {
  return title.match(/v[\d.]+/i)?.[0] ?? 'v1.0';
}

function docOwnerLabel(doc: KnowledgeDoc) {
  return OWNER_LABEL[doc.ownerId ?? 'u1'] ?? '未指定';
}

const KB_TYPE_OPTIONS = ['Runbook', 'CMDB', 'CVE', 'SIEM', 'Postmortem', '变更方案', '合规文档'];
const CONTENT_PAGE_SIZE = 10;

// Markdown → HTML（知识正文阅读渲染）
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function MarkdownView({ text }: { text: string }) {
  const html = useMemo(() => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const out: string[] = [];
    let inUl = false;
    let inOl = false;
    let inQuote = false;
    let inCode = false;
    let codeLang = '';
    let codeBuf: string[] = [];
    let quoteBuf: string[] = [];

    const closeLists = () => {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    };
    const flushQuote = () => {
      if (!inQuote) return;
      out.push(`<blockquote><p>${quoteBuf.join('<br />')}</p></blockquote>`);
      quoteBuf = [];
      inQuote = false;
    };
    const flushCode = () => {
      if (!inCode) return;
      const body = escapeHtml(codeBuf.join('\n'));
      out.push(`<pre class="knowledge-md__pre"><code class="language-${escapeHtml(codeLang || 'text')}">${body}</code></pre>`);
      codeBuf = [];
      codeLang = '';
      inCode = false;
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        closeLists();
        flushQuote();
        if (!inCode) {
          inCode = true;
          codeLang = trimmed.slice(3).trim() || 'text';
          codeBuf = [];
        } else {
          flushCode();
        }
        continue;
      }
      if (inCode) {
        codeBuf.push(raw);
        continue;
      }

      if (/^>\s?/.test(line)) {
        closeLists();
        if (!inQuote) inQuote = true;
        quoteBuf.push(formatInlineMarkdown(line.replace(/^>\s?/, '')));
        continue;
      }
      if (inQuote) flushQuote();

      if (/^### (.+)$/.test(line)) {
        closeLists();
        out.push(`<h3>${formatInlineMarkdown(line.replace(/^### /, ''))}</h3>`);
      } else if (/^## (.+)$/.test(line)) {
        closeLists();
        out.push(`<h2>${formatInlineMarkdown(line.replace(/^## /, ''))}</h2>`);
      } else if (/^# (.+)$/.test(line)) {
        closeLists();
        out.push(`<h1>${formatInlineMarkdown(line.replace(/^# /, ''))}</h1>`);
      } else if (/^[-*] (.+)$/.test(line)) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${formatInlineMarkdown(line.replace(/^[-*] /, ''))}</li>`);
      } else if (/^\d+\. (.+)$/.test(line)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${formatInlineMarkdown(line.replace(/^\d+\. /, ''))}</li>`);
      } else if (/^---+$/.test(trimmed)) {
        closeLists();
        out.push('<hr />');
      } else if (!trimmed) {
        closeLists();
      } else {
        closeLists();
        out.push(`<p>${formatInlineMarkdown(line)}</p>`);
      }
    }
    flushCode();
    flushQuote();
    closeLists();
    return out.join('');
  }, [text]);
  return <article className="knowledge-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

type ModalKind = 'upload' | 'reindex' | 'citationAgents' | 'connectSource' | 'newPackage' | null;
type KnowledgeWorkspace = 'assets' | 'processing' | 'retrieval' | 'graph' | 'governance';
type AssetsView = 'docs' | 'packages';

export default function Knowledge() {
  const { t } = useT();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const canWrite = Boolean(user?.permissions.includes('knowledge.write'));
  const currentWorkspace = useWorkspaceStore((state) => state.current);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId ?? 'w1');
  const scopeKey = `${currentWorkspaceId}:${user?.id ?? 'anonymous'}`;
  const workspaceName = currentWorkspace?.name ?? 'ACME 生产';

  const [workspace, setWorkspace] = useState<KnowledgeWorkspace>('assets');
  const [assetsView, setAssetsView] = useState<AssetsView>('docs');
  const [highlightedPackageId, setHighlightedPackageId] = useState<string | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState<'all' | 'running' | 'succeeded' | 'failed'>('all');
  const [docPreviewId, setDocPreviewId] = useState<string | null>('k1');
  const [chunkDrawer, setChunkDrawer] = useState<any | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [reindexConfirm, setReindexConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'indexing'>('all');
  const [contentPage, setContentPage] = useState(1);
  const [selectedGraphEntityId, setSelectedGraphEntityId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [governanceNotice, setGovernanceNotice] = useState('所有知识资产均处于可追溯治理范围内');
  const sourcesSectionRef = useRef<HTMLElement>(null);
  const jobsSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const packageId = searchParams.get('package');
    const view = searchParams.get('view');
    if (!packageId && view !== 'packages') return;
    setWorkspace('assets');
    if (view === 'packages' || packageId) setAssetsView('packages');
    if (packageId) {
      setHighlightedPackageId(packageId);
      setGovernanceNotice('已定位记忆晋升生成的知识包草稿，请完成加工与评测后发布。');
    }
  }, [searchParams]);

  const isAssets = workspace === 'assets';
  const isProcessing = workspace === 'processing';
  const isRetrieval = workspace === 'retrieval';
  const isGraph = workspace === 'graph';
  const isGovernance = workspace === 'governance';

  const { data: docs = [] } = useApiQuery<KnowledgeDoc[]>(['knowledge', 'docs', scopeKey], '/api/knowledge/docs', undefined, { enabled: isAssets });
  const { data: docDetail } = useApiQuery<any>(['doc', docPreviewId, scopeKey], `/api/knowledge/doc/${docPreviewId ?? 'k1'}`, undefined, { enabled: isAssets && Boolean(docPreviewId) && showDetails });
  const { data: citationTrace = [] } = useApiQuery<any[]>(['citation-trace', scopeKey], '/api/knowledge/citation-trace', undefined, { enabled: isAssets || isGovernance });
  const { data: evalMetrics } = useApiQuery<any>(['eval', scopeKey], '/api/knowledge/eval', undefined, { enabled: isAssets || isRetrieval });
  const { data: topChunks = [] } = useApiQuery<KnowledgeRetrievalResult[]>(['knowledge', 'chunks', 'top', scopeKey], '/api/knowledge/chunks/top', undefined, { enabled: isAssets || isRetrieval });
  const { data: sourceConnections = [] } = useApiQuery<KnowledgeSourceConnection[]>(['knowledge', 'sources', scopeKey], '/api/knowledge/sources', undefined, { enabled: isProcessing });
  const { data: governance } = useApiQuery<KnowledgeGovernancePolicy>(['knowledge', 'governance', scopeKey], '/api/knowledge/governance', undefined, { enabled: isGovernance });
  const { data: knowledgeAudit = [] } = useApiQuery<KnowledgeAuditEvent[]>(['knowledge', 'audit', scopeKey], '/api/knowledge/audit', undefined, { enabled: isGovernance });
  const { data: knowledgePackages = [] } = useApiQuery<KnowledgePackage[]>(['knowledge', 'packages', scopeKey], '/api/knowledge/packages', undefined, { enabled: isAssets || isRetrieval || isProcessing });
  const { data: processingJobs = [] } = useApiQuery<KnowledgeProcessingJob[]>(['knowledge', 'processing-jobs', scopeKey], '/api/knowledge/processing-jobs', undefined, { enabled: isProcessing });
  const { data: retrievalProfiles = [] } = useApiQuery<KnowledgeRetrievalProfile[]>(['knowledge', 'retrieval-profiles', scopeKey], '/api/knowledge/retrieval-profiles', undefined, { enabled: isRetrieval });
  const { data: evaluations = [] } = useApiQuery<KnowledgeEvaluation[]>(['knowledge', 'evaluations', scopeKey], '/api/knowledge/evaluations', undefined, { enabled: isRetrieval });
  const { data: graphEntities = [] } = useApiQuery<KnowledgeGraphEntity[]>(['knowledge', 'graph-entities', scopeKey], '/api/knowledge/graph/entities', undefined, { enabled: isGraph });
  const { data: graphRelations = [] } = useApiQuery<KnowledgeGraphRelation[]>(['knowledge', 'graph-relations', scopeKey], '/api/knowledge/graph/relations', undefined, { enabled: isGraph });
  const { data: consumerBindings = [] } = useApiQuery<KnowledgeConsumerBinding[]>(['knowledge', 'bindings', scopeKey], '/api/knowledge/bindings', undefined, { enabled: isGovernance });

  const uploadMutation = useApiMutation<KnowledgeDoc, { title: string; source: string; tags: string }>('/api/knowledge/docs', { onSuccess: (doc) => { setActiveModal(null); setGovernanceNotice(`文档「${doc.title}」已进入解析与索引队列。`); } });
  const reindexMutation = useApiMutation<{ status: string; affected: number }, { kb: string }>('/api/knowledge/reindex', { onSuccess: (result) => { setReindexConfirm(false); setGovernanceNotice(`索引重建任务已创建，影响 ${result.affected} 项资产。`); } });
  const reviewMutation = useApiMutation<{ ids: string[] }, { ids: string[] }>('/api/knowledge/docs/review', { onSuccess: (result) => { setSelectedDocumentIds([]); setGovernanceNotice(`已发起 ${result.ids.length} 项知识资产复核。`); } });
  const retrieveMutation = useApiMutation<{ results: KnowledgeRetrievalResult[]; metrics: unknown }, { query: string; kb: string }>('/api/knowledge/retrieve', { onSuccess: (result, vars) => setGovernanceNotice(`已完成「${vars.query}」检索验证，返回 ${result.results.length} 条证据。`) });
  const rescoreMutation = useApiMutation<KnowledgeRetrievalResult[], Record<string, never>>('/api/knowledge/chunks/rescore', { onSuccess: () => setGovernanceNotice('证据重新评分完成，已刷新 Top-K 结果。') });
  const sourceMutation = useApiMutation<KnowledgeSourceConnection, { name: string; kind: string; schedule: string }>('/api/knowledge/sources', { onSuccess: (source) => { setActiveModal(null); setWorkspace('processing'); setGovernanceNotice(`数据源「${source.name}」已接入，等待首次同步。`); } });
  const sourceSyncMutation = useApiMutation<KnowledgeSourceConnection, { id: string }>(({ id }) => `/api/knowledge/sources/${id}/sync`, { onSuccess: (source) => setGovernanceNotice(`数据源「${source.name}」同步完成。`) });
  const governanceMutation = useApiMutation<KnowledgeGovernancePolicy, Partial<KnowledgeGovernancePolicy>>('/api/knowledge/governance', { onSuccess: (policy) => setGovernanceNotice(policy.versionRetention ? '版本保留策略已启用并写入审计。' : '版本保留策略已暂停，请确认合规风险。') }, 'PATCH');
  const createPackageMutation = useApiMutation<KnowledgePackage, { name: string; description: string; domain: string; classification: KnowledgePackage['classification'] }>('/api/knowledge/packages', { onSuccess: (item) => { setActiveModal(null); setWorkspace('assets'); setAssetsView('packages'); setGovernanceNotice(`知识包「${item.name}」已创建，请完成加工与评测后发布。`); } });
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
  const publishedPackageCount = knowledgePackages.filter((item) => item.status === 'published').length;
  const pendingPackageCount = knowledgePackages.filter((item) => item.status !== 'published').length;
  const healthySourceCount = sourceConnections.filter((item) => item.status === 'healthy').length;
  const attentionSourceCount = sourceConnections.filter((item) => item.status === 'attention').length;
  const sourceDocumentTotal = sourceConnections.reduce((total, item) => total + item.documents, 0);
  const failedJobCount = processingJobs.filter((item) => item.status === 'failed').length;
  const activeJobCount = processingJobs.filter((item) => item.status === 'running' || item.status === 'queued').length;
  const syncingSourceCount = sourceConnections.filter((item) => item.status === 'syncing').length
    + (sourceSyncMutation.isPending ? 1 : 0);
  const filteredProcessingJobs = useMemo(() => {
    if (jobStatusFilter === 'all') return processingJobs;
    if (jobStatusFilter === 'running') return processingJobs.filter((item) => item.status === 'running' || item.status === 'queued');
    return processingJobs.filter((item) => item.status === jobStatusFilter);
  }, [jobStatusFilter, processingJobs]);
  const pendingReviewPackages = knowledgePackages.filter((item) => item.status !== 'published');

  const pipelineStages = useMemo(() => {
    return PIPELINE.map((stage) => {
      let tone: PipelineTone = 'default';
      let statusLabel = '默认能力';
      if (stage.target === 'sources') {
        if (attentionSourceCount > 0) { tone = 'attention'; statusLabel = `${attentionSourceCount} 需关注`; }
        else if (syncingSourceCount > 0) { tone = 'active'; statusLabel = '同步中'; }
        else if (sourceConnections.length > 0) { statusLabel = `${sourceConnections.length} 个数据源`; }
        else { statusLabel = '待接入'; }
      } else if (stage.target === 'jobs') {
        if (failedJobCount > 0) { tone = 'attention'; statusLabel = `${failedJobCount} 失败`; }
        else if (activeJobCount > 0) { tone = 'active'; statusLabel = `${activeJobCount} 进行中`; }
        else { statusLabel = '查看任务'; }
      } else {
        statusLabel = '检索验证';
      }
      return { ...stage, tone, statusLabel };
    });
  }, [activeJobCount, attentionSourceCount, failedJobCount, sourceConnections.length, syncingSourceCount]);

  const focusPipelineTarget = (target: PipelineTarget) => {
    if (target === 'retrieval') {
      setWorkspace('retrieval');
      return;
    }
    if (target === 'jobs') {
      setJobStatusFilter(failedJobCount > 0 ? 'failed' : activeJobCount > 0 ? 'running' : 'all');
      requestAnimationFrame(() => jobsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }
    requestAnimationFrame(() => sourcesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

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
    <div className="knowledge-page de-employee-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      <div className="space-y-3">
        <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
          <div className="flex items-start justify-between gap-4 px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg">
                  <BookOpen className="h-4 w-4" />
                </div>
                <h1 className="text-base font-semibold text-[var(--text)]">{t('module.knowledge.title')}</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">{t('module.knowledge.subtitle')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Badge tone="info">{workspaceName}</Badge>
              {!canWrite && <Badge tone="neutral">只读 · 需 knowledge.write</Badge>}
            </div>
          </div>
          <div className="de-employee-tabs flex overflow-x-auto px-3" role="tablist" aria-label="知识运营分区">
            {[
              { key: 'assets' as const, labelKey: 'module.knowledge.tabs.assets', icon: FileText },
              { key: 'processing' as const, labelKey: 'module.knowledge.tabs.processing', icon: Layers },
              { key: 'retrieval' as const, labelKey: 'module.knowledge.tabs.retrieval', icon: Search },
              { key: 'graph' as const, labelKey: 'module.knowledge.tabs.graph', icon: Network },
              { key: 'governance' as const, labelKey: 'module.knowledge.tabs.governance', icon: ShieldCheck },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={workspace === item.key}
                onClick={() => setWorkspace(item.key)}
                className={cn('de-employee-tab flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs transition-colors', workspace === item.key && 'is-active')}
              >
                <item.icon className="h-3.5 w-3.5" />{t(item.labelKey)}
              </button>
            ))}
          </div>
        </section>

        {workspace === 'assets' ? (
          <div className="space-y-3">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="受管文档" value={docs?.length ?? 0} sub="项" icon={FileText} tone="brand" size="comfortable" />
              <KpiCard label="待处理索引" value={isReindexing ? 1 : 0} sub="项" icon={RefreshCw} tone="warn" size="comfortable" />
              <KpiCard label="检索健康度" value={`${evalMetrics?.recall ?? 92}%`} sub={`${evalMetrics?.p95Latency ?? 320}ms P95`} icon={Activity} tone="success" size="comfortable" />
              <KpiCard label="智能体引用" value={citationTrace.reduce((total: number, item: any) => total + (item.citeCount ?? 0), 0)} sub="次" icon={Users} tone="neutral" size="comfortable" />
            </section>

            <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5" style={{ boxShadow: 'var(--saas-divider)' }}>
                <div className="knowledge-assets-segment" role="tablist" aria-label="知识资产视图">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={assetsView === 'docs'}
                    className={cn(assetsView === 'docs' && 'is-active')}
                    onClick={() => setAssetsView('docs')}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    内容文档
                    <span className="knowledge-assets-segment__count">{docs.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={assetsView === 'packages'}
                    className={cn(assetsView === 'packages' && 'is-active')}
                    onClick={() => setAssetsView('packages')}
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    知识包
                    <span className="knowledge-assets-segment__count">{knowledgePackages.length}</span>
                  </button>
                </div>
                {assetsView === 'docs' ? (
                  canWrite && <Button size="sm" onClick={() => setActiveModal('upload')}><Upload className="h-3.5 w-3.5" />上传内容</Button>
                ) : (
                  canWrite && <Button size="sm" variant="secondary" onClick={() => setActiveModal('newPackage')}><Plus className="h-3.5 w-3.5" />新建知识包</Button>
                )}
              </div>

              {assetsView === 'docs' ? (
                <>
                  {knowledgePackages.length > 0 && (
                    <button type="button" className="knowledge-package-strip" onClick={() => setAssetsView('packages')}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Boxes className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
                        <span className="truncate text-[11px] text-[var(--text-secondary)]">
                          <strong className="font-semibold text-[var(--text)]">{publishedPackageCount}</strong> 个已发布知识包
                          {pendingPackageCount > 0 && <> · <strong className="font-semibold text-[var(--warning)]">{pendingPackageCount}</strong> 个待发布</>}
                          <span className="text-[var(--text-muted)]"> · 向智能体与工作流交付稳定版本</span>
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[var(--brand)]">
                        管理知识包 <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  )}

                  <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3 md:px-5">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--text)]">内容列表</h2>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">按来源、生命周期与检索影响持续运营企业知识内容。</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                        <Input placeholder="搜索标题、来源…" value={searchQ} onChange={(event) => { setSearchQ(event.target.value); setContentPage(1); }} className="de-employee-input h-8 w-48 bg-[var(--bg)] pl-8 text-xs md:w-56" />
                      </div>
                      <div className="knowledge-filter-group" role="group" aria-label="状态筛选">
                        {(['all', 'ready', 'indexing'] as const).map((status) => (
                          <button key={status} type="button" onClick={() => { setStatusFilter(status); setContentPage(1); }} className={cn(statusFilter === status && 'is-active')}>
                            {status === 'all' ? '全部' : status === 'ready' ? '已就绪' : '索引中'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-y border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 md:px-5">
                    <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">来源</span>
                    <button type="button" onClick={() => { setTagFilter(null); setContentPage(1); }} className={cn('knowledge-source-chip', !tagFilter && 'is-active')}>全部</button>
                    {allTags.map((source) => (
                      <button key={source} type="button" onClick={() => { setTagFilter(tagFilter === source ? null : source); setContentPage(1); }} className={cn('knowledge-source-chip', tagFilter === source && 'is-active')}>
                        <TagIcon className="h-3 w-3" />{source}
                      </button>
                    ))}
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">共 {filteredDocs.length} 条</span>
                  </div>

                  {selectedCount > 0 && canWrite && (
                    <div className="knowledge-bulk-bar mx-4 mt-3 md:mx-5">
                      <span>已选择 {selectedCount} 项资产</span>
                      <Button size="sm" variant="secondary" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ ids: selectedDocumentIds })}>
                        <ShieldCheck className="h-3 w-3" />{reviewMutation.isPending ? '提交中…' : '发起复核'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedDocumentIds([])}>取消选择</Button>
                    </div>
                  )}

                  {filteredDocs.length === 0 ? (
                    <div className="p-6">
                      <EmptyState icon={FileText} title="没有匹配的内容" description="尝试清除筛选条件，或上传新的企业知识文档。" action={canWrite ? <Button size="sm" onClick={() => setActiveModal('upload')}><Upload className="h-3.5 w-3.5" />上传文档</Button> : undefined} />
                    </div>
                  ) : (
                    <>
                      <div className="knowledge-asset-table knowledge-asset-table--flush">
                        <div className="knowledge-asset-table__head">
                          <span />
                          <span>内容</span>
                          <span>来源与状态</span>
                          <span>质量与规模</span>
                          <span>影响</span>
                          <span>更新</span>
                          <span className="text-right">操作</span>
                        </div>
                        {paginatedDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className={cn('knowledge-asset-row', doc.id === docPreviewId && showDetails && 'is-selected')}
                            onClick={() => openDocument(doc.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => event.key === 'Enter' && openDocument(doc.id)}
                          >
                            <span>
                              {canWrite && (
                                <input type="checkbox" checked={selectedDocumentIds.includes(doc.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleDocument(doc.id)} aria-label={`选择 ${doc.title}`} />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-2.5">
                                <span className="knowledge-doc-icon"><FileText className="h-3.5 w-3.5" /></span>
                                <span className="min-w-0">
                                  <strong className="block truncate text-[12px] text-[var(--text)]">{doc.title}</strong>
                                  <small>责任人 {docOwnerLabel(doc)} · {docVersionFromTitle(doc.title)}</small>
                                </span>
                              </span>
                            </span>
                            <span className="flex flex-wrap items-center gap-1">
                              <Badge tone="info">{doc.source}</Badge>
                              <span className={cn('knowledge-status-dot', doc.status === 'ready' ? 'is-ready' : 'is-indexing')}>
                                {doc.status === 'ready' ? '已就绪' : '索引中'}
                              </span>
                            </span>
                            <span>
                              <strong className="font-mono text-xs text-[var(--text)]">{doc.chunks}</strong>
                              <small>{doc.sizeKb} KB · {doc.status === 'ready' ? '质量正常' : '等待构建'}</small>
                            </span>
                            <span>
                              <strong className="font-mono text-xs text-[var(--text)]">{doc.citeCount}</strong>
                              <small>引用次数</small>
                            </span>
                            <span><small className="!mt-0">{doc.updatedAt.slice(0, 10)}</small></span>
                            <span className="justify-self-end">
                              <button
                                type="button"
                                className="knowledge-row-action"
                                onClick={(event) => { event.stopPropagation(); openDocument(doc.id); }}
                              >
                                <Eye className="h-3.5 w-3.5" />详情
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-[var(--text-muted)] md:px-5" style={{ boxShadow: 'inset 0 1px 0 rgba(15,23,42,0.06)' }}>
                        <span>第 {activeContentPage} / {contentPageCount} 页 · 每页 {CONTENT_PAGE_SIZE} 条</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" disabled={activeContentPage === 1} onClick={() => setContentPage((page) => Math.max(1, page - 1))}>上一页</Button>
                          <Button size="sm" variant="secondary" disabled={activeContentPage === contentPageCount} onClick={() => setContentPage((page) => Math.min(contentPageCount, page + 1))}>下一页</Button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="px-4 py-3 md:px-5" style={{ boxShadow: 'var(--saas-divider)' }}>
                    <h2 className="text-sm font-semibold text-[var(--text)]">知识包交付</h2>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">以稳定版本、检索策略和权限范围向智能体与工作流交付知识能力。</p>
                  </div>
                  {knowledgePackages.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        icon={Boxes}
                        title="暂无知识包"
                        description="将运营完成的内容打包为可版本化、可授权的交付单元。"
                        action={canWrite ? <Button size="sm" onClick={() => setActiveModal('newPackage')}><Plus className="h-3.5 w-3.5" />新建知识包</Button> : undefined}
                      />
                    </div>
                  ) : (
                    <div className="grid gap-3 p-3 md:grid-cols-2 md:p-4 lg:grid-cols-3">
                      {knowledgePackages.map((item) => (
                        <article
                          key={item.id}
                          className={cn('knowledge-package-card group', highlightedPackageId === item.id && 'ring-2 ring-[var(--brand)]')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[var(--text)]">{item.name}</div>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                <Badge tone={item.status === 'published' ? 'success' : item.status === 'review' ? 'warn' : 'neutral'}>{item.status === 'published' ? '已发布' : item.status === 'review' ? '待审核' : '草稿'}</Badge>
                                <Badge tone="neutral">{item.currentVersion.version}</Badge>
                                <Badge tone="info">{item.classification === 'restricted' ? '受限' : item.classification === 'confidential' ? '机密' : '内部'}</Badge>
                              </div>
                            </div>
                            <span className="knowledge-package-card__icon"><Boxes className="h-3.5 w-3.5" /></span>
                          </div>
                          <p className="mt-2.5 line-clamp-2 text-[11px] leading-5 text-[var(--text-secondary)]">{item.description}</p>
                          <div className="knowledge-package-card__stats">
                            <span><strong>{item.documentCount}</strong><small>资产</small></span>
                            <span><strong>{item.currentVersion.qualityScore || '—'}%</strong><small>质量</small></span>
                            <span><strong>{item.consumers}</strong><small>引用方</small></span>
                          </div>
                          <div className="knowledge-package-card__footer">
                            <span className="truncate">{item.owner} · {item.currentVersion.indexVersion}</span>
                            {item.status === 'published' ? (
                              <button type="button" className="knowledge-package-card__link" onClick={() => setWorkspace('governance')}>查看引用</button>
                            ) : canWrite ? (
                              <button type="button" disabled={publishPackageMutation.isPending} className="knowledge-package-card__link" onClick={() => publishPackageMutation.mutate({ id: item.id })}>发布版本</button>
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)]">只读</span>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        ) : workspace === 'processing' ? (
          <div className="space-y-3">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="接入数据源" value={sourceConnections.length} sub="个" icon={Database} tone="brand" size="comfortable" />
              <KpiCard label="覆盖资产" value={sourceDocumentTotal} sub="项" icon={FileText} tone="neutral" size="comfortable" />
              <KpiCard label="健康连接" value={healthySourceCount} sub={attentionSourceCount ? `${attentionSourceCount} 需关注` : '全部正常'} icon={CheckCircle2} tone={attentionSourceCount ? 'warn' : 'success'} size="comfortable" />
              <KpiCard label="加工任务" value={activeJobCount} sub={failedJobCount ? `${failedJobCount} 失败` : '运行/排队'} icon={Layers} tone={failedJobCount ? 'warn' : 'success'} size="comfortable" />
            </section>

            <section ref={sourcesSectionRef} className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
              <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3.5 md:px-5" style={{ boxShadow: 'var(--saas-divider)' }}>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">数据源接入</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">连接企业知识来源，按计划同步并进入加工队列。</p>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setReindexConfirm(true)}>
                      <RefreshCw className={cn('h-3.5 w-3.5', isReindexing && 'animate-spin')} />重建索引
                    </Button>
                    <Button size="sm" onClick={() => setActiveModal('connectSource')}>
                      <Plus className="h-3.5 w-3.5" />接入数据源
                    </Button>
                  </div>
                )}
              </div>

              {sourceConnections.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Database}
                    title="尚未接入数据源"
                    description="接入 Git、API 或 Webhook 后，可自动同步并加工为企业知识资产。"
                    action={canWrite ? <Button size="sm" onClick={() => setActiveModal('connectSource')}><Plus className="h-3.5 w-3.5" />接入数据源</Button> : undefined}
                  />
                </div>
              ) : (
                <div className="grid gap-3 p-3 md:grid-cols-2 md:p-4">
                  {sourceConnections.map((source) => {
                    const syncing = sourceSyncMutation.isPending && sourceSyncMutation.variables?.id === source.id;
                    const statusLabel = syncing || source.status === 'syncing' ? '同步中' : source.status === 'healthy' ? '健康' : '需关注';
                    const statusTone = syncing || source.status === 'syncing' ? 'brand' : source.status === 'healthy' ? 'success' : 'warn';
                    return (
                      <article key={source.id} className="knowledge-source-card">
                        <div className="knowledge-source-card__icon"><Database className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="truncate text-sm text-[var(--text)]">{source.name}</strong>
                            <Badge tone={statusTone}>{statusLabel}</Badge>
                          </div>
                          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{source.kind} · {source.documents} 个资产 · {source.schedule}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
                            <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />最近同步：{source.lastSync}</span>
                          </div>
                        </div>
                        {canWrite && (
                          <Button size="sm" variant="secondary" disabled={syncing} onClick={() => syncSource(source.id)}>
                            {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            {source.status === 'attention' ? '重试同步' : '立即同步'}
                          </Button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)] p-3 md:p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[var(--text)]">加工流水线</div>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">工作区默认加工链路（只读）。点击阶段跳转到对应操作区，参数在任务与检索配置中管理。</p>
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">接入 → 切片 → 向量化 → 索引 → 检索</span>
              </div>
              <div className="knowledge-pipeline" role="navigation" aria-label="加工流水线导航">
                {pipelineStages.map((stage, index) => (
                  <button
                    key={stage.key}
                    type="button"
                    className={cn(
                      'knowledge-pipeline__stage',
                      stage.tone === 'active' && 'is-active',
                      stage.tone === 'attention' && 'is-attention',
                    )}
                    onClick={() => focusPipelineTarget(stage.target)}
                  >
                    <span className="knowledge-pipeline__step">{index + 1}</span>
                    <stage.icon className="h-3.5 w-3.5 text-[var(--brand)]" />
                    <strong>{stage.label}</strong>
                    <small>{stage.capability}</small>
                    <em className="knowledge-pipeline__status">{stage.statusLabel}</em>
                  </button>
                ))}
              </div>
            </section>

            <section ref={jobsSectionRef} className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
              <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3.5 md:px-5" style={{ boxShadow: 'var(--saas-divider)' }}>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">加工与索引任务</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">切片策略、索引版本与失败样本与发布版本一一对应。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="knowledge-filter-group" role="group" aria-label="任务状态筛选">
                    {([
                      { key: 'all' as const, label: '全部' },
                      { key: 'running' as const, label: '进行中' },
                      { key: 'succeeded' as const, label: '已完成' },
                      { key: 'failed' as const, label: '失败' },
                    ]).map((item) => (
                      <button key={item.key} type="button" className={cn(jobStatusFilter === item.key && 'is-active')} onClick={() => setJobStatusFilter(item.key)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {canWrite && pendingReviewPackages[0] && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={processPackageMutation.isPending}
                      onClick={() => processPackageMutation.mutate({ id: pendingReviewPackages[0].id, strategy: 'semantic' })}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      加工待审包
                    </Button>
                  )}
                </div>
              </div>

              {pendingReviewPackages.length > 0 && (
                <button type="button" className="knowledge-package-strip" onClick={() => { setWorkspace('assets'); setAssetsView('packages'); }}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Boxes className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
                    <span className="truncate text-[11px] text-[var(--text-secondary)]">
                      <strong className="font-semibold text-[var(--text)]">{pendingReviewPackages.length}</strong> 个知识包待加工/发布
                      <span className="text-[var(--text-muted)]"> · 完成后可在检索评测中验证质量</span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[var(--brand)]">
                    查看知识包 <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              )}

              {filteredProcessingJobs.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Layers} title="暂无匹配任务" description="调整状态筛选，或对知识包发起一次加工。" />
                </div>
              ) : (
                <div className="knowledge-job-table">
                  <div className="knowledge-job-table__head">
                    <span>任务来源</span>
                    <span>切片策略</span>
                    <span>状态</span>
                    <span>切片 / 文档</span>
                    <span>索引版本</span>
                    <span className="text-right">操作</span>
                  </div>
                  {filteredProcessingJobs.map((job) => {
                    const strategyLabel = job.strategy === 'structured' ? '结构切片' : job.strategy === 'semantic' ? '语义切片' : job.strategy === 'table' ? '表格切片' : '固定窗口';
                    const statusLabel = job.status === 'succeeded' ? '已完成' : job.status === 'failed' ? '失败' : job.status === 'running' ? '加工中' : '排队中';
                    const statusClass = job.status === 'succeeded' ? 'is-ready' : job.status === 'failed' ? 'is-failed' : 'is-indexing';
                    return (
                      <div key={job.id} className="knowledge-job-table__row">
                        <span className="min-w-0">
                          <strong className="block truncate text-[12px] text-[var(--text)]">{job.source}</strong>
                          <small className="text-[10px] text-[var(--text-muted)]">{new Date(job.startedAt).toLocaleString('zh-CN')}</small>
                        </span>
                        <span><Badge tone="info">{strategyLabel}</Badge></span>
                        <span><span className={cn('knowledge-status-dot', statusClass)}>{statusLabel}</span></span>
                        <span className="font-mono text-xs text-[var(--text)]">{job.chunkCount || '—'} / {job.documentCount}</span>
                        <span className="font-mono text-[10px] text-[var(--text-secondary)]">{job.indexVersion}</span>
                        <span className="justify-self-end">
                          {job.status === 'failed' && canWrite ? (
                            <button type="button" className="knowledge-row-action" onClick={() => retryJobMutation.mutate({ id: job.id })}>
                              <RotateCcw className="h-3.5 w-3.5" />重试
                            </button>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">{job.error ?? '可追溯'}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
        <main className="de-employee-shell knowledge-workspace overflow-hidden rounded-xl bg-[var(--surface-1)] p-3 md:p-4">
          {workspace === 'retrieval' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">检索验证台</div><p>验证数字员工在真实问题下的证据覆盖、相关度与响应性能。</p></div><Badge tone="success"><CheckCircle2 className="mr-1 h-3 w-3" />检索服务可用</Badge></div>
            <div className="knowledge-retrieval-query mt-3"><Search className="h-4 w-4 text-[var(--brand)]" /><Input placeholder="输入业务问题，例如：Redis OOM 如何安全处置？" value={testQuery} onChange={(event) => setTestQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && testQuery.trim() && retrieveMutation.mutate({ query: testQuery, kb: 'all' })} className="border-0 bg-transparent text-sm shadow-none focus-visible:ring-0" /><Button size="sm" disabled={!testQuery.trim() || retrieveMutation.isPending} onClick={() => retrieveMutation.mutate({ query: testQuery, kb: 'all' })}>{retrieveMutation.isPending ? '验证中…' : '执行验证'}</Button></div>
            <div className="knowledge-retrieval-layout mt-3"><section className="knowledge-retrieval-results"><div className="knowledge-section-title"><Search className="h-3.5 w-3.5 text-[var(--brand)]" />证据结果 <Badge tone="neutral">{testQuery.trim() ? searchResults.length : topChunks.length} 条</Badge></div><div className="mt-3 space-y-2">{(testQuery.trim() ? searchResults : topChunks.slice(0, 4)).map((chunk) => <button key={chunk.idx} type="button" onClick={() => setChunkDrawer(chunk)} className="knowledge-evidence-card"><span className="font-mono text-[var(--brand)]">[{chunk.idx}]</span><span className="min-w-0 flex-1"><strong>{chunk.source}</strong><small>{chunk.text}</small></span><span className="font-mono text-[var(--success)]">{(chunk.score * 100).toFixed(0)}%</span></button>)}</div></section><section className="knowledge-retrieval-health"><div className="knowledge-section-title"><Activity className="h-3.5 w-3.5 text-[var(--brand)]" />质量与性能</div><div className="mt-3 grid grid-cols-2 gap-2"><EvalCard label="召回率" value={`${evalMetrics?.recall ?? 92}%`} tone="success" /><EvalCard label="准确率" value={`${evalMetrics?.precision ?? 88}%`} tone="info" /><EvalCard label="P95 延迟" value={`${evalMetrics?.p95Latency ?? 320}ms`} tone="primary" /><EvalCard label="缓存命中" value={`${evalMetrics?.hitRate ?? 32}%`} tone="purple" /></div>{canWrite && <button type="button" className="knowledge-text-action mt-3" onClick={handleRescore}><RotateCcw className="h-3 w-3" />重新评分并查看差异</button>}</section></div>
            <div className="knowledge-pipeline mt-3" aria-label="检索链路说明">
              {PIPELINE.map((stage, index) => (
                <div key={stage.key} className="knowledge-pipeline__stage is-static">
                  <span className="knowledge-pipeline__step">{index + 1}</span>
                  <stage.icon className="h-3.5 w-3.5 text-[var(--brand)]" />
                  <strong>{stage.label}</strong>
                  <small>{stage.capability}</small>
                </div>
              ))}
            </div>
            <section className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 md:p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-[var(--brand)]" />评测与发布门禁</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">以标准问题集验证混合召回、重排质量、引用正确性与延迟，再决定是否发布版本。</p></div>{canWrite && <Button size="sm" variant="secondary" disabled={!knowledgePackages[0] || evaluationMutation.isPending} onClick={() => { const target = knowledgePackages.find((item) => item.status === 'published') ?? knowledgePackages[0]; const profile = retrievalProfiles.find((item) => item.packageId === target?.id); if (target && profile) evaluationMutation.mutate({ packageId: target.id, profileId: profile.id }); }}><Activity className="h-3.5 w-3.5" />运行评测</Button>}</div><div className="mt-3 grid gap-3 lg:grid-cols-2">{evaluations.slice(0, 2).map((item) => { const packageItem = knowledgePackages.find((record) => record.id === item.packageId); return <article key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{packageItem?.name ?? item.packageId}</span><Badge tone={item.status === 'passed' ? 'success' : item.status === 'needs_review' ? 'warn' : 'error'}>{item.status === 'passed' ? '通过' : item.status === 'needs_review' ? '需复核' : '未通过'}</Badge></div><div className="mt-3 grid grid-cols-5 gap-2 text-[10px]"><MetricCell label="Recall@K" value={`${(item.recallAtK * 100).toFixed(0)}%`} /><MetricCell label="MRR" value={item.mrr.toFixed(2)} /><MetricCell label="nDCG" value={item.ndcg.toFixed(2)} /><MetricCell label="引用正确" value={`${(item.citationAccuracy * 100).toFixed(0)}%`} /><MetricCell label="P95" value={`${item.p95LatencyMs}ms`} /></div><div className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-muted)]">{item.baselineVersion} → {item.evaluatedVersion} · {new Date(item.evaluatedAt).toLocaleString('zh-CN')}</div></article>; })}</div></section>
          </>}

          {workspace === 'graph' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">图谱与关联</div><p>从原始文档中抽取实体与关系，为影响分析和混合召回提供可回溯的业务上下文。</p></div><Badge tone="brand">证据溯源已启用</Badge></div>
            <KnowledgeGraphCanvas entities={graphEntities} relations={graphRelations} selectedEntityId={selectedGraphEntityId} onSelect={(id) => { setSelectedGraphEntityId(id); const entity = graphEntities.find((item) => item.id === id); if (entity) setGovernanceNotice(`实体「${entity.name}」来自文档 ${entity.sourceDocId} · ${entity.sourceVersion}。`); }} />
          </>}

          {workspace === 'governance' && <>
            <div className="knowledge-workspace-heading"><div><div className="text-sm font-semibold">引用治理</div><p>管理权限、版本、风险策略，并追踪知识包对智能体和工作流的变更影响。</p></div><Badge tone="brand">审计已启用</Badge></div>
            <div className="knowledge-governance-grid mt-3"><section className="knowledge-governance-card"><div className="knowledge-section-title"><ShieldCheck className="h-3.5 w-3.5 text-[var(--brand)]" />访问与保留策略</div><div className="mt-3 space-y-2 text-xs"><div className="knowledge-policy-row"><span><strong>敏感数据检测</strong><small>上传后识别凭据、个人数据与机密内容</small></span><Badge tone={governance?.sensitiveDataDetection ? 'success' : 'warn'}>{governance?.sensitiveDataDetection ? '已启用' : '已暂停'}</Badge></div><label className="knowledge-policy-row"><span><strong>版本保留</strong><small>保留 {governance?.retentionDays ?? 365} 天版本，可审计和回滚</small></span><input type="checkbox" checked={governance?.versionRetention ?? true} disabled={!canWrite || governanceMutation.isPending} onChange={(event) => governanceMutation.mutate({ versionRetention: event.target.checked })} /></label><div className="knowledge-policy-row"><span><strong>高风险操作</strong><small>归档、删除和共享需责任人复核</small></span><Badge tone={governance?.highRiskChangeApproval ? 'warn' : 'error'}>{governance?.highRiskChangeApproval ? '受控' : '未受控'}</Badge></div></div></section><section className="knowledge-governance-card"><div className="knowledge-section-title"><Users className="h-3.5 w-3.5 text-[var(--brand)]" />智能体影响范围</div><div className="mt-3 space-y-2">{citationTrace.length ? citationTrace.slice(0, 3).map((citation) => <button key={citation.docId} type="button" onClick={() => setActiveModal('citationAgents')} className="knowledge-impact-row"><span className="min-w-0"><strong>{citation.title}</strong><small>最后引用：{citation.lastUsed}</small></span><span className="font-mono text-[var(--brand)]">{citation.citeCount} 次</span><ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" /></button>) : <EmptyState icon={Users} title="暂无引用影响" description="智能体使用知识后将在此追踪" />}</div></section></div>
            <section className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex items-center justify-between"><div className="knowledge-section-title"><Link2 className="h-3.5 w-3.5 text-[var(--brand)]" />已发布知识包引用</div><Badge tone="neutral">{consumerBindings.length} 个运行时绑定</Badge></div><div className="mt-3 overflow-x-auto"><div className="min-w-[720px] divide-y divide-[var(--border)] text-xs"><div className="grid grid-cols-[1.2fr_.9fr_.8fr_.8fr_.9fr] gap-3 px-2 py-2 text-[10px] text-[var(--text-muted)]"><span>知识包 / 版本</span><span>引用方</span><span>环境</span><span>无结果策略</span><span>检索配置</span></div>{consumerBindings.map((binding) => <div key={binding.id} className="grid grid-cols-[1.2fr_.9fr_.8fr_.8fr_.9fr] gap-3 px-2 py-3"><span><strong className="block">{binding.packageName}</strong><small className="font-mono text-[var(--text-muted)]">{binding.packageVersion}</small></span><span><Badge tone={binding.consumerType === 'agent' ? 'brand' : 'info'}>{binding.consumerType === 'agent' ? '智能体' : '工作流'}</Badge><small className="ml-1 text-[var(--text-muted)]">{binding.consumerName}</small></span><span>{binding.environment === 'production' ? '生产' : binding.environment === 'staging' ? '预发' : '沙箱'}</span><span>{binding.noResultPolicy === 'block' ? '阻断执行' : binding.noResultPolicy === 'handoff' ? '人工接管' : '请求澄清'}</span><span className="font-mono text-[10px]">{binding.profileId}</span></div>)}</div></div></section>
            <div className="knowledge-audit-note mt-3"><ShieldAlert className="h-4 w-4 text-[var(--warning)]" /><span>{knowledgeAudit[0] ? `${knowledgeAudit[0].time} · ${knowledgeAudit[0].action} · ${knowledgeAudit[0].target}` : governanceNotice}</span><button type="button" onClick={() => setWorkspace('assets')}>返回内容资产</button></div>
          </>}
        </main>
        )}
      </div>

      {/* 文档阅读器：宽屏双栏，正文滚动、侧栏信息收敛，避免元数据重复。 */}
      <Modal
        open={showDetails}
        onClose={() => { setShowDetails(false); setEditingContent(false); }}
        title={
          docDetail ? (
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="truncate">{docDetail.title}</span>
              <span className="flex flex-wrap items-center gap-1.5 font-normal">
                <Badge tone="info">{docDetail.source}</Badge>
                <span className={cn('knowledge-status-dot', docDetail.status === 'ready' ? 'is-ready' : 'is-indexing')}>
                  {docDetail.status === 'ready' ? '已就绪' : '索引中'}
                </span>
                <Badge tone="neutral">{docDetail.version ?? 'v1.0'}</Badge>
                {docDetail.classification && <Badge tone="warn">{docDetail.classification}</Badge>}
              </span>
            </span>
          ) : '内容详情'
        }
        description={docDetail ? `责任人 ${docDetail.author ?? '未指定'} · 更新于 ${docDetail.updatedAt?.slice(0, 10) ?? '—'}` : '正在加载文档内容…'}
        size="xl"
        bodyClassName="overflow-hidden p-0"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setShowDetails(false); setEditingContent(false); }}>关闭</Button>
            <Button variant="secondary" onClick={downloadOriginal} disabled={!docDetail}><Download className="h-3.5 w-3.5" />下载原文</Button>
            <Button
              variant="secondary"
              disabled={!topChunks.length}
              onClick={() => { setShowDetails(false); setChunkDrawer(topChunks[0]); }}
            >
              <Hash className="h-3.5 w-3.5" />关联切片
            </Button>
            {canWrite && (
              <Button variant={editingContent ? 'secondary' : 'primary'} onClick={() => setEditingContent((editing) => !editing)}>
                <Pencil className="h-3.5 w-3.5" />{editingContent ? '退出编辑' : '编辑内容'}
              </Button>
            )}
          </>
        )}
      >
        {!docDetail ? (
          <div className="flex h-[40vh] items-center justify-center text-xs text-[var(--text-muted)]">加载文档内容中…</div>
        ) : (
          <div className="knowledge-doc-detail">
            <section className="knowledge-doc-detail__reader">
              <div className="knowledge-doc-detail__reader-head">
                <div className="knowledge-doc-mode" role="tablist" aria-label="阅读模式">
                  <button type="button" role="tab" aria-selected={!editingContent} className={cn(!editingContent && 'is-active')} onClick={() => setEditingContent(false)}>
                    <FileText className="h-3.5 w-3.5" />阅读
                  </button>
                  {canWrite && (
                    <button type="button" role="tab" aria-selected={editingContent} className={cn(editingContent && 'is-active')} onClick={() => setEditingContent(true)}>
                      <Pencil className="h-3.5 w-3.5" />编辑
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                  <span className="font-mono">{docDetail.size}</span>
                  <span>·</span>
                  <span className="font-mono">{docDetail.chunks} 切片</span>
                  <span>·</span>
                  <span>{docDetail.chunkStrategy ?? '结构切片'}</span>
                </div>
              </div>
              <div className="knowledge-doc-detail__reader-body">
                {editingContent ? (
                  <textarea
                    key={docDetail.id}
                    defaultValue={docDetail.content}
                    className="knowledge-doc-editor"
                    spellCheck={false}
                    onBlur={() => setGovernanceNotice(`内容「${docDetail.title}」编辑草稿已更新，发布前需完成复核。`)}
                  />
                ) : (
                  <div className="knowledge-md-shell">
                    <MarkdownView text={docDetail.content} />
                  </div>
                )}
              </div>
            </section>

            <aside className="knowledge-doc-detail__aside">
              <section className="knowledge-doc-stat-strip">
                <div>
                  <strong>{Math.round(((docDetail.quality?.completeness ?? 96) + (docDetail.quality?.freshness ?? 92) + (docDetail.quality?.citationAccuracy ?? 97)) / 3)}%</strong>
                  <small>综合质量</small>
                </div>
                <div>
                  <strong className="font-mono">{docDetail.citeCount ?? 0}</strong>
                  <small>运行引用</small>
                </div>
                <div>
                  <strong className="font-mono">{docDetail.chunks ?? 0}</strong>
                  <small>切片数</small>
                </div>
              </section>

              <section className="knowledge-doc-meta">
                <div className="knowledge-doc-meta__title">内容质量</div>
                <div className="mt-3 space-y-2.5">
                  <QualityBar label="完整度" value={docDetail.quality?.completeness ?? 96} />
                  <QualityBar label="时效性" value={docDetail.quality?.freshness ?? 92} />
                  <QualityBar label="引用正确率" value={docDetail.quality?.citationAccuracy ?? 97} />
                </div>
              </section>

              <section className="knowledge-doc-impact">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)]">
                    <TrendingUp className="h-3.5 w-3.5" />引用影响
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-[var(--text)]">{docDetail.citeCount ?? 0} 次</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                  版本变更前请确认智能体与工作流影响范围。
                </p>
                <button
                  type="button"
                  className="knowledge-doc-impact__action"
                  onClick={() => { setShowDetails(false); setWorkspace('governance'); }}
                >
                  查看引用治理 <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </section>

              {docDetail.tags?.length > 0 && (
                <section className="knowledge-doc-meta">
                  <div className="knowledge-doc-meta__title">标签</div>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {docDetail.tags.map((tag: string) => <Badge key={tag} tone="neutral">#{tag}</Badge>)}
                  </div>
                </section>
              )}

              {docDetail.versions?.length > 0 && (
                <section className="knowledge-doc-meta">
                  <div className="knowledge-doc-meta__title">版本历史</div>
                  <ul className="knowledge-doc-versions">
                    {docDetail.versions.slice(0, 3).map((version: any, index: number) => (
                      <li key={`${version.version}-${version.time}`} className={cn(index === 0 && 'is-current')}>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="font-mono">{version.version}</strong>
                          {index === 0 && <Badge tone="brand">当前</Badge>}
                        </div>
                        <span>{version.time}</span>
                        <small>{version.note}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <button
                type="button"
                className="knowledge-doc-nav"
                onClick={() => { setShowDetails(false); setWorkspace('retrieval'); }}
              >
                <span className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-[var(--brand)]" />前往检索与评测</span>
                <ChevronRight className="h-3.5 w-3.5 text-[var(--brand)]" />
              </button>
            </aside>
          </div>
        )}
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
        connecting={sourceMutation.isPending}
      />

      <UploadDocModal
        open={activeModal === 'upload'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleUploadDoc}
        uploading={uploadMutation.isPending}
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

      {/* Chunk 详情 · 居中模态 */}
      <Modal
        open={!!chunkDrawer}
        onClose={() => setChunkDrawer(null)}
        title={chunkDrawer ? `Chunk [${chunkDrawer.idx}] · 详情` : 'Chunk 详情'}
        description={chunkDrawer ? `相关度 ${(chunkDrawer.score * 100).toFixed(0)}%` : undefined}
        size="md"
        panelClassName="max-w-[560px]"
        bodyClassName="chunk-detail-modal"
        footer={chunkDrawer ? (
          <>
            {canWrite && (
              <Button variant="secondary" onClick={handleRescore}>
                <RefreshCw className="h-3.5 w-3.5" />重新评分
              </Button>
            )}
            <Button onClick={() => setChunkDrawer(null)}>
              <ExternalLink className="h-3.5 w-3.5" />查看原文
            </Button>
          </>
        ) : undefined}
      >
        {chunkDrawer && (
          <div className="flex flex-col gap-5 text-xs">
            <dl className="chunk-detail-kv">
              <div><dt>来源</dt><dd>{chunkDrawer.source}</dd></div>
              {chunkDrawer.page != null && <div><dt>页码</dt><dd className="font-mono">p.{chunkDrawer.page}</dd></div>}
              <div><dt>相关度</dt><dd><Badge tone="success">{(chunkDrawer.score * 100).toFixed(0)}%</Badge></dd></div>
              <div><dt>所属文档</dt><dd>{chunkDrawer.source}</dd></div>
              <div><dt>Token 数</dt><dd className="font-mono">128</dd></div>
              <div><dt>Embedding 模型</dt><dd className="font-mono">BGE-M3</dd></div>
            </dl>
            <div>
              <div className="mb-2 text-[11px] font-semibold text-[var(--text-muted)]">原文片段</div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3.5 text-[12px] leading-6 text-[var(--text)] whitespace-pre-wrap">
                {chunkDrawer.text}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ===== 子组件 ===== */

function QualityBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-mono font-semibold text-[var(--text)]">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
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
  return <><div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2"><div className="flex flex-wrap gap-1">{typeOptions.map((option) => <button key={option.key} type="button" onClick={() => { setActiveType(option.key); setSelectedRelationId(null); }} className={cn('rounded-md px-2.5 py-1.5 text-[11px] transition-colors', activeType === option.key ? 'bg-[var(--surface-1)] font-semibold text-[var(--brand)] shadow-[0_1px_2px_rgba(15,23,42,.06)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-1)]')}>{option.label}</button>)}</div><span className="text-[10px] text-[var(--text-muted)]">显示 {visibleEntities.length} 个实体 / {visibleRelations.length} 条关系</span></div><KnowledgeGraphCanvasReadonly entities={visibleEntities} relations={visibleRelations} selectedEntityId={selectedEntityId} onSelect={onSelect} /><section className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex items-center justify-between"><div className="text-xs font-semibold">关系证据</div><span className="text-[10px] text-[var(--text-muted)]">点击关系查看来源</span></div><div className="mt-2 flex flex-wrap gap-2">{visibleRelations.map((relation) => <button key={relation.id} type="button" onClick={() => setSelectedRelationId(relation.id)} className={cn('rounded-md border px-2.5 py-1.5 text-[11px] transition-colors', selectedRelationId === relation.id ? 'border-[var(--brand)]/30 bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]/30')}><span>{entities.find((entity) => entity.id === relation.fromId)?.name}</span><span className="mx-1 text-[var(--text-muted)]">{relation.type}</span><span>{entities.find((entity) => entity.id === relation.toId)?.name}</span></button>)}</div>{selectedRelation && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-[11px]"><strong>{relationFrom?.name} → {relationTo?.name}</strong><span className="text-[var(--text-muted)]">关系：{selectedRelation.type}</span><span className="text-[var(--text-muted)]">来源：{selectedRelation.sourceDocId} · {selectedRelation.sourceVersion}</span><span className="font-mono text-[var(--success)]">置信度 {(selectedRelation.confidence * 100).toFixed(0)}%</span></div>}</section></>;
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
  return <section className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="knowledge-section-title"><Network className="h-3.5 w-3.5 text-[var(--brand)]" />知识关系图谱 <Badge tone="neutral">{entities.length} 个实体 · {relations.length} 条关系</Badge></div><p className="mt-1 text-[11px] text-[var(--text-muted)]">选择节点查看来源证据；关系边表示已抽取且可追溯的业务依赖。</p></div><div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-muted)]"><span>● 服务</span><span>● 资产</span><span>● Runbook</span><span>● 漏洞</span><span>● 责任团队</span></div></div><div className="knowledge-graph-canvas mt-3"><svg viewBox="0 0 740 360" role="img" aria-label="知识图谱实体与关系" preserveAspectRatio="xMidYMid meet"><defs><marker id="knowledge-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs><g>{relations.map((relation) => { const fromIndex = entities.findIndex((entity) => entity.id === relation.fromId); const toIndex = entities.findIndex((entity) => entity.id === relation.toId); const from = entities[fromIndex]; const to = entities[toIndex]; if (!from || !to) return null; const [x1, y1] = positionFor(from, fromIndex); const [x2, y2] = positionFor(to, toIndex); return <g key={relation.id}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#knowledge-graph-arrow)" /><rect x={(x1 + x2) / 2 - 30} y={(y1 + y2) / 2 - 11} width="60" height="18" rx="9" fill="var(--surface-1)" stroke="#e2e8f0" /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 3.5} textAnchor="middle" fontSize="9" fill="#64748b">{relation.type}</text></g>; })}</g><g>{entities.map((entity, index) => { const [x, y] = positionFor(entity, index); const tone = toneFor(entity.type); const active = entity.id === selected?.id; return <g key={entity.id} transform={`translate(${x} ${y})`} className="knowledge-graph-node" onClick={() => onSelect(entity.id)} role="button" tabIndex={0} aria-label={`选择实体 ${entity.name}`} onKeyDown={(event) => event.key === 'Enter' && onSelect(entity.id)}><rect x="-74" y="-30" width="148" height="60" rx="10" fill={tone.fill} stroke={active ? '#4f46e5' : tone.stroke} strokeWidth={active ? 2.2 : 1.2} /><circle cx="-54" cy="0" r="11" fill="var(--surface-1)" stroke={tone.stroke} /><circle cx="-54" cy="0" r="4" fill={tone.text} /><text x="-35" y="-4" fontSize="11" fontWeight="600" fill="#1e293b">{entity.name.length > 16 ? `${entity.name.slice(0, 15)}…` : entity.name}</text><text x="-35" y="14" fontSize="9" fill="#64748b">{typeLabel(entity.type)} · {(entity.confidence * 100).toFixed(0)}%</text></g>; })}</g></svg></div>{selected && <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"><span className="min-w-0"><strong className="block text-xs">{selected.name}</strong><small className="mt-1 block text-[10px] text-[var(--text-muted)]">{typeLabel(selected.type)} · 来自 {selected.sourceDocId} · {selected.sourceVersion}</small></span><span className="text-[11px]"><small className="block text-[var(--text-muted)]">抽取置信度</small><strong className="font-mono text-[var(--success)]">{(selected.confidence * 100).toFixed(0)}%</strong></span><span className="text-[11px]"><small className="block text-[var(--text-muted)]">关联关系</small><strong>{relations.filter((relation) => relation.fromId === selected.id || relation.toId === selected.id).length} 条</strong></span><button type="button" className="text-left text-[11px] text-[var(--brand)] hover:underline" onClick={() => setTimeout(() => document.getElementById('knowledge-graph-evidence')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)}>查看证据</button></div>}<div id="knowledge-graph-evidence" className="mt-3 rounded-lg bg-[var(--brand-light)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"><Brain className="mr-1 inline h-3.5 w-3.5 text-[var(--brand)]" />图谱用于扩展候选证据；实际回答仍需完成权限过滤、混合召回与引用校验。</div></section>;
}

function NewKnowledgePackageModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (form: { name: string; description: string; domain: string; classification: KnowledgePackage['classification'] }) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('SRE');
  const [classification, setClassification] = useState<KnowledgePackage['classification']>('internal');
  return <Modal open={open} onClose={onClose} title="新建知识包" description="知识包是供智能体和工作流引用的版本化知识能力。创建后需经过加工、评测和发布才可被绑定。" size="md" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), description: description.trim(), domain, classification })}>创建知识包</Button></>}><div className="space-y-3"><Field label="知识包名称" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：生产故障处置知识包" /></Field><Field label="业务域"><Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="例如：SRE、安全、财务" /></Field><Field label="说明"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明适用范围、主要来源与使用边界" /></Field><Field label="数据分级"><select value={classification} onChange={(event) => setClassification(event.target.value as KnowledgePackage['classification'])} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"><option value="internal">内部</option><option value="confidential">机密</option><option value="restricted">受限</option></select></Field><div className="rounded-lg border border-[var(--brand)]/20 bg-[var(--brand-light)] p-3 text-[11px] text-[var(--text-secondary)]"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-[var(--brand)]" />发布前将检查加工索引、检索评测和引用影响；本地环境为 Mock 流程演示。</div></div></Modal>;
}

const SOURCE_KIND_OPTIONS: Array<{
  value: KnowledgeSourceConnection['kind'];
  label: string;
  hint: string;
  endpointLabel: string;
  endpointPlaceholder: string;
}> = [
  { value: 'REST API', label: 'REST API', hint: '拉取变更记录、工单或资产目录', endpointLabel: '接口地址', endpointPlaceholder: 'https://api.example.com/v1/knowledge' },
  { value: 'Git / Markdown', label: 'Git / Markdown', hint: '同步 Runbook 与文档仓库', endpointLabel: '仓库路径', endpointPlaceholder: 'git@github.com:acme/runbooks.git' },
  { value: 'Webhook', label: 'Webhook', hint: '接收 SIEM / 变更事件推送', endpointLabel: '回调地址', endpointPlaceholder: '由平台签发，接入后自动生成' },
  { value: '数据库只读连接', label: '数据库只读', hint: '只读查询配置表或知识表', endpointLabel: '连接串', endpointPlaceholder: 'postgres://readonly@db:5432/knowledge' },
];

const SOURCE_SCHEDULE_OPTIONS = ['每 30 分钟', '每 1 小时', '每 6 小时', '手动同步'];

function ConnectSourceModal({
  open, onClose, onSubmit, connecting = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { name: string; kind: string; schedule: string }) => void;
  connecting?: boolean;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<KnowledgeSourceConnection['kind']>('REST API');
  const [schedule, setSchedule] = useState('每 1 小时');
  const [endpoint, setEndpoint] = useState('');
  const [authHint, setAuthHint] = useState('');
  const kindMeta = SOURCE_KIND_OPTIONS.find((item) => item.value === kind) ?? SOURCE_KIND_OPTIONS[0];
  const valid = name.trim().length > 0 && (kind === 'Webhook' || endpoint.trim().length > 0);

  useEffect(() => {
    if (!open) {
      setName('');
      setKind('REST API');
      setSchedule('每 1 小时');
      setEndpoint('');
      setAuthHint('');
    }
  }, [open]);

  useEffect(() => {
    setEndpoint('');
    setAuthHint('');
  }, [kind]);

  const handleSubmit = () => {
    if (!valid || connecting) return;
    onSubmit({ name: name.trim(), kind, schedule });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="接入数据源"
      description="接入后首次同步、字段校验与访问策略将写入知识审计，可供追溯。"
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={connecting}>取消</Button>
          <Button disabled={!valid || connecting} onClick={handleSubmit}>
            <Database className="h-3.5 w-3.5" />
            {connecting ? '接入中…' : '确认接入'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label="数据源名称" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：生产变更记录库"
            className="de-employee-input bg-[var(--bg)]"
            onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
          />
        </Field>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-[var(--text-secondary)]">连接类型</div>
          <div className="knowledge-source-kind-grid">
            {SOURCE_KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn('knowledge-source-kind', kind === option.value && 'is-active')}
                onClick={() => setKind(option.value)}
              >
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kindMeta.endpointLabel} required={kind !== 'Webhook'}>
            <Input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={kindMeta.endpointPlaceholder}
              className="de-employee-input bg-[var(--bg)]"
              disabled={kind === 'Webhook'}
            />
            {kind === 'Webhook' && (
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">确认接入后将生成受控回调地址，仅当前工作区可使用。</p>
            )}
          </Field>
          <Field label="同步策略">
            <select
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
              className="de-employee-input h-9 w-full rounded-lg bg-[var(--bg)] px-2.5 text-xs text-[var(--text)]"
            >
              {SOURCE_SCHEDULE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
        </div>

        {kind !== 'Webhook' && (
          <Field label="凭据说明（演示）">
            <Input
              value={authHint}
              onChange={(event) => setAuthHint(event.target.value)}
              placeholder={kind === 'REST API' ? '例如：Bearer Token / 服务账号' : kind === 'Git / Markdown' ? '例如：Deploy Key / PAT' : '例如：只读账号，不含生产写权限'}
              className="de-employee-input bg-[var(--bg)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">真实凭据由密钥管理系统托管，此字段仅用于演示说明，不会落库。</p>
          </Field>
        )}

        <div className="knowledge-source-summary">
          <div className="knowledge-source-summary__title">接入预览</div>
          <dl>
            <div><dt>名称</dt><dd>{name.trim() || '—'}</dd></div>
            <div><dt>类型</dt><dd>{kindMeta.label}</dd></div>
            <div><dt>同步</dt><dd>{schedule}</dd></div>
            <div><dt>目标</dt><dd className="truncate">{kind === 'Webhook' ? '平台签发回调' : (endpoint.trim() || '待填写')}</dd></div>
          </dl>
        </div>

        <div className="knowledge-upload-hint">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
          <span>
            当前为控制面演示：确认后将创建数据源并进入待首次同步状态。生产环境由连接器凭据、权限校验与同步任务 API 承接。
          </span>
        </div>
      </div>
    </Modal>
  );
}

function UploadDocModal({
  open, onClose, onSubmit, uploading = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { title: string; source: string; tags: string }) => void;
  uploading?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState(KB_TYPE_OPTIONS[0]);
  const [tags, setTags] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeKb: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valid = title.trim().length > 0;

  useEffect(() => {
    if (!open) {
      setTitle('');
      setSource(KB_TYPE_OPTIONS[0]);
      setTags('');
      setDragging(false);
      setFileMeta(null);
    }
  }, [open]);

  const applyFile = (file?: File | null) => {
    if (!file) return;
    setFileMeta({ name: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)) });
    setTitle((current) => current.trim() || file.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = () => {
    if (!valid || uploading) return;
    onSubmit({ title: title.trim(), source, tags: tags.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="上传文档"
      description="支持 PDF / Word / Markdown / 纯文本，上传后自动进入解析、切片与索引队列。"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={uploading}>取消</Button>
          <Button disabled={!valid || uploading} onClick={handleSubmit}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? '上传中…' : '开始上传'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.doc,.docx,.md,.txt,.markdown,.zip"
          onChange={(event) => {
            applyFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            applyFile(event.dataTransfer.files?.[0] ?? null);
          }}
          className={cn('knowledge-upload-dropzone', dragging && 'is-dragging', fileMeta && 'has-file')}
        >
          <span className="knowledge-upload-dropzone__icon">
            <Upload className="h-5 w-5" />
          </span>
          <span className="mt-3 text-xs font-semibold text-[var(--text)]">
            {fileMeta ? '重新选择文件' : '拖拽文件到此处，或点击选择'}
          </span>
          <span className="mt-1 text-[10px] text-[var(--text-muted)]">
            PDF / Word / Markdown / 文本 · 最大 50MB · 多文件请打包 zip
          </span>
        </button>

        {fileMeta && (
          <div className="knowledge-upload-file">
            <span className="knowledge-upload-file__icon"><FileText className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs text-[var(--text)]">{fileMeta.name}</strong>
              <small className="text-[10px] text-[var(--text-muted)]">{fileMeta.sizeKb} KB · 将用于标题建议与解析预检</small>
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              onClick={() => { setFileMeta(null); fileInputRef.current?.click(); }}
            >
              更换
            </button>
          </div>
        )}

        <Field label="文档标题" required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：Redis 故障 Runbook v3.3"
            className="de-employee-input bg-[var(--bg)]"
            onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="文档分类">
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="de-employee-input h-9 w-full rounded-lg bg-[var(--bg)] px-2.5 text-xs text-[var(--text)]"
            >
              {KB_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="标签">
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="redis, oom, 生产"
              className="de-employee-input bg-[var(--bg)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">多个标签用逗号分隔，便于检索与治理筛选</p>
          </Field>
        </div>

        <div className="knowledge-upload-hint">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
          <span>
            上传后将执行敏感内容检测，并进入接入加工队列。当前为控制面演示，生产环境由对象存储与解析服务承接真实文件。
          </span>
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
