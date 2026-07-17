/**
 * P8 技能（企业级优化版）— 全交互增强
 * 1. 4 Tab（已安装/商店/自定义/沙箱）
 * 2. 批量安装/升级 + 单条安装/卸载
 * 3. 测试运行器（输入回显 + 沙箱标识）
 * 4. 版本历史 + 详情
 * 5. 权限矩阵（可切换）
 * 6. 依赖关系图（标签视图）
 * 7. 新建/导入技能 Modal
 */
import { useState, useMemo } from 'react';
import { useApiQuery } from '@/services/query';
import { Badge, Button, Tabs, Input } from '@de/web-ui';
import {
  Wrench, Download, ShieldAlert, ShieldCheck, Settings, Plus, Search,
  AlertTriangle, CheckCircle2, Box, Star, Globe, Activity, History,
  Play, RefreshCw, Network, Lock, Cpu, Container, Eye, Terminal,
  Sparkles, Layers, Upload, Trash2, FileCode2,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Skill } from '@de/web-types';
import { Modal, Drawer, ConfirmDialog, EmptyState, Sparkline } from '@/components/shared';

const KIND_META: Record<string, { label: string; tone: 'info' | 'success' | 'warn'; icon: any; exec: string }> = {
  skill: { label: 'Skill', tone: 'info', icon: Wrench, exec: 'gVisor 沙箱' },
  mcp: { label: 'MCP', tone: 'success', icon: Globe, exec: 'HTTP/JSON 外部协议' },
  tool: { label: 'Tool', tone: 'warn', icon: Box, exec: 'REST/RPC 内部 API' },
};

const INITIAL_INSTALLED = [
  { id: 's1', kind: 'skill' as const, name: 'redis-cli', version: '1.4.2', description: 'Redis 命令执行', rating: 4.9, installCount: 1200, riskLevel: 'mid' as const, calls: '2.3k/日', cacheable: true, perf: { calls24h: 2300, errorRate: 0.4, p95Ms: 80 }, spark: [12,18,14,22,20,28,25,30,26,34,32,38] },
  { id: 's2', kind: 'skill' as const, name: 'kubectl', version: '1.4.0', description: 'K8s 资源操作', rating: 4.8, installCount: 980, riskLevel: 'high' as const, calls: '1.8k/日', cacheable: true, perf: { calls24h: 1820, errorRate: 1.2, p95Ms: 220 }, spark: [8,12,10,15,14,18,16,22,20,19,21,24] },
  { id: 's3', kind: 'skill' as const, name: 'loki-query', version: '1.2.1', description: 'Loki 日志检索', rating: 4.6, installCount: 880, riskLevel: 'low' as const, calls: '4.5k/日', cacheable: true, perf: { calls24h: 4500, errorRate: 0.1, p95Ms: 45 }, spark: [40,45,42,48,50,55,52,58,60,62,65,68] },
  { id: 's4', kind: 'skill' as const, name: 'es-query', version: '1.0.5', description: 'OpenSearch 查询', rating: 4.5, installCount: 720, riskLevel: 'low' as const, calls: '1.2k/日', cacheable: true, perf: { calls24h: 1200, errorRate: 0.2, p95Ms: 60 }, spark: [10,8,12,11,14,13,15,16,14,17,18,20] },
  { id: 's5', kind: 'mcp' as const, name: 'prometheus-mcp', version: '1.1.0', description: 'Prometheus MCP', rating: 4.7, installCount: 940, riskLevel: 'low' as const, calls: '5.6k/日', cacheable: false, perf: { calls24h: 5600, errorRate: 0.05, p95Ms: 30 }, spark: [50,55,52,58,62,65,68,72,70,75,78,82] },
  { id: 's6', kind: 'mcp' as const, name: 'kafka-mcp', version: '1.0.0', description: 'Kafka 消息 MCP', rating: 4.5, installCount: 480, riskLevel: 'low' as const, calls: '2.1k/日', cacheable: false, perf: { calls24h: 2100, errorRate: 0.1, p95Ms: 50 }, spark: [15,18,20,22,19,24,25,28,30,32,31,35] },
  { id: 's7', kind: 'tool' as const, name: 'cmdb-tool', version: '1.2.0', description: 'CMDB 资产查询', rating: 4.6, installCount: 760, riskLevel: 'mid' as const, calls: '3.4k/日', cacheable: true, perf: { calls24h: 3400, errorRate: 0.3, p95Ms: 70 }, spark: [25,28,30,32,35,38,40,42,45,48,50,52] },
  { id: 's8', kind: 'tool' as const, name: 'jira-tool', version: '1.3.5', description: 'Jira 工单管理', rating: 4.5, installCount: 690, riskLevel: 'mid' as const, calls: '1.1k/日', cacheable: true, perf: { calls24h: 1100, errorRate: 0.6, p95Ms: 150 }, spark: [8,10,12,9,11,14,12,15,16,14,17,18] },
];

