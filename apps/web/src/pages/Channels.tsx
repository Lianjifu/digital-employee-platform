/**
 * P10 渠道 · 消息推送
 * 1:1 对齐 docs/01-product/mockups/p10-channels.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs } from '@de/web-ui';
import {
  Send, MessageSquare, Mail, Webhook, Phone, AlertCircle, FileText,
  ShieldCheck, Plus, CheckCircle2, ArrowUp, Activity, ChevronRight,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Channel, ChannelKind } from '@de/web-types';

const ICONS: Record<ChannelKind, any> = {
  feishu: MessageSquare, wecom: MessageSquare, dingtalk: MessageSquare, slack: MessageSquare,
  email: Mail, webhook: Webhook, sms: Phone, phone: Phone,
};

const CHANNELS = [
  { id: 'c1', kind: 'feishu' as const, name: '飞书', enabled: true, monthly: 480, rate: 0.998, group: '国内 IM' },
  { id: 'c2', kind: 'wecom' as const, name: '企业微信', enabled: true, monthly: 280, rate: 0.992, group: '国内 IM' },
  { id: 'c3', kind: 'dingtalk' as const, name: '钉钉', enabled: true, monthly: 120, rate: 0.985, group: '国内 IM' },
  { id: 'c4', kind: 'slack' as const, name: 'Slack', enabled: false, monthly: 0, rate: 0, group: '国外 IM' },
  { id: 'c5', kind: 'email' as const, name: '邮件', enabled: true, monthly: 240, rate: 0.978, group: '邮件+API' },
  { id: 'c6', kind: 'webhook' as const, name: 'Webhook', enabled: true, monthly: 120, rate: 0.995, group: '邮件+API' },
];

const ROUTE_TABLE = [
  { event: 'P0 紧急告警', main: '飞书', f1: '企微', f2: '电话+SMS', fb: '邮件', tone: 'error' as const },
  { event: 'P1 重要升级', main: '飞书+企微', f1: '电话', f2: '邮件', fb: '—', tone: 'warn' as const },
  { event: 'P2 标准通知', main: '企微', f1: '飞书', f2: '邮件', fb: '—', tone: 'info' as const },
  { event: 'P3 内部播报', main: '邮件', f1: 'Slack', f2: 'Webhook', fb: '—', tone: 'neutral' as const },
  { event: '外部用户', main: '邮件 (T&S)', f1: 'SMS', f2: 'Webhook', fb: '—', tone: 'info' as const },
  { event: '审计日志', main: 'Webhook→SIEM', f1: 'S3→归档', f2: '—', fb: '—', tone: 'neutral' as const },
];

const CARDS = [
  { name: '告警卡片', icon: AlertCircle, color: '#ef4444', desc: 'P0/P1 紧急事件 · 含一键跳转', tone: 'bg-[var(--danger-bg)] text-[var(--danger)]' },
  { name: '审批卡片', icon: ShieldCheck, color: '#f59e0b', desc: '双签审批 · 同意/拒绝按钮', tone: 'bg-[var(--warning-bg)] text-[var(--warning)]' },
  { name: '报告卡片', icon: FileText, color: '#3b82f6', desc: '日报/周报/月报 · 富文本', tone: 'bg-[var(--info-bg)] text-[var(--info)]' },
  { name: '升级卡片', icon: MessageSquare, color: '#10b981', desc: '任务升级 · @指定接收人', tone: 'bg-[var(--success-bg)] text-[var(--success)]' },
];

const STATS = [
  { label: '本月发送', value: '1.24k', tone: 'brand' as const },
  { label: '送达率', value: '99.1%', tone: 'success' as const },
  { label: '日均', value: '412', tone: 'primary' as const },
  { label: 'P95', value: '850ms', tone: 'info' as const },
];

const ACTIVITIES = [
  { tone: 'success' as const, text: '飞书 推送 cache-oom 告警', time: '14:28', target: '王昊' },
  { tone: 'success' as const, text: '邮件 推送合规审计报告', time: '14:18', target: '管理员组' },
  { tone: 'warning' as const, text: '企微 重试 2 次后送达', time: '13:55', target: 'SRE 组' },
  { tone: 'info' as const, text: 'Webhook 推送 SIEM 审计', time: '13:40', target: 'SIEM' },
];

export default function Channels() {
  const [activeId, setActiveId] = useState('c1');
  const active = CHANNELS.find((c) => c.id === activeId);
  const groups = ['国内 IM', '国外 IM', '邮件+API'];

  return (
    <div className="flex h-full">
      {/* 左侧渠道 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)]">
          <div className="text-xs font-semibold">渠道 (6)</div>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g} className="p-2">
            <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">{g}</div>
            {CHANNELS.filter((c) => c.group === g).map((c) => {
              const Icon = ICONS[c.kind];
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
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">{c.monthly} 发送</div>
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
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="page-header__title">智能路由 · 6 类事件 × 4 兜底</h1>
              <p className="page-header__sub">主渠道 → 失败 1 → 失败 2 → 兜底 · Adaptive Card v2.0</p>
            </div>
            <div className="page-header__actions">
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />智能路由启用</Badge>
            </div>
          </div>

          {/* 路由表 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
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
                  <tr key={r.event} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
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
        </div>

        {/* Adaptive Card 模板 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-3 text-xs font-semibold">Adaptive Card v2.0 · 4 类模板</div>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {CARDS.map((c) => (
              <div key={c.name} className="tile-brandable rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className={cn('mb-2 grid h-9 w-9 place-items-center rounded-md', c.tone)}>
                  <c.icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">{c.desc}</div>
                <Button size="sm" variant="secondary" className="mt-3 w-full">编辑模板</Button>
              </div>
            ))}
          </div>

          {/* KPI 4 张 */}
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

      {/* 右侧：详情 + 路由路径 + 合规 + 最近活动 */}
      <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        {active && (
          <>
            <div className="p-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[var(--brand)]" />
                  {active.name} 详情
                </div>
                <Badge tone={active.enabled ? 'success' : 'neutral'}>{active.enabled ? '已启用' : '未启用'}</Badge>
              </div>
              <div className="space-y-2 text-xs">
                <Row label="状态" value={<Badge tone={active.enabled ? 'success' : 'neutral'}>{active.enabled ? '运行中' : '已停止'}</Badge>} />
                <Row label="App ID" value={<span className="font-mono">cli_a7f****</span>} />
                <Row label="机器人" value="DE-Bot" />
                <Row label="本月发送" value={<span className="font-mono">{active.monthly}</span>} />
                <Row label="送达率" value={<span className={cn('font-mono font-semibold', active.rate >= 0.99 ? 'text-[var(--success)]' : active.rate >= 0.95 ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]')}>{(active.rate * 100).toFixed(1)}%</span>} />
              </div>
            </div>

            <div className="p-4 border-b border-[var(--border)]">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />路由路径
              </div>
              <div className="flow-row flex-wrap">
                {['飞书', '企微', '电话+SMS', '邮件'].map((step, i) => (
                  <span key={step} className="flow-node-pill text-[10px]">{step}</span>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-[var(--text-muted)] font-mono">
                失败 5xx 后自动降级 · 兜底邮件保证必达
              </div>
            </div>

            <div className="p-4 border-b border-[var(--border)]">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />合规
              </div>
              <div className="space-y-1.5 text-xs">
                <Row label="PII 脱敏" value={<Badge tone="success">token 级</Badge>} />
                <Row label="静默期" value="22:00-08:00" />
                <Row label="合并窗口" value="5 min" />
                <Row label="重试次数" value="3 · 指数退避" />
              </div>
            </div>

            <div className="p-4 border-b border-[var(--border)]">
              <div className="text-xs font-semibold mb-3">最近活动</div>
              <div className="activity-timeline">
                {ACTIVITIES.map((a, i) => (
                  <div key={i} className="activity-timeline__item">
                    <div className={cn('activity-timeline__dot', `activity-timeline__dot--${a.tone}`)}>
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                    <div className="activity-timeline__content">
                      <div className="activity-timeline__text">{a.text}</div>
                      <div className="activity-timeline__time">{a.time} · {a.target}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4">
              <Button className="w-full"><Send className="h-3.5 w-3.5" />发送测试消息</Button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}