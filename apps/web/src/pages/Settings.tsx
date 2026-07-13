import { useState } from 'react';
import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Progress } from '@de/web-ui';
import { Building2, Users, ShieldCheck, FileText, Lock, Bell, CreditCard, Database, CheckCircle2, AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
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

export default function Settings() {
  const [active, setActive] = useState('tenant');
  const { data: audits } = useApiQuery<AuditItem[]>(['audits'], '/api/audits');
  const pass = (audits ?? []).filter((a) => a.status === 'pass').length;
  const warn = (audits ?? []).filter((a) => a.status === 'warn').length;

  return (
    <div className="grid h-full grid-cols-[220px_1fr_320px] divide-x divide-[var(--color-border)]">
      {/* 左侧 8 大模块 */}
      <aside className="overflow-y-auto p-3">
        <div className="mb-2 px-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">企业管理</div>
        {MENU.map((m) => (
          <button
            key={m.key}
            onClick={() => setActive(m.key)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md p-2 text-left text-xs',
              active === m.key ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]' : 'hover:bg-[var(--color-surface-2)]',
            )}
          >
            <m.icon className="h-3.5 w-3.5" />
            <span>{m.label}</span>
          </button>
        ))}
      </aside>

      {/* 中间 */}
      <section className="overflow-y-auto p-4">
        {active === 'tenant' && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>租户信息</CardTitle><Badge tone="success">Enterprise Plus</Badge></CardHeader>
              <CardBody className="grid grid-cols-2 gap-4 text-xs">
                <Field label="租户名" value="ACME Corp" />
                <Field label="租户 ID" value={<span className="font-mono">tnt_a7f9****</span>} />
                <Field label="区域" value={<Badge tone="info">cn-east-1</Badge>} />
                <Field label="创建时间" value="2024-03-12" />
                <Field label="席位" value="50 / 50" />
                <Field label="订阅" value="$5,000 / 月" />
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>4 角色权限矩阵</CardTitle></CardHeader>
              <CardBody>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-[var(--color-text-muted)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="py-2 text-left">角色</th>
                      <th className="py-2 text-left">人数</th>
                      <th className="py-2 text-left">主要权限</th>
                      <th className="py-2 text-left">写动作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { role: 'Admin', count: 2, perms: '所有模块 · 双签', tone: 'error' as const },
                      { role: 'SRE', count: 4, perms: 'AIOps / RAG / MCP / 写(复核)', tone: 'warn' as const },
                      { role: 'Sec', count: 3, perms: 'SecOps / 审计 / 数据出境', tone: 'info' as const },
                      { role: 'View', count: 9, perms: '只读 · 检索 · 报表', tone: 'neutral' as const },
                    ].map((r) => (
                      <tr key={r.role} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-2.5"><Badge tone={r.tone}>{r.role}</Badge></td>
                        <td className="py-2.5">{r.count}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)]">{r.perms}</td>
                        <td className="py-2.5">{r.role === 'View' ? <Badge tone="neutral">✗</Badge> : <Badge tone="success">✔ 复核</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <div className="grid grid-cols-4 gap-3">
              <Card><CardBody className="text-xs"><div className="text-[10px] text-[var(--color-text-muted)]">合规评分</div><div className="mt-1 text-2xl font-semibold text-emerald-500">98<span className="text-xs">/100</span></div></CardBody></Card>
              <Card><CardBody className="text-xs"><div className="text-[10px] text-[var(--color-text-muted)]">审计/24h</div><div className="mt-1 text-2xl font-semibold">242</div></CardBody></Card>
              <Card><CardBody className="text-xs"><div className="text-[10px] text-[var(--color-text-muted)]">本月用量</div><div className="mt-1 text-2xl font-semibold">$1.24k</div></CardBody></Card>
              <Card><CardBody className="text-xs"><div className="text-[10px] text-[var(--color-text-muted)]">预算占比</div><div className="mt-1 text-2xl font-semibold text-emerald-500">24%</div></CardBody></Card>
            </div>
          </div>
        )}

        {active === 'security' && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>94 项安全审计</CardTitle>
                <div className="flex items-center gap-2 text-xs">
                  <Badge tone="success"><CheckCircle2 className="mr-1 inline h-3 w-3" />{pass} 通过</Badge>
                  <Badge tone="warn"><AlertTriangle className="mr-1 inline h-3 w-3" />{warn} 改善</Badge>
                </div>
              </CardHeader>
              <CardBody>
                <div className="mb-3">
                  <Progress value={(pass / (audits?.length ?? 1)) * 100} tone="success" />
                  <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">{pass} / {audits?.length} 通过 · 98%</div>
                </div>
                <div className="space-y-1">
                  {(audits ?? []).map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        {a.status === 'pass' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        <span>{a.name}</span>
                        <Badge tone="neutral">{a.category}</Badge>
                      </div>
                      <Badge tone={a.status === 'pass' ? 'success' : 'warn'}>{a.status === 'pass' ? '通过' : '改善中'}</Badge>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {active === 'compliance' && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>合规框架</CardTitle></CardHeader>
              <CardBody className="grid grid-cols-2 gap-3 text-xs">
                <ComplianceItem title="等保 3.0" status="pass" desc="94 项 / 91 通过 / 3 改善" />
                <ComplianceItem title="ISO 27001" status="pass" desc="认证有效至 2027-03" />
                <ComplianceItem title="数据出境" status="pass" desc="P0/P1 可出境 (5%) · 其余境内" />
                <ComplianceItem title="GDPR 兼容" status="warn" desc="欧盟用户数据需补充协议" />
              </CardBody>
            </Card>
          </div>
        )}

        {['members', 'audit', 'notify', 'billing', 'backup'].includes(active) && (
          <Card>
            <CardHeader><CardTitle>{MENU.find((m) => m.key === active)?.label}</CardTitle></CardHeader>
            <CardBody className="text-xs text-[var(--color-text-muted)]">
              此模块占位 — 完整功能将在后续 Sprint 接入。<br />
              <br />
              当前演示模块已覆盖：租户信息、安全 & 认证、数据合规。
            </CardBody>
          </Card>
        )}
      </section>

      {/* 右侧 */}
      <aside className="space-y-3 overflow-y-auto p-4">
        <Card>
          <CardHeader><CardTitle className="text-xs">企业详情</CardTitle></CardHeader>
          <CardBody className="space-y-1 text-xs">
            <Field label="租户" value="ACME Corp" />
            <Field label="订阅" value="Enterprise Plus" />
            <Field label="席位" value="50" />
            <Field label="下次审计" value="2026-09-12" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">合规清单</CardTitle></CardHeader>
          <CardBody className="space-y-1 text-xs">
            <Row label="等保 3.0" value={<Badge tone="success">✔</Badge>} />
            <Row label="ISO 27001" value={<Badge tone="success">✔</Badge>} />
            <Row label="数据境内" value={<Badge tone="success">✔</Badge>} />
            <Row label="双审计" value={<Badge tone="success">✔</Badge>} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">快捷操作</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-xs">
            <Button size="sm" variant="outline" className="w-full">导出审计日志</Button>
            <Button size="sm" variant="outline" className="w-full">管理 API Key</Button>
            <Button size="sm" variant="outline" className="w-full">Webhook 配置</Button>
            <Button size="sm" variant="outline" className="w-full">系统版本</Button>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-2">
      <div className="text-[var(--color-text-muted)]">{label}</div>
      <div>{value}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-[var(--color-text-muted)]">{label}</span>{value}</div>;
}
function ComplianceItem({ title, status, desc }: { title: string; status: 'pass' | 'warn'; desc: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <Badge tone={status === 'pass' ? 'success' : 'warn'}>{status === 'pass' ? '通过' : '改善中'}</Badge>
      </div>
      <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">{desc}</div>
    </div>
  );
}