const STORE_LIST = [
  { id: 'st1', kind: 'skill' as const, name: 'mysql-cli', version: '2.0.0', description: 'MySQL 命令执行', rating: 4.7, installCount: 3200, riskLevel: 'mid' as const, calls: '—', cacheable: true },
  { id: 'st2', kind: 'skill' as const, name: 'pg-cli', version: '1.8.0', description: 'PostgreSQL 客户端', rating: 4.6, installCount: 2800, riskLevel: 'mid' as const, calls: '—', cacheable: true },
  { id: 'st3', kind: 'mcp' as const, name: 'gitlab-mcp', version: '0.9.0', description: 'GitLab MR/Issue MCP', rating: 4.4, installCount: 1200, riskLevel: 'mid' as const, calls: '—', cacheable: false },
  { id: 'st4', kind: 'mcp' as const, name: 'jenkins-mcp', version: '1.0.0', description: 'Jenkins 构建触发', rating: 4.3, installCount: 880, riskLevel: 'high' as const, calls: '—', cacheable: false },
  { id: 'st5', kind: 'tool' as const, name: 'slack-tool', version: '1.2.0', description: 'Slack 消息发送', rating: 4.5, installCount: 1100, riskLevel: 'low' as const, calls: '—', cacheable: true },
  { id: 'st6', kind: 'tool' as const, name: 'github-tool', version: '1.4.0', description: 'GitHub PR/Issue', rating: 4.6, installCount: 1500, riskLevel: 'low' as const, calls: '—', cacheable: true },
];

const CUSTOM_TAB_LIST = [
  { id: 'cu1', kind: 'skill' as const, name: 'my-redis-tool', version: '0.3.0', description: '自定义 Redis 工具（团队）', rating: 4.5, installCount: 12, riskLevel: 'mid' as const, calls: '180/日', cacheable: true, perf: { calls24h: 180, errorRate: 0.5, p95Ms: 60 }, spark: [2,3,2,4,5,4,6,5,7,6,8,9] },
  { id: 'cu2', kind: 'tool' as const, name: 'jenkins-deploy', version: '0.1.0', description: 'Jenkins 部署触发', rating: 4.2, installCount: 5, riskLevel: 'high' as const, calls: '45/日', cacheable: false, perf: { calls24h: 45, errorRate: 1.5, p95Ms: 200 }, spark: [1,1,2,1,2,3,2,3,4,3,4,5] },
];

type SkillRow = {
  id: string;
  kind: 'skill' | 'mcp' | 'tool';
  name: string;
  version: string;
  description: string;
  rating: number;
  installCount: number;
  riskLevel: 'low' | 'mid' | 'high';
  calls: string;
  cacheable: boolean;
  perf: { calls24h: number; errorRate: number; p95Ms: number };
  spark?: number[];
};

function asRow(s: any): SkillRow { return s; }

