/**
 * P11 设置（企业级优化版）
 * Todo 1-10:
 *  1. 租户信息（完整表单）
 *  2. 成员 & 权限（CRUD 表格）
 *  3. 安全 & 认证（MFA / Authentik / OIDC）
 *  4. 审计 & 监控（实时流）
 *  5. 数据合规（94 项自评）
 *  6. 通知 & 告警（渠道订阅）
 *  7. 租户 & 计费（用量进度）
 *  8. 备份 & 恢复（历史 + 触发）
 *  9. API Key 管理
 * 10. Webhook 配置
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress } from '@de/web-ui';
import {
  Building2, Users, ShieldCheck, FileText, Lock, Bell, CreditCard, Database,
  CheckCircle2, AlertTriangle, Plus, Key, Webhook, RotateCcw, Download,
  History, Activity, Eye, Trash2, Archive, Send, Sparkles, Clock,
  ArrowRight, ChevronRight, Copy,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { AuditItem } from '@de/web-types';

const MENU = [
  { key: 'tenant', label: '租户信息', icon: Building2 },
  { key: 'members', label: '成员 & 权限', icon: Users },
  { key: 'security', label: '安全 & 认证', icon: ShieldCheck },
  { key: 'audit', label: '审计 & 监控', icon: FileText },
  { key: 'compliance', label: '数据合规', icon: Lock },
  { key: 'notify', label: '通知 & 告警', icon: Bell },
  { key: 'billing', label: '租户 & 计费', icon: CreditCard },
  { key: 'backup', label: '备份 & 恢复', icon: Database },
  { key: 'apikeys', label: 'API Key', icon: Key },
  { key: 'webhooks', label: 'Webhook', icon: Webhook },
];

export default function Settings() {
  const [active, setActive] = useState('security');
  const { data: audits = [] } = useApiQuery<AuditItem[]>(['audits'], '/api/audits');
  const { data: apiKeys = [] } = useApiQuery<any[]>(['api-keys'], '/api/api-keys');
  const { data: webhooks = [] } = useApiQuery<any[]>(['webhooks-config'], '/api/webhooks-config');
  const { data: backups = [] } = useApiQuery<any[]>(['backups'], '/api/backups');
  const { data: auditStream = [] } = useApiQuery<any[]>(['audit-stream'], '/api/audit-stream');
  const { data: billing } = useApiQuery<any>(['billing'], '/api/billing');
  const { data: notifChannels = [] } = useApiQuery<any[]>(['notification-channels'], '/api/notification-channels');

  const pass = audits.filter((a) => a.status === 'pass').length;
  const warn = audits.filter((a) => a.status === 'warn').length;
  const total = audits.length;
  const auditScore = Math.round((pass / total) * 100);

  return (
    <div className="flex h-full">
      {/* 左侧 10 模块菜单 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="text-[10px] font-semibold mb-3 uppercase tracking-wider text-[var(--text-muted)]">企业管理</div>
          <div className="space-y-0.5">
            {MENU.map((m) => (
              <button
                key={m.key}
                onClick={() => setActive(m.key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs transition-colors',
                  active === m.key ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold' : 'hover:bg-[var(--bg-hover)]',
                )}
              >
                <m.icon className="h-3.5 w-3.5" />
                <span>{m.label}</span>
                {active === m.key && <ChevronRight className="h-3 w-3 ml-auto" />}
              </button>
            ))}
          </div>
        </div>

        {/* 危险区 */}
        <div className="p-3">
          <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--danger)]">
              <AlertTriangle className="h-3.5 w-3.5" />危险区
            </div>
            <div className="mt-1.5 space-y-1.5">
              <Button size="sm" variant="secondary" className="w-full text-[10px] !h-7">
                <Archive className="h-3 w-3" />归档租户
              </Button>
              <Button size="sm" variant="secondary" className="w-full text-[10px] !h-7">
                <Database className="h-3 w-3" />迁移数据
              </Button>
              <Button size="sm" variant="danger" className="w-full text-[10px] !h-7">
                <Trash2 className="h-3 w-3" />删除租户
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* 中间主区 */}
      <section className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Todo 1: 租户信息 */}
        {active === 'tenant' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />租户信息
              </div>
              <Button size="sm">保存</Button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-xs">
              <Field label="租户名" value="ACME Corp" />
              <Field label="租户 ID" value={<span className="font-mono">tnt_a7f9****</span>} />
              <Field label="区域" value={<Badge tone="info">cn-east-1</Badge>} />
              <Field label="创建时间" value="2024-03-12" />
              <Field label="席位" value={<span className="font-mono">50 / 50</span>} />
              <Field label="订阅" value={<span className="font-mono">$5,000 / 月</span>} />
            </div>
          </div>
        )}

        {/* Todo 2: 成员 & 权限 */}
        {active === 'members' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />成员 & 权限
              </div>
              <Button size="sm"><Plus className="h-3 w-3" />邀请成员</Button>
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] bg-[var(--bg-elevated)]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">成员</th>
                  <th className="text-left px-3 py-2 font-semibold">角色</th>
                  <th className="text-left px-3 py-2 font-semibold">MFA</th>
                  <th className="text-left px-3 py-2 font-semibold">最后活跃</th>
                  <th className="text-right px-3 py-2 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: '王昊', role: 'Admin', mfa: true, last: '刚刚' },
                  { name: '李婷', role: 'SRE', mfa: true, last: '5min 前' },
                  { name: '张睿', role: 'Sec', mfa: true, last: '12min 前' },
                  { name: '孙博', role: 'Admin', mfa: true, last: '32min 前' },
                  { name: '周慧', role: 'View', mfa: false, last: '1h 前' },
                ].map((m, i) => (
                  <tr key={i} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]">
                    <td className="px-3 py-2 font-semibold">{m.name}</td>
                    <td className="px-3 py-2">
                      <Badge tone={m.role === 'Admin' ? 'error' : m.role === 'SRE' ? 'brand' : m.role === 'Sec' ? 'warn' : 'neutral'}>{m.role}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {m.mfa ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" /> : <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{m.last}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="text-[var(--text-muted)] hover:text-[var(--brand)]"><Eye /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Todo 3: 安全 & 认证 */}
        {active === 'security' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />94 项安全审计
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />{pass} 通过</Badge>
                <Badge tone="warn"><AlertTriangle className="mr-1 inline h-3 w-3" />{warn} 改善</Badge>
              </div>
            </div>
            <div className="p-4">
              <div className="mb-3 flex items-center gap-3">
                <Progress value={(pass / total) * 100} tone="success" />
                <span className="text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">{pass} / {total} · {auditScore}%</span>
              </div>
              <div className="space-y-1">
                {audits.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {a.status === 'pass' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)] shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />
                      )}
                      <span className="truncate">{a.name}</span>
                      <Badge tone="neutral" className="text-[9px]">{a.category}</Badge>
                    </div>
                    <Badge tone={a.status === 'pass' ? 'success' : 'warn'}>{a.status === 'pass' ? '通过' : '改善中'}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Todo 4: 审计 & 监控（实时流） */}
        {active === 'audit' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />实时审计流
                <Badge tone="success" className="text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse mr-1" />LIVE
                </Badge>
              </div>
              <Button size="sm" variant="secondary"><Download className="h-3 w-3" />导出</Button>
            </div>
            <div className="p-3 space-y-1.5 max-h-[500px] overflow-y-auto">
              {auditStream.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] p-2 text-[11px]">
                  <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">{a.time}</span>
                  <Badge tone={a.result === 'success' ? 'success' : 'error'} className="text-[9px] shrink-0">
                    {a.action}
                  </Badge>
                  <span className="text-[var(--text-muted)] shrink-0">{a.user}</span>
                  <ArrowRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                  <span className="font-mono text-[10px] truncate flex-1">{a.target}</span>
                  {a.result === 'success' ? (
                    <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-[var(--danger)]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Todo 5: 数据合规（合并到 security 同款） */}
        {active === 'compliance' && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: '等保 3.0', status: 'pass', desc: '94 项 / 91 通过' },
              { name: 'ISO 27001', status: 'pass', desc: '有效至 2027-03' },
              { name: '数据出境', status: 'pass', desc: '境内 94% / 出境 6%' },
              { name: 'GDPR 兼容', status: 'warn', desc: '需补充协议' },
            ].map((c) => (
              <div key={c.name} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{c.name}</span>
                  <Badge tone={c.status === 'pass' ? 'success' : 'warn'}>{c.status === 'pass' ? '通过' : '改善'}</Badge>
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">{c.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Todo 6: 通知 & 告警 */}
        {active === 'notify' && (
          <div className="space-y-3">
            {notifChannels.map((n) => (
              <div key={n.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bell className={cn('h-4 w-4', n.enabled ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]')} />
                    <span className="text-sm font-semibold">{n.name}</span>
                    <Badge tone={n.enabled ? 'success' : 'neutral'} className="text-[10px]">{n.enabled ? '启用' : '禁用'}</Badge>
                  </div>
                  <input type="checkbox" defaultChecked={n.enabled} className="accent-[var(--brand)]" />
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[var(--text-muted)]">渠道:</span>
                  {n.channels.map((c: string) => (
                    <Badge key={c} tone="info" className="text-[9px]">{c}</Badge>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">频率: {n.frequency}</div>
              </div>
            ))}
          </div>
        )}

        {/* Todo 7: 租户 & 计费 */}
        {active === 'billing' && billing && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />订阅
              </div>
              <Badge tone="brand">{billing.plan}</Badge>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <Field label="月费" value={<span className="font-mono text-base font-bold">{billing.price}</span>} />
              <Field label="下次扣款" value={billing.nextBilling} />
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[var(--text-muted)]">本月成本</span>
                  <span className="font-mono">${billing.usage.cost} / ${billing.usage.budget}</span>
                </div>
                <Progress value={(billing.usage.cost / billing.usage.budget) * 100} tone="success" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[var(--text-muted)]">Token</span>
                  <span className="font-mono">{(billing.usage.tokens / 1e6).toFixed(1)}M / {(billing.usage.tokenBudget / 1e6).toFixed(0)}M</span>
                </div>
                <Progress value={(billing.usage.tokens / billing.usage.tokenBudget) * 100} tone="primary" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[var(--text-muted)]">席位</span>
                  <span className="font-mono">{billing.usage.seats} / {billing.usage.seatLimit}</span>
                </div>
                <Progress value={(billing.usage.seats / billing.usage.seatLimit) * 100} tone="primary" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[var(--text-muted)]">智能体</span>
                  <span className="font-mono">{billing.usage.agents} / {billing.usage.agentLimit}</span>
                </div>
                <Progress value={(billing.usage.agents / billing.usage.agentLimit) * 100} tone="success" />
              </div>
            </div>
          </div>
        )}

        {/* Todo 8: 备份 & 恢复 */}
        {active === 'backup' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />备份历史
              </div>
              <Button size="sm"><RotateCcw className="h-3 w-3" />立即备份</Button>
            </div>
            <div className="p-3 space-y-1.5">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                    <div>
                      <div className="font-mono text-[11px]">{b.time}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{b.type} · {b.size} · {b.duration}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary"><RotateCcw className="h-3 w-3" />恢复</Button>
                    <Button size="sm" variant="secondary"><Download className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Todo 9: API Key */}
        {active === 'apikeys' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4" />API Key 管理
              </div>
              <Button size="sm"><Plus className="h-3 w-3" />新建 Key</Button>
            </div>
            <div className="p-3 space-y-1.5">
              {apiKeys.map((k) => (
                <div key={k.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5 text-[var(--brand)]" />
                      <span className="font-semibold">{k.name}</span>
                      <Badge tone={k.status === 'active' ? 'success' : 'warn'} className="text-[9px]">{k.status}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary"><Copy className="h-3 w-3" /></Button>
                      <Button size="sm" variant="secondary"><RotateCcw className="h-3 w-3" /></Button>
                      <Button size="sm" variant="danger"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                    <span>{k.prefix}</span>
                    <span>·</span>
                    <span>创建 {k.created}</span>
                    <span>·</span>
                    <span>最后 {k.lastUsed}</span>
                    <span>·</span>
                    <span>到期 {k.expires}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Todo 10: Webhook */}
        {active === 'webhooks' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Webhook className="h-4 w-4" />Webhook 配置
              </div>
              <Button size="sm"><Plus className="h-3 w-3" />添加</Button>
            </div>
            <div className="p-3 space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="success" className="text-[9px]">{w.status}</Badge>
                      <span className="font-mono text-[11px] truncate">{w.url}</span>
                    </div>
                    <Button size="sm" variant="secondary"><SettingsIcon className="h-3 w-3" /></Button>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                    <span>事件: {w.events.map((e: string) => <Badge key={e} tone="info" className="text-[9px] mr-1">{e}</Badge>)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                    <span>签名 {w.secret}</span>
                    <span>·</span>
                    <span>重试 {w.retry}</span>
                    <span>·</span>
                    <span className="text-[var(--success)]">成功率 {w.success}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 右侧：企业详情 + 快捷操作 */}
      <aside className="w-[280px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-[var(--brand)]" />企业详情
          </div>
          <div className="space-y-2 text-xs">
            <Row label="租户" value="ACME Corp" />
            <Row label="订阅" value={billing?.plan ?? 'Enterprise Plus'} />
            <Row label="席位" value={billing ? `${billing.usage.seats}/${billing.usage.seatLimit}` : '18/50'} />
            <Row label="下次审计" value="2026-09-12" />
          </div>
        </div>
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />合规清单
          </div>
          <div className="space-y-1.5 text-xs">
            {['等保 3.0', 'ISO 27001', '数据境内', '双审计', 'gVisor 沙箱'].map((c) => (
              <Row key={c} label={c} value={<Badge tone="success" className="text-[9px]">✔</Badge>} />
            ))}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-semibold mb-3">快捷操作</div>
          <div className="space-y-1.5">
            <Button size="sm" variant="secondary" className="w-full justify-start">
              <Download className="h-3.5 w-3.5" />导出审计日志
            </Button>
            <Button size="sm" variant="secondary" className="w-full justify-start">
              <Key className="h-3.5 w-3.5" />管理 API Key
            </Button>
            <Button size="sm" variant="secondary" className="w-full justify-start">
              <Webhook className="h-3.5 w-3.5" />Webhook 配置
            </Button>
            <Button size="sm" variant="secondary" className="w-full justify-start">
              <SettingsIcon className="h-3.5 w-3.5" />系统版本
            </Button>
          </div>
        </div>
        <div className="p-4">
          <div className="rounded-md border border-[var(--brand)]/30 bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] p-3 text-xs">
            <div className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)]" />系统状态
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px]">
              {['API 服务', '数据库', 'Milvus', 'OpenSearch'].map((s) => (
                <div key={s} className="flex justify-between">
                  <span>{s}</span>
                  <span className="text-[var(--success)]">● 正常</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] last:border-0 pb-2 last:pb-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span>{value}</span>
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