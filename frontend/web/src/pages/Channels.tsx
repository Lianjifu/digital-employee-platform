/**
 * P10 渠道（企业级优化版）— 全交互增强
 */
import { useState, useMemo, useEffect } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs, Input } from '@de/web-ui';
import {
  Send, MessageSquare, Mail, Webhook, Phone, AlertCircle, FileText,
  ShieldCheck, Plus, CheckCircle2, ArrowRight, Activity, Clock,
  Volume2, History, Edit3, AlertTriangle, Clock3, Globe, Ban,
  Send as SendIcon, PhoneCall, Trash2, Code2, Eye, Search,
  Power, Route, Settings2, ChevronRight,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Channel, ChannelKind } from '@de/web-types';
import { Modal, Drawer, ConfirmDialog, EmptyState, Sparkline } from '@/components/shared';

const ICONS: Record<ChannelKind, any> = {
  feishu: MessageSquare, wecom: MessageSquare, dingtalk: MessageSquare, slack: MessageSquare,
  email: Mail, webhook: Webhook, sms: Phone, phone: Phone,
};

const INITIAL_ROUTE_TABLE = [
  { event: 'P0 紧急告警', main: '飞书', f1: '企微', f2: '电话+SMS', fb: '邮件', tone: 'error' as const },
  { event: 'P1 重要升级', main: '飞书+企微', f1: '电话', f2: '邮件', fb: '—', tone: 'warn' as const },
  { event: 'P2 标准通知', main: '企微', f1: '飞书', f2: '邮件', fb: '—', tone: 'info' as const },
  { event: 'P3 内部播报', main: '邮件', f1: 'Slack', f2: 'Webhook', fb: '—', tone: 'neutral' as const },
  { event: '外部用户', main: '邮件 (T&S)', f1: 'SMS', f2: 'Webhook', fb: '—', tone: 'info' as const },
  { event: '审计日志', main: 'Webhook→SIEM', f1: 'S3→归档', f2: '—', fb: '—', tone: 'neutral' as const },
];

const INITIAL_CARDS = [
  { id: 'card1', name: '告警卡片', icon: AlertCircle, tone: 'error' as const, desc: 'P0/P1 紧急事件 · 含一键跳转', preview: '🔴 [P0] Redis OOM\n集群: prod-redis-01\n时间: 14:32:01\n[查看详情 →]' },
  { id: 'card2', name: '审批卡片', icon: ShieldCheck, tone: 'warn' as const, desc: '双签审批 · 同意/拒绝按钮', preview: '✍️ 变更审批\n操作: CONFIG SET\n操作人: 王昊\n[批准] [拒绝]' },
  { id: 'card3', name: '报告卡片', icon: FileText, tone: 'info' as const, desc: '日报/周报/月报 · 富文本', preview: '📊 本月合规报告\n94 项 · 98 分\n合规: ✓\n[下载 PDF]' },
  { id: 'card4', name: '升级卡片', icon: MessageSquare, tone: 'success' as const, desc: '任务升级 · @指定接收人', preview: '⚠️ 任务升级\n@李婷 @孙博\n优先级: P0\n[立即处理]' },
];

const LANGUAGES = [
  { key: 'zh-CN', label: '简体中文', sample: '您的服务出现异常，请立即处理。' },
  { key: 'en-US', label: 'English', sample: 'Your service has encountered an anomaly, please handle immediately.' },
  { key: 'ja-JP', label: '日本語', sample: 'サービスで異常が発生しました。すぐに対応してください。' },
];

const INITIAL_BLACKLIST = [
  { id: 'b1', type: '用户', value: 'test-spammer@external.com', reason: '高频无效告警', addedBy: '系统', expires: '2026-08-01' },
  { id: 'b2', type: '电话', value: '+86 139****8888', reason: '拒收投诉', addedBy: '孙博', expires: '永久' },
];

const QPS_SPARK = [12, 18, 14, 22, 28, 24, 32, 30, 38, 42, 36, 44, 48, 52, 46, 54];

// 渠道可按类型扩展；未单独配置的渠道也必须能安全打开详情和编辑配置。
const DEFAULT_CHANNEL_CONFIG = {
  rateLimit: { qps: 50, daily: 10000 },
  retry: { max: 3, backoff: 'exponential' },
  silent: { start: '22:00', end: '08:00' },
  mergeWindow: '5 min',
};

type ModalKind = 'sendTest' | 'newChannel' | 'newCard' | 'editCard' | 'editConfig' | 'addBlacklist' | 'addLanguage' | 'editRoute' | null;