const DEP_GRAPH = [
  { id: 's1', name: 'redis-cli', deps: [] },
  { id: 's2', name: 'kubectl', deps: [] },
  { id: 's3', name: 'loki-query', deps: [] },
  { id: 's5', name: 'prometheus-mcp', deps: ['s3'] },
  { id: 's7', name: 'cmdb-tool', deps: [] },
  { id: 'a1', name: '故障自愈', deps: ['s1', 's2', 's5', 's7'] },
  { id: 'a3', name: '变更辅助', deps: ['s2', 's7'] },
];

type ModalKind = 'newSkill' | 'importSkill' | 'uninstall' | null;

export default function Skills() {
  const [tab, setTab] = useState<'installed' | 'store' | 'custom' | 'sandbox'>('installed');
  const [filter, setFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<string | null>('s1');
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [batchConfirm, setBatchConfirm] = useState<'install' | 'upgrade' | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // 本地可写 state
  const [installed, setInstalled] = useState<any[]>(INITIAL_INSTALLED);
  const [searchQ, setSearchQ] = useState('');

  // 测试运行器输入与输出
  const [testCmd, setTestCmd] = useState('');
  const [testOutputs, setTestOutputs] = useState<Array<{ cmd: string; out: string; ms: number; tone: 'success' | 'error' | 'info' }>>([]);

  // 权限矩阵（state 化）
  const [permsState, setPermsState] = useState<Record<string, { canCall: boolean; canConfig: boolean }>>({});

  // 不同 tab 的数据源
  const tabList: SkillRow[] = useMemo(() => {
    if (tab === 'installed') return installed;
    if (tab === 'custom') return CUSTOM_TAB_LIST;
    if (tab === 'store') return STORE_LIST as any;
    return installed.slice(0, 4); // sandbox tab 用前 4 个演示
  }, [tab, installed]);

  const filtered = useMemo(() => {
    return tabList
      .filter((s) => filter === 'all' || s.kind === filter)
      .filter((s) => !searchQ || s.name.toLowerCase().includes(searchQ.toLowerCase()) || s.description.toLowerCase().includes(searchQ.toLowerCase()));
  }, [tabList, filter, searchQ]);

  const active = tabList.find((s) => s.id === activeId);

  const { data: trace } = useApiQuery<any>(['skill', activeId, 'trace'], activeId ? `/api/skills/${activeId}/trace` : '');
  const { data: versions = [] } = useApiQuery<any[]>(['skill', activeId, 'versions'], activeId ? `/api/skills/${activeId}/versions` : '');
  const { data: perms = [] } = useApiQuery<any[]>(['skill-perms'], '/api/skills/perms');

  // 初始化权限 state
  const currentPerms = useMemo(() => {
    return perms.map((p: any) => ({
      ...p,
      ...(permsState[p.role] ?? {}),
    }));
  }, [perms, permsState]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Handlers
  const handleInstallFromStore = (storeItem: any) => {
    setInstalled((prev) => [
      ...prev,
      {
        ...storeItem,
        id: `inst_${Date.now().toString(36)}`,
        calls: '0/日',
        perf: { calls24h: 0, errorRate: 0, p95Ms: 0 },
        spark: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    ]);
  };

  const handleUninstall = () => {
    if (!active) return;
    setInstalled((prev) => prev.filter((s) => s.id !== active.id));
    setActiveId(installed[0]?.id ?? null);
    setActiveModal(null);
  };

  const handleBatchInstall = () => {
    const toInstall = Array.from(selected).map((id) => STORE_LIST.find((s) => s.id === id)).filter(Boolean);
    toInstall.forEach(handleInstallFromStore);
    setSelected(new Set());
    setBatchConfirm(null);
  };

  const handleBatchUpgrade = () => {
    // 演示：把所有选中项的 version 小版本 +0.1
    setInstalled((prev) =>
      prev.map((s) => {
        if (!selected.has(s.id)) return s;
        const [maj, min, pat] = s.version.split('.').map(Number);
        return { ...s, version: `${maj}.${min + 1}.${pat ?? 0}` };
      }),
    );
    setSelected(new Set());
    setBatchConfirm(null);
  };

  const handleNewSkill = (form: { name: string; kind: string; description: string; riskLevel: string }) => {
    const newId = `usr_${Date.now().toString(36)}`;
    setInstalled((prev) => [
      ...prev,
      {
        id: newId,
        kind: form.kind,
        name: form.name,
        version: '0.1.0',
        description: form.description,
        rating: 0,
        installCount: 0,
        riskLevel: form.riskLevel,
        calls: '0/日',
        cacheable: false,
        perf: { calls24h: 0, errorRate: 0, p95Ms: 0 },
        spark: Array(12).fill(0),
      },
    ]);
    setActiveId(newId);
    setActiveModal(null);
  };

  const handleImport = (raw: string) => {
    // 演示：解析 JSON 或追加为 raw 名称
    try {
      const obj = JSON.parse(raw);
      const items = Array.isArray(obj) ? obj : [obj];
      items.forEach((it: any) => {
        if (it.name) {
          setInstalled((prev) => [
            ...prev,
            {
              id: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
              kind: it.kind ?? 'skill',
              name: it.name,
              version: it.version ?? '0.1.0',
              description: it.description ?? '',
              rating: it.rating ?? 0,
              installCount: it.installCount ?? 0,
              riskLevel: it.riskLevel ?? 'mid',
              calls: '0/日',
              cacheable: !!it.cacheable,
              perf: { calls24h: 0, errorRate: 0, p95Ms: 0 },
              spark: Array(12).fill(0),
            },
          ]);
        }
      });
    } catch {
      // 非 JSON：按行作为名称批量导入
      raw.split('\n').filter(Boolean).forEach((name) => {
        setInstalled((prev) => [
          ...prev,
          {
            id: `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            kind: 'skill',
            name: name.trim(),
            version: '0.1.0',
            description: `从粘贴内容导入 · ${name.trim()}`,
            rating: 0,
            installCount: 0,
            riskLevel: 'mid',
            calls: '0/日',
            cacheable: false,
            perf: { calls24h: 0, errorRate: 0, p95Ms: 0 },
            spark: Array(12).fill(0),
          },
        ]);
      });
    }
    setActiveModal(null);
  };

  const handleRunTest = () => {
    if (!active || !testCmd.trim()) return;
    // 确定性伪输出：危险命令报错，否则回显
    const dangerous = /\b(rm\s+-rf|drop\s+database|DELETE\s+FROM\s+\*|force\s*push|--hard)\b/i.test(testCmd);
    const output = dangerous
      ? '⛔ 拒绝执行：高危命令已被策略拦截（gVisor runsc policy-violation）。'
      : `+OK\n${active.name} v${active.version} 已执行\n参数: ${testCmd}\n耗时: ${active.perf.p95Ms}ms (P95 范围内)`;
    const ms = dangerous ? 5 : active.perf.p95Ms;
    const tone: 'success' | 'error' | 'info' = dangerous ? 'error' : 'success';
    setTestOutputs((prev) => [
      { cmd: testCmd, out: output, ms, tone },
      ...prev,
    ].slice(0, 6));
  };

  const riskIcon = (risk: string) => {
    if (risk === 'high') return <ShieldAlert className="h-3 w-3" />;
    if (risk === 'mid') return <AlertTriangle className="h-3 w-3" />;
    return <ShieldCheck className="h-3 w-3" />;
  };

  return (
    <div className="skills-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      {/* 左侧分类 */}
      <aside className="hidden">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="text-xs font-semibold mb-3">分类</div>
          {(['all', 'skill', 'mcp', 'tool'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs mb-1',
                filter === k ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold' : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              )}
            >
              <span>{k === 'all' ? '全部' : k === 'skill' ? 'Skill' : k === 'mcp' ? 'MCP' : 'Tool'}</span>
              <Badge tone={k === 'skill' ? 'info' : k === 'mcp' ? 'success' : k === 'tool' ? 'warn' : 'neutral'} className="text-[10px] font-mono">
                {k === 'all' ? installed.length : installed.filter((s) => s.kind === k).length}
              </Badge>
            </button>
          ))}
        </div>
        <div className="p-3 space-y-2">
          <div className="rounded-md border border-[var(--success)]/30 bg-[var(--success-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--success)]">
              <Container className="h-3.5 w-3.5" />
              gVisor 沙箱
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">{installed.length + 2} 沙箱运行中 · 0 异常</div>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="text-xs font-semibold">本月调用</div>
            <div className="mt-0.5 text-lg font-mono font-bold text-[var(--brand)]">8.2k</div>
            <div className="text-[10px] text-[var(--text-muted)]">次/日 · $0.06/次</div>
          </div>
        </div>
      </aside>

      <section className="mx-auto w-full max-w-[1680px]">
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[var(--brand)]" />
                技能与工具管理
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                统一管理 Skill、MCP 与 Tool 的安装、权限、版本和沙箱执行。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDetails(true)} disabled={!active}>
                <Eye className="h-3.5 w-3.5" />技能详情
              </Button>
              {selected.size > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] text-xs">
                  <span>已选 {selected.size}</span>
                  <Button size="sm" variant="secondary" onClick={() => setBatchConfirm('install')}>
                    <Download className="h-3 w-3" />批量安装
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setBatchConfirm('upgrade')}>
                    <RefreshCw className="h-3 w-3" />批量升级
                  </Button>
                </div>
              )}
              <Button variant="secondary" size="sm" onClick={() => setActiveModal('importSkill')}>
                <Upload className="h-3.5 w-3.5" />导入
              </Button>
              <Button size="sm" onClick={() => setActiveModal('newSkill')}><Plus className="h-3.5 w-3.5" />新建技能</Button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
              <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="搜索技能..." className="h-7 pl-7 w-48 text-xs" />
            </div>
            <div className="flex items-center gap-1 rounded-md bg-[var(--bg-elevated)] p-1">
              {(['all', 'skill', 'mcp', 'tool'] as const).map((kind) => (
                <button key={kind} onClick={() => setFilter(kind)} className={cn(
                  'rounded px-2.5 py-1 text-[11px] transition-colors',
                  filter === kind ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                )}>{kind === 'all' ? '全部' : kind === 'skill' ? 'Skill' : kind === 'mcp' ? 'MCP' : 'Tool'}</button>
              ))}
            </div>
          </div>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'installed', label: <>已安装 <Badge tone="brand" className="ml-1">{installed.length}</Badge></> },
              { key: 'store', label: <>商店 <Badge tone="neutral" className="ml-1">{STORE_LIST.length}</Badge></> },
              { key: 'custom', label: <>自定义 <Badge tone="purple" className="ml-1">{CUSTOM_TAB_LIST.length}</Badge></> },
              { key: 'sandbox', label: <>沙箱 <Badge tone="info" className="ml-1">{installed.length + 2}</Badge></> },
            ]}
          />
        </div>

        <div className="p-4 pb-8 sm:p-5 sm:pb-10">
          {filtered.length === 0 ? (
            <EmptyState
              icon={tab === 'store' ? Sparkles : Wrench}
              title={tab === 'store' ? '商店暂无更多技能' : '没有匹配的技能'}
              description={tab === 'store' ? '试试切换分类或等待新上架' : '尝试清除搜索或切换分类'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((s) => {
                const meta = KIND_META[s.kind];
                const Icon = meta.icon;
                const isActive = s.id === activeId;
                const isInInstalled = installed.some((i) => i.id === s.id || i.name === s.name);
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      'tile-brandable relative rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 cursor-pointer',
                      isActive && 'card-active',
                    )}
                  >
                    {tab !== 'store' && (
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[var(--brand)] absolute top-3 right-3"
                      />
                    )}
                    <div className="flex items-start gap-3 mb-2 pr-5">
                      <div className={cn('grid h-10 w-10 place-items-center rounded-md shrink-0',
                        s.kind === 'skill' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                        s.kind === 'mcp' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                        'bg-[var(--warning-bg)] text-[var(--warning)]',
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{s.name}</span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{s.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {s.riskLevel === 'high' ? (
                        <Badge tone="error"><ShieldAlert className="mr-0.5 inline h-2.5 w-2.5" />高风险</Badge>
                      ) : s.riskLevel === 'mid' ? (
                        <Badge tone="warn"><AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />中风险</Badge>
                      ) : (
                        <Badge tone="success"><ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" />低风险</Badge>
                      )}
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">v{s.version}</span>
                      <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-current" />{s.rating}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-[var(--border)] text-[10px]">
                      <Mini label="调用" value={s.calls ?? '—'} />
                      <Mini label="安装" value={s.installCount?.toLocaleString() ?? '—'} />
                      <Mini label="缓存" value={s.cacheable ? <span className="text-[var(--success)]">支持</span> : <span className="text-[var(--text-muted)]">无</span>} />
                    </div>

                    {/* 商店 Tab 显示安装按钮 */}
                    {tab === 'store' && (
                      <Button
                        size="sm"
                        variant={isInInstalled ? 'secondary' : 'primary'}
                        className="w-full mt-3"
                        disabled={isInInstalled}
                        onClick={(e) => { e.stopPropagation(); handleInstallFromStore(s); }}
                      >
                        {isInInstalled ? <><CheckCircle2 className="h-3 w-3" />已安装</> : <><Download className="h-3 w-3" />安装</>}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 按需展开的技能详情 */}
      <Drawer
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title={active ? `${active.name} · 技能详情` : '技能详情'}
        description="运行性能、沙箱、测试、版本和权限"
        width={460}
      >
      <div className="space-y-3">
        {active ? (
          <>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-start gap-3">
                <div className={cn('grid h-10 w-10 place-items-center rounded-md shrink-0',
                  active.kind === 'skill' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                  active.kind === 'mcp' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                  'bg-[var(--warning-bg)] text-[var(--warning)]',
                )}>
                  {(() => { const Icon = KIND_META[active.kind].icon; return <Icon className="h-5 w-5" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{active.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge tone={KIND_META[active.kind].tone}>{KIND_META[active.kind].label}</Badge>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">v{active.version}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-bg)] p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--success)]">
                <Container className="h-3.5 w-3.5" />gVisor 沙箱保护
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)] font-mono">
                runsc · gvisor 20240603 · 网络隔离 · sys 拦截
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                所有 syscall 拦截 · 网络命名空间隔离 · 文件只读挂载
              </div>
            </div>

            {/* 性能监控（含 sparkline） */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />24h 性能
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="调用" value={(active as any).perf?.calls24h ?? 0} />
                <Stat label="错误率" value={`${(active as any).perf?.errorRate ?? 0}%`} tone={(active as any).perf?.errorRate > 1 ? 'error' : 'success'} />
                <Stat label="P95" value={`${(active as any).perf?.p95Ms ?? 0}ms`} />
              </div>
              {(active as any).spark && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] text-[var(--text-muted)]">调用趋势</span>
                  <Sparkline data={(active as any).spark} stroke="var(--brand)" width={140} height={28} />
                </div>
              )}
            </div>

            {/* 测试运行器 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />测试运行器
                </div>
                <Button size="sm" variant="secondary" onClick={() => setTestRunnerOpen(!testRunnerOpen)}>
                  {testRunnerOpen ? '收起' : '打开'}
                </Button>
              </div>
              {testRunnerOpen && (
                <div className="space-y-2">
                  <Input
                    placeholder={`${active.name} 命令...`}
                    className="font-mono text-xs h-8"
                    value={testCmd}
                    onChange={(e) => setTestCmd(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunTest()}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="flex-1" onClick={handleRunTest}>
                      <Play className="h-3 w-3" />执行（沙箱隔离）
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setTestCmd('')} title="清空">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {testOutputs.length === 0 ? (
                      <div className="rounded-md bg-[var(--bg)] border border-dashed border-[var(--border)] p-3 text-[10px] text-center text-[var(--text-muted)]">
                        输入命令并回车，或点击执行
                      </div>
                    ) : (
                      testOutputs.map((o, i) => (
                        <div key={i} className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2 font-mono text-[10px]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[var(--text-muted)]">→ {o.cmd}</span>
                            <Badge tone={o.tone} className="text-[9px]">{o.ms}ms</Badge>
                          </div>
                          <pre className={cn(
                            'whitespace-pre-wrap text-[10px]',
                            o.tone === 'error' ? 'text-[var(--danger)]' : o.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]',
                          )}>{o.out}</pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 执行 trace */}
            {trace && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />最近执行 trace
                </div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono text-[10px]">
                  {trace.trace?.map((line: any, i: number) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[var(--text-muted)] shrink-0">{line.ts}</span>
                      <span className={cn(
                        line.level === 'info' ? 'text-[var(--info)]' :
                        line.level === 'debug' ? 'text-[var(--text-muted)]' :
                        'text-[var(--text-secondary)]',
                      )}>[{line.level}] {line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 版本历史 */}
            {versions.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />版本历史
                </div>
                <div className="space-y-1.5">
                  {versions.slice(0, 3).map((v: any) => (
                    <div key={v.version} className="rounded-md bg-[var(--bg)] border border-[var(--border)] p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs">v{v.version}</span>
                          <Badge tone={v.type === 'major' ? 'error' : v.type === 'minor' ? 'info' : 'neutral'} className="text-[9px]">{v.type}</Badge>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">{v.date}</span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-[10px] text-[var(--text-muted)]">
                        {v.notes?.map((n: string, i: number) => (
                          <div key={i} className={cn(n.startsWith('+') ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>{n}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 权限矩阵（可切换） */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />权限矩阵
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">点击切换</span>
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="text-left py-1">角色</th>
                    <th className="px-2">调用</th>
                    <th className="px-2">配置</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPerms.map((p: any) => (
                    <tr key={p.role} className="border-t border-[var(--border)]">
                      <td className="py-1 font-semibold">{p.role}</td>
                      <td className="px-2 text-center">
                        <button
                          onClick={() => setPermsState((s) => ({ ...s, [p.role]: { ...(s[p.role] ?? { canCall: p.canCall, canConfig: p.canConfig }), canCall: !(s[p.role]?.canCall ?? p.canCall) } }))}
                          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
                        >
                          {p.canCall ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" /> : <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                        </button>
                      </td>
                      <td className="px-2 text-center">
                        <button
                          onClick={() => setPermsState((s) => ({ ...s, [p.role]: { ...(s[p.role] ?? { canCall: p.canCall, canConfig: p.canConfig }), canConfig: !(s[p.role]?.canConfig ?? p.canConfig) } }))}
                          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
                        >
                          {p.canConfig ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" /> : <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1">
                <Settings className="h-3.5 w-3.5" />配置
              </Button>
              <Button size="sm" variant="danger" className="flex-1" onClick={() => setActiveModal('uninstall')}>卸载</Button>
            </div>
          </>
        ) : (
          <EmptyState icon={Wrench} title="选择一项技能查看详情" />
        )}

        {/* 依赖关系图（仅 sandbox tab 显示） */}
        {tab === 'sandbox' && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />依赖关系图
            </div>
            <div className="space-y-1.5 text-[11px]">
              {DEP_GRAPH.map((d) => (
                <div key={d.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={d.id.startsWith('a') ? 'brand' : 'info'} className="text-[10px] shrink-0">
                      {d.id.startsWith('a') ? 'Agent' : 'Skill'}
                    </Badge>
                    <span className="font-mono text-[11px] flex-1">{d.name}</span>
                  </div>
                  {d.deps.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-7">
                      {d.deps.map((depId) => {
                        const dep = DEP_GRAPH.find((x) => x.id === depId);
                        return (
                          <span key={depId} className="px-1.5 py-0.5 bg-[var(--bg-elevated)] rounded text-[10px] font-mono text-[var(--text-secondary)]">
                            ← {dep?.name ?? depId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </Drawer>

      {/* ===== Modals ===== */}
      <NewSkillModal open={activeModal === 'newSkill'} onClose={() => setActiveModal(null)} onSubmit={handleNewSkill} />
      <ImportSkillModal open={activeModal === 'importSkill'} onClose={() => setActiveModal(null)} onSubmit={handleImport} />

      <ConfirmDialog
        open={activeModal === 'uninstall'}
        onClose={() => setActiveModal(null)}
        onConfirm={handleUninstall}
        title={`卸载 ${active?.name ?? ''}？`}
        description="卸载后将停止所有调用，正在使用此技能的工作流将失败。"
        confirmText="确认卸载"
        tone="danger"
      />

      <ConfirmDialog
        open={batchConfirm === 'install'}
        onClose={() => setBatchConfirm(null)}
        onConfirm={handleBatchInstall}
        title={`批量安装 ${selected.size} 项`}
        description="将从商店批量安装选中的技能到默认沙箱环境。"
        confirmText="开始安装"
      />
      <ConfirmDialog
        open={batchConfirm === 'upgrade'}
        onClose={() => setBatchConfirm(null)}
        onConfirm={handleBatchUpgrade}
        title={`批量升级 ${selected.size} 项`}
        description="将对选中技能执行 minor 版本升级。生产环境请在维护窗口操作。"
        confirmText="开始升级"
      />
    </div>
  );
}

/* ===== 子组件 ===== */

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[9px] text-[var(--text-muted)] uppercase">{label}</div>
      <div className="text-[11px] font-mono font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: 'success' | 'error' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-center">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={cn('text-base font-mono font-bold', color)}>{value}</div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function NewSkillModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (f: { name: string; kind: string; description: string; riskLevel: string }) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'skill' | 'mcp' | 'tool'>('skill');
  const [description, setDescription] = useState('');
  const [riskLevel, setRisk] = useState<'low' | 'mid' | 'high'>('mid');
  const valid = name.trim().length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建技能"
      description="创建一个团队私有技能，将进入 gVisor 沙箱"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit({ name: name.trim(), kind, description: description.trim(), riskLevel }); setName(''); setDescription(''); }}>
            创建
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="技能名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：team-redis-tool" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="类型">
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
              <option value="skill">Skill（沙箱内）</option>
              <option value="mcp">MCP（外部协议）</option>
              <option value="tool">Tool（内部 API）</option>
            </select>
          </Field>
          <Field label="风险等级">
            <select value={riskLevel} onChange={(e) => setRisk(e.target.value as any)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
              <option value="low">低风险</option>
              <option value="mid">中风险</option>
              <option value="high">高风险</option>
            </select>
          </Field>
        </div>
        <Field label="描述">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="一句话说明技能用途"
            className="w-full h-20 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs resize-none"
          />
        </Field>
      </div>
    </Modal>
  );
}

function ImportSkillModal({
  open, onClose, onSubmit,
}: { open: boolean; onClose: () => void; onSubmit: (raw: string) => void }) {
  const [text, setText] = useState('');
  const valid = text.trim().length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="导入技能"
      description="粘贴 OpenAPI / MCP / Skill 描述 JSON，或每行一个技能名称"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={() => { onSubmit(text); setText(''); }}>
            导入
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`# JSON 格式示例：\n{"name": "my-tool", "kind": "skill", "description": "...", "version": "0.1.0"}\n\n# 或每行一个名称：\nteam-redis-tool\nteam-k8s-helper`}
          className="w-full h-48 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 font-mono text-[11px] resize-none"
        />
        <p className="text-[10px] text-[var(--text-muted)]">
          <FileCode2 className="inline h-3 w-3 mr-1" />
          支持 JSON 数组 / 对象 / 纯文本名称，每行解析为一条技能。
        </p>
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
