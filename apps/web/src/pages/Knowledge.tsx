/**
 * P7 知识库（企业级优化版）
 * Todo 1-10:
 *  1. 知识库管理：4 KB + 创建向导
 *  2. 文档卡片：版本/大小/chunk + 上传者
 *  3. 文档预览侧栏：markdown 实时渲染
 *  4. 检索测试：实时 + 历史记录
 *  5. Top-K Chunks：可点击查看原文 + 重新评分
 *  6. 引用追踪：哪些任务/会话引用过
 *  7. 自动重新索引按钮
 *  8. 文档分类标签 + 全文搜索
 *  9. Chunk 编辑（高级）
 * 10. 评估指标：召回/准确/延迟
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Input } from '@de/web-ui';
import {
  Database, FileText, Brain, Layers, Search, Upload, ShieldCheck, Zap,
  Plus, Filter, Star, History, Eye, RefreshCw, Tag as TagIcon, X, Download,
  ExternalLink, TrendingUp, Activity, BookOpen, Hash, ChevronRight,
} from 'lucide-react';
import type { KnowledgeDoc } from '@de/web-types';
import { cn } from '@de/web-utils';

const PIPELINE: { key: string; label: string; icon: any; tool: string; count: string }[] = [
  { key: 'ingest', label: 'Ingest', icon: Upload, tool: 'Tika + PaddleOCR', count: '1.2 GB/日' },
  { key: 'chunk', label: 'Chunk', icon: FileText, tool: '512 tokens · 64 overlap', count: '247k 段' },
  { key: 'embed', label: 'Embed', icon: Brain, tool: 'BGE-M3 · 1024 维', count: '124k 向量' },
  { key: 'index', label: 'Index', icon: Layers, tool: 'Milvus HNSW', count: '12 GB' },
  { key: 'retrieve', label: 'Retrieve', icon: Search, tool: 'Top-K=8 + Rerank', count: '320ms P95' },
];

const TOP_CHUNKS = [
  { idx: 1, source: 'Redis Runbook v3.2 §3.1', page: 12, score: 0.92, docId: 'k1', text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换...' },
  { idx: 2, source: 'CMDB PRD-CACHE-019', page: null, score: 0.78, docId: 'k2', text: 'prod-redis-01 资产编号 PRD-CACHE-019，归属 ACME 生产集群，cn-east-1 区，双实例主从...' },
  { idx: 3, source: 'INC-019 处理记录', page: 5, score: 0.71, docId: 'k3', text: '历史类似事件在 2026-05-22 处置耗时 38min，使用 CONFIG SET 临时扩容 + 后续调整策略...' },
  { idx: 4, source: 'Prometheus 告警规则', page: null, score: 0.65, docId: 'k4', text: 'rate(redis_oom_total[5m]) > 3 触发 P0 告警；持续 10min 自动升级...' },
  { idx: 5, source: '变更辅助 Runbook', page: 8, score: 0.58, docId: 'k5', text: 'Redis 升级必须在维护窗口执行，建议使用灰度发布 + 双实例验证...' },
];

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

export default function Knowledge() {
  const [tab, setTab] = useState('runbook');
  const [docPreviewId, setDocPreviewId] = useState<string | null>('k1');
  const [chunkDrawer, setChunkDrawer] = useState<any | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);

  const { data: kbList = [] } = useApiQuery<any[]>(['kb-list'], '/api/knowledge/kb-list');
  const { data: docs } = useApiQuery<KnowledgeDoc[]>(['knowledge', 'docs'], '/api/knowledge/docs');
  const { data: docDetail } = useApiQuery<any>(['doc', docPreviewId], `/api/knowledge/doc/${docPreviewId ?? 'k1'}`);
  const { data: searchHistory = [] } = useApiQuery<any[]>(['search-history'], '/api/knowledge/search-history');
  const { data: citationTrace = [] } = useApiQuery<any[]>(['citation-trace'], '/api/knowledge/citation-trace');
  const { data: evalMetrics } = useApiQuery<any>(['eval'], '/api/knowledge/eval');

  // Todo 8: 文档分类标签 + 全文搜索
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

  // 30 天热力图
  const heatmap = Array.from({ length: 30 }, (_, i) => Math.floor(Math.random() * 5));

  return (
    <div className="flex h-full">
      {/* Todo 1: 左侧 4 KB + 创建向导 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center justify-between">
            <span>知识库 ({kbList.length})</span>
            <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)]">
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
          <Button size="sm" variant="secondary" className="w-full">
            <Plus className="h-3.5 w-3.5" />新建知识库
          </Button>
        </div>
      </aside>

      <section className="flex-1 flex flex-col overflow-hidden">
        {/* Header + RAG Pipeline */}
        <div className="border-b border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[var(--brand)]" />
                {kbList.find((k) => k.key === tab)?.label ?? '知识库'}
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                247 个文档 · 124k 向量段 · 320ms 召回 · 92% 命中率
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Todo 7: 重新索引 */}
              <Button variant="secondary" size="sm">
                <RefreshCw className="h-3.5 w-3.5" />重新索引
              </Button>
              <Button size="sm">
                <Upload className="h-3.5 w-3.5" />上传文档
              </Button>
            </div>
          </div>

          {/* RAG Pipeline 5 步 */}
          <div className="grid grid-cols-5 gap-2">
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

        {/* Todo 8: 文档网格 + 标签筛选 + 搜索 */}
        <div className="flex-1 overflow-y-auto p-5">
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
              {/* Todo 8: 标签筛选 */}
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

          <div className="grid grid-cols-2 gap-3">
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
                    {/* Todo 2: 上传者 + 版本 */}
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
        </div>
      </section>

      {/* Todo 3: 文档预览 + 检索测试 + 引用追踪 + 评估指标 */}
      <aside className="w-[340px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {/* Todo 3: 文档预览侧栏 */}
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
            {/* Todo 9: Chunk 编辑（高级） */}
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" className="flex-1">
                <Hash className="h-3 w-3" />Chunk 编辑
              </Button>
              <Button size="sm" variant="secondary" className="flex-1">
                <ExternalLink className="h-3 w-3" />打开
              </Button>
            </div>
          </div>
        )}

        {/* Todo 4: 检索测试 + 历史 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />检索测试
            </div>
            <button onClick={() => setSearchHistoryOpen(!searchHistoryOpen)} className="text-[10px] text-[var(--brand)] hover:underline">
              历史 ({searchHistory.length})
            </button>
          </div>
          <Input placeholder="输入测试问题..." />
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="flex-1">
              <Search className="h-3.5 w-3.5" />检索
            </Button>
            <Button size="sm" variant="secondary">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* 历史记录 */}
          {searchHistoryOpen && (
            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {searchHistory.map((h) => (
                <div key={h.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px] hover:border-[var(--brand)] cursor-pointer transition-colors">
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

        {/* Todo 5: Top-K Chunks（可点击） */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              Top-5 Chunks
              <Badge tone="success" className="ml-1 text-[10px]">实时</Badge>
            </div>
            <button className="text-[10px] text-[var(--brand)] hover:underline">重新评分</button>
          </div>
          <div className="space-y-2">
            {TOP_CHUNKS.map((c) => (
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

        {/* Todo 6: 引用追踪 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />引用追踪（最热）
          </div>
          <div className="space-y-2">
            {citationTrace.slice(0, 2).map((c) => (
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
        </div>

        {/* Todo 10: 评估指标 */}
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
      </aside>

      {/* Todo 5: Chunk 详情 Drawer */}
      {chunkDrawer && (
        <div className="fixed inset-0 z-40" onClick={() => setChunkDrawer(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute right-0 top-0 h-full w-[520px] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-semibold flex items-center gap-2">
                <Hash className="h-4 w-4 text-[var(--brand)]" />Chunk [{chunkDrawer.idx}] · 详情
              </div>
              <button onClick={() => setChunkDrawer(null)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <DrawerField label="来源" value={chunkDrawer.source} />
              {chunkDrawer.page && <DrawerField label="页码" value={`p.${chunkDrawer.page}`} mono />}
              <DrawerField label="相关度" value={<Badge tone="success">{(chunkDrawer.score * 100).toFixed(0)}%</Badge>} />
              <DrawerField label="所属文档" value="Redis 故障 Runbook v3.2" />
              <div className="pt-3 border-t border-[var(--border)]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">原文片段</div>
                <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-3 text-[11px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                  {chunkDrawer.text}
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
                <Button size="sm" variant="secondary" className="flex-1">
                  <RefreshCw className="h-3 w-3" />重新评分
                </Button>
                <Button size="sm" className="flex-1">
                  <ExternalLink className="h-3 w-3" />查看原文
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function DrawerField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn(mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}