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
import { useState } from 'react';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Progress, Avatar } from '@de/web-ui';
import {
  Building2, ShieldCheck, Plus, Users, Bot, Wrench, Activity, FileText,
  ChevronRight, History, Sparkles, Lock, CheckCircle2, AlertTriangle,
  Database, Settings, ArrowRight, Layers,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Workspace } from '@de/web-types';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
  const { current, setCurrent } = useWorkspaceStore();
  const activeWs = current?.id ?? 'w1';
  const [showWizard, setShowWizard] = useState(false);
  const [tab, setTab] = useState<'overview' | 'members' | 'agents' | 'tools' | 'compliance' | 'quota' | 'runtime' | 'audit' | 'settings'>('overview');
  const [governanceNotice, setGovernanceNotice] = useState<string | null>(null);
  const [transferOwnerId, setTransferOwnerId] = useState('');

  const { data: list } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  const { data: members = [] } = useApiQuery<any[]>(['ws', activeWs, 'members'], `/api/workspaces/${activeWs}/members`);
  const { data: agents = [] } = useApiQuery<string[]>(['ws', activeWs, 'agents'], `/api/workspaces/${activeWs}/agents`);
  const { data: tools } = useApiQuery<any>(['ws', activeWs, 'tools'], `/api/workspaces/${activeWs}/tools`);
  const { data: environments = [] } = useApiQuery<any[]>(['ws', activeWs, 'environments'], `/api/workspaces/${activeWs}/environments`);
  const { data: quota } = useApiQuery<any>(['ws', activeWs, 'quota'], `/api/workspaces/${activeWs}/quota`);
  const { data: audit = [] } = useApiQuery<any[]>(['ws', activeWs, 'audit'], `/api/workspaces/${activeWs}/audit`);
  const { data: switchHistory = [] } = useApiQuery<any[]>(['ws-switch-history'], '/api/workspace-switch-history');
  const runtimeAction = useApiMutation<any, { type: 'handoff' | 'paused'; detail: string }> (() => `/api/workspaces/${activeWs}/runtime`, { onSuccess: (event) => setGovernanceNotice(`运行治理已登记：${event.detail}`), onError: (error) => setGovernanceNotice(error instanceof Error ? error.message : '运行治理动作失败') });
  const freezeWorkspace = useApiMutation<any, { reason: string }>(() => `/api/workspaces/${activeWs}/freeze`, { onSuccess: () => setGovernanceNotice('工作区已冻结，相关动作已写入审计。'), onError: (error) => setGovernanceNotice(error instanceof Error ? error.message : '冻结失败') });
  const transferWorkspace = useApiMutation<any, { ownerId: string; reason: string }>(() => `/api/workspaces/${activeWs}/transfer`, { onSuccess: () => { setGovernanceNotice('工作区负责人已移交，变更已写入审计。'); setTransferOwnerId(''); }, onError: (error) => setGovernanceNotice(error instanceof Error ? error.message : '负责人移交失败') });

  const active = list?.find((w) => w.id === activeWs);

  return (
    <div className="workspaces-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)]">
      {/* Header */}
      <div className="workspace-shell">
      <header className="workspace-header-panel">
        <div className="workspace-header-row">
          <div>
            <div className="workspace-eyebrow">ENTERPRISE CONTROL PLANE</div><h1 className="page-header__title">工作区</h1>
            <p className="page-header__sub">
              {list?.length ?? 0} 个工作区 · 跨团队隔离 · 独立 Agent/知识/工具
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-xs text-[var(--text-muted)] md:flex">
              当前工作区
              <select value={activeWs} onChange={(e) => { const target = list?.find((item) => item.id === e.target.value); if (target) setCurrent(target); }} className="h-9 max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-medium text-[var(--text)]">
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

      </header>

      {/* 独立治理内容面板 */}
      <main className="workspace-main-panel">
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
                  onClick={() => setCurrent(w)}
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
        <section className="workspace-content-panel">
          {active && (
            <>
              <div className="workspace-control-layout">
                  <nav className="workspace-tabs" aria-label="工作区管理分区">
                    {(['overview', 'members', 'agents', 'tools', 'compliance', 'quota', 'runtime', 'audit', 'settings'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                          'px-2.5 py-1 text-[11px]',
                          tab === t ? 'bg-[var(--brand)] text-white' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]',
                        )}
                      >
                        {t === 'overview' ? '概览' : t === 'members' ? '成员与权限' : t === 'agents' ? '资源目录' : t === 'tools' ? '环境与发布' : t === 'compliance' ? '策略与合规' : t === 'quota' ? '配额与成本' : t === 'runtime' ? '运行治理' : t === 'audit' ? '工作区审计' : '工作区设置'}
                      </button>
                    ))}
                  </nav>
              <div className="workspace-panel-body">
                {governanceNotice && <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--brand)]/30 bg-[var(--brand-light)] px-3 py-2 text-xs text-[var(--brand)]"><span>{governanceNotice}</span><button type="button" onClick={() => setGovernanceNotice(null)}>关闭</button></div>}
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
                    <div className="mt-4 grid grid-cols-3 gap-2">{environments.map((environment) => <div key={environment.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"><div className="font-semibold">{environment.kind === 'production' ? '生产' : environment.kind === 'staging' ? '预发' : '沙箱'}</div><div className="mt-1 text-[10px] text-[var(--text-muted)]">{environment.approvalRequired ? '发布需审批' : '可直接发布'} · 灰度 {environment.canaryPercent}%</div></div>)}</div>
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

                {tab === 'quota' && <div className="grid grid-cols-2 gap-3">{quota && Object.entries(quota).map(([name, value]: any) => <KpiInline key={name} label={name === 'budgetUsd' ? '模型预算' : name === 'tokens' ? 'Token' : name === 'concurrency' ? '并发' : name === 'agents' ? '数字员工' : '席位'} value={`${value.used}/${value.limit}`} sub={`使用率 ${Math.round(value.used / value.limit * 100)}%`} tone={value.used / value.limit > .8 ? 'brand' : 'success'} />)}</div>}
                {tab === 'runtime' && <div className="space-y-3"><div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-4 text-xs"><strong>运行治理</strong><p className="mt-1 text-[var(--text-muted)]">支持人工接管、熔断、暂停和事件复盘；所有动作需要原因并写入工作区审计。</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" loading={runtimeAction.isPending} onClick={() => runtimeAction.mutate({ type: 'handoff', detail: '人工接管当前高风险任务' })}>发起人工接管</Button><Button size="sm" variant="secondary" loading={runtimeAction.isPending} onClick={() => runtimeAction.mutate({ type: 'paused', detail: '暂停高风险运行并等待复核' })}>暂停高风险运行</Button></div></div>}
                {tab === 'audit' && <div className="divide-y overflow-hidden rounded-md border border-[var(--border)]">{audit.length ? audit.map((event) => <div key={event.id} className="flex gap-3 px-3 py-2 text-xs"><span className="font-mono text-[var(--text-muted)]">{event.time.slice(11, 19)}</span><span>{event.actor}</span><strong>{event.action}</strong><span className="text-[var(--text-muted)]">{event.target}</span></div>) : <div className="p-8 text-center text-xs text-[var(--text-muted)]">暂无工作区审计事件</div>}</div>}
                {tab === 'settings' && <div className="space-y-3 rounded-lg border border-[var(--border)] p-4 text-xs"><div><strong>工作区负责人</strong><p className="mt-1 text-[var(--text-muted)]">负责人变更、冻结与归档均需记录原因和影响范围。</p></div><div className="flex flex-wrap gap-2"><select aria-label="选择新负责人" value={transferOwnerId} onChange={(event) => setTransferOwnerId(event.target.value)} className="h-8 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="">选择工作区成员</option>{members.filter((member) => member.id !== active.ownerId).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select><Button size="sm" variant="secondary" disabled={!transferOwnerId} loading={transferWorkspace.isPending} onClick={() => transferWorkspace.mutate({ ownerId: transferOwnerId, reason: '运营管理员发起负责人移交' })}>移交负责人</Button><Button size="sm" variant="secondary" loading={freezeWorkspace.isPending} onClick={() => freezeWorkspace.mutate({ reason: '运营管理员发起冻结' })}>冻结工作区</Button></div></div>}
              </div></div>
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
      </main></div>

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
