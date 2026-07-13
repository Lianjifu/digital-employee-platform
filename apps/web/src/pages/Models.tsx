import { useApiQuery } from '@/services/query';
import { Card, CardHeader, CardTitle, CardBody, Badge, Button, Tabs } from '@de/web-ui';
import { Cloud, Server, Globe, Plus, Key, Settings, Activity, DollarSign, ShieldCheck } from 'lucide-react';
import { cn, formatNumber } from '@de/web-utils';
import type { ModelRoute, Provider, ProviderTier } from '@de/web-types';
import { useState } from 'react';

const TIER_ICON: Record<ProviderTier, any> = { official: Cloud, self_hosted: Server, connectable: Globe };
const TIER_LABEL: Record<ProviderTier, string> = { official: '官方 API', self_hosted: '自部署', connectable: '可接入' };

export default function Models() {
  const { data: providers } = useApiQuery<Provider[]>(['providers'], '/api/providers');
  const { data: routes } = useApiQuery<ModelRoute[]>(['routes'], '/api/routes');
  const [activeId, setActiveId] = useState('p1');
  const active = providers?.find((p) => p.id === activeId);

  return (
    <div className="grid h-full grid-cols-[260px_1fr_320px] divide-x divide-[var(--border)]">
      {/* 左侧 Provider */}
      <aside className="overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold">Provider (8)</div>
          <button className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--surface-2)]">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {(['official', 'self_hosted', 'connectable'] as ProviderTier[]).map((tier) => (
          <div key={tier} className="mb-3">
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{TIER_LABEL[tier]}</div>
            {(providers ?? []).filter((p) => p.tier === tier).map((p) => {
              const Icon = TIER_ICON[p.tier];
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-[var(--surface-2)]',
                    activeId === p.id && 'bg-[var(--brand)]/15',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-[var(--brand)]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{p.models[0]}</div>
                  </div>
                  <Badge tone={p.status === 'active' ? 'success' : p.status === 'standby' ? 'warn' : 'neutral'}>{p.status}</Badge>
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* 中间：路由表 + 配置 */}
      <section className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold">模型路由 · 5 等级自动切换</h1>
            <Badge tone="success"><Activity className="mr-1 inline h-3 w-3" />自动映射已启用</Badge>
          </div>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-[var(--text-muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 text-left">等级</th>
                <th className="py-2 text-left">主路由</th>
                <th className="py-2 text-left">降级 1</th>
                <th className="py-2 text-left">降级 2</th>
                <th className="py-2 text-left">出境</th>
              </tr>
            </thead>
            <tbody>
              {(routes ?? []).map((r) => (
                <tr key={r.level} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5"><Badge tone={r.level === 'P0' ? 'error' : r.level === 'P1' ? 'warn' : r.level === 'audit' ? 'neutral' : 'info'}>{r.level}</Badge></td>
                  <td className="py-2.5 font-mono">{r.primary}</td>
                  <td className="py-2.5 font-mono text-[var(--text-muted)]">{r.fallback1}</td>
                  <td className="py-2.5 font-mono text-[var(--text-muted)]">{r.fallback2 ?? '—'}</td>
                  <td className="py-2.5">{r.crossBorder ? <Badge tone="warn">出境</Badge> : <Badge tone="success">境内</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 配置编辑器 */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs
            value="basic"
            onChange={() => {}}
            items={[
              { key: 'basic', label: '基础' },
              { key: 'apikey', label: 'API Key' },
              { key: 'mapping', label: '模型映射' },
              { key: 'advanced', label: '高级' },
            ]}
          />
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-xs">Provider 配置 · {active?.name}</CardTitle>
              <Button size="sm">保存</Button>
            </CardHeader>
            <CardBody className="space-y-3 text-xs">
              <Field label="名称" value={active?.name ?? ''} />
              <Field label="Base URL" value="https://api.anthropic.com" />
              <Field label="区域" value={
                <Badge tone={active?.region === 'cn' ? 'success' : 'info'}>{active?.region}</Badge>
              } />
              <Field label="模型" value={
                <div className="flex flex-wrap gap-1">
                  {active?.models.map((m) => (
                    <Badge key={m} tone="brand">{m}</Badge>
                  ))}
                </div>
              } />
              <Field label="API Key 状态" value={
                <div className="flex items-center gap-1.5">
                  <Key className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-500">已配置 · 下次轮转 18d</span>
                </div>
              } />
              <Field label="请求超时" value="30s" />
              <Field label="重试策略" value="指数退避 · 最多 3 次" />
            </CardBody>
          </Card>
        </div>
      </section>

      {/* 右侧：用量 + 合规 */}
      <aside className="space-y-3 overflow-y-auto p-4">
        <Card>
          <CardHeader><CardTitle className="text-xs">本月 Token 用量</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-xs">
            <div className="flex items-center justify-between"><span>输入</span><span className="font-mono">8.4M (68%)</span></div>
            <div className="flex items-center justify-between"><span>输出</span><span className="font-mono">2.8M (32%)</span></div>
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 font-semibold">
              <span>合计</span><span>12.4M</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">本月成本</CardTitle><DollarSign className="h-3.5 w-3.5 text-emerald-500" /></CardHeader>
          <CardBody className="space-y-1 text-xs">
            <div className="flex items-center justify-between"><span>已用</span><span className="font-mono">$1.24k</span></div>
            <div className="flex items-center justify-between"><span>预算</span><span className="font-mono">$5.0k</span></div>
            <div className="flex items-center justify-between text-emerald-500"><span>占比</span><span>24%</span></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">合规</CardTitle><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /></CardHeader>
          <CardBody className="space-y-1 text-xs">
            <Row label="数据出境策略" value={<Badge tone="success">已配置</Badge>} />
            <Row label="API Key 轮转" value={<Badge tone="success">30d 自动</Badge>} />
            <Row label="字段权限" value={<Badge tone="success">白名单</Badge>} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xs">本月排行</CardTitle></CardHeader>
          <CardBody className="space-y-1 text-xs">
            {(providers ?? []).slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span>{p.name}</span>
                <span className="font-mono text-[var(--text-muted)]">{formatNumber(p.monthlyTokens)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
      <div className="text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-xs">{value}</div>
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