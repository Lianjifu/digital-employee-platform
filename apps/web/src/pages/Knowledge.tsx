import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Progress } from '@de/web-ui';
import { Database, FileText, Brain, Layers, Search, Upload, ShieldCheck, Zap } from 'lucide-react';
import { cn, relativeTime } from '@de/web-utils';
import type { KnowledgeDoc, KnowledgeChunk, KnowledgeStep } from '@de/web-types';

const PIPELINE: { key: KnowledgeStep; label: string; icon: any; tool: string }[] = [
  { key: 'ingest', label: 'Ingest', icon: Upload, tool: 'Tika + PaddleOCR' },
  { key: 'chunk', label: 'Chunk', icon: FileText, tool: '512 tokens · 64 overlap' },
  { key: 'embed', label: 'Embed', icon: Brain, tool: 'BGE-M3 1024 维' },
  { key: 'index', label: 'Index', icon: Layers, tool: 'Milvus HNSW' },
  { key: 'retrieve', label: 'Retrieve', icon: Search, tool: 'Top-K=8 + Rerank' },
];

export default function Knowledge() {
  const { data: docs } = useApiQuery<KnowledgeDoc[]>(['knowledge', 'docs'], '/api/knowledge/docs');
  const { data: chunks } = useApiQuery<KnowledgeChunk[]>(['knowledge', 'top'], '/api/knowledge/chunks/top');

  // 30 天热力图（mock 矩阵）
  const heatmap = Array.from({ length: 30 }, (_, i) => Math.floor(Math.random() * 4));

  return (
    <div className="grid h-full grid-cols-[1fr_360px] divide-x divide-[var(--border)]">
      <section className="flex h-full flex-col overflow-hidden">
        {/* RAG Pipeline 5 步 */}
        <div className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold">RAG Pipeline · 5 步可视化</h1>
            <Button size="sm"><Upload className="h-3.5 w-3.5" />上传文档</Button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PIPELINE.map((p, i) => (
              <div key={p.key} className="relative rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="mb-1 flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-[var(--brand)]/15 text-[var(--brand)]">
                    <p.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">Step {i + 1}</div>
                </div>
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">{p.tool}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
            <KPI label="向量段" value="124k" />
            <KPI label="存储" value="12 GB" />
            <KPI label="P95 召回" value="320ms" tone="success" />
            <KPI label="命中率" value="92%" tone="success" />
          </div>
        </div>

        {/* 文档网格 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-2 text-xs font-semibold">24 个知识源</div>
          <div className="grid grid-cols-2 gap-3">
            {(docs ?? []).map((d) => (
              <Card key={d.id}>
                <CardBody className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--brand)]/15 text-[var(--brand)]">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{d.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                      <Badge tone="info">{d.source}</Badge>
                      <Badge tone={d.status === 'ready' ? 'success' : d.status === 'indexing' ? 'warn' : 'neutral'}>{d.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>{d.chunks} chunks · {d.sizeKb} KB</span>
                      <span>{d.citeCount} 引用</span>
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">{relativeTime(d.updatedAt)}</div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 右侧：Top chunks + 测试 + 合规 + 热力 */}
      <aside className="space-y-3 overflow-y-auto p-4">
        <Card>
          <CardHeader><CardTitle className="text-xs">Top-3 RAG Chunks</CardTitle><Badge tone="success">实时</Badge></CardHeader>
          <CardBody className="space-y-2 text-xs">
            {(chunks ?? []).slice(0, 3).map((c) => (
              <div key={c.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="font-medium text-[var(--brand)]">{c.source}</span>
                  {c.page && <Badge tone="info">p.{c.page}</Badge>}
                  <span className="ml-auto text-[10px] text-emerald-500">{(c.score * 100).toFixed(0)}%</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">{c.text}</div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">检索测试</CardTitle></CardHeader>
          <CardBody>
            <input
              placeholder="输入问题..."
              className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs outline-none focus:border-[var(--brand)]"
            />
            <Button size="sm" className="mt-2 w-full"><Search className="h-3.5 w-3.5" />检索</Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">合规边界</CardTitle><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /></CardHeader>
          <CardBody className="space-y-1 text-xs">
            <div className="flex justify-between"><span>PII 脱敏</span><Badge tone="success">token 级</Badge></div>
            <div className="flex justify-between"><span>数据出境</span><Badge tone="success">境内</Badge></div>
            <div className="flex justify-between"><span>字段权限</span><Badge tone="success">已配置</Badge></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">30 天使用热力图</CardTitle></CardHeader>
          <CardBody>
            <div className="grid grid-cols-10 gap-0.5">
              {heatmap.map((v, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-sm"
                  style={{
                    background: `rgba(59, 130, 246, ${0.15 + v * 0.2})`,
                  }}
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
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold', tone === 'success' ? 'text-emerald-500' : 'text-[var(--text)]')}>{value}</div>
    </div>
  );
}