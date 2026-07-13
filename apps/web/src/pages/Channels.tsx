/**
 * P10 渠道（企业级优化版）
 * Todo 1-10:
 *  1. 渠道健康度监控
 *  2. 消息发送实时流
 *  3. Adaptive Card 可视化编辑器（4 模板）
 *  4. 路由策略配置
 *  5. 失败重试配置 + 告警
 *  6. 静默期 / 合并窗口配置
 *  7. 消息统计图表
 *  8. 渠道测试器
 *  9. 多语言模板
 * 10. 黑名单 / 频率限制
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import {
  Send, MessageSquare, Mail, Webhook, Phone, AlertCircle, FileText,
  ShieldCheck, Plus, CheckCircle2, ArrowRight, Activity, Clock,
  Volume2, History, Edit3, AlertTriangle, Clock3, Globe, Ban,
  Send as SendIcon, PhoneCall,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Channel, ChannelKind } from '@de/web-types';

const ICONS: Record<ChannelKind, any> = {
  feishu: MessageSquare, wecom: MessageSquare, dingtalk: MessageSquare, slack: MessageSquare,
  email: Mail, webhook: Webhook, sms: Phone, phone: Phone,
};

const ROUTE_TABLE = [
  { event: 'P0 紧急告警', main: '飞书', f1: '企微', f2: '电话+SMS', fb: '邮件', tone: 'error' as const },
  { event: 'P1 重要升级', main: '飞书+企微', f1: '电话', f2: '邮件', fb: '—', tone: 'warn' as const },
  { event: 'P2 标准通知', main: '企微', f1: '飞书', f2: '邮件', fb: '—', tone: 'info' as const },
  { event: 'P3 内部播报', main: '邮件', f1: 'Slack', f2: 'Webhook', fb: '—', tone: 'neutral' as const },
  { event: '外部用户', main: '邮件 (T&S)', f1: 'SMS', f2: 'Webhook', fb: '—', tone: 'info' as const },
  { event: '审计日志', main: 'Webhook→SIEM', f1: 'S3→归档', f2: '—', fb: '—', tone: 'neutral' as const },
];

const CARDS = [
  { name: '告警卡片', icon: AlertCircle, tone: 'error' as const, desc: 'P0/P1 紧急事件 · 含一键跳转', preview: '🔴 [P0] Redis OOM\n集群: prod-redis-01\n时间: 14:32:01\n[查看详情 →]' },
  { name: '审批卡片', icon: ShieldCheck, tone: 'warn' as const, desc: '双签审批 · 同意/拒绝按钮', preview: '✍️ 变更审批\n操作: CONFIG SET\n操作人: 王昊\n[批准] [拒绝]' },
  { name: '报告卡片', icon: FileText, tone: 'info' as const, desc: '日报/周报/月报 · 富文本', preview: '📊 本月合规报告\n94 项 · 98 分\n合规: ✓\n[下载 PDF]' },
  { name: '升级卡片', icon: MessageSquare, tone: 'success' as const, desc: '任务升级 · @指定接收人', preview: '⚠️ 任务升级\n@李婷 @孙博\n优先级: P0\n[立即处理]' },
];

const STATS = [
  { label: '本月发送', value: '1.24k', tone: 'brand' as const },
  { label: '送达率', value: '99.1%', tone: 'success' as const },
  { label: '日均', value: '412', tone: 'primary' as const },
  { label: 'P95', value: '850ms', tone: 'info' as const },
];

const LANGUAGES = [
  { key: 'zh-CN', label: '简体中文', sample: '您的服务出现异常，请立即处理。' },
  { key: 'en-US', label: 'English', sample: 'Your service has encountered an anomaly, please handle immediately.' },
  { key: 'ja-JP', label: '日本語', sample: 'サービスで異常が発生しました。すぐに対応してください。' },
];

const BLACKLIST = [
  { id: 'b1', type: '用户', value: 'test-spammer@external.com', reason: '高频无效告警', addedBy: '系统', expires: '2026-08-01' },
  { id: 'b2', type: '电话', value: '+86 139****8888', reason: '拒收投诉', addedBy: '孙博', expires: '永久' },
];

export default function Channels() {
  const [activeId, setActiveId] = useState('c1');
  const [showStream, setShowStream] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const { data: channels } = useApiQuery<Channel[]>(['channels'], '/api/channels');
  const { data: health } = useApiQuery<any>(['channel-health'], '/api/channel-health');
  const { data: stream = [] } = useApiQuery<any[]>(['message-stream'], '/api/message-stream');
  const { data: config } = useApiQuery<any>(['channel-config'], '/api/channel-config');
  const active = channels?.find((c) => c.id === activeId);
  const h = health?.[activeId];
  const cfg = config?.[activeId];
  const groups = ['国内 IM', '国外 IM', '邮件+API'];

  return (
    <div className="flex h-full">
      {/* 左侧渠道 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)]">
          <div className="text-xs font-semibold">渠道 ({channels?.length ?? 0})</div>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g} className="p-2">
            <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">{g}</div>
            {(channels ?? []).filter((c) => (g === '国内 IM' ? ['feishu', 'wecom', 'dingtalk'].includes(c.kind) : g === '国外 IM' ? c.kind === 'slack' : ['email', 'webhook'].includes(c.kind))).map((c) => {
              const Icon = ICONS[c.kind];
              const ch = health?.[c.id];
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md p-2.5 text-left transition-all mb-1',
                    c.id === activeId ? 'card-active' : 'hover:bg-[var(--bg-elevated)] border border-transparent',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{c.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">{ch?.latency ?? '—'}ms · {ch?.success ?? 0}%</div>
                  </div>
                  <span className={cn('h-2 w-2 rounded-full', c.enabled ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--text-muted)]')} />
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* 中间 */}
      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Send className="h-5 w-5 text-[var(--brand)]" />
                智能路由 · 6 类事件 × 4 兜底
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                主渠道 → 失败 1 → 失败 2 → 兜底 · Adaptive Card v2.0
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Todo 8: 渠道测试 */}
              <Button variant="secondary" size="sm">
                <SendIcon className="h-3.5 w-3.5" />发送测试
              </Button>
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />智能路由启用</Badge>
            </div>
          </div>

          {/* 路由表 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                  <th className="text-left px-4 py-2 font-semibold">事件</th>
                  <th className="text-left px-4 py-2 font-semibold">主</th>
                  <th className="text-left px-4 py-2 font-semibold">失败 1</th>
                  <th className="text-left px-4 py-2 font-semibold">失败 2</th>
                  <th className="text-left px-4 py-2 font-semibold">兜底</th>
                </tr>
              </thead>
              <tbody>
                {ROUTE_TABLE.map((r) => (
                  <tr key={r.event} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                    <td className="px-4 py-2.5"><Badge tone={r.tone}>{r.event}</Badge></td>
                    <td className="px-4 py-2.5 font-semibold">{r.main}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.f1}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.f2}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.fb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Todo 2: 消息实时流 */}
          {showStream && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />消息发送实时流
                  <Badge tone="success" className="text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse mr-1" />
                    LIVE
                  </Badge>
                </div>
                <button onClick={() => setShowStream(false)} className="text-[10px] text-[var(--brand)] hover:underline">收起</button>
              </div>
              <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
                {stream.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 rounded-md bg-[var(--bg-elevated)] p-2 text-[11px]">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">{m.time}</span>
                    <Badge tone={m.status === 'delivered' ? 'success' : 'error'} className="text-[9px] shrink-0">
                      {m.channel}
                    </Badge>
                    <span className="flex-1 truncate">
                      <span className="text-[var(--text-secondary)]">→ {m.target}:</span> {m.content}
                    </span>
                    {m.status === 'failed' && (
                      <Badge tone="error" className="text-[9px] shrink-0">失败</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Todo 3: Adaptive Card 4 模板 */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Edit3 className="h-4 w-4 text-[var(--brand)]" />Adaptive Card v2.0 · 4 类模板
            </div>
            <Button size="sm" variant="secondary"><Plus className="h-3 w-3" />新建模板</Button>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {CARDS.map((c) => {
              const toneBg = c.tone === 'error' ? 'bg-[var(--danger-bg)] border-[var(--danger)]/30' :
                c.tone === 'warn' ? 'bg-[var(--warning-bg)] border-[var(--warning)]/30' :
                c.tone === 'info' ? 'bg-[var(--info-bg)] border-[var(--info)]/30' :
                'bg-[var(--success-bg)] border-[var(--success)]/30';
              return (
                <div key={c.name} className={cn('rounded-lg border p-3', toneBg)}>
                  <div className="flex items-center gap-2 mb-2">
                    <c.icon className={cn('h-4 w-4', c.tone === 'error' ? 'text-[var(--danger)]' : c.tone === 'warn' ? 'text-[var(--warning)]' : c.tone === 'info' ? 'text-[var(--info)]' : 'text-[var(--success)]')} />
                    <span className="text-sm font-semibold">{c.name}</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-2">{c.desc}</div>
                  <pre className="text-[10px] font-mono bg-[var(--bg)] rounded p-2 whitespace-pre-wrap text-[var(--text-secondary)] border border-[var(--border)]">
                    {c.preview}
                  </pre>
                  <Button size="sm" variant="secondary" className="w-full mt-2">编辑模板</Button>
                </div>
              );
            })}
          </div>

          {/* Todo 9: 多语言模板 */}
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />多语言模板（默认 zh-CN）
            </div>
            <div className="space-y-2">
              {LANGUAGES.map((l) => (
                <div key={l.key} className="flex items-start gap-3 rounded-md bg-[var(--bg-elevated)] p-2.5 text-xs">
                  <Badge tone="info" className="text-[10px] shrink-0">{l.key}</Badge>
                  <span className="font-semibold shrink-0 w-20">{l.label}</span>
                  <span className="text-[var(--text-muted)] flex-1">{l.sample}</span>
                </div>
              ))}
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-4 gap-3">
            {STATS.map((s) => (
              <div key={s.label} className={cn('kpi-card', `kpi-card--${s.tone === 'primary' ? 'brand' : s.tone}`)}>
                <div className="kpi-card__label">{s.label}</div>
                <div className="kpi-card__value !text-2xl">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 右侧：详情 + 配置 + 黑名单 */}
      <aside className="w-[340px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {/* Todo 1: 健康度 */}
        {active && h && (
          <div className="p-4 border-b border-[var(--border)]">
            <div className="text-xs font-semibold mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />{active.name} 健康度
              </span>
              <Badge tone={h.status === 'healthy' ? 'success' : h.status === 'disabled' ? 'neutral' : 'warn'}>
                {h.status}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <KpiCard label="延迟" value={h.latency > 0 ? `${h.latency}ms` : '—'} />
              <KpiCard label="送达率" value={`${h.success}%`} tone="success" />
              <KpiCard label="24h 失败" value={h.errorCount24h} tone={h.errorCount24h > 10 ? 'error' : 'neutral'} />
            </div>
          </div>
        )}

        {/* Todo 6: 配置（限流 + 重试 + 静默期 + 合并）============ */}
        {active && cfg && (
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Edit3 className="h-3.5 w-3.5" />渠道配置
              </div>
              <button onClick={() => setShowConfig(!showConfig)} className="text-[10px] text-[var(--brand)] hover:underline">
                {showConfig ? '收起' : '展开'}
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {/* Todo 10: 限流 */}
              <ConfigField label="QPS 限流" value={`${cfg.rateLimit.qps} / ${cfg.rateLimit.daily}/日`} />
              {/* Todo 5: 重试 */}
              <ConfigField label="失败重试" value={`最多 ${cfg.retry.max} 次 · ${cfg.retry.backoff === 'exponential' ? '指数退避' : cfg.retry.backoff}`} />
              {/* Todo 6: 静默期 + 合并窗口 */}
              <ConfigField label="静默期" value={`${cfg.silent.start} - ${cfg.silent.end}`} />
              <ConfigField label="合并窗口" value={cfg.mergeWindow} />
            </div>
            {showConfig && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                <div className="text-[10px] font-semibold text-[var(--text-muted)]">编辑</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary">QPS</Button>
                  <Button size="sm" variant="secondary">重试次数</Button>
                  <Button size="sm" variant="secondary">静默期</Button>
                  <Button size="sm" variant="secondary">合并窗口</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 路由路径 + 测试消息 */}
        {active && (
          <div className="p-4 border-b border-[var(--border)]">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />路由路径
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['飞书', '企微', '电话+SMS', '邮件'].map((step, i) => (
                <span key={step} className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-mono',
                  i === 0 ? 'bg-[var(--brand)] text-white'
                  : i === 1 ? 'bg-[var(--brand-light)] text-[var(--brand)] border border-[var(--brand)]/30'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]',
                )}>
                  {i + 1}. {step}
                </span>
              ))}
            </div>
            <Button className="w-full" size="sm">
              <SendIcon className="h-3.5 w-3.5" />发送测试消息
            </Button>
          </div>
        )}

        {/* Todo 10: 黑名单 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-[var(--danger)]" />黑名单（{BLACKLIST.length}）
            </div>
            <Button size="sm" variant="secondary"><Plus className="h-3 w-3" />添加</Button>
          </div>
          <div className="space-y-1.5">
            {BLACKLIST.map((b) => (
              <div key={b.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                <div className="flex items-center justify-between mb-0.5">
                  <Badge tone={b.type === '用户' ? 'info' : 'warn'} className="text-[9px]">{b.type}</Badge>
                  <span className="text-[10px] text-[var(--text-muted)]">至 {b.expires}</span>
                </div>
                <div className="font-mono text-[10px] truncate">{b.value}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{b.reason} · {b.addedBy}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 最近活动 */}
        <div className="p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />最近活动
          </div>
          <div className="activity-timeline">
            {stream.slice(0, 3).map((a) => (
              <div key={a.id} className="activity-timeline__item">
                <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone === 'warning' ? 'warning' : a.tone === 'info' ? 'info' : 'success'}`)}>
                  <CheckCircle2 className="h-3 w-3" />
                </div>
                <div className="activity-timeline__content">
                  <div className="activity-timeline__text">{a.channel} → {a.target}</div>
                  <div className="activity-timeline__time">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: any; tone?: 'success' | 'error' | 'neutral' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-center">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
    </div>
  );
}

function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono text-[11px]">{value}</span>
    </div>
  );
}