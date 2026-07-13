/**
 * P4 工作区
 * 1:1 对齐 docs/01-product/mockups/p4-workspace.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Avatar } from '@de/web-ui';
import {
  Building2, ShieldCheck, Plus, Users, Bot, Wrench, Activity, FileText,
  ArrowUp, CheckCircle2, Globe, Lock, CreditCard, Database, Bell,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Workspace } from '@de/web-types';

const KPI_DATA = [
  { tone: 'brand' as const, label: '工作区', value: '8', sub: '/ 12 已用', trend: { dir: 'up' as const, v: '+1' } },
  { tone: 'purple' as const, label: '成员', value: '18', sub: '人 · 4 角色', trend: { dir: 'up' as const, v: '+2' } },
  { tone: 'success' as const, label: '智能体', value: '8', sub: '已启用', trend: { dir: 'flat' as const } },
  { tone: 'warning' as const, label: '技能调用', value: '8.2k', sub: '次/日' },
  { tone: 'danger' as const, label: '待办积压', value: '3', sub: '件 · 临近' },
  { tone: 'success' as const, label: '合规评分', value: '98', sub: '/ 100 等保 3' },
  { tone: 'primary' as const, label: '月用量', value: '$1.24k', sub: '/ $5.0k (24%)' },
  { tone: 'info' as const, label: '审计', value: '242', sub: '条/24h' },
];

const ROLE_MATRIX = [
  { role: 'Admin', count: 2, color: 'bg-[var(--danger)]', perms: '所有模块 · 双签 · Admin', write: '✔' },
  { role: 'SRE', count: 4, color: 'bg-[var(--brand)]', perms: 'AIOps / RAG / MCP / 写(复核)', write: '✔ (复核)' },
  { role: 'Sec', count: 3, color: 'bg-[var(--warning)]', perms: 'SecOps / 审计 / 数据出境', write: '✔ (复核)' },
  { role: 'View', count: 9, color: 'bg-[var(--text-muted)]', perms: '只读 · 检索 · 报表', write: '✗' },
];

const DETAIL_CARDS = [
  { icon: Users, title: '成员', value: '18 人 · 4 角色 · MFA 100%', accent: 'list-card-accent--success' },
  { icon: Bot, title: '智能体', value: '8 已启用 · 24 商店 · 2 企业包', accent: 'list-card-accent' },
  { icon: Wrench, title: '工具', value: '24 启用 · 8 MCP · 8.2k/日', accent: 'list-card-accent--warning' },
  { icon: ShieldCheck, title: '合规', value: '等保 3 + ISO 27001 · 98/100', accent: 'list-card-accent--success' },
  { icon: Activity, title: '用量', value: '12.4M token · $1.24k / $5k', accent: 'list-card-accent--purple' },
  { icon: FileText, title: '审计', value: '242 条/24h · SignedLog', accent: 'list-card-accent' },
];

const RIGHT_MENU = [
  { key: 'tenant', label: '租户信息', icon: Building2 },
  { key: 'members', label: '成员 & 权限', icon: Users },
  { key: 'security', label: '安全 & 认证', icon: ShieldCheck },
  { key: 'audit', label: '审计 & 监控', icon: FileText },
  { key: 'compliance', label: '数据合规', icon: Lock },
  { key: 'notify', label: '通知 & 告警', icon: Bell },
  { key: 'billing', label: '租户 & 计费', icon: CreditCard },
  { key: 'backup', label: '备份 & 恢复', icon: Database },
];

export default function Workspaces() {
  const { data: list } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  const active = list?.[0];

  return (
    <div className="flex h-full">
      {/* 左侧：4 工作区列表 */}
      <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold">工作区</div>
            <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--bg-elevated)]">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="p-2">
          {(list ?? []).map((w) => (
            <div
              key={w.id}
              className={cn(
                'flex items-center gap-3 rounded-md p-3 cursor-pointer transition-all',
                w.id === active?.id
                  ? 'card-active'
                  : 'hover:bg-[var(--bg-elevated)] border border-transparent',
              )}
            >
              <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] text-[var(--brand)]">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{w.name}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono">{w.region} · {w.plan}</div>
              </div>
              <Badge tone={w.complianceScore >= 95 ? 'success' : 'warn'} className="font-mono">{w.complianceScore}</Badge>
            </div>
          ))}
        </div>

        {/* 创建向导 */}
        <div className="m-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Plus className="h-3 w-3" />创建新工作区
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">多租户隔离 · 独立 Agent/知识/工具</div>
          <Button size="sm" className="mt-2 w-full">
            <Plus className="h-3 w-3" />立即创建
          </Button>
        </div>
      </aside>

      {/* 中间 */}
      <section className="flex-1 overflow-y-auto p-6">
        {active && (
          <>
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="page-header__title">{active.name}</h1>
                <p className="page-header__sub">
                  {active.plan} · {active.region} · 创建于 {active.createdAt.slice(0, 10)}
                </p>
              </div>
              <div className="page-header__actions">
                <Button variant="secondary" size="sm">
                  <Globe className="h-3.5 w-3.5" />切换
                </Button>
                <Button size="sm">编辑设置</Button>
              </div>
            </div>

            {/* KPI 8 卡 */}
            <div className="mb-6 grid grid-cols-4 gap-3">
              {KPI_DATA.map((k) => (
                <div key={k.label} className={cn('kpi-card', `kpi-card--${k.tone === 'primary' ? 'brand' : k.tone}`)}>
                  <div className="kpi-card__label">{k.label}</div>
                  <div className="kpi-card__value">
                    {k.value}
                    {k.trend && (
                      <span className={cn('kpi-card__trend', `kpi-card__trend--${k.trend.dir}`)}>
                        {k.trend.dir === 'up' && <ArrowUp className="h-3 w-3" />}
                        {k.trend.v ?? '—'}
                      </span>
                    )}
                  </div>
                  <div className="kpi-card__sub">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* 4 角色权限矩阵 */}
            <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--text-muted)]" />
                  4 角色权限矩阵
                </div>
                <Badge tone="brand">RBAC + 字段级</Badge>
              </div>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    <th className="text-left px-4 py-2 font-semibold">角色</th>
                    <th className="text-left px-4 py-2 font-semibold">人数</th>
                    <th className="text-left px-4 py-2 font-semibold">主要权限</th>
                    <th className="text-left px-4 py-2 font-semibold">写动作</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_MATRIX.map((r) => (
                    <tr key={r.role} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', r.color)} />
                          <span className="font-semibold">{r.role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{r.count}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{r.perms}</td>
                      <td className="px-4 py-3">
                        {r.write === '✔' ? <Badge tone="success">✔</Badge> : <Badge tone="warn">{r.write}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 6 详情卡 */}
            <div className="grid grid-cols-3 gap-3">
              {DETAIL_CARDS.map((c) => (
                <div key={c.title} className={cn('list-card list-card-accent relative pl-5', c.accent)}>
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--brand-light)] text-[var(--brand)]">
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{c.title}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{c.value}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 右侧：8 模块菜单 + 合规基线 + 事件 */}
      <aside className="w-[280px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-[var(--text-muted)]">企业管理</div>
          <div className="space-y-0.5">
            {RIGHT_MENU.map((m) => (
              <button
                key={m.key}
                className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <m.icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />
            合规基线
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between"><span>数据出境</span><Badge tone="success">境内</Badge></div>
            <div className="flex items-center justify-between"><span>双签复核</span><Badge tone="success">已启用</Badge></div>
            <div className="flex items-center justify-between"><span>字段脱敏</span><Badge tone="success">token 级</Badge></div>
            <div className="flex items-center justify-between"><span>Key 轮转</span><Badge tone="success">30d</Badge></div>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            最近管理事件
          </div>
          <div className="space-y-1.5 text-xs">
            {['新增成员 张睿', '升级 Enterprise Plus', '完成等保 3 审计', '新增工作区 安全'].map((e, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-[var(--bg-elevated)] px-2 py-1.5">
                <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                <span className="text-[var(--text-secondary)]">{e}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}