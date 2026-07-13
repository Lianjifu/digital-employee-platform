/**
 * P7 知识库 · RAG
 * 1:1 对齐 docs/01-product/mockups/p7-knowledge.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs, Input } from '@de/web-ui';
import { Database, FileText, Brain, Layers, Search, Upload, ShieldCheck, Zap, Plus, Filter } from 'lucide-react';
import { cn, relativeTime } from '@de/web-utils';
import type { KnowledgeDoc, KnowledgeChunk, KnowledgeStep } from '@de/web-types';

const PIPELINE: { key: KnowledgeStep; label: string; icon: any; tool: string; count: string }[] = [
  { key: 'ingest', label: 'Ingest', icon: Upload, tool: 'Tika + PaddleOCR', count: '1.2 GB/日' },
  { key: 'chunk', label: 'Chunk', icon: FileText, tool: '512 tokens · 64 overlap', count: '247k 段' },
  { key: 'embed', label: 'Embed', icon: Brain, tool: 'BGE-M3 · 1024 维', count: '124k 向量' },
  { key: 'index', label: 'Index', icon: Layers, tool: 'Milvus HNSW', count: '12 GB' },
  { key: 'retrieve', label: 'Retrieve', icon: Search, tool: 'Top-K=8 + Rerank', count: '320ms P95' },
];

const KB_TABS = [
  { key: 'runbook', label: 'Runbook 知识库', count: 86, source: 'Runbook' },
  { key: 'cmdb', label: 'CMDB 资产', count: 1280, source: 'CMDB' },
  { key: 'cve', label: 'CVE 漏洞库', count: 620, source: 'CVE' },
  { key: 'siem', label: 'SIEM 检测用例', count: 380, source: 'SIEM' },
];

const TOP_CHUNKS = [
  { idx: 1, source: 'Redis Runbook v3.2 §3.1', page: 12, score: 0.92, text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率；建议在维护窗口执行 volatile-lru 切换...' },
  { idx: 2, source: 'CMDB PRD-CACHE-019', page: null, score: 0.78, text: 'prod-redis-01 资产编号 PRD-CACHE-019，归属 ACME 生产集群，cn-east-1 区，双实例主从...' },
  { idx: 3, source: 'INC-019 处理记录', page: 5, score: 0.71, text: '历史类似事件在 2026-05-22 处置耗时 38min，使用 CONFIG SET 临时扩容 + 后续调整策略...' },
  { idx: 4, source: 'Prometheus 告警规则', page: null, score: 0.65, text: 'rate(redis_oom_total[5m]) > 3 触发 P0 告警；持续 10min 自动升级...' },
  { idx: 5, source: '变更辅助 Runbook', page: 8, score: 0.58, text: 'Redis 升级必须在维护窗口执行，建议使用灰度发布 + 双实例验证...' },
];

export default function Knowledge() {
  const [tab, setTab] = useState('runbook');
  const { data: docs } = useApiQuery<KnowledgeDoc[]>(['knowledge', 'docs'], '/api/knowledge/docs');

  // 30 天热力图
  const heatmap = Array.from({ length: 30 }, (_, i) => Math.floor(Math.random() * 5));

  return (
    <div className="flex h-full">
      {/* 左侧 KB 切换 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3">知识库 (4)</div>
          {KB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex w-full items-center justify-between rounded-md p-2.5 text-left transition-colors mb-1',
                tab === t.key
                  ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold'
                  : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Database className="h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs truncate">{t.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{t.source}</div>
                </div>
              </div>
              <Badge tone="neutral" className="text-[10px]">{t.count}</Badge>
            </button>
          ))}
        </div>
        <div className="p-4">
          <Button size="sm" variant="secondary" className="w-full">
            <Plus className="h-3.5 w-3.5" />新建知识库
          </Button>
        </div>
      </aside>

      <section className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="page-header__title">{KB_TABS.find((t) => t.key === tab)?.label}</h1>
              <p className="page-header__sub">
                247 个文档 · 124k 向量段 · 320ms 召回 · 92% 命中率
              </p>
            </div>
            <div className="page-header__actions">
              <Button variant="secondary" size="sm">
                <Filter className="h-3.5 w-3.5" />筛选
              </Button>
              <Button size="sm"><Upload className="h-3.5 w-3.5" />上传文档</Button>
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

        {/* 文档列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold">文档列表</div>
            <span className="text-[10px] text-[var(--text-muted)]">按引用数排序</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(docs ?? []).map((d) => (
              <div key={d.id} className="tile-brandable rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] text-[var(--brand)] shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{d.title}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                      <Badge tone="info">{d.source}</Badge>
                      <Badge tone={d.status === 'ready' ? 'success' : d.status === 'indexing' ? 'warn' : 'neutral'}>
                        {d.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>{d.chunks} chunks · {d.sizeKb} KB</span>
                      <span className="font-mono">{d.citeCount} 引用</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{relativeTime(d.updatedAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 右侧：检索测试 + Top Chunks + 合规 */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />检索测试
          </div>
          <Input placeholder="输入测试问题..." />
          <div className="mt-2 space-y-1.5">
            {['如何处理 Redis OOM？', 'CVE-2026-3321 影响哪些资产？', '容量预测算法'].map((q) => (
              <button key={q} className="w-full text-left px-2 py-1 rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] truncate">{q}</button>
            ))}
          </div>
          <Button size="sm" className="mt-2 w-full"><Search className="h-3.5 w-3.5" />检索</Button>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            Top-5 RAG Chunks
            <Badge tone="success" className="ml-auto">实时</Badge>
          </div>
          <div className="space-y-2">
            {TOP_CHUNKS.map((c) => (
              <div key={c.idx} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[var(--brand)] font-mono text-[10px] font-bold">[{c.idx}]</span>
                  <span className="font-semibold text-[11px] truncate flex-1">{c.source}</span>
                  {c.page && <Badge tone="info" className="text-[9px]">p.{c.page}</Badge>}
                  <span className="ml-auto text-[10px] text-[var(--success)] font-mono font-bold">{(c.score * 100).toFixed(0)}%</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] line-clamp-2">{c.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />合规边界
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>PII 脱敏</span><Badge tone="success">token 级</Badge></div>
            <div className="flex justify-between"><span>数据出境</span><Badge tone="success">境内</Badge></div>
            <div className="flex justify-between"><span>字段权限</span><Badge tone="success">已配置</Badge></div>
            <div className="flex justify-between"><span>审计追踪</span><Badge tone="success">SignedLog</Badge></div>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[var(--text-muted)]" />30 天使用热力图
          </div>
          <div className="grid grid-cols-10 gap-0.5">
            {heatmap.map((v, i) => (
              <div
                key={i}
                className="aspect-square rounded-sm"
                style={{ background: `rgba(59, 130, 246, ${0.15 + v * 0.17})` }}
                title={`D${i + 1}: ${v + 1} 次`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>少</span>
            <div className="flex gap-0.5">
              {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
                <div key={o} className="h-2 w-2 rounded-sm" style={{ background: `rgba(59, 130, 246, ${o})` }} />
              ))}
            </div>
            <span>多</span>
          </div>
        </div>
      </aside>
    </div>
  );
}