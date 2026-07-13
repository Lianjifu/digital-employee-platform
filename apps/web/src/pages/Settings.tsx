/**
 * P11 设置 · 企业管理控制台
 * 1:1 对齐 docs/01-product/mockups/p11-settings.html
 */
import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Progress } from '@de/web-ui';
import {
  Building2, Users, ShieldCheck, FileText, Lock, Bell, CreditCard, Database,
  CheckCircle2, AlertTriangle, Settings as SettingsIcon, ArrowUp, Globe2,
  Trash2, Download, Key, ChevronRight,
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
];

const ROLE_MATRIX = [
  { role: 'Admin', count: 2, color: 'bg-[var(--danger)]', perms: '所有模块 · 双签 · 全权限', write: '✔', tone: 'success' as const },
  { role: 'SRE', count: 4, color: 'bg-[var(--brand)]', perms: 'AIOps / RAG / MCP / 写(复核)', write: '✔ (复核)', tone: 'warn' as const },
  { role: 'Sec', count: 3, color: 'bg-[var(--warning)]', perms: 'SecOps / 审计 / 数据出境', write: '✔ (复核)', tone: 'warn' as const },
  { role: 'View', count: 9, color: 'bg-[var(--text-muted)]', perms: '只读 · 检索 · 报表', write: '✗', tone: 'neutral' as const },
];

const AUDIT_ITEMS: AuditItem[] = [
  { id: 'a1', name: '身份认证 (Authentik+OIDC)', category: 'identity', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a2', name: 'MFA 双因素 (100% 启用)', category: 'identity', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a3', name: '密码策略 (12 位 + 90d 轮转)', category: 'identity', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a4', name: '字段级权限', category: 'access', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a5', name: '数据出境策略', category: 'data', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a6', name: '双签复核 (写动作 100%)', category: 'access', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a7', name: 'SignedLog 审计', category: 'audit', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a8', name: 'API Key 30d 轮转', category: 'data', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a9', name: 'gVisor 沙箱隔离', category: 'compliance', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a10', name: '风险评估', category: 'compliance', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a11', name: '下次审计日期', category: 'compliance', status: 'pass', updatedAt: '2026-07-12' },
  { id: 'a12', name: '导出审计日志', category: 'audit', status: 'warn', updatedAt: '2026-07-12' },
  { id: 'a13', name: '字段脱敏增强', category: 'data', status: 'warn', updatedAt: '2026-07-12' },
  { id: 'a14', name: '灰度发布策略', category: 'compliance', status: 'warn', updatedAt: '2026-07-12' },
];

const COMPLIANCE = [
  { name: '等保 3.0', status: 'pass' as const, desc: '94 项 / 91 通过 / 3 改善中' },
  { name: 'ISO 27001', status: 'pass' as const, desc: '认证有效至 2027-03' },
  { name: '数据出境', status: 'pass' as const, desc: 'P0/P1 可出境 (5%) · 其余境内' },
  { name: 'GDPR 兼容', status: 'warn' as const, desc: '欧盟用户数据需补充协议' },
];

