import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Tabs } from '@de/web-ui';
import { Send, MessageSquare, Mail, Webhook, Phone, AlertCircle, FileText, ShieldCheck } from 'lucide-react';
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
  { name: '告警卡片', icon: AlertCircle, color: '#ef4444', desc: 'P0/P1 紧急事件 · 含一键跳转' },
  { name: '审批卡片', icon: ShieldCheck, color: '#f59e0b', desc: '双签审批 · 同意/拒绝按钮' },
  { name: '报告卡片', icon: FileText, color: '#3b82f6', desc: '日报/周报/月报 · 富文本' },
  { name: '升级卡片', icon: MessageSquare, color: '#10b981', desc: '任务升级 · @指定接收人' },
];

export default function Channels() {
  const { data: channels } = useApiQuery<Channel[]>(['channels'], '/api/channels');
  const [activeId, setActiveId] = useState('c1');

  const groups: { label: string; kinds: ChannelKind[] }[] = [
    { label: '国内 IM', kinds: ['feishu', 'wecom', 'dingtalk'] },
    { label: '国外 IM', kinds: ['slack'] },
    { label: '邮件 + API', kinds: ['email', 'webhook'] },
  ];

  return (
    <div className="grid h-full grid-cols-[240px_1fr_320px] divide-x divide-[var(--color-border)]">
      {/* 左侧渠道 */}
      <aside className="overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{g.label}</div>
            {(channels ?? []).filter((c) => g.kinds.includes(c.kind)).map((c) => {
              const Icon = ICONS[c.kind];
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-[var(--color-surface-2)] ${activeId === c.id ? 'bg-[var(--color-primary)]/15' : ''}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className={`h-2 w-2 rounded-full ${c.enabled ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* 中间 */}
      <section className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--color-border)] p-4">
          <h1 className="mb-3 text-sm font-semibold">智能路由 · 6 类事件 × 4 兜底</h1>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-[var(--color-text-muted)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 text-left">事件</th>
                <th className="py-2 text-left">主</th>
                <th className="py-2 text-left">失败 1</th>
                <th className="py-2 text-left">失败 2</th>
                <th className="py-2 text-left">兜底</th>
              </tr>
            </thead>
            <tbody>
              {ROUTE_TABLE.map((r) => (
                <tr key={r.event} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2.5"><Badge tone={r.tone}>{r.event}</Badge></td>
                  <td className="py-2.5 font-medium">{r.main}</td>
                  <td className="py-2.5 text-[var(--color-text-muted)]">{r.f1}</td>
                  <td className="py-2.5 text-[var(--color-text-muted)]">{r.f2}</td>
                  <td className="py-2.5 text-[var(--color-text-muted)]">{r.fb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 text-xs font-semibold">Adaptive Card v2.0 · 4 类模板</div>
          <div className="grid grid-cols-4 gap-3">
            {CARDS.map((c) => (
              <Card key={c.name}>
                <CardBody>
                  <div className="mb-2 grid h-9 w-9 place-items-center rounded-md" style={{ background: `${c.color}25`, color: c.color }}>
                    <c.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{c.desc}</div>
                  <Button size="sm" variant="outline" className="mt-2 w-full">编辑模板</Button>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
            <Stat label="本月发送" value="1.24k" />
            <Stat label="送达率" value="99.1%" tone="success" />
            <Stat label="日均" value="412" />
            <Stat label="P95" value="850ms" />
          </div>
        </div>
      </section>

      {/* 右侧：详情 */}
      <aside className="space-y-3 overflow-y-auto p-4">
        <Card>
          <CardHeader><CardTitle className="text-xs">飞书详情</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-xs">
            <Row label="状态" value={<Badge tone="success">已启用</Badge>} />
            <Row label="App ID" value={<span className="font-mono">cli_a7f****</span>} />
            <Row label="机器人" value="DE-Bot" />
            <Row label="本月发送" value="480" />
            <Row label="送达率" value={<span className="text-emerald-500">99.8%</span>} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">路由路径</CardTitle></CardHeader>
          <CardBody className="text-xs">
            <div className="rounded-md bg-[var(--color-surface-2)] p-2 font-mono text-[11px]">
              飞书 → (失败 5xx) → 企微 → (失败) → 电话+SMS → 邮件
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">合规</CardTitle><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /></CardHeader>
          <CardBody className="space-y-1 text-xs">
            <Row label="PII 脱敏" value={<Badge tone="success">是</Badge>} />
            <Row label="静默期" value="22:00-08:00" />
            <Row label="合并窗口" value="5min" />
          </CardBody>
        </Card>

        <Button className="w-full"><Send className="h-3.5 w-3.5" />发送测试消息</Button>
      </aside>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${tone === 'success' ? 'text-emerald-500' : 'text-[var(--color-text)]'}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}