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
import { useT } from '@/i18n';

const MENU = [
  { key: 'tenant', labelKey: 'module.settings.tabs.organization', icon: Building2 },
  { key: 'security', labelKey: 'module.settings.tabs.identity', icon: ShieldCheck },
  { key: 'backup', labelKey: 'module.settings.tabs.retention', icon: Database },
  { key: 'apikeys', labelKey: 'module.settings.tabs.integration', icon: Key },
  { key: 'billing', labelKey: 'module.settings.tabs.usage', icon: CreditCard },
];

export default function Settings() {
  const { t } = useT();
  const [active, setActive] = useState('tenant');
  const { data: audits = [] } = useApiQuery<AuditItem[]>(['audits'], '/api/audits');
  const { data: apiKeys = [] } = useApiQuery<any[]>(['api-keys'], '/api/api-keys');
  const { data: webhooks = [] } = useApiQuery<any[]>(['webhooks-config'], '/api/webhooks-config');
  const { data: backups = [] } = useApiQuery<any[]>(['backups'], '/api/backups');
  const { data: auditStream = [] } = useApiQuery<any[]>(
    ['audit-stream'],
    '/api/audit-stream',
    undefined,
    { refetchInterval: 5_000 },
  );
  const { data: billing } = useApiQuery<any>(['billing'], '/api/billing');
  const { data: notifChannels = [] } = useApiQuery<any[]>(['notification-channels'], '/api/notification-channels');

  const pass = audits.filter((a) => a.status === 'pass').length;
  const warn = audits.filter((a) => a.status === 'warn').length;
  const total = audits.length;
  const auditScore = Math.round((pass / total) * 100);

  return (
    <div className="settings-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)]">
      {/* 已由顶部设置导航替代的旧侧栏，保留结构以兼容各设置模块。 */}
      <aside className="hidden">
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
                <span>{t(m.labelKey)}</span>
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

      {/* 单一主面板 */}
      <section className="mx-auto w-full max-w-[1480px] p-4 sm:p-6">
        <header className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-base font-semibold"><SettingsIcon className="h-4 w-4 text-[var(--brand)]" />{t('module.settings.title')}</h1>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t('module.settings.subtitle')}</p>
            </div>
            <Badge tone="success" className="text-[10px]"><CheckCircle2 className="mr-1 h-3 w-3" />安全基线已启用</Badge>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1" aria-label="设置分类">
            {MENU.map((item) => (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs transition-colors', active === item.key ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]')}
              >
                <item.icon className="h-3.5 w-3.5" />{t(item.labelKey)}
              </button>
            ))}
          </nav>
        </header>
        <div className="space-y-4">
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

        {/* 身份源与认证：访问范围、零信策略和审计均在安全治理中管理。 */}
        {active === 'security' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />企业身份认证
              </div>
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />企业 SSO 已连接</Badge>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2"><div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="text-xs font-semibold">单点登录</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">OIDC · 企业身份源同步 · 强制多因素验证</p><Button size="sm" variant="secondary" className="mt-3">查看身份源</Button></div><div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="text-xs font-semibold">账户生命周期</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">成员同步、禁用和访问范围由访问控制统一管理。</p><Button size="sm" variant="secondary" className="mt-3">前往访问控制</Button></div></div>
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

        {/* 数据保留与恢复 */}
        {active === 'backup' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />数据保留与恢复
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

        {/* 开发者集成 */}
        {active === 'apikeys' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4" />开发者凭证
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
        </div>
      </section>

      {/* 固定企业详情侧栏已由顶部设置导航与各设置项内信息替代。 */}
      <aside className="hidden">
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
