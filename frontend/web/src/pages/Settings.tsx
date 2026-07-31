/**
 * 平台设置：组织 / 身份 / 保留 / 集成 / 用量 + 治理三项（套餐用量右侧）
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiQuery } from '@/services/query';
import { Badge, Button, KpiCard, Progress, toast } from '@de/web-ui';
import {
  Building2, ShieldCheck, Bell, CreditCard, Database, Clock3, HardDrive,
  CheckCircle2, Plus, Key, Webhook, RotateCcw, Download, Trash2, Copy,
  Settings as SettingsIcon, Shield, ShieldAlert, ScrollText, Users, Link2, Activity,
  AlertTriangle, Bot, Coins,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import { useT } from '@/i18n';
import Governance from '@/pages/Governance';
import ZeroTrust from '@/pages/ZeroTrust';
import AuditCenter from '@/pages/AuditCenter';

const MENU = [
  { key: 'tenant', labelKey: 'module.settings.tabs.organization', icon: Building2 },
  { key: 'security', labelKey: 'module.settings.tabs.identity', icon: ShieldCheck },
  { key: 'backup', labelKey: 'module.settings.tabs.retention', icon: Database },
  { key: 'apikeys', labelKey: 'module.settings.tabs.integration', icon: Key },
  { key: 'billing', labelKey: 'module.settings.tabs.usage', icon: CreditCard },
  { key: 'access', labelKey: 'nav.accessControl', icon: Shield },
  { key: 'zeroTrust', labelKey: 'nav.zeroTrust', icon: ShieldAlert },
  { key: 'auditCenter', labelKey: 'nav.auditCenter', icon: ScrollText },
] as const;

type TabKey = (typeof MENU)[number]['key'];
const SETTINGS_TAB_KEYS = new Set<string>(MENU.map((item) => item.key));
const panelClass = 'de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]';

export default function Settings() {
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [active, setActive] = useState<TabKey>(() =>
    (tabFromUrl && SETTINGS_TAB_KEYS.has(tabFromUrl) ? tabFromUrl : 'tenant') as TabKey,
  );

  const { data: billing } = useApiQuery<any>(['billing'], '/api/billing');
  const { data: notifChannels = [] } = useApiQuery<any[]>(
    ['notification-channels'],
    '/api/notification-channels',
    undefined,
    { enabled: active === 'tenant' },
  );
  const { data: apiKeys = [] } = useApiQuery<any[]>(
    ['api-keys'],
    '/api/api-keys',
    undefined,
    { enabled: active === 'apikeys' },
  );
  const { data: webhooks = [] } = useApiQuery<any[]>(
    ['webhooks-config'],
    '/api/webhooks-config',
    undefined,
    { enabled: active === 'apikeys' },
  );
  const { data: backups = [] } = useApiQuery<any[]>(
    ['backups'],
    '/api/backups',
    undefined,
    { enabled: active === 'backup' },
  );

  const selectTab = (key: TabKey) => {
    setActive(key);
    setSearchParams(key === 'tenant' ? {} : { tab: key }, { replace: true });
  };

  useEffect(() => {
    if (tabFromUrl && SETTINGS_TAB_KEYS.has(tabFromUrl) && tabFromUrl !== active) {
      setActive(tabFromUrl as TabKey);
    }
  }, [tabFromUrl, active]);

  return (
    <div className="settings-page de-employee-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      <div className="space-y-3">
        <section className={panelClass}>
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 md:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg">
                  <SettingsIcon className="h-4 w-4" />
                </div>
                <h1 className="text-base font-semibold text-[var(--text)]">{t('module.settings.title')}</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">{t('module.settings.subtitle')}</p>
            </div>
            <Badge tone="success" className="shrink-0 text-[10px]">
              <CheckCircle2 className="mr-1 h-3 w-3" />安全基线已启用
            </Badge>
          </div>
          <nav className="de-employee-tabs flex overflow-x-auto px-3" aria-label="设置分类">
            {MENU.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => selectTab(item.key)}
                className={cn(
                  'de-employee-tab flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs transition-colors',
                  active === item.key && 'is-active',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </section>

        {active === 'tenant' && (
          <TenantPanel
            billing={billing}
            notifChannels={notifChannels}
            onSave={() => toast.success('组织资料已保存，并写入审计')}
            onGotoAccess={() => selectTab('access')}
          />
        )}

        {active === 'security' && (
          <SecurityPanel onGotoAccess={() => selectTab('access')} />
        )}

        {active === 'backup' && (
          <BackupPanel backups={backups} />
        )}

        {active === 'apikeys' && (
          <IntegrationPanel apiKeys={apiKeys} webhooks={webhooks} />
        )}

        {active === 'billing' && billing && (
          <BillingPanel billing={billing} />
        )}

        {active === 'access' && <Governance embedded />}
        {active === 'zeroTrust' && <ZeroTrust embedded />}
        {active === 'auditCenter' && <AuditCenter embedded />}
      </div>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  trailing,
}: {
  icon: typeof Building2;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 md:px-5"
      style={{ boxShadow: 'var(--saas-divider)' }}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-[var(--brand)]" />
        {title}
      </div>
      {trailing}
    </div>
  );
}

function TenantPanel({
  billing,
  notifChannels,
  onSave,
  onGotoAccess,
}: {
  billing: any;
  notifChannels: any[];
  onSave: () => void;
  onGotoAccess: () => void;
}) {
  const seats = billing?.usage?.seats ?? 18;
  const seatLimit = billing?.usage?.seatLimit ?? 50;
  const agents = billing?.usage?.agents ?? 8;
  const agentLimit = billing?.usage?.agentLimit ?? 20;

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="席位占用" value={seats} sub={`/ ${seatLimit}`} icon={Users} tone="brand" size="comfortable" />
        <KpiCard label="数字员工" value={agents} sub={`/ ${agentLimit}`} icon={Building2} tone="success" size="comfortable" />
        <KpiCard label="月费" value={billing?.price ?? '$5,000'} icon={CreditCard} tone="info" size="comfortable" />
        <KpiCard label="方案" value={billing?.plan === 'Enterprise Plus' ? 'Ent+' : (billing?.plan ?? 'Ent+')} icon={ShieldCheck} tone="warn" size="comfortable" />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className={panelClass}>
          <PanelHeader icon={Building2} title="租户信息" trailing={<Button size="sm" onClick={onSave}>保存</Button>} />
          <div className="grid gap-x-6 gap-y-3 p-4 text-xs sm:grid-cols-2 md:px-5">
            <Field label="租户名" value="ACME Corp" />
            <Field label="租户 ID" value={<span className="font-mono">tnt_a7f9****</span>} />
            <Field label="区域" value={<Badge tone="info">cn-east-1</Badge>} />
            <Field label="创建时间" value="2024-03-12" />
            <Field label="席位" value={<span className="font-mono">{seats} / {seatLimit}</span>} />
            <Field label="订阅" value={<span className="font-mono">{billing?.price ?? '$5,000'} / 月</span>} />
          </div>
          <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)] md:px-5">
            成员授权与职责分离请在
            <button type="button" className="mx-1 font-medium text-[var(--brand)] hover:underline" onClick={onGotoAccess}>访问控制</button>
            管理。
          </div>
        </section>

        <section className={panelClass}>
          <PanelHeader icon={Bell} title="通知与告警" />
          <div className="max-h-[360px] space-y-2 overflow-y-auto p-3 md:p-4">
            {notifChannels.map((n) => (
              <div key={n.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Bell className={cn('h-3.5 w-3.5 shrink-0', n.enabled ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]')} />
                    <span className="truncate text-xs font-semibold">{n.name}</span>
                    <Badge tone={n.enabled ? 'success' : 'neutral'} className="text-[9px]">{n.enabled ? '启用' : '禁用'}</Badge>
                  </div>
                  <input type="checkbox" defaultChecked={n.enabled} className="accent-[var(--brand)]" aria-label={`${n.name} 开关`} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {n.channels.map((c: string) => (
                    <Badge key={c} tone="info" className="text-[9px]">{c}</Badge>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">频率: {n.frequency}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SecurityPanel({ onGotoAccess }: { onGotoAccess: () => void }) {
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="身份源" value="OIDC" icon={ShieldCheck} tone="brand" size="comfortable" />
        <KpiCard label="MFA 覆盖" value="96" sub="%" icon={Users} tone="success" size="comfortable" />
        <KpiCard label="SSO 状态" value="已连接" icon={CheckCircle2} tone="info" size="comfortable" />
        <KpiCard label="会话超时" value="8h" icon={Clock3} tone="warn" size="comfortable" />
      </section>
      <section className={panelClass}>
        <PanelHeader
          icon={ShieldCheck}
          title="企业身份认证"
          trailing={<Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />企业 SSO 已连接</Badge>}
        />
        <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 md:px-5">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs font-semibold">单点登录</div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">OIDC · 企业身份源同步 · 强制多因素验证</p>
            <Button size="sm" variant="secondary" className="mt-3">查看身份源</Button>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs font-semibold">账户生命周期</div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">成员同步、禁用和访问范围由访问控制统一管理。</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={onGotoAccess}>前往访问控制</Button>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 md:col-span-2 lg:col-span-1">
            <div className="text-xs font-semibold">会话与令牌</div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">Web 会话 8 小时 · API Token 90 天轮换 · 异常登录自动告警</p>
            <Button size="sm" variant="secondary" className="mt-3">查看策略</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BackupPanel({ backups }: { backups: any[] }) {
  const latest = backups[0];
  const autoCount = backups.filter((b) => b.type === '自动').length;

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="备份总数" value={backups.length} sub="份" icon={Database} tone="brand" size="comfortable" />
        <KpiCard label="最近备份" value={latest?.time?.slice(5, 10) ?? '—'} sub={latest?.time?.slice(11) ?? ''} icon={Clock3} tone="success" size="comfortable" />
        <KpiCard label="自动备份" value={autoCount} sub="份" icon={RotateCcw} tone="info" size="comfortable" />
        <KpiCard label="保留策略" value="30" sub="天" icon={HardDrive} tone="warn" size="comfortable" />
      </section>

      <section className={panelClass}>
        <PanelHeader
          icon={Database}
          title="数据保留与恢复"
          trailing={(
            <Button size="sm" onClick={() => toast.success('已触发立即备份')}>
              <RotateCcw className="h-3 w-3" />立即备份
            </Button>
          )}
        />
        <div className="hidden border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2 text-[11px] font-medium text-[var(--text-muted)] md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_auto] md:gap-4">
          <span>备份时间</span>
          <span>类型</span>
          <span>大小</span>
          <span>耗时</span>
          <span className="text-right">操作</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {backups.map((b) => (
            <article
              key={b.id}
              className="grid gap-3 px-4 py-3 text-xs transition-colors hover:bg-[var(--bg-hover)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_auto] md:items-center md:gap-4 md:px-5"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                <span className="font-mono text-[11px]">{b.time}</span>
              </div>
              <div><Badge tone={b.type === '自动' ? 'info' : 'brand'} className="text-[9px]">{b.type}</Badge></div>
              <div className="font-mono text-[var(--text-secondary)]">{b.size}</div>
              <div className="text-[var(--text-muted)]">{b.duration}</div>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary"><RotateCcw className="h-3 w-3" />恢复</Button>
                <Button size="sm" variant="secondary" aria-label="下载备份"><Download className="h-3 w-3" /></Button>
              </div>
            </article>
          ))}
        </div>
        <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)] md:px-5">
          自动备份每日 02:00 执行；恢复操作需管理员审批并写入审计。
        </div>
      </section>
    </div>
  );
}

function IntegrationPanel({ apiKeys, webhooks }: { apiKeys: any[]; webhooks: any[] }) {
  const activeKeys = apiKeys.filter((k) => k.status === 'active').length;
  const expiringKeys = apiKeys.filter((k) => k.status === 'warning').length;
  const avgSuccess = webhooks.length
    ? (webhooks.reduce((sum, w) => sum + w.success, 0) / webhooks.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="活跃 Key" value={activeKeys} sub="个" icon={Key} tone="brand" size="comfortable" />
        <KpiCard label="即将到期" value={expiringKeys} sub="个" icon={Clock3} tone={expiringKeys ? 'warn' : 'success'} size="comfortable" />
        <KpiCard label="Webhook" value={webhooks.length} sub="个" icon={Webhook} tone="info" size="comfortable" />
        <KpiCard label="投递成功率" value={avgSuccess} sub="%" icon={Activity} tone="success" size="comfortable" />
      </section>

      <section className={panelClass}>
        <PanelHeader
          icon={Key}
          title="开发者凭证"
          trailing={<Button size="sm"><Plus className="h-3 w-3" />新建 Key</Button>}
        />
        <div className="hidden border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2 text-[11px] font-medium text-[var(--text-muted)] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_auto] lg:gap-4">
          <span>名称</span>
          <span>Key 前缀</span>
          <span>状态</span>
          <span>创建</span>
          <span>最后使用</span>
          <span>到期</span>
          <span className="text-right">操作</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {apiKeys.map((k) => (
            <article
              key={k.id}
              className="grid gap-3 px-4 py-3 text-xs transition-colors hover:bg-[var(--bg-hover)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_auto] lg:items-center lg:gap-4 lg:px-5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Key className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
                <span className="truncate font-semibold">{k.name}</span>
              </div>
              <div className="truncate font-mono text-[11px] text-[var(--text-secondary)]">{k.prefix}</div>
              <div><KeyStatusBadge status={k.status} /></div>
              <div className="text-[var(--text-muted)]">{k.created}</div>
              <div className="text-[var(--text-muted)]">{k.lastUsed}</div>
              <div className={cn('font-mono', k.status === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>{k.expires}</div>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary" aria-label="复制 Key"><Copy className="h-3 w-3" /></Button>
                <Button size="sm" variant="secondary" aria-label="轮换 Key"><RotateCcw className="h-3 w-3" /></Button>
                <Button size="sm" variant="danger" aria-label="删除 Key"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={panelClass}>
        <PanelHeader
          icon={Webhook}
          title="Webhook 回调"
          trailing={<Button size="sm"><Plus className="h-3 w-3" />添加</Button>}
        />
        <div className="hidden border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2 text-[11px] font-medium text-[var(--text-muted)] lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,0.45fr)_auto] lg:gap-4">
          <span>回调地址</span>
          <span>订阅事件</span>
          <span>成功率</span>
          <span>重试</span>
          <span className="text-right">操作</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {webhooks.map((w) => (
            <article
              key={w.id}
              className="grid gap-3 px-4 py-3 text-xs transition-colors hover:bg-[var(--bg-hover)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,0.45fr)_auto] lg:items-center lg:gap-4 lg:px-5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
                <span className="truncate font-mono text-[11px]">{w.url}</span>
                <Badge tone="success" className="shrink-0 text-[9px]">{w.status === 'active' ? '生效' : w.status}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {w.events.map((e: string) => (
                  <Badge key={e} tone="info" className="text-[9px]">{e}</Badge>
                ))}
              </div>
              <div className="font-mono text-[var(--success)]">{w.success}%</div>
              <div className="text-[var(--text-muted)]">{w.retry} 次</div>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary"><SettingsIcon className="h-3 w-3" /></Button>
                <Button size="sm" variant="secondary" aria-label="下载日志"><Download className="h-3 w-3" /></Button>
              </div>
            </article>
          ))}
        </div>
        <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)] lg:px-5">
          API Key 与 Webhook 凭据由服务端保管；轮换与删除操作均写入审计，生产环境建议最小权限与 IP 白名单。
        </div>
      </section>
    </div>
  );
}

function KeyStatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge tone="success" className="text-[9px]">生效中</Badge>;
  if (status === 'warning') return <Badge tone="warn" className="text-[9px]">即将到期</Badge>;
  return <Badge tone="neutral" className="text-[9px]">{status}</Badge>;
}

function BillingPanel({ billing }: { billing: any }) {
  const usage = billing.usage;
  const quotas = [
    {
      key: 'cost',
      label: '本月成本',
      used: `$${usage.cost}`,
      limit: `$${usage.budget}`,
      pct: (usage.cost / usage.budget) * 100,
      tone: usage.cost / usage.budget >= 0.8 ? 'warn' as const : 'success' as const,
      icon: Coins,
    },
    {
      key: 'tokens',
      label: 'Token 消耗',
      used: `${(usage.tokens / 1e6).toFixed(1)}M`,
      limit: `${(usage.tokenBudget / 1e6).toFixed(0)}M`,
      pct: (usage.tokens / usage.tokenBudget) * 100,
      tone: 'primary' as const,
      icon: Activity,
    },
    {
      key: 'seats',
      label: '席位',
      used: String(usage.seats),
      limit: String(usage.seatLimit),
      pct: (usage.seats / usage.seatLimit) * 100,
      tone: 'primary' as const,
      icon: Users,
    },
    {
      key: 'agents',
      label: '数字员工',
      used: String(usage.agents),
      limit: String(usage.agentLimit),
      pct: (usage.agents / usage.agentLimit) * 100,
      tone: usage.agents / usage.agentLimit >= 0.8 ? 'warn' as const : 'success' as const,
      icon: Bot,
    },
  ];
  const budgetPct = Math.round((usage.cost / usage.budget) * 100);
  const warnCount = quotas.filter((q) => q.pct >= 80).length;

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="订阅方案" value={billing.plan === 'Enterprise Plus' ? 'Ent+' : billing.plan} icon={CreditCard} tone="brand" size="comfortable" />
        <KpiCard label="固定月费" value={billing.price} icon={Building2} tone="info" size="comfortable" />
        <KpiCard label="预算消耗" value={budgetPct} sub="%" icon={Coins} tone={budgetPct >= 80 ? 'warn' : 'success'} size="comfortable" />
        <KpiCard label="下次扣款" value={billing.nextBilling.slice(5)} icon={Clock3} tone="warn" size="comfortable" />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className={panelClass}>
          <PanelHeader icon={CreditCard} title="订阅信息" trailing={<Badge tone="brand">{billing.plan}</Badge>} />
          <div className="space-y-0 divide-y divide-[var(--border)] px-4 text-xs md:px-5">
            <BillingFact label="方案" value={billing.plan} />
            <BillingFact label="月费" value={<span className="font-mono font-semibold">{billing.price}</span>} />
            <BillingFact label="计费周期" value="按月 · 自然月结算" />
            <BillingFact label="下次扣款" value={billing.nextBilling} />
            <BillingFact label="席位上限" value={`${usage.seatLimit} 席`} />
            <BillingFact label="数字员工上限" value={`${usage.agentLimit} 个`} />
          </div>
          <div className="border-t border-[var(--border)] px-4 py-3 md:px-5">
            <Button size="sm" variant="secondary" className="w-full sm:w-auto">
              <Download className="h-3 w-3" />导出账单
            </Button>
          </div>
        </section>

        <section className={panelClass}>
          <PanelHeader
            icon={Database}
            title="配额用量"
            trailing={warnCount > 0 ? (
              <Badge tone="warn"><AlertTriangle className="mr-1 inline h-3 w-3" />{warnCount} 项接近上限</Badge>
            ) : (
              <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />用量正常</Badge>
            )}
          />
          <div className="hidden border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2 text-[11px] font-medium text-[var(--text-muted)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.45fr)_minmax(0,1.2fr)] lg:gap-4">
            <span>配额项</span>
            <span>已用 / 上限</span>
            <span>占用</span>
            <span>进度</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {quotas.map((item) => (
              <article
                key={item.key}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.45fr)_minmax(0,1.2fr)] lg:items-center lg:gap-4 lg:px-5"
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <item.icon className="h-3.5 w-3.5 text-[var(--brand)]" />
                  {item.label}
                </div>
                <div className="font-mono text-[11px] text-[var(--text-secondary)]">{item.used} / {item.limit}</div>
                <div>
                  <Badge tone={item.pct >= 90 ? 'error' : item.pct >= 80 ? 'warn' : item.tone === 'success' ? 'success' : 'brand'} className="text-[9px]">
                    {Math.round(item.pct)}%
                  </Badge>
                </div>
                <div className="min-w-0">
                  <Progress
                    value={item.pct}
                    tone={item.pct >= 90 ? 'error' : item.pct >= 80 ? 'warn' : item.tone === 'success' ? 'success' : 'primary'}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className={cn(panelClass, 'px-4 py-3 text-[11px] leading-5 text-[var(--text-muted)] md:px-5')}>
        套餐用量按租户聚合；Token 与运行成本达 80% 时将触发预算告警。升级方案或扩容席位请联系企业客户成功经理。
      </section>
    </div>
  );
}

function BillingFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
