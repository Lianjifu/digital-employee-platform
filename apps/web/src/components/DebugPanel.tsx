/**
 * 调试面板 — 查看消息流、Agent 元数据、Tool 调用详情、RAG 引用、日志
 * 点右上角"调试"按钮打开 / Esc 关闭
 */
import { useState, useEffect, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button } from '@de/web-ui';
import { X, Bug, Receipt, Cpu, Wrench, Database, Activity, Copy, CheckCircle2, AlertCircle, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { ChatMessageEx } from '@/hooks/types';
import type { ChatSession } from '@/hooks/useChat';

interface AgentMetaDebug {
  id: string; name: string; version: string; category: string;
  rating: number; ratingCount: number; lastActive: string;
  installCount: number; responseP95: number; totalTokens: number;
  sla: number; errorRate: number; knowledgeBases: number; tools: number; languages: string[];
  description?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  session: ChatSession | undefined;
  agentMeta: AgentMetaDebug | undefined;
}

const TABS: { key: string; label: string; icon: any }[] = [
  { key: 'request', label: 'Request', icon: Receipt },
  { key: 'response', label: 'Response', icon: Bug },
  { key: 'agent', label: 'Agent Info', icon: Cpu },
  { key: 'tools', label: 'Tool Calls', icon: Wrench },
  { key: 'rag', label: 'RAG', icon: Database },
  { key: 'logs', label: 'Logs', icon: Activity },
];

export function DebugPanel({ open, onClose, session, agentMeta }: Props) {
  const [tab, setTab] = useState('agent');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const copy = async (text: string, key?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (key) { setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1200); }
    } catch {}
  };

  // 所有 messages 的工具调用汇总
  const allToolCalls = useMemo(() => {
    if (!session) return [];
    return session.messages.flatMap((m) => (m.toolCalls ?? []).map((tc) => ({ ...tc, createdAt: m.createdAt, agentName: m.agentName })));
  }, [session]);

  // 所有 RAG 引用
  const allCites = useMemo(() => {
    if (!session) return [];
    return session.messages.flatMap((m) => (m.citations ?? []).map((c) => ({ ...c, createdAt: m.createdAt })));
  }, [session]);

  // 日志时间线
  const logs = useMemo(() => {
    if (!session) return [];
    const out: { time: string; text: string; tone: 'info' | 'success' | 'warn' | 'error'; detail?: string }[] = [];
    out.push({ time: new Date(session.createdAt).toLocaleTimeString(), text: '会话创建', tone: 'info', detail: `Session ID: ${session.id}` });
    session.messages.forEach((m) => {
      const role = m.role === 'user' ? '用户消息' : m.role === 'assistant' ? `${m.agentName ?? 'Agent'} 回复` : m.role === 'tool' ? '工具调用' : '系统消息';
      out.push({ time: m.createdAt.slice(11, 19), text: role, tone: m.role === 'user' ? 'info' : m.role === 'assistant' ? 'success' : 'warn' });
    });
    if (session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1];
      out.push({ time: '...', text: '消息流式完成', tone: 'success', detail: `${session.messages.length} 条消息` });
    }
    return out;
  }, [session]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative h-full w-[640px] max-w-[92vw] bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl flex flex-col overflow-hidden animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-[var(--brand)]" />
            <span className="text-sm font-semibold">调试面板</span>
            {session && <Badge tone="neutral" className="text-[9px] font-mono">{session.messages.length} 条消息</Badge>}
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--bg-hover)]" aria-label="关闭面板">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] overflow-x-auto px-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors',
                  active ? 'border-[var(--brand)] text-[var(--brand)] font-semibold' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs font-mono">
          {/* Request Tab */}
          {tab === 'request' && session && session.messages.map((m) => (
            <DebugBlock
              key={m.id}
              title={`${m.role.toUpperCase()} @ ${m.createdAt.slice(11, 19)}`}
              json={m}
              copyKey={m.id}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
          {tab === 'request' && session && session.messages.length === 0 && (
            <EmptyTab text="暂无消息数据。发送一条消息后在此查看请求体。" />
          )}

          {/* Response Tab */}
          {tab === 'response' && session && session.messages.filter((m) => m.role !== 'user').map((m) => (
            <DebugBlock
              key={m.id}
              title={`${(m as any).agentName ?? m.role.toUpperCase()} — ${m.createdAt.slice(11, 19)}`}
              json={m}
              copyKey={`res_${m.id}`}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          ))}
          {tab === 'response' && session && session.messages.filter((m) => m.role !== 'user').length === 0 && (
            <EmptyTab text={`暂无 Agent 回复。试试输入 "Redis OOM" 发送后查看原始响应。`} />
          )}

          {/* Agent Info Tab */}
          {tab === 'agent' && agentMeta && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="ID" value={agentMeta.id} />
                <Field label="名称" value={agentMeta.name} />
                <Field label="版本" value={agentMeta.version} />
                <Field label="分类" value={agentMeta.category} />
                <Field label="评分" value={`${agentMeta.rating} (${agentMeta.ratingCount} 人)`} />
                <Field label="最后活跃" value={agentMeta.lastActive} />
                <Field label="安装数" value={agentMeta.installCount.toLocaleString()} />
                <Field label="P95" value={`${agentMeta.responseP95}ms`} />
                <Field label="Token 累计" value={agentMeta.totalTokens.toLocaleString()} />
                <Field label="SLA" value={`${agentMeta.sla}%`} />
                <Field label="错误率" value={`${((agentMeta.errorRate ?? 0) * 100).toFixed(2)}%`} />
                <Field label="知识库" value={`${agentMeta.knowledgeBases} 个`} />
                <Field label="工具" value={`${agentMeta.tools} 个`} />
                <Field label="语言" value={agentMeta.languages?.join(' · ') ?? '—'} />
              </div>
              <div>
                <div className="text-[var(--text-muted)] mb-0.5">描述</div>
                <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded p-2">{agentMeta.description}</div>
              </div>
            </div>
          )}

          {/* Tool Calls Tab */}
          {tab === 'tools' && (
            <div className="space-y-2">
              {allToolCalls.length === 0 && <EmptyTab text="暂无工具调用。试试输入 'Redis OOM' 触发故障自愈的 tool call。" />}
              {allToolCalls.map((tc, i) => (
                <DebugBlock
                  key={i}
                  title={`${tc.name} — ${tc.durationMs}ms · ${tc.status}`}
                  sub={`${(tc as any).agentName ?? 'Agent'} @ ${(tc as any).createdAt?.slice(11, 19) ?? '—'}`}
                  json={tc}
                  copyKey={`tc_${i}`}
                  copiedKey={copiedKey}
                  onCopy={copy}
                />
              ))}
            </div>
          )}

          {/* RAG Tab */}
          {tab === 'rag' && (
            <div className="space-y-2">
              {allCites.length === 0 && <EmptyTab text="暂无 RAG 引用。试试输入 'Redis OOM' 触发故障自愈的 RAG 检索。" />}
              {allCites.map((c, i) => (
                <DebugBlock
                  key={i}
                  title={`[${i + 1}] ${c.source}${c.page ? ` · p.${c.page}` : ''} · ${((c.score ?? 0) * 100).toFixed(0)}%`}
                  json={c}
                  copyKey={`cite_${i}`}
                  copiedKey={copiedKey}
                  onCopy={copy}
                />
              ))}
            </div>
          )}

          {/* Logs Tab */}
          {tab === 'logs' && (
            <div className="space-y-1">
              {logs.length === 0 && <EmptyTab text="暂无日志。" />}
              {logs.map((l, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] p-2">
                  <span className={cn(
                    'shrink-0 w-3 h-3 rounded-full mt-0.5',
                    l.tone === 'success' ? 'bg-[var(--success)]' : l.tone === 'warn' ? 'bg-[var(--warning)]' : l.tone === 'error' ? 'bg-[var(--danger)]' : 'bg-[var(--text-muted)]',
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{l.time}</span>
                      <span className="font-semibold text-[11px]">{l.text}</span>
                    </div>
                    {l.detail && <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">{l.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DebugBlock({ title, sub, json, copyKey, copiedKey, onCopy }: {
  title: string; sub?: string; json: any; copyKey: string; copiedKey: string | null; onCopy: (text: string, key: string) => void;
}) {
  const text = useMemo(() => JSON.stringify(json, null, 2), [json]);
  return (
    <div className="rounded-md border border-[var(--border)] overflow-hidden">
      <div className="flex items-center justify-between bg-[var(--bg-elevated)] px-3 py-1.5 border-b border-[var(--border)] cursor-pointer" onClick={() => onCopy(text, copyKey)}>
        <div>
          <div className="text-[11px] font-semibold">{title}</div>
          {sub && <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onCopy(text, copyKey); }}
          className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text)]"
          title="复制 JSON"
        >
          {copiedKey === copyKey ? <CheckCircle2 className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed max-h-48 overflow-y-auto">{text}</pre>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between rounded bg-[var(--bg-elevated)] px-2.5 py-1.5 border border-[var(--border)]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] font-semibold">{value}</span>
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Bug className="h-8 w-8 text-[var(--text-muted)] opacity-30 mb-2" />
      <div className="text-[11px] text-[var(--text-muted)]">{text}</div>
    </div>
  );
}
