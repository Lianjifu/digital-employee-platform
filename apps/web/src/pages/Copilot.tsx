import { useState, useRef, useEffect } from 'react';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Avatar, Badge, Button, Input } from '@de/web-ui';
import { Bot, User as UserIcon, Send, Paperclip, Wrench, FileText, ShieldCheck, StopCircle } from 'lucide-react';
import { cn, relativeTime } from '@de/web-utils';
import type { Agent, Conversation } from '@de/web-types';

const QUICK_PROMPTS = [
  'prod-redis-01 OOM 了，怎么处理？',
  'K8s 节点扩容的最佳实践是什么？',
  '最近的 CVE 漏洞有哪些需要修复？',
  '生成本月容量预测报告',
];

export default function Copilot() {
  const [activeAgentId, setActiveAgentId] = useState('a1');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: agents } = useApiQuery<Agent[]>(['agents'], '/api/agents');
  const { data: conv } = useApiQuery<Conversation>(['conv', activeAgentId], '/api/conversations/cv1');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conv?.messages.length]);

  const onSend = () => {
    if (!input.trim()) return;
    setInput('');
    // TODO: 调真实接口 /api/copilot/chat
  };

  return (
    <div className="grid h-full grid-cols-[260px_1fr_320px] divide-x divide-[var(--color-border)]">
      {/* 左侧 Agent 列表 */}
      <aside className="flex flex-col overflow-hidden">
        <div className="border-b border-[var(--color-border)] p-3">
          <div className="text-xs font-semibold">数字员工</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">8 个领域 · 24 个 Agent</div>
          <Input className="mt-3" placeholder="搜索 Agent..." />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">AIOps</div>
          {(agents ?? []).filter((a) => a.category === 'AIOps').map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAgentId(a.id)}
              className={cn(
                'flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-xs transition-colors',
                activeAgentId === a.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'border-transparent hover:bg-[var(--color-surface-2)]',
              )}
            >
              <Avatar name={a.name} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="truncate text-[10px] text-[var(--color-text-muted)]">v{a.version} · ⭐ {a.rating}</div>
              </div>
            </button>
          ))}
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">SecOps</div>
          {(agents ?? []).filter((a) => a.category === 'SecOps').map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAgentId(a.id)}
              className={cn(
                'flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-xs transition-colors',
                activeAgentId === a.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'border-transparent hover:bg-[var(--color-surface-2)]',
              )}
            >
              <Avatar name={a.name} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="truncate text-[10px] text-[var(--color-text-muted)]">v{a.version} · ⭐ {a.rating}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* 中间对话 */}
      <section className="flex flex-col overflow-hidden">
        {/* 对话头 */}
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={conv?.title ?? '?'} size={32} />
            <div>
              <div className="text-sm font-semibold">{conv?.title ?? '加载中...'}</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                {agents?.find((a) => a.id === activeAgentId)?.name} · 模型 Sonnet-4 · 上下文 4.2k tokens
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="success"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />运行中</Badge>
            <Button size="sm" variant="outline">导出</Button>
          </div>
        </header>

        {/* 消息流 */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {conv?.messages.map((m) => (
            <div key={m.id} className={cn('flex gap-3', m.role === 'user' ? 'flex-row-reverse' : '')}>
              <div className="shrink-0">
                {m.role === 'user' ? (
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-surface-3)]">
                    <UserIcon className="h-4 w-4" />
                  </div>
                ) : m.role === 'tool' ? (
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/15 text-amber-500">
                    <Wrench className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className={cn('flex-1 space-y-2', m.role === 'user' ? 'flex flex-col items-end' : '')}>
                <div className="text-[10px] text-[var(--color-text-muted)]">{relativeTime(m.createdAt)}</div>
                <div
                  className={cn(
                    'max-w-2xl whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'bg-[var(--color-primary)] text-white'
                      : m.role === 'tool'
                        ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-text)]',
                  )}
                >
                  {m.content}
                </div>

                {/* 工具调用 */}
                {m.toolCalls?.map((tc) => (
                  <div key={tc.id} className="max-w-2xl rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-2 text-xs">
                    <div className="mb-1 flex items-center gap-1.5 font-mono">
                      <Wrench className="h-3 w-3 text-[var(--color-primary)]" />
                      <span className="font-semibold">{tc.name}</span>
                      <Badge tone={tc.status === 'success' ? 'success' : 'warn'}>{tc.status}</Badge>
                      {tc.durationMs && <span className="text-[var(--color-text-muted)]">· {tc.durationMs}ms</span>}
                    </div>
                    {tc.result && (
                      <pre className="overflow-x-auto rounded bg-[var(--color-bg)] p-2 text-[11px] text-emerald-400">{tc.result}</pre>
                    )}
                  </div>
                ))}

                {/* RAG 引用 */}
                {m.citations && m.citations.length > 0 && (
                  <div className="max-w-2xl space-y-1">
                    <div className="text-[10px] text-[var(--color-text-muted)]">📚 引用 {m.citations.length} 个文档段</div>
                    {m.citations.map((c) => (
                      <div key={c.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-2 text-xs">
                        <div className="mb-1 flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-[var(--color-primary)]" />
                          <span className="font-medium">{c.source}</span>
                          {c.page && <Badge tone="info">p.{c.page}</Badge>}
                          <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">相关度 {(c.score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="text-[var(--color-text-muted)]">{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className="border-t border-[var(--color-border)] p-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setInput(p)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-[11px] hover:bg-[var(--color-surface-3)]"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
            <button className="grid h-8 w-8 place-items-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]">
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="问任何问题... (Shift+Enter 换行)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
            />
            <Button onClick={onSend} disabled={!input.trim()} size="sm">
              <Send className="h-3.5 w-3.5" />
              发送
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> 对话存档 · SignedLog</span>
            <span>·</span>
            <span>P95 680ms · 99.4% 成功率</span>
          </div>
        </div>
      </section>

      {/* 右侧引用 + 操作 */}
      <aside className="flex flex-col gap-3 overflow-y-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs">RAG 检索</CardTitle>
            <Badge tone="success">Top-K=8</Badge>
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            <div className="flex justify-between"><span>召回</span><span>320ms</span></div>
            <div className="flex justify-between"><span>重排</span><span>BGE-reranker-large</span></div>
            <div className="flex justify-between"><span>命中率</span><span className="text-emerald-500">92%</span></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs">工具调用</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between"><span>redis-cli</span><Badge tone="success">✓</Badge></div>
            <div className="flex items-center justify-between"><span>kubectl</span><Badge tone="neutral">—</Badge></div>
            <div className="flex items-center justify-between"><span>loki-query</span><Badge tone="neutral">—</Badge></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs">会话信息</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            <div className="flex justify-between"><span>多轮深度</span><span>4.2 轮</span></div>
            <div className="flex justify-between"><span>Token 用量</span><span>1.2k / 200k</span></div>
            <div className="flex justify-between"><span>平均响应</span><span>680ms</span></div>
          </CardBody>
        </Card>

        <Button variant="outline" size="sm" className="w-full">
          <StopCircle className="h-3.5 w-3.5" /> 停止生成
        </Button>
      </aside>
    </div>
  );
}