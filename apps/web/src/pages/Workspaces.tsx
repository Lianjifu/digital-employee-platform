/**
 * P4 工作区（企业级优化版）
 * Todo 1-10:
 *  1. 工作区切换器（4 工作区 + 增强）
 *  2. 工作区卡片：合规分/区域/成员
 *  3. 顶部 4 KPI（工作区/成员/Agent/工具）
 *  4. 成员表格：4 角色 + 双签权限
 *  5. Agent 关联（独立 Agent 列表）
 *  6. 工具矩阵（每个工作区启用）
 *  7. 创建向导（多步表单）
 *  8. 切换实时数据更新
 *  9. 跨工作区切换历史
 * 10. 合规基线检查
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar } from '@de/web-ui';
import {
  Building2, ShieldCheck, Plus, Users, Bot, Wrench, Activity, FileText,
  ChevronRight, History, Sparkles, Lock, CheckCircle2, AlertTriangle,
  Database, Settings, ArrowRight, Layers,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Workspace } from '@de/web-types';

const COMPLIANCE_BAR = [
  { label: '数据出境', status: 'pass' },
  { label: '双签复核', status: 'pass' },
  { label: '字段脱敏', status: 'pass' },
  { label: 'Key 轮转', status: 'pass' },
  { label: 'MFA', status: 'pass' },
  { label: 'SignedLog', status: 'pass' },
  { label: 'gVisor 沙箱', status: 'pass' },
];

export default function Workspaces() {
  const [activeWs, setActiveWs] = useState('w1');
  const [showWizard, setShowWizard] = useState(false);
  const [tab, setTab] = useState<'overview' | 'members' | 'agents' | 'tools' | 'compliance'>('overview');

  const { data: list } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  const { data: members = [] } = useApiQuery<any[]>(['ws', activeWs, 'members'], `/api/workspaces/${activeWs}/members`);
  const { data: agents = [] } = useApiQuery<string[]>(['ws', activeWs, 'agents'], `/api/workspaces/${activeWs}/agents`);
  const { data: tools } = useApiQuery<any>(['ws', activeWs, 'tools'], `/api/workspaces/${activeWs}/tools`);
  const { data: switchHistory = [] } = useApiQuery<any[]>(['ws-switch-history'], '/api/workspace-switch-history');

  const active = list?.find((w) => w.id === activeWs);

  // KPI 计算
  const kpis = useMemo(() => {
    const totalAgents = list?.reduce((s, w) => s + w.memberCount, 0) ?? 0;
    const onlineAgents = (list ?? []).filter((w) => w.plan !== 'standard').length;
    return [
      { label: '工作区', value: `${list?.length ?? 0}/${list?.[0]?.plan ? '12' : '0'}`, sub: `${onlineAgents} 在线`, tone: 'brand' as const },
      { label: '成员', value: String(totalAgents), sub: '4 角色', tone: 'purple' as const },
      { label: '智能体', value: '8', sub: '已启用', tone: 'success' as const },
      { label: '技能调用', value: '8.2k', sub: '次/日', tone: 'warning' as const },
    ];
  }, [list]);

  return (
    <div className="workspaces-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)]">
      {/* Header */}
      <div className="mx-auto w-full max-w-[1480px] px-4 pt-5 sm:px-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="page-header__title">工作区 · 多租户管理</h1>
            <p className="page-header__sub">
              {list?.length ?? 0} 个工作区 · 跨团队隔离 · 独立 Agent/知识/工具
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-xs text-[var(--text-muted)] md:flex">
              当前工作区
              <select value={activeWs} onChange={(e) => setActiveWs(e.target.value)} className="h-9 max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-medium text-[var(--text)]">
                {(list ?? []).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.region}</option>)}
              </select>
            </label>
            <Button variant="secondary" size="md">
              <Settings className="h-3.5 w-3.5" />组织设置
            </Button>
            <Button size="md" onClick={() => setShowWizard(true)}>
              <Plus className="h-3.5 w-3.5" />新建工作区
            </Button>
          </div>
        </div>

        {/* Todo 3: 4 KPI */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {kpis.map((k) => (
            <div key={k.label} className={cn('kpi-card', `kpi-card--${k.tone}`)}>
              <div className="kpi-card__label">{k.label}</div>
              <div className="kpi-card__value">{k.value}</div>
              <div className="kpi-card__sub">{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 单一主面板 */}
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-6 sm:px-6">
        {/* Todo 1: 左侧 4 工作区切换器 */}
        <aside className="hidden">
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              我的工作区 ({list?.length ?? 0})
            </div>
            <div className="space-y-2">
              {(list ?? []).map((w) => (
                <button
                  key={w.id}
                  onClick={() => setActiveWs(w.id)}
                  className={cn(
                    'block w-full rounded-lg border p-3 text-left transition-all',
                    w.id === activeWs ? 'card-active' : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      'grid h-9 w-9 place-items-center rounded-md shrink-0',
                      w.plan === 'enterprise_plus' ? 'bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-white' :
                      w.plan === 'enterprise' ? 'bg-[var(--brand-light)] text-[var(--brand)]' :
                      'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
                    )}>
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{w.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{w.region}</div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Badge tone={w.complianceScore >= 95 ? 'success' : 'warn'} className="text-[9px]">
                          合规 {w.complianceScore}
                        </Badge>
                        <span className="text-[10px] text-[var(--text-muted)]">·</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{w.memberCount} 人</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Todo 7: 创建向导入口 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />
              快速创建
            </div>
            <Button size="sm" variant="secondary" className="w-full" onClick={() => setShowWizard(true)}>
              <Plus className="h-3 w-3" />工作区向导
            </Button>
            <div className="mt-2 text-[10px] text-[var(--text-muted)] leading-relaxed">
              3 步创建：基本信息 → 资源配额 → 合规基线
            </div>
          </div>
        </aside>

        {/* 中间：当前工作区详情 + Tabs */}
        <section className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)]">
          {active && (
            <>
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">{active.name}</h2>
                    <Badge tone="brand">{active.plan.replace('_', ' ')}</Badge>
                    <Badge tone={active.complianceScore >= 95 ? 'success' : 'warn'}>
                      合规 {active.complianceScore}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {active.region} · 创建于 {active.createdAt.slice(0, 10)} · {active.memberCount} 成员
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex rounded-md border border-[var(--border)] overflow-hidden">
                    {(['overview', 'members', 'agents', 'tools', 'compliance'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                          'px-2.5 py-1 text-[11px]',
                          tab === t ? 'bg-[var(--brand)] text-white' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]',
                        )}
                      >
                        {t === 'overview' ? '概览' : t === 'members' ? '成员' : t === 'agents' ? 'Agent' : t === 'tools' ? '工具' : '合规'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {/* Tab: 概览 */}
                {tab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <KpiInline label="成员" value={`${active.memberCount}`} sub="4 角色" />
                      <KpiInline label="智能体" value={`${agents.length}`} sub="已启用" tone="brand" />
                      <KpiInline label="技能" value={`${tools?.enabled ?? 0}/${tools?.total ?? 0}`} sub="已启用" tone="success" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />合规基线（7 项）
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {COMPLIANCE_BAR.map((c) => (
                          <div key={c.label} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs">
                            <span>{c.label}</span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5" />本月指标
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <Mini label="调用" value="8.2k/日" />
                        <Mini label="缓存命中" value="32%" tone="success" />
                        <Mini label="P95" value="680ms" />
                        <Mini label="成本" value="$1.24k" tone="primary" />
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><History className="h-3.5 w-3.5" />最近切换记录</div>
                      <div className="divide-y overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
                        {switchHistory.slice(0, 4).map((h) => (
                          <div key={h.id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">{h.time}</span>
                            <span className="truncate">{h.from}</span><ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" /><span className="truncate font-semibold text-[var(--brand)]">{h.to}</span>
                            <span className="ml-auto hidden text-[10px] text-[var(--text-muted)] sm:block">{h.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: 成员 */}
                {tab === 'members' && (
                  <div className="rounded-md border border-[var(--border)] overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] bg-[var(--bg-elevated)]">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">成员</th>
                          <th className="text-left px-3 py-2 font-semibold">角色</th>
                          <th className="text-left px-3 py-2 font-semibold">邮箱</th>
                          <th className="text-center px-3 py-2 font-semibold">MFA</th>
                          <th className="text-left px-3 py-2 font-semibold">最后活跃</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m: any) => (
                          <tr key={m.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Avatar name={m.name} size={20} />
                                <span className="font-semibold">{m.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge tone={
                                m.role === 'Admin' ? 'error' :
                                m.role === 'SRE' ? 'brand' :
                                m.role === 'Sec' ? 'warn' : 'neutral'
                              }>{m.role}</Badge>
                            </td>
                            <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{m.email}</td>
                            <td className="px-3 py-2 text-center">
                              {m.mfa ? <CheckCircle2 className="inline h-3.5 w-3.5 text-[var(--success)]" /> : <AlertTriangle className="inline h-3.5 w-3.5 text-[var(--warning)]" />}
                            </td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{m.lastActive}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tab: Agent */}
                {tab === 'agents' && (
                  <div>
                    <div className="mb-2 text-xs font-semibold flex items-center justify-between">
                      <span>已启用 Agent ({agents.length})</span>
                      <Button size="sm" variant="secondary"><Plus className="h-3 w-3" />添加</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {agents.map((a: string) => (
                        <div key={a} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 flex items-center gap-2.5">
                          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)] shrink-0">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{a}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">v1.x · 4.5+ · 已启用</div>
                          </div>
                          <Button size="sm" variant="secondary"><Settings className="h-3 w-3" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tab: 工具 */}
                {tab === 'tools' && tools && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5" />
                        工具矩阵
                        <Badge tone="brand" className="text-[10px]">{tools.enabled}/{tools.total}</Badge>
                      </div>
                      <Progress value={(tools.enabled / tools.total) * 100} tone="success" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['redis-cli', 'kubectl', 'loki-query', 'prometheus-mcp', 'cmdb-tool', 'jira-tool'].map((t, i) => (
                        <div key={t} className={cn(
                          'rounded-md border p-2.5',
                          i < tools.enabled ? 'border-[var(--success)]/30 bg-[var(--success-bg)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]',
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs">{t}</span>
                            {i < tools.enabled ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                            ) : (
                              <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tab: 合规 */}
                {tab === 'compliance' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />
                        合规评分 {active.complianceScore}/100
                      </div>
                      <Progress value={active.complianceScore} tone="success" />
                      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                        等保 3 · ISO 27001 · GDPR 兼容 · 94 项自评通过
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: '等保 3.0', status: 'pass', desc: '94 项 / 91 通过' },
                        { name: 'ISO 27001', status: 'pass', desc: '有效至 2027-03' },
                        { name: '数据出境', status: 'pass', desc: '境内 94% / 出境 6%' },
                        { name: 'GDPR', status: 'warn', desc: '需补充协议' },
                      ].map((c) => (
                        <div key={c.name} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">{c.name}</span>
                            <Badge tone={c.status === 'pass' ? 'success' : 'warn'}>{c.status === 'pass' ? '通过' : '改善'}</Badge>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">{c.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* 右侧：Todo 9 切换历史 + 系统状态 */}
        <aside className="hidden">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />工作区切换历史
            </div>
            <div className="space-y-2">
              {switchHistory.map((h) => (
                <div key={h.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{h.time}</span>
                    <span className="text-[10px] font-mono">{h.user}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <span>{h.from}</span>
                    <ArrowRight className="h-3 w-3 text-[var(--text-muted)]" />
                    <span className="font-semibold text-[var(--brand)]">{h.to}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{h.reason}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />系统状态
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                { label: 'API 服务', status: 'healthy' },
                { label: '数据库', status: 'healthy' },
                { label: 'Milvus', status: 'healthy' },
                { label: 'OpenSearch', status: 'healthy' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">{s.label}</span>
                  <Badge tone="success" className="text-[9px]">
                    <span className="h-1 w-1 rounded-full bg-[var(--success)] animate-pulse mr-0.5" />
                    正常
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Todo 7: 创建向导 Modal */}
      {showWizard && <CreateWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}

function KpiInline({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'brand' | 'success' }) {
  const color = tone === 'brand' ? 'text-[var(--brand)]' : tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-xl font-bold font-mono', color)}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'primary' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'primary' ? 'text-[var(--brand)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-sm font-mono font-bold', color)}>{value}</div>
    </div>
  );
}

function CreateWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-xl bg-[var(--surface-1)] border border-[var(--border)] shadow-xl w-[560px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="text-sm font-semibold">新建工作区向导</div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Stepper */}
          <div className="flex items-center gap-2">
            {['基本信息', '资源配额', '合规基线'].map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  i + 1 <= step ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]',
                )}>{i + 1}</div>
                <span className={cn('text-xs', i + 1 === step ? 'font-semibold' : 'text-[var(--text-muted)]')}>{s}</span>
                {i < 2 && <div className="flex-1 h-px bg-[var(--border)]" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <Field label="工作区名称" placeholder="例如 ACME 预发" />
              <Field label="区域" placeholder="cn-east-1" mono />
              <Field label="订阅" placeholder="Enterprise" />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3 text-xs">
              <Limiter label="席位" value="10" max="50" />
              <Limiter label="智能体" value="5" max="20" />
              <Limiter label="Token / 月" value="1M" max="50M" />
            </div>
          )}
          {step === 3 && (
            <div className="space-y-2 text-xs">
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="accent-[var(--brand)]" />数据出境（境内）</label>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="accent-[var(--brand)]" />双签复核（写动作 100%）</label>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="accent-[var(--brand)]" />SignedLog 审计</label>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          <Button size="sm" variant="secondary" onClick={() => step > 1 ? setStep(step - 1) : onClose()}>
            {step > 1 ? '上一步' : '取消'}
          </Button>
          <Button size="sm" onClick={() => step < 3 ? setStep(step + 1) : onClose()}>
            {step < 3 ? '下一步' : '完成创建'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, mono }: { label: string; placeholder: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)] mb-1">{label}</div>
      <input
        type="text"
        placeholder={placeholder}
        className={cn('h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm', mono && 'font-mono')}
      />
    </div>
  );
}

function Limiter({ label, value, max }: { label: string; value: string; max: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-mono">{value} / {max}</span>
      </div>
      <div className="h-1.5 bg-[var(--bg-hover)] rounded overflow-hidden">
        <div className="h-full bg-[var(--brand)]" style={{ width: '20%' }} />
      </div>
    </div>
  );
}
