/**
 * P7 知识库（企业级优化版）
 * 增强：所有按钮接入交互，纯前端 state 化演示。
 */
import { useState, useMemo, useEffect } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Input } from '@de/web-ui';
import {
  Database, FileText, Brain, Layers, Search, Upload, ShieldCheck, Zap,
  Plus, Filter, Star, History, Eye, RefreshCw, Tag as TagIcon, X, Download,
  ExternalLink, TrendingUp, Activity, BookOpen, Hash, ChevronRight,
  Sparkles, Trash2,
} from 'lucide-react';
import type { KnowledgeDoc } from '@de/web-types';
import { cn } from '@de/web-utils';
import { Modal, Drawer, ConfirmDialog, EmptyState } from '@/components/shared';

const PIPELINE: { key: string; label: string; icon: any; tool: string; count: string }[] = [
  { key: 'ingest', label: 'Ingest', icon: Upload, tool: 'Tika + PaddleOCR', count: '1.2 GB/日' },
  { key: 'chunk', label: 'Chunk', icon: FileText, tool: '512 tokens · 64 overlap', count: '247k 段' },
  { key: 'embed', label: 'Embed', icon: Brain, tool: 'BGE-M3 · 1024 维', count: '124k 向量' },
  { key: 'index', label: 'Index', icon: Layers, tool: 'Milvus HNSW', count: '12 GB' },
  { key: 'retrieve', label: 'Retrieve', icon: Search, tool: 'Top-K=8 + Rerank', count: '320ms P95' },
];