export default function Settings() {
  const [active, setActive] = useState('security');
  const pass = AUDIT_ITEMS.filter((a) => a.status === 'pass').length;
  const warn = AUDIT_ITEMS.filter((a) => a.status === 'warn').length;
  const total = AUDIT_ITEMS.length;

  return (
    <div className="flex h-full">
      {/* 左侧 8 大模块 */}
      <aside className="w-[220px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-[var(--text-muted)]">企业管理</div>
          <div className="space-y-0.5">
            {MENU.map((m) => (
              <button
                key={m.key}
                onClick={() => setActive(m.key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md p-2 text-left text-xs transition-colors',
                  active === m.key ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold' : 'hover:bg-[var(--bg-elevated)]',
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
        <div className="p-4">
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

      {/* 中间 */}
      <section className="flex-1 overflow-y-auto p-6">
        {active === 'tenant' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" />租户信息</div>
                <Badge tone="success">Enterprise Plus</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-xs">
                <Field label="租户名" value="ACME Corp" />
                <Field label="租户 ID" value={<span className="font-mono">tnt_a7f9****</span>} />
                <Field label="区域" value={<Badge tone="info"><Globe2 className="mr-1 inline h-3 w-3" />cn-east-1</Badge>} />
                <Field label="创建时间" value="2024-03-12" />
                <Field label="席位" value={<span className="font-mono">50 / 50</span>} />
                <Field label="订阅" value={<span className="font-mono">$5,000 / 月</span>} />
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" />4 角色权限矩阵</div>
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
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', r.color)} />
                          <span className="font-semibold">{r.role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono">{r.count}</td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.perms}</td>
                      <td className="px-4 py-2.5"><Badge tone={r.tone}>{r.write}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <KPI icon={<ShieldCheck className="h-4 w-4 text-[var(--success)]" />} label="合规评分" value="98/100" tone="success" />
              <KPI icon={<FileText className="h-4 w-4" />} label="审计/24h" value="242" />
              <KPI icon={<CreditCard className="h-4 w-4" />} label="本月用量" value="$1.24k" />
              <KPI icon={<ArrowUp className="h-4 w-4 text-[var(--success)]" />} label="预算占比" value="24%" tone="success" />
            </div>
          </div>
        )}

        {active === 'security' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" />94 项安全审计</div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />{pass} 通过</Badge>
                  <Badge tone="warn"><AlertTriangle className="mr-1 inline h-3 w-3" />{warn} 改善</Badge>
                </div>
              </div>
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Progress value={(pass / total) * 100} tone="success" />
                  <span className="text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">{pass} / {total} · {((pass / total) * 100).toFixed(0)}%</span>
                </div>
                <div className="space-y-1.5">
                  {AUDIT_ITEMS.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs hover:border-[var(--brand)] transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        {a.status === 'pass' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)] shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />
                        )}
                        <span className="truncate">{a.name}</span>
                        <Badge tone="neutral" className="text-[10px]">{a.category}</Badge>
                      </div>
                      <Badge tone={a.status === 'pass' ? 'success' : 'warn'}>{a.status === 'pass' ? '通过' : '改善中'}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {active === 'compliance' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" />合规框架</div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 text-xs">
              {COMPLIANCE.map((c) => (
                <div key={c.name} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.name}</span>
                    <Badge tone={c.status === 'pass' ? 'success' : 'warn'}>{c.status === 'pass' ? '通过' : '改善中'}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {['members', 'audit', 'notify', 'billing', 'backup'].includes(active) && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6">
            <div className="text-sm font-semibold mb-2">{MENU.find((m) => m.key === active)?.label}</div>
            <div className="text-xs text-[var(--text-muted)]">
              此模块占位 — 完整功能将在后续 Sprint 接入。<br />
              <br />
              当前演示已覆盖：租户信息、安全 & 认证、数据合规。
            </div>
          </div>
        )}
      </section>

      {/* 右侧：企业详情 + 合规清单 + 快捷操作 */}
      <aside className="w-[280px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-[var(--brand)]" />企业详情
          </div>
          <div className="space-y-2 text-xs">
            <Row label="租户" value="ACME Corp" />
            <Row label="订阅" value="Enterprise Plus" />
            <Row label="席位" value="50" />
            <Row label="下次审计" value="2026-09-12" />
          </div>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" />合规清单
          </div>
          <div className="space-y-1.5 text-xs">
            <Row label="等保 3.0" value={<Badge tone="success">✔</Badge>} />
            <Row label="ISO 27001" value={<Badge tone="success">✔</Badge>} />
            <Row label="数据境内" value={<Badge tone="success">✔</Badge>} />
            <Row label="双审计" value={<Badge tone="success">✔</Badge>} />
            <Row label="gVisor 沙箱" value={<Badge tone="success">✔</Badge>} />
          </div>
        </div>

        <div className="p-4 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3">快捷操作</div>
          <div className="space-y-1.5">
            <Button size="sm" variant="secondary" className="w-full justify-start"><Download className="h-3.5 w-3.5" />导出审计日志</Button>
            <Button size="sm" variant="secondary" className="w-full justify-start"><Key className="h-3.5 w-3.5" />管理 API Key</Button>
            <Button size="sm" variant="secondary" className="w-full justify-start"><Webhook className="h-3.5 w-3.5" />Webhook 配置</Button>
            <Button size="sm" variant="secondary" className="w-full justify-start"><SettingsIcon className="h-3.5 w-3.5" />系统版本</Button>
          </div>
        </div>

        <div className="p-4">
          <div className="rounded-md border border-[var(--brand)]/30 bg-gradient-to-br from-[var(--brand-light)] to-[var(--purple-bg)] p-3 text-xs">
            <div className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)]" />系统状态
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10px]">
              <div className="flex justify-between"><span>API 服务</span><span className="text-[var(--success)]">● 正常</span></div>
              <div className="flex justify-between"><span>数据库</span><span className="text-[var(--success)]">● 正常</span></div>
              <div className="flex justify-between"><span>Milvus</span><span className="text-[var(--success)]">● 正常</span></div>
              <div className="flex justify-between"><span>OpenSearch</span><span className="text-[var(--success)]">● 正常</span></div>
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

function KPI({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'success' }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">{label}</div>
        {icon}
      </div>
      <div className={cn('mt-1 text-2xl font-mono font-bold', tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text)]')}>{value}</div>
    </div>
  );
}

// 占位图标（Settings 用到 Archive）
function Archive(props: any) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" x2="14" y1="12" y2="12"/></svg>;
}

function Webhook(props: any) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.06 2.04M2 12c0 5.52 4.48 10 10 10s10-4.48 10-10S17.52 2 12 2M19.85 8A10 10 0 0 0 8.15 4.92"/></svg>;
}