export default function Channels() {
  const [activeId, setActiveId] = useState('c1');
  const [showStream, setShowStream] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [cardToEdit, setCardToEdit] = useState<any | null>(null);
  const [deleteBlacklist, setDeleteBlacklist] = useState<string | null>(null);
  const [clearStreamConfirm, setClearStreamConfirm] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  // 搜索渠道
  const [channelSearch, setChannelSearch] = useState('');

  // 本地可写 state
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [routeTable, setRouteTable] = useState<any[]>(INITIAL_ROUTE_TABLE);
  const [cards, setCards] = useState<any[]>(INITIAL_CARDS);
  const [blacklist, setBlacklist] = useState<any[]>(INITIAL_BLACKLIST);
  const [languages, setLanguages] = useState<any[]>(LANGUAGES);
  const [configState, setConfigState] = useState<Record<string, any>>({});

  // 测试消息历史
  const [testResults, setTestResults] = useState<Array<{ id: string; channel: string; target: string; content: string; status: 'delivered' | 'failed'; tone: 'success' | 'error' }>>([]);

  const { data: fetchedChannels } = useApiQuery<Channel[]>(['channels'], '/api/channels');
  const { data: health } = useApiQuery<any>(['channel-health'], '/api/channel-health');
  const { data: stream = [] } = useApiQuery<any[]>(
    ['message-stream'],
    '/api/message-stream',
    undefined,
    { refetchInterval: 5_000 },
  );
  const { data: config } = useApiQuery<any>(['channel-config'], '/api/channel-config');

  // 填充 channels
  useEffect(() => {
    if (fetchedChannels && !channels) setChannels(fetchedChannels);
  }, [fetchedChannels, channels]);

  const chs = channels ?? fetchedChannels ?? [];
  const active = chs.find((c) => c.id === activeId);
  const h = health?.[activeId];
  const sourceConfig = config?.[activeId];
  const localConfig = configState[activeId];
  const cfg = {
    ...DEFAULT_CHANNEL_CONFIG,
    ...sourceConfig,
    ...localConfig,
    rateLimit: { ...DEFAULT_CHANNEL_CONFIG.rateLimit, ...sourceConfig?.rateLimit, ...localConfig?.rateLimit },
    retry: { ...DEFAULT_CHANNEL_CONFIG.retry, ...sourceConfig?.retry, ...localConfig?.retry },
    silent: { ...DEFAULT_CHANNEL_CONFIG.silent, ...sourceConfig?.silent, ...localConfig?.silent },
  };
  const groups = ['国内 IM', '国外 IM', '邮件+API'];

  const filteredChannels = useMemo(() => {
    return chs.filter((c) => !channelSearch || c.name.includes(channelSearch) || c.kind.includes(channelSearch));
  }, [chs, channelSearch]);

  const handleNewChannel = (form: { name: string; kind: ChannelKind }) => {
    const id = `c_${Date.now().toString(36)}`;
    setChannels((prev) => [
      ...(prev ?? fetchedChannels ?? []),
      { id, name: form.name, kind: form.kind, enabled: true, monthlySent: 0, successRate: 1 } as Channel,
    ]);
    setActiveId(id);
    setActiveModal(null);
  };

  const handleNewCard = (form: { name: string; desc: string; preview: string; tone: string }) => {
    setCards((prev) => [
      ...prev,
      {
        id: `card_${Date.now().toString(36)}`,
        name: form.name,
        icon: form.tone === 'error' ? AlertCircle : form.tone === 'warn' ? ShieldCheck : form.tone === 'info' ? FileText : MessageSquare,
        tone: form.tone as any,
        desc: form.desc,
        preview: form.preview,
      },
    ]);
    setActiveModal(null);
  };

  const handleSaveCard = (updated: any) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setCardToEdit(null);
    setActiveModal(null);
  };

  const handleSendTest = (form: { target: string; content: string }) => {
    if (!active) return;
    const id = `t_${Date.now().toString(36)}`;
    const status: 'delivered' | 'failed' = Math.random() > 0.1 ? 'delivered' : 'failed';
    const tone: 'success' | 'error' = status === 'delivered' ? 'success' : 'error';
    setTestResults((prev) => [
      {
        id,
        channel: active.name,
        target: form.target,
        content: form.content,
        status,
        tone,
      },
      ...prev,
    ].slice(0, 8));
    setActiveModal(null);
  };

  const handleAddBlacklist = (form: { type: string; value: string; reason: string }) => {
    setBlacklist((prev) => [
      ...prev,
      {
        id: `b_${Date.now().toString(36)}`,
        type: form.type,
        value: form.value,
        reason: form.reason,
        addedBy: '当前用户',
        expires: '永久',
      },
    ]);
    setActiveModal(null);
  };

  const handleDeleteBlacklist = () => {
    if (!deleteBlacklist) return;
    setBlacklist((prev) => prev.filter((b) => b.id !== deleteBlacklist));
    setDeleteBlacklist(null);
  };

  const handleClearStream = () => {
    setTestResults([]);
    setClearStreamConfirm(false);
  };

  const handleSaveConfig = (updates: Record<string, any>) => {
    setConfigState((prev) => ({ ...prev, [activeId]: { ...(prev[activeId] ?? {}), ...updates } }));
    setActiveModal(null);
  };

  const handleAddLanguage = (form: { key: string; label: string; sample: string }) => {
    setLanguages((prev) => [...prev, form]);
    setActiveModal(null);
  };

  const handleSaveRoute = (index: number, updated: any) => {
    setRouteTable((prev) => prev.map((r, i) => (i === index ? updated : r)));
    setActiveModal(null);
  };

  const handleToggleChannel = () => {
    if (!active) return;
    setChannels((prev) => (prev ?? fetchedChannels ?? []).map((channel) => (
      channel.id === active.id ? { ...channel, enabled: !channel.enabled } : channel
    )));
  };

  return (
    <div className="channels-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      {/* 渠道选择已移至顶部；此处保留的列表仅用于复用筛选逻辑。 */}
      <aside className="hidden">
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)]">
          <div className="text-xs font-semibold">渠道 ({chs.length})</div>
          <button
            onClick={() => setActiveModal('newChannel')}
            className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]"
            title="新建渠道"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-3 border-b border-[var(--border)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
            <Input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="搜索渠道..."
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
        {groups.map((g) => {
          const inGroup = filteredChannels.filter((c) =>
            g === '国内 IM' ? ['feishu', 'wecom', 'dingtalk'].includes(c.kind)
            : g === '国外 IM' ? c.kind === 'slack'
            : ['email', 'webhook', 'sms', 'phone'].includes(c.kind)
          );
          if (inGroup.length === 0) return null;
          return (
            <div key={g} className="p-2">
              <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">{g}</div>
              {inGroup.map((c) => {
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
          );
        })}
      </aside>

      <section className="mx-auto min-w-0 w-full max-w-[1680px]">
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                <Route className="h-3.5 w-3.5 text-[var(--brand)]" /> 渠道运营
              </div>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                消息路由与渠道管理
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                统一管理通知策略、投递渠道与送达状态。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="选择渠道"
                value={activeId}
                onChange={(event) => setActiveId(event.target.value)}
                className="h-7 max-w-[148px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs lg:hidden"
              >
                {chs.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={() => setActiveModal('editConfig')} disabled={!active || !cfg}>
                <Settings2 className="h-3.5 w-3.5" />配置
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowDetails(true)} disabled={!active}>
                <Activity className="h-3.5 w-3.5" />渠道详情
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveModal('sendTest')}>
                <SendIcon className="h-3.5 w-3.5" />发送测试
              </Button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />路由已启用</span>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-40">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={channelSearch}
                  onChange={(event) => setChannelSearch(event.target.value)}
                  placeholder="筛选渠道"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <div className="channels-picker flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
                {filteredChannels.map((channel) => {
                  const ChannelIcon = ICONS[channel.kind];
                  const isActive = channel.id === activeId;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => setActiveId(channel.id)}
                      className={cn(
                        'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition-colors',
                        isActive
                          ? 'border-[var(--brand)]/40 bg-[var(--brand-light)] font-semibold text-[var(--brand)]'
                          : 'border-transparent bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      <ChannelIcon className="h-3.5 w-3.5" />
                      {channel.name}
                      <span className={cn('h-1.5 w-1.5 rounded-full', channel.enabled ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]')} />
                    </button>
                  );
                })}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setActiveModal('newChannel')} className="shrink-0">
                <Plus className="h-3.5 w-3.5" />新渠道
              </Button>
            </div>
          </div>

          <div className="channels-overview-grid mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ChannelMetric label="活跃渠道" value={`${chs.filter((channel) => channel.enabled).length}/${chs.length}`} detail="可参与路由" />
            <ChannelMetric label="近 30 天送达率" value="99.1%" detail="目标 ≥ 99%" tone="success" />
            <ChannelMetric label="P95 投递时延" value="850ms" detail="目标 < 1s" />
            <ChannelMetric label="待复核失败" value="3" detail="需要处理" tone="warning" />
          </div>

          {active && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {(() => { const ActiveIcon = ICONS[active.kind]; return <ActiveIcon className="h-4 w-4 shrink-0 text-[var(--brand)]" />; })()}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="truncate">{active.name}</span>
                    <Badge tone={active.enabled ? 'success' : 'neutral'} className="text-[9px]">{active.enabled ? '投递中' : '已停用'}</Badge>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{h?.latency ?? '—'}ms 延迟 · {h?.success ?? 0}% 送达率 · {h?.errorCount24h ?? 0} 次 24h 失败</div>
                </div>
              </div>
              <Button size="sm" variant={active.enabled ? 'outline' : 'primary'} onClick={handleToggleChannel}>
                <Power className="h-3.5 w-3.5" />{active.enabled ? '暂停投递' : '恢复投递'}
              </Button>
            </div>
          )}

          {/* 路由表 */}
          <div className="mb-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <div className="text-sm font-semibold">事件路由策略 <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">主路径失败后按序降级</span></div>
              <button onClick={() => setShowRouteMap((value) => !value)} className="text-[10px] font-medium text-[var(--brand)] hover:underline">
                {showRouteMap ? '收起策略' : '展开策略'}
              </button>
            </div>
            {showRouteMap && <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                  <th className="text-left px-4 py-2 font-semibold">事件</th>
                  <th className="text-left px-4 py-2 font-semibold">主</th>
                  <th className="text-left px-4 py-2 font-semibold">失败 1</th>
                  <th className="text-left px-4 py-2 font-semibold">失败 2</th>
                  <th className="text-left px-4 py-2 font-semibold">兜底</th>
                  <th className="text-right px-4 py-2 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {routeTable.map((r, i) => (
                  <tr key={r.event} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                    <td className="px-4 py-2.5"><Badge tone={r.tone}>{r.event}</Badge></td>
                    <td className="px-4 py-2.5 font-semibold"><RouteStep value={r.main} active /></td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]"><RouteStep value={r.f1} /></td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]"><RouteStep value={r.f2} /></td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]"><RouteStep value={r.fb} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => { setCardToEdit({ ...r, _idx: i, _kind: 'route' }); setActiveModal('editRoute'); }}
                        className="text-[10px] text-[var(--brand)] hover:underline"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>}
          </div>

          {/* 消息流 */}
          {!showStream && (
            <button onClick={() => setShowStream(true)} className="flex w-full items-center justify-between rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]">
              <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />消息发送实时流已收起</span>
              <span className="flex items-center gap-1 text-[10px] font-medium">展开 <ChevronRight className="h-3 w-3" /></span>
            </button>
          )}
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
                <div className="flex items-center gap-2">
                  <button onClick={() => setClearStreamConfirm(true)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--danger)]">清空</button>
                  <button onClick={() => setShowStream(false)} className="text-[10px] text-[var(--brand)] hover:underline">收起</button>
                </div>
              </div>
              <div className="p-3 space-y-1.5 max-h-56 overflow-y-auto">
                {/* 测试发送结果（最优先显示） */}
                {testResults.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 rounded-md bg-[var(--brand-light)] border border-[var(--brand)]/20 p-2 text-[11px]">
                    <span className="font-mono text-[10px] text-[var(--brand)] shrink-0">TEST</span>
                    <Badge tone={m.tone} className="text-[9px] shrink-0">{m.channel}</Badge>
                    <span className="flex-1 truncate">
                      <span className="text-[var(--text-secondary)]">→ {m.target}:</span> {m.content}
                    </span>
                    <Badge tone={m.tone} className="text-[9px] shrink-0">
                      {m.status === 'delivered' ? <CheckCircle2 className="mr-0.5 inline h-2.5 w-2.5" /> : <AlertCircle className="mr-0.5 inline h-2.5 w-2.5" />}
                      {m.status === 'delivered' ? '已送达' : '失败'}
                    </Badge>
                  </div>
                ))}
                {/* 历史流 */}
                {stream.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 rounded-md bg-[var(--bg-elevated)] p-2 text-[11px]">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">{m.time}</span>
                    <Badge tone={m.status === 'delivered' ? 'success' : 'error'} className="text-[9px] shrink-0">{m.channel}</Badge>
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

        {/* Adaptive Card 模板 */}
        <div className="p-4 pb-8 sm:p-5 sm:pb-10">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Edit3 className="h-4 w-4 text-[var(--brand)]" />消息模板 <span className="font-normal text-[var(--text-muted)]">共 {cards.length} 个</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setActiveModal('newCard')}>
              <Plus className="h-3 w-3" />新建模板
            </Button>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {cards.map((c) => {
              const Icon = c.icon;
              const toneBg = c.tone === 'error' ? 'text-[var(--danger)]' :
                c.tone === 'warn' ? 'text-[var(--warning)]' :
                c.tone === 'info' ? 'text-[var(--info)]' : 'text-[var(--success)]';
              return (
                <div key={c.id} className="channels-template rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn('grid h-7 w-7 place-items-center rounded-md bg-[var(--bg-elevated)]', toneBg)}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="text-sm font-semibold">{c.name}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mb-3">{c.desc}</div>
                  <pre className="text-[10px] font-mono bg-[var(--bg-elevated)] rounded-md p-2.5 whitespace-pre-wrap text-[var(--text-secondary)] border border-[var(--border)] max-h-24 overflow-y-auto">
                    {c.preview}
                  </pre>
                  <Button
                    size="sm" variant="secondary" className="w-full mt-2"
                    onClick={() => { setCardToEdit(c); setActiveModal('editCard'); }}
                  >
                    <Code2 className="h-3 w-3" />编辑模板
                  </Button>
                </div>
              );
            })}
          </div>

          {/* 多语言模板 */}
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />多语言模板（默认 zh-CN）
              </div>
              <Button size="sm" variant="secondary" onClick={() => setActiveModal('addLanguage')}>
                <Plus className="h-3 w-3" />新增语言
              </Button>
            </div>
            <div className="space-y-2">
              {languages.map((l) => (
                <div key={l.key} className="flex items-start gap-3 rounded-md bg-[var(--bg-elevated)] p-2.5 text-xs">
                  <Badge tone="info" className="text-[10px] shrink-0">{l.key}</Badge>
                  <span className="font-semibold shrink-0 w-20">{l.label}</span>
                  <span className="text-[var(--text-muted)] flex-1">{l.sample}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* 按需展开的渠道详情面板 */}
      <Drawer
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title={active ? `${active.name} · 渠道详情` : '渠道详情'}
        description="健康度、投递配置、降级路径与黑名单"
        width={420}
      >
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
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
                <span>QPS 趋势 (15min)</span>
                <span className="font-mono">峰值 {Math.max(...QPS_SPARK)}</span>
              </div>
              <Sparkline data={QPS_SPARK} stroke="var(--brand)" width={272} height={32} />
            </div>
          </div>
        )}

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
              <ConfigField label="QPS 限流" value={`${cfg.rateLimit.qps} / ${cfg.rateLimit.daily}/日`} />
              <ConfigField label="失败重试" value={`最多 ${cfg.retry.max} 次 · ${cfg.retry.backoff === 'exponential' ? '指数退避' : cfg.retry.backoff}`} />
              <ConfigField label="静默期" value={`${cfg.silent.start} - ${cfg.silent.end}`} />
              <ConfigField label="合并窗口" value={cfg.mergeWindow} />
            </div>
            {showConfig && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" onClick={() => setActiveModal('editConfig')}>
                  <Edit3 className="h-3 w-3" />编辑配置
                </Button>
                <Button size="sm" variant="secondary">
                  <History className="h-3 w-3" />变更记录
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 路由路径 */}
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
            <Button className="w-full" size="sm" onClick={() => setActiveModal('sendTest')}>
              <SendIcon className="h-3.5 w-3.5" />发送测试消息
            </Button>
          </div>
        )}

        {/* 黑名单 */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-[var(--danger)]" />黑名单（{blacklist.length}）
            </div>
            <Button size="sm" variant="secondary" onClick={() => setActiveModal('addBlacklist')}>
              <Plus className="h-3 w-3" />添加
            </Button>
          </div>
          {blacklist.length === 0 ? (
            <EmptyState icon={Ban} title="黑名单为空" description="所有联系人都可正常触达" />
          ) : (
            <div className="space-y-1.5">
              {blacklist.map((b) => (
                <div key={b.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px] group relative">
                  <div className="flex items-center justify-between mb-0.5">
                    <Badge tone={b.type === '用户' ? 'info' : 'warn'} className="text-[9px]">{b.type}</Badge>
                    <span className="text-[10px] text-[var(--text-muted)]">至 {b.expires}</span>
                  </div>
                  <div className="font-mono text-[10px] truncate">{b.value}</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{b.reason} · {b.addedBy}</div>
                  <button
                    onClick={() => setDeleteBlacklist(b.id)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity grid h-5 w-5 place-items-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--danger)]"
                    title="移除"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
      </Drawer>

      {/* ===== Modals ===== */}
      <SendTestModal
        open={activeModal === 'sendTest'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleSendTest}
        channelName={active?.name ?? ''}
      />

      <NewChannelModal
        open={activeModal === 'newChannel'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleNewChannel}
      />

      <NewCardModal
        open={activeModal === 'newCard'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleNewCard}
      />

      <EditCardDrawer
        open={activeModal === 'editCard' && !!cardToEdit}
        onClose={() => { setActiveModal(null); setCardToEdit(null); }}
        card={cardToEdit}
        onSubmit={handleSaveCard}
      />

      <AddBlacklistModal
        open={activeModal === 'addBlacklist'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleAddBlacklist}
      />

      <AddLanguageModal
        open={activeModal === 'addLanguage'}
        onClose={() => setActiveModal(null)}
        onSubmit={handleAddLanguage}
      />

      <EditConfigModal
        open={activeModal === 'editConfig'}
        onClose={() => setActiveModal(null)}
        config={cfg}
        onSubmit={handleSaveConfig}
      />

      <EditRouteModal
        open={activeModal === 'editRoute' && !!cardToEdit}
        onClose={() => { setActiveModal(null); setCardToEdit(null); }}
        route={cardToEdit}
        onSubmit={(updated) => handleSaveRoute(cardToEdit?._idx, updated)}
      />

      <ConfirmDialog
        open={!!deleteBlacklist}
        onClose={() => setDeleteBlacklist(null)}
        onConfirm={handleDeleteBlacklist}
        title="从黑名单移除？"
        description="移除后将恢复对该联系人的消息发送。"
        confirmText="移除"
        tone="danger"
      />

      <ConfirmDialog
        open={clearStreamConfirm}
        onClose={() => setClearStreamConfirm(false)}
        onConfirm={handleClearStream}
        title="清空消息流？"
        description="仅清空本地测试记录，真实消息流不受影响。"
        confirmText="清空"
      />
    </div>
  );
}

/* ===== 子组件 ===== */

function KpiCard({ label, value, tone }: { label: string; value: any; tone?: 'success' | 'error' | 'neutral' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-center">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
    </div>
  );
}

function ChannelMetric({
  label, value, detail, tone = 'brand',
}: {
  label: string; value: string; detail: string; tone?: 'brand' | 'success' | 'info' | 'warning';
}) {
  const toneClass = tone === 'success' ? 'channels-metric--success' : tone === 'info' ? 'channels-metric--info' : tone === 'warning' ? 'channels-metric--warning' : 'channels-metric--brand';
  return (
    <div className={cn('channels-metric rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5', toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold leading-none text-[var(--text)]">{value}</div>
      <div className="mt-1 text-[10px] text-[var(--text-muted)]">{detail}</div>
    </div>
  );
}

function RouteStep({ value, active = false }: { value: string; active?: boolean }) {
  if (value === '—') return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px]',
      active
        ? 'border-[var(--brand)]/35 bg-[var(--brand-light)] text-[var(--brand)]'
        : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
    )}>
      {value}
    </span>
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

function SendTestModal({
  open, onClose, onSubmit, channelName,
}: { open: boolean; onClose: () => void; onSubmit: (f: { target: string; content: string }) => void; channelName: string }) {
  const [target, setTarget] = useState('');
  const [content, setContent] = useState('这是一条来自数字员工平台的测试消息');
  const valid = target.trim() && content.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`发送测试消息 · ${channelName}`}
      description="将通过所选渠道发送，真实消耗配额"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ target: target.trim(), content }); setTarget(''); }}>
            <SendIcon className="h-3 w-3" />发送
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="接收方" required>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="例如：ou_3a8b... 或 user@example.com" />
        </Field>
        <Field label="消息内容" required>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-28 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs resize-none"
          />
        </Field>
        <div className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2.5">
          <div className="text-[10px] text-[var(--text-muted)] mb-1 flex items-center gap-1"><Eye className="h-3 w-3" />预览</div>
          <pre className="text-[11px] whitespace-pre-wrap font-sans text-[var(--text)]">{content}</pre>
        </div>
      </div>
    </Modal>
  );
}

function NewChannelModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { name: string; kind: ChannelKind }) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('feishu');
  const valid = name.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建渠道"
      description="接入新的消息通知渠道"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ name: name.trim(), kind }); setName(''); }}>
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="渠道名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：飞书生产环境" />
        </Field>
        <Field label="渠道类型">
          <select value={kind} onChange={(e) => setKind(e.target.value as ChannelKind)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
            <option value="feishu">飞书</option>
            <option value="wecom">企业微信</option>
            <option value="dingtalk">钉钉</option>
            <option value="slack">Slack</option>
            <option value="email">邮件</option>
            <option value="webhook">Webhook</option>
            <option value="sms">短信</option>
            <option value="phone">电话</option>
          </select>
        </Field>
        <p className="text-[10px] text-[var(--text-muted)]">创建后可进入右侧「渠道配置」设置鉴权、限流等参数。</p>
      </div>
    </Modal>
  );
}

function NewCardModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { name: string; desc: string; preview: string; tone: string }) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [preview, setPreview] = useState('');
  const [tone, setTone] = useState('info');
  const valid = name.trim() && preview.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建 Adaptive Card 模板"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ name: name.trim(), desc: desc.trim(), preview: preview.trim(), tone }); setName(''); setDesc(''); setPreview(''); }}>
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="模板名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：紧急扩容通知" />
        </Field>
        <Field label="分类">
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
            <option value="error">error（告警）</option>
            <option value="warn">warn（审批）</option>
            <option value="info">info（报告）</option>
            <option value="success">success（升级）</option>
          </select>
        </Field>
        <Field label="说明">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="一句话用途" />
        </Field>
        <Field label="卡片内容" required>
          <textarea
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            placeholder={'📌 标题\n内容描述\n[操作按钮]'}
            className="w-full h-32 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono resize-none"
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditCardDrawer({
  open, onClose, card, onSubmit,
}: { open: boolean; onClose: () => void; card: any; onSubmit: (c: any) => void }) {
  const [name, setName] = useState(card?.name ?? '');
  const [desc, setDesc] = useState(card?.desc ?? '');
  const [preview, setPreview] = useState(card?.preview ?? '');
  const [tone, setTone] = useState(card?.tone ?? 'info');
  useEffect(() => {
    setName(card?.name ?? ''); setDesc(card?.desc ?? ''); setPreview(card?.preview ?? ''); setTone(card?.tone ?? 'info');
  }, [card?.id]);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={card ? `编辑 ${card.name}` : '编辑'}
      description="支持 Markdown + Emoji · 实时预览"
      width={760}
    >
      {card && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="模板名称">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="分类">
              <select value={tone} onChange={(e) => setTone(e.target.value as any)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
                <option value="error">error</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
                <option value="success">success</option>
              </select>
            </Field>
            <Field label="说明">
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </Field>
            <Field label="卡片内容">
              <textarea
                value={preview}
                onChange={(e) => setPreview(e.target.value)}
                className="w-full h-56 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs font-mono resize-none"
              />
            </Field>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-2">实时预览</div>
            <div className={cn('rounded-lg border p-3',
              tone === 'error' ? 'bg-[var(--danger-bg)] border-[var(--danger)]/30' :
              tone === 'warn' ? 'bg-[var(--warning-bg)] border-[var(--warning)]/30' :
              tone === 'info' ? 'bg-[var(--info-bg)] border-[var(--info)]/30' :
              'bg-[var(--success-bg)] border-[var(--success)]/30',
            )}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className={cn('h-4 w-4',
                  tone === 'error' ? 'text-[var(--danger)]' : tone === 'warn' ? 'text-[var(--warning)]' : tone === 'info' ? 'text-[var(--info)]' : 'text-[var(--success)]')} />
                <span className="text-sm font-semibold">{name || '未命名模板'}</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mb-2">{desc || '无说明'}</div>
              <pre className="text-[11px] font-mono bg-[var(--bg)] rounded p-2 whitespace-pre-wrap text-[var(--text-secondary)] border border-[var(--border)]">
                {preview || '（空白）'}
              </pre>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={() => onSubmit({ ...card, name, desc, preview, tone })}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function AddBlacklistModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { type: string; value: string; reason: string }) => void }) {
  const [type, setType] = useState('用户');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const valid = value.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加到黑名单"
      description="阻止向该目标发送任何消息"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" disabled={!valid} onClick={() => { onSubmit({ type, value: value.trim(), reason: reason.trim() || '手动添加' }); setValue(''); setReason(''); }}>
            添加
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="类型">
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
            <option>用户</option>
            <option>电话</option>
            <option>邮箱</option>
            <option>Webhook</option>
          </select>
        </Field>
        <Field label="目标值" required>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="user@example.com / +86... / webhook URL" />
        </Field>
        <Field label="原因">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="拒收投诉 / 高频无效告警" />
        </Field>
      </div>
    </Modal>
  );
}

function AddLanguageModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { key: string; label: string; sample: string }) => void }) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [sample, setSample] = useState('');
  const valid = key.trim() && label.trim() && sample.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新增多语言"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ key: key.trim(), label: label.trim(), sample: sample.trim() }); setKey(''); setLabel(''); setSample(''); }}>
            添加
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="语言标识 (BCP-47)" required>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="zh-TW / fr-FR / ko-KR" />
        </Field>
        <Field label="显示名称" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="繁體中文 / Français" />
        </Field>
        <Field label="示例文案" required>
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            className="w-full h-20 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs resize-none"
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditConfigModal({
  open, onClose, config, onSubmit,
}: { open: boolean; onClose: () => void; config: any; onSubmit: (u: Record<string, any>) => void; }) {
  const [qps, setQps] = useState(config?.rateLimit?.qps ?? 50);
  const [retryMax, setRetryMax] = useState(config?.retry?.max ?? 3);
  const [silentStart, setSilentStart] = useState(config?.silent?.start ?? '22:00');
  const [silentEnd, setSilentEnd] = useState(config?.silent?.end ?? '08:00');
  const [merge, setMerge] = useState(config?.mergeWindow ?? '5 min');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑渠道配置"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={() => onSubmit({ rateLimit: { qps, daily: config?.rateLimit?.daily ?? 10000 }, retry: { max: retryMax, backoff: 'exponential' }, silent: { start: silentStart, end: silentEnd }, mergeWindow: merge })}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="QPS 限流">
            <Input type="number" value={qps} onChange={(e) => setQps(Number(e.target.value))} />
          </Field>
          <Field label="重试次数">
            <Input type="number" value={retryMax} onChange={(e) => setRetryMax(Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="静默期开始">
            <Input value={silentStart} onChange={(e) => setSilentStart(e.target.value)} placeholder="HH:mm" />
          </Field>
          <Field label="静默期结束">
            <Input value={silentEnd} onChange={(e) => setSilentEnd(e.target.value)} placeholder="HH:mm" />
          </Field>
        </div>
        <Field label="合并窗口">
          <Input value={merge} onChange={(e) => setMerge(e.target.value)} placeholder="5 min" />
        </Field>
        <p className="text-[10px] text-[var(--text-muted)]">变更将立即生效，影响正在路由的事件。</p>
      </div>
    </Modal>
  );
}

function EditRouteModal({
  open, onClose, route, onSubmit,
}: { open: boolean; onClose: () => void; route: any; onSubmit: (r: any) => void }) {
  const [main, setMain] = useState(route?.main ?? '');
  const [f1, setF1] = useState(route?.f1 ?? '');
  const [f2, setF2] = useState(route?.f2 ?? '');
  const [fb, setFb] = useState(route?.fb ?? '');
  useEffect(() => {
    setMain(route?.main ?? ''); setF1(route?.f1 ?? ''); setF2(route?.f2 ?? ''); setFb(route?.fb ?? '');
  }, [route?.event]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={route ? `编辑 ${route.event} 路由` : ''}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={() => onSubmit({ ...route, main, f1, f2, fb })}>保存</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="主渠道" required>
          <Input value={main} onChange={(e) => setMain(e.target.value)} />
        </Field>
        <Field label="失败 1 (Fallback 1)">
          <Input value={f1} onChange={(e) => setF1(e.target.value)} placeholder="—" />
        </Field>
        <Field label="失败 2 (Fallback 2)">
          <Input value={f2} onChange={(e) => setF2(e.target.value)} placeholder="—" />
        </Field>
        <Field label="兜底 (Last Resort)">
          <Input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="—" />
        </Field>
      </div>
    </Modal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="text-[var(--danger)]"> *</span>}
      </label>
      {children}
    </div>
  );
}
