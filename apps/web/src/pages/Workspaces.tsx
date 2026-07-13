import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Progress, Avatar, Empty } from '@de/web-ui';
import { Building2, ShieldCheck, Plus, Users, Bot, Wrench, Activity, FileText } from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Workspace } from '@de/web-types';

const ROLE_MATRIX = [
  { role: 'Admin', count: 2, color: 'bg-rose-500', perms: '所有模块 · 双签' },
  { role: 'SRE', count: 4, color: 'bg-blue-500', perms: 'AIOps / RAG / MCP · 写(复核)' },
  { role: 'Sec', count: 3, color: 'bg-amber-500', perms: 'SecOps / 审计 / 出境 · 复核' },
  { role: 'View', count: 9, color: 'bg-slate-500', perms: '只读 · 检索 · 报表' },
];

export default function Workspaces() {
  const { data: list } = useApiQuery<Workspace[]>(['workspaces'], '/api/workspaces');
  const active = list?.[0];

  return (
    <div className="grid h-full grid-cols-[260px_1fr_320px] divide-x divide-[var(--border)]">
      {/* 左侧列表 */}
      <aside className="overflow-y-auto p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold">我的工作区</div>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--surface-2)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1">
          {(list ?? []).map((w) => (
            <div
              key={w.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border border-transparent p-2 hover:border-[var(--border)] hover:bg-[var(--surface-2)]',
                w.id === active?.id && 'border-[var(--brand)] bg-[var(--brand)]/10',
              )}
            >
              <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--surface-3)]">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{w.name}</div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                  <span>{w.region}</span>
                  <span>·</span>
                  <span>{w.plan}</span>
                </div>
              </div>
              <Badge tone={w.complianceScore >= 95 ? 'success' : 'warn'}>{w.complianceScore}</Badge>
            </div>
          ))}
        </div>
      </aside>

      {/* 中间 KPI */}
      <section className="overflow-y-auto p-4">
        {active ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{active.name}</h2>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Badge tone="info">{active.region}</Badge>
                  <Badge tone="brand">{active.plan}</Badge>
                  <span>· 创建于 {active.createdAt.slice(0, 10)}</span>
                </div>
              </div>
              <Button>编辑设置</Button>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-3">
              {[
                { label: '成员', value: active.memberCount, icon: <Users className="h-3.5 w-3.5" />, tone: 'primary' as const },
                { label: '智能体', value: '8', icon: <Bot className="h-3.5 w-3.5" />, tone: 'primary' as const },
                { label: '技能调用', value: '8.2k', sub: '次/日', icon: <Wrench className="h-3.5 w-3.5" />, tone: 'primary' as const },
                { label: '合规评分', value: `${active.complianceScore}`, sub: '/100', icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />, tone: 'success' as const },
              ].map((s) => (
                <Card key={s.label}>
                  <CardBody className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">{s.label}</div>
                      <div className={cn('mt-0.5 text-xl font-semibold', s.tone === 'success' ? 'text-emerald-500' : 'text-[var(--brand)]')}>
                        {s.value}{s.sub && <span className="ml-1 text-xs">{s.sub}</span>}
                      </div>
                    </div>
                    {s.icon}
                  </CardBody>
                </Card>
              ))}
            </div>

            {/* 4 角色权限矩阵 */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>4 角色权限矩阵</CardTitle>
                <span className="text-xs text-[var(--text-muted)]">RBAC + 字段级</span>
              </CardHeader>
              <CardBody>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-[var(--text-muted)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="py-2 text-left">角色</th>
                      <th className="py-2 text-left">人数</th>
                      <th className="py-2 text-left">主要权限</th>
                      <th className="py-2 text-left">写动作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_MATRIX.map((r) => (
                      <tr key={r.role} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-full', r.color)} />
                            <span className="font-medium">{r.role}</span>
                          </div>
                        </td>
                        <td className="py-2.5">{r.count}</td>
                        <td className="py-2.5 text-[var(--text-muted)]">{r.perms}</td>
                        <td className="py-2.5">
                          {r.role === 'View' ? <Badge tone="neutral">✗</Badge> : <Badge tone="warn">✔ 复核</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            {/* 详情卡：成员/智能体/工具 */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { title: '成员', icon: Users, content: '18 人 · 4 角色 · MFA 100%' },
                { title: '智能体', icon: Bot, content: '8 已安装 · 24 商店' },
                { title: '工具', icon: Wrench, content: '24 启用 · 8 MCP · 8.2k/日' },
                { title: '合规', icon: ShieldCheck, content: '等保 3 + ISO 27001 · 98/100' },
                { title: '用量', icon: Activity, content: '12.4M token · $1.24k / $5k' },
                { title: '审计', icon: FileText, content: '242 条/24h · SignedLog' },
              ].map((c) => (
                <Card key={c.title}>
                  <CardBody className="flex items-start gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--brand)]/15 text-[var(--brand)]">
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-medium">{c.title}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{c.content}</div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Empty title="加载中..." />
        )}
      </section>

      {/* 右侧创建向导 / 合规基线 */}
      <aside className="space-y-3 overflow-y-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs">创建新工作区</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            <div className="text-[var(--text-muted)]">支持多企业、多团队隔离 · 独立 Agent / 知识 / 工具</div>
            <Button size="sm" className="w-full"><Plus className="h-3.5 w-3.5" />创建向导</Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs">合规基线</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-xs">
            <div className="flex items-center justify-between"><span>数据出境</span><Badge tone="success">境内</Badge></div>
            <div className="flex items-center justify-between"><span>双签复核</span><Badge tone="success">已启用</Badge></div>
            <div className="flex items-center justify-between"><span>字段脱敏</span><Badge tone="success">token 级</Badge></div>
            <div className="flex items-center justify-between"><span>Key 轮转</span><Badge tone="success">30d</Badge></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs">最近管理事件</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-xs">
            {['新增成员 张睿', '升级 Enterprise Plus', '完成等保 3 审计'].map((e, i) => (
              <div key={i} className="rounded bg-[var(--surface-2)] px-2 py-1.5">{e}</div>
            ))}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}