const INITIAL_TOP_CHUNKS = [
  { idx: 1, source: 'Redis Runbook v3.2 §3.1', page: 12, score: 0.92, docId: 'k1', text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换...' },
  { idx: 2, source: 'CMDB PRD-CACHE-019', page: null, score: 0.78, docId: 'k2', text: 'prod-redis-01 资产编号 PRD-CACHE-019，归属 ACME 生产集群，cn-east-1 区，双实例主从...' },
  { idx: 3, source: 'INC-019 处理记录', page: 5, score: 0.71, docId: 'k3', text: '历史类似事件在 2026-05-22 处置耗时 38min，使用 CONFIG SET 临时扩容 + 后续调整策略...' },
  { idx: 4, source: 'Prometheus 告警规则', page: null, score: 0.65, docId: 'k4', text: 'rate(redis_oom_total[5m]) > 3 触发 P0 告警；持续 10min 自动升级...' },
  { idx: 5, source: '变更辅助 Runbook', page: 8, score: 0.58, docId: 'k5', text: 'Redis 升级必须在维护窗口执行，建议使用灰度发布 + 双实例验证...' },
  { idx: 6, source: 'On-Call 手册 v2.1', page: 22, score: 0.51, docId: 'k6', text: 'P0 故障 5min 内需在飞书群同步状态，超过 15min 升级到 L2 主管...' },
  { idx: 7, source: 'CVE-2026-1042', page: null, score: 0.43, docId: 'k7', text: 'Redis 7.2 之前版本存在 AUTH 绕过漏洞，建议尽快升级到 7.2.5+' },
];

const KB_TYPE_OPTIONS = ['Runbook', 'CMDB', 'CVE', 'SIEM', 'Postmortem', '变更方案', '合规文档'];

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

type ModalKind = 'newKb' | 'upload' | 'reindex' | 'citationAgents' | null;

export default function Knowledge() {
  const [tab, setTab] = useState('runbook');
  const [docPreviewId, setDocPreviewId] = useState<string | null>('k1');
  const [chunkDrawer, setChunkDrawer] = useState<any | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [reindexConfirm, setReindexConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // 本地可写 state
  const [kbList, setKbList] = useState<any[]>([]);
  const [topChunks, setTopChunks] = useState<any[]>(INITIAL_TOP_CHUNKS);
  const [reindexing, setReindexing] = useState<Record<string, boolean>>({});

  const { data: fetchedKbList = [] } = useApiQuery<any[]>(['kb-list'], '/api/knowledge/kb-list');
  const { data: docs } = useApiQuery<KnowledgeDoc[]>(['knowledge', 'docs'], '/api/knowledge/docs');
  const { data: docDetail } = useApiQuery<any>(['doc', docPreviewId], `/api/knowledge/doc/${docPreviewId ?? 'k1'}`);
  const { data: searchHistory = [] } = useApiQuery<any[]>(['search-history'], '/api/knowledge/search-history');
  const { data: citationTrace = [] } = useApiQuery<any[]>(['citation-trace'], '/api/knowledge/citation-trace');
  const { data: evalMetrics } = useApiQuery<any>(['eval'], '/api/knowledge/eval');

  // 把 fetched 数据塞进本地 state（首次）
  useEffect(() => {
    if (fetchedKbList.length && kbList.length === 0) setKbList(fetchedKbList);
  }, [fetchedKbList, kbList.length]);

  // 检索测试 query
  const [testQuery, setTestQuery] = useState('');

  // 标签筛选
  const allTags = useMemo(() => {
    const s = new Set<string>();
    (docs ?? []).forEach((d) => s.add(d.source));
    return Array.from(s);
  }, [docs]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const filteredDocs = useMemo(() => {
    return (docs ?? []).filter((d) => {
      if (tagFilter && d.source !== tagFilter) return false;
      if (searchQ && !d.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [docs, tagFilter, searchQ]);

  // 检索测试结果（纯前端匹配）
  const searchResults = useMemo(() => {
    if (!testQuery.trim()) return [];
    const q = testQuery.toLowerCase();
    return topChunks
      .filter((c) => c.text.toLowerCase().includes(q) || c.source.toLowerCase().includes(q))
      .map((c) => ({ ...c, score: Math.min(0.99, c.score + (q.length % 5) * 0.01) }));
  }, [testQuery, topChunks]);

  // 当前 KB
  const currentKb = kbList.find((k) => k.key === tab);
  const isReindexing = !!reindexing[tab];

  // Handlers
  const handleNewKb = (form: { key: string; label: string; source: string; embedding: string }) => {
    const id = `kb_${Date.now().toString(36)}`;
    setKbList((prev) => [
      ...prev,
      { key: form.key, label: form.label, source: form.source, count: 0, embedding: form.embedding },
    ]);
    setTab(form.key);
    setActiveModal(null);
  };

  const handleUploadDoc = (form: { title: string; source: string; tags: string }) => {
    // 纯前端：只在控制台提示（mock 数据契约不变）
    // 真实场景会追加 docs state，但 mock 是只读，这里仅给视觉反馈
    setActiveModal(null);
    // eslint-disable-next-line no-console
    console.info('[mock upload]', form);
  };

  const handleReindex = () => {
    setReindexing((prev) => ({ ...prev, [tab]: true }));
    setReindexConfirm(false);
    // 3 秒后清除（仅作演示）
    setTimeout(() => setReindexing((prev) => ({ ...prev, [tab]: false })), 2500);
  };

  const handleRescore = () => {
    setTopChunks((prev) =>
      [...prev]
        .map((c) => ({ ...c, score: Math.min(0.99, Math.max(0.3, c.score + (Math.random() - 0.5) * 0.08)) }))
        .sort((a, b) => b.score - a.score)
        .map((c, i) => ({ ...c, idx: i + 1 })),
    );
  };

  const activeCitation = citationTrace[0] ?? null;

  return (
    <div className="knowledge-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      {/* 左侧 4 KB */}
      <aside className="hidden">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center justify-between">
            <span>知识库 ({kbList.length})</span>
            <button
              onClick={() => setActiveModal('newKb')}
              className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)]"
              title="新建知识库"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {kbList.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors mb-1',
                tab === t.key
                  ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold'
                  : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              )}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{t.label}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{t.source}</div>
              </div>
              <Badge tone="neutral" className="text-[10px]">{t.count}</Badge>
            </button>
          ))}
        </div>
        <div className="p-3">
          <Button size="sm" variant="secondary" className="w-full" onClick={() => setActiveModal('newKb')}>
            <Plus className="h-3.5 w-3.5" />新建知识库
          </Button>
          {kbList.length === 0 && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">暂无知识库，点击右上角 + 或下方按钮创建</p>
          )}
        </div>
      </aside>

      <section className="mx-auto w-full max-w-[1680px]">
        {/* Header + RAG Pipeline */}
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[var(--brand)]" />
                {currentKb?.label ?? '知识库'}
                {isReindexing && (
                  <Badge tone="warn" className="ml-2 text-[10px]">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />重新索引中…
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                247 个文档 · 124k 向量段 · 320ms 召回 · 92% 命中率
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDetails(true)}>
                <Eye className="h-3.5 w-3.5" />知识详情
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setReindexConfirm(true)}>
                <RefreshCw className="h-3.5 w-3.5" />重新索引
              </Button>
              <Button size="sm" onClick={() => setActiveModal('upload')}>
                <Upload className="h-3.5 w-3.5" />上传文档
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
            <span className="px-1 text-[11px] text-[var(--text-muted)]">知识库</span>
            <div className="knowledge-kb-picker flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
              {kbList.map((knowledgeBase) => (
                <button key={knowledgeBase.key} onClick={() => setTab(knowledgeBase.key)} className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors',
                  tab === knowledgeBase.key ? 'border-[var(--brand)]/40 bg-[var(--brand-light)] font-semibold text-[var(--brand)]' : 'border-transparent bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                )}>
                  <Database className="h-3.5 w-3.5" />{knowledgeBase.label}<span className="font-mono text-[10px] opacity-70">{knowledgeBase.count}</span>
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setActiveModal('newKb')}><Plus className="h-3.5 w-3.5" />新建</Button>
          </div>

          {/* RAG Pipeline 5 步 */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((p, i) => (
              <div key={p.key} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)]">
                    <p.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">Step {i + 1}</div>
                </div>
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{p.tool}</div>
                <div className="mt-1 text-[11px] font-mono font-semibold text-[var(--brand)]">{p.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 文档网格 + 标签筛选 + 搜索 */}
        <div className="p-4 pb-8 sm:p-5 sm:pb-10">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold">文档列表</div>
              <Badge tone="neutral" className="text-[10px]">{filteredDocs.length} 个</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                <Input
                  placeholder="搜索文档..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="h-7 pl-7 w-40 text-xs"
                />
              </div>
              <Filter size={12} className="text-[var(--text-muted)]" />
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-mono',
                    tagFilter === t ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)]',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="没有匹配的文档"
              description={searchQ || tagFilter ? '尝试清除筛选条件或换个关键词' : '点击「上传文档」添加第一批内容'}
              action={
                !searchQ && !tagFilter && (
                  <Button size="sm" onClick={() => setActiveModal('upload')}>
                    <Upload className="h-3.5 w-3.5" />上传文档
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredDocs.map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    'tile-brandable relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 cursor-pointer',
                    d.id === docPreviewId && 'card-active',
                  )}
                  onClick={() => setDocPreviewId(d.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'grid h-10 w-10 place-items-center rounded-md shrink-0',
                      d.source === 'Runbook' ? 'bg-[var(--brand-light)] text-[var(--brand)]' :
                      d.source === 'CMDB' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                      d.source === 'CVE' ? 'bg-[var(--danger-bg)] text-[var(--danger)]' :
                      'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
                    )}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate flex-1">{d.title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                        <Badge tone="info">{d.source}</Badge>
                        <Badge tone={d.status === 'ready' ? 'success' : 'warn'}>{d.status}</Badge>
                        <span className="text-[var(--text-muted)] font-mono">v3.2</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="font-mono">{d.chunks} chunks · {d.sizeKb} KB</span>
                        <span>↑ {d.citeCount} 引用</span>
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--text-muted)]">上传者: 李婷 · {d.updatedAt.slice(0, 10)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 按需展开的知识详情 */}
      <Drawer
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title={currentKb ? `${currentKb.label} · 知识详情` : '知识详情'}
        description="文档预览、检索测试、引用证据与评测指标"
        width={460}
      >
        {docDetail && (
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />文档预览
              </div>
              <button className="text-[10px] text-[var(--brand)] hover:underline flex items-center gap-0.5">
                <Download className="h-3 w-3" />下载
              </button>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">{docDetail.title}</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-2 mb-2">
                <span>{docDetail.source}</span> · <span>v{docDetail.version?.slice(1)}</span> · <span>{docDetail.author}</span>
                <span className="ml-auto font-mono">{docDetail.size} · {docDetail.chunks} chunks</span>
              </div>
              <div className="max-h-48 overflow-y-auto pr-1">
                <MarkdownView text={docDetail.content} />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setChunkDrawer(topChunks[0])}>
                <Hash className="h-3 w-3" />Chunk 编辑
              </Button>
              <Button size="sm" variant="secondary" className="flex-1">
                <ExternalLink className="h-3 w-3" />打开
              </Button>
            </div>
          </div>
        )}

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
            onKeyDown={(e) => e.key === 'Enter' && testQuery.trim() && setTopChunks((p) => p)}
          />
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="flex-1" onClick={() => { /* 触发 useMemo 重算 */ setTopChunks((p) => [...p]); }}>
              <Search className="h-3.5 w-3.5" />检索
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
      </Drawer>

      {/* ====== Modals ====== */}

      <NewKbModal
        open={activeModal === 'newKb'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleNewKb}
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
        description={`将对「${currentKb?.label ?? '当前知识库'}」所有文档重新执行 Embed + Index，预计耗时 5-10 分钟，期间检索仍然可用旧索引。`}
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

