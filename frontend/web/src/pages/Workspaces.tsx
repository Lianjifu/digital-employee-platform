/**
 * 工作区是业务域资源与运营的边界。
 * 身份权限、安全策略、审计与运行处置统一由安全治理承接，避免控制面重复。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Progress } from '@de/web-ui';
import {
  Plus, Bot, Wrench, Activity, History, Lock,
  CheckCircle2, Settings, ArrowRight,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Workspace } from '@de/web-types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useT } from '@/i18n';

export default function Workspaces() {
  const { t } = useT();
  const navigate = useNavigate();
  const { current, setCurrent } = useWorkspaceStore();
  const activeWs = current?.id ?? 'w1';
  const [showWizard, setShowWizard] = useState(false);
  const [tab, setTab] = useState<'overview' | 'resources' | 'environment' | 'quota' | 'settings'>('overview');
  const [governanceNotice, setGovernanceNotice] = useState<string | null>(null);
  const [transferOwnerId, setTransferOwnerId] = useState('');

  const { data: list } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  const { data: members = [] } = useApiQuery<any[]>(['ws', activeWs, 'members'], `/api/workspaces/${activeWs}/members`);
  const { data: agents = [] } = useApiQuery<string[]>(['ws', activeWs, 'agents'], `/api/workspaces/${activeWs}/agents`);
  const { data: tools } = useApiQuery<any>(['ws', activeWs, 'tools'], `/api/workspaces/${activeWs}/tools`);
  const { data: environments = [] } = useApiQuery<any[]>(['ws', activeWs, 'environments'], `/api/workspaces/${activeWs}/environments`);
  const { data: quota } = useApiQuery<any>(['ws', activeWs, 'quota'], `/api/workspaces/${activeWs}/quota`);
  const { data: switchHistory = [] } = useApiQuery<any[]>(['ws-switch-history'], '/api/workspace-switch-history');
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
            <div className="workspace-eyebrow">WORKSPACE MANAGEMENT</div><h1 className="page-header__title">{t('module.workspace.title')}</h1>
            <p className="page-header__sub">
              {t('module.workspace.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-xs text-[var(--text-muted)] md:flex">
              当前工作区
              <select value={activeWs} onChange={(e) => { const target = list?.find((item) => item.id === e.target.value); if (target) setCurrent(target); }} className="h-9 max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-medium text-[var(--text)]">
                {(list ?? []).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.region}</option>)}
              </select>
            </label>
            <Button variant="secondary" size="md" onClick={() => navigate('/settings')}>
              <Settings className="h-3.5 w-3.5" />组织设置
            </Button>
            <Button size="md" onClick={() => setShowWizard(true)}>
              <Plus className="h-3.5 w-3.5" />新建工作区
            </Button>
          </div>
        </div>

      </header>

      {/* 工作区内容面板 */}
      <main className="workspace-main-panel">
        {/* 当前工作区详情 */}
        <section className="workspace-content-panel">
          {active && (
            <>
              <div className="workspace-control-layout">
                  <nav className="workspace-tabs" aria-label="工作区管理分区">
                    {(['overview', 'resources', 'environment', 'quota', 'settings'] as const).map((tabKey) => (
                      <button
                        key={tabKey}
                        onClick={() => setTab(tabKey)}
                        className={cn(
                          'px-2.5 py-1 text-[11px]',
                          tab === tabKey ? 'bg-[var(--brand)] text-white' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]',
                        )}
                      >
                        {t(`module.workspace.tabs.${tabKey}`)}
                      </button>
                    ))}
                  </nav>
              <div className="workspace-panel-body">
                {governanceNotice && <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--brand)]/30 bg-[var(--brand-light)] px-3 py-2 text-xs text-[var(--brand)]"><span>{governanceNotice}</span><button type="button" onClick={() => setGovernanceNotice(null)}>关闭</button></div>}
                {/* Tab: 概览 */}
                {tab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <KpiInline label="数字员工" value={`${agents.length}`} sub="已纳入目录" tone="brand" />
                      <KpiInline label="可用技能" value={`${tools?.enabled ?? 0}/${tools?.total ?? 0}`} sub="已启用" tone="success" />
                      <KpiInline label="发布环境" value={`${environments.length}`} sub="按环境隔离" />
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

                {/* Tab: 资源目录 */}
                {tab === 'resources' && (
                  <div>
                    <div className="mb-2 text-xs font-semibold flex items-center justify-between">
                      <span>已接入数字员工 ({agents.length})</span>
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
                            <div className="text-[10px] text-[var(--text-muted)]">已分配至当前工作区</div>
                          </div>
                          <Button size="sm" variant="secondary"><Settings className="h-3 w-3" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tab: 环境发布 */}
                {tab === 'environment' && tools && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5" />
                        发布可用技能
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
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold">发布环境</div>
                      <div className="grid grid-cols-3 gap-2">{environments.map((environment) => <div key={environment.id} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"><div className="font-semibold">{environment.kind === 'production' ? '生产' : environment.kind === 'staging' ? '预发' : '沙箱'}</div><div className="mt-1 text-[10px] text-[var(--text-muted)]">{environment.approvalRequired ? '发布需审批' : '可直接发布'} · 灰度 {environment.canaryPercent}%</div></div>)}</div>
                    </div>
                  </div>
                )}

                {tab === 'quota' && <div className="grid grid-cols-2 gap-3">{quota && Object.entries(quota).map(([name, value]: any) => <KpiInline key={name} label={name === 'budgetUsd' ? '模型预算' : name === 'tokens' ? 'Token' : name === 'concurrency' ? '并发' : name === 'agents' ? '数字员工' : '席位'} value={`${value.used}/${value.limit}`} sub={`使用率 ${Math.round(value.used / value.limit * 100)}%`} tone={value.used / value.limit > .8 ? 'brand' : 'success'} />)}</div>}
                {tab === 'settings' && <div className="space-y-3 rounded-lg border border-[var(--border)] p-4 text-xs"><div><strong>工作区负责人</strong><p className="mt-1 text-[var(--text-muted)]">负责人变更、冻结与归档均需记录原因和影响范围。</p></div><div className="flex flex-wrap gap-2"><select aria-label="选择新负责人" value={transferOwnerId} onChange={(event) => setTransferOwnerId(event.target.value)} className="h-8 min-w-[160px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="">选择工作区成员</option>{members.filter((member) => member.id !== active.ownerId).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select><Button size="sm" variant="secondary" disabled={!transferOwnerId} loading={transferWorkspace.isPending} onClick={() => transferWorkspace.mutate({ ownerId: transferOwnerId, reason: '运营管理员发起负责人移交' })}>移交负责人</Button><Button size="sm" variant="secondary" loading={freezeWorkspace.isPending} onClick={() => freezeWorkspace.mutate({ reason: '运营管理员发起冻结' })}>冻结工作区</Button></div></div>}
              </div></div>
            </>
          )}
        </section>

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