function EvalCard({ label, value, tone }: { label: string; value: string; tone: 'success' | 'info' | 'primary' | 'purple' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'info' ? 'text-[var(--info)]' : tone === 'primary' ? 'text-[var(--brand)]' : 'text-[var(--purple)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-bold font-mono', color)}>{value}</div>
    </div>
  );
}

function DrawerField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}

function NewKbModal({
  open, onClose, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { key: string; label: string; source: string; embedding: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [source, setSource] = useState(KB_TYPE_OPTIONS[0]);
  const [embedding, setEmbedding] = useState('BGE-M3');
  const valid = label.trim().length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建知识库"
      description="创建后可上传文档或配置自动同步"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            disabled={!valid}
            onClick={() => onSubmit({ key: `kb_${Date.now().toString(36)}`, label: label.trim(), source, embedding })}
          >
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="知识库名称" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例如：故障 Runbook" />
        </Field>
        <Field label="文档分类">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"
          >
            {KB_TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Embedding 模型">
          <select
            value={embedding}
            onChange={(e) => setEmbedding(e.target.value)}
            className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text)]"
          >
            <option>BGE-M3</option>
            <option>OpenAI text-embedding-3</option>
            <option>Cohere embed-multilingual-v3</option>
          </select>
        </Field>
        <p className="text-[10px] text-[var(--text-muted)]">提示：知识库创建后可单独配置 Embedding、Chunk 策略与同步源。</p>
      </div>
    </Modal>
  );
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
