/**
 * P8 技能（企业级优化版）— 全交互增强
 * 1. 4 Tab（技能列表/技能商店/技能接入/运行治理）
 * 2. 批量安装/升级 + 单条安装/卸载
 * 3. 测试运行器（输入回显 + 沙箱标识）
 * 4. 版本历史 + 详情
 * 5. 权限矩阵（可切换）
 * 6. 依赖关系图（标签视图）
 * 7. 新建/导入技能 Modal
 */
import { useState, useMemo, useEffect } from 'react';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Tabs, Input } from '@de/web-ui';
import {
  Wrench, Download, ShieldAlert, ShieldCheck, Settings, Plus, Search,
  AlertTriangle, CheckCircle2, Box, Star, Globe, Activity, History,
  Play, RefreshCw, Network, Lock, Cpu, Container, Eye, Terminal,
  Sparkles, Layers, Upload, Trash2, FileCode2, GitBranch,
  Save, List, LayoutGrid, Power, ShieldX, ArrowUpCircle,
} from 'lucide-react';
import { cn } from '@de/web-utils';
import type { Skill, SkillAuditEvent, SkillImpactReport, SkillInstallPreflight, SkillPermission, SkillGovernancePolicy, SkillLifecycleStatus, SkillIntegration, SkillRuntimeHealth, SkillGovernanceIncident, SkillGovernanceEvent, WorkflowSkill } from '@de/web-types';
import { Link } from 'react-router-dom';
import { Modal, Drawer, ConfirmDialog, EmptyState, Sparkline } from '@/components/shared';
import { useAuthStore } from '@/stores/authStore';
import { useT } from '@/i18n';

const KIND_META: Record<string, { label: string; tone: 'info' | 'success' | 'warn'; icon: any; exec: string }> = {
  skill: { label: 'Skill', tone: 'info', icon: Wrench, exec: 'gVisor 沙箱' },
  mcp: { label: 'MCP', tone: 'success', icon: Globe, exec: 'HTTP/JSON 外部协议' },
  tool: { label: 'Tool', tone: 'warn', icon: Box, exec: 'REST/RPC 内部 API' },
};

const KIND_PROFILE: Record<Skill['kind'], { caption: string; primaryLabel: string; primaryValue: string; secondaryLabel: string; secondaryValue: string; rail: string; iconSurface: string }> = {
  skill: { caption: '可执行技能', primaryLabel: '运行隔离', primaryValue: 'gVisor 沙箱', secondaryLabel: '执行边界', secondaryValue: '命令允许清单', rail: 'border-l-[var(--info)]', iconSurface: 'bg-[var(--info-bg)] text-[var(--info)]' },
  mcp: { caption: '协议连接器', primaryLabel: '连接协议', primaryValue: 'MCP / HTTPS', secondaryLabel: '认证方式', secondaryValue: 'OAuth / Token', rail: 'border-l-[var(--success)]', iconSurface: 'bg-[var(--success-bg)] text-[var(--success)]' },
  tool: { caption: '受控接口工具', primaryLabel: '接口契约', primaryValue: 'OpenAPI / Schema', secondaryLabel: '动作权限', secondaryValue: '读写策略控制', rail: 'border-l-[var(--warning)]', iconSurface: 'bg-[var(--warning-bg)] text-[var(--warning)]' },
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
} & Pick<Skill, 'lifecycleStatus' | 'source' | 'owner' | 'team' | 'lastVerifiedAt' | 'hasUpdate' | 'upgradeVersion' | 'tags'>;

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

type ModalKind = 'importSkill' | 'configureMcp' | 'configureTool' | 'uninstall' | 'upgrade' | null;

export default function Skills() {
  const { t } = useT();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [tab, setTab] = useState<'workspace' | 'store' | 'atomic' | 'workflowSkills' | 'integration' | 'governance'>('workspace');
  const [typeFilters, setTypeFilters] = useState<Record<'workspace' | 'store' | 'integration' | 'governance', 'all' | Skill['kind']>>({ workspace: 'all', store: 'all', integration: 'all', governance: 'all' });
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | SkillLifecycleStatus>('all');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [storeSearchQ, setStoreSearchQ] = useState('');
  const [storeRiskFilter, setStoreRiskFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [certifiedOnly, setCertifiedOnly] = useState(false);
  const [storePreview, setStorePreview] = useState<{ skill: any; preflight: SkillInstallPreflight } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [storePage, setStorePage] = useState(1);
  const storePageSize = 8;
  const [upgradePlan, setUpgradePlan] = useState<any | null>(null);
  const [activeId, setActiveId] = useState<string | null>('s1');
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [batchConfirm, setBatchConfirm] = useState<'install' | 'upgrade' | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'access' | 'versions' | 'runtime'>('overview');
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<Record<string, { cacheable: boolean; timeout: string; retries: string }>>({});
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [bindAgentId, setBindAgentId] = useState('a1');
  const [bindWorkflowId, setBindWorkflowId] = useState('wf1');

  // 本地可写 state
  const [installed, setInstalled] = useState<any[]>(INITIAL_INSTALLED);
  const [searchQ, setSearchQ] = useState('');
  const { data: apiInstalled = [] } = useApiQuery<Skill[]>(['skills'], '/api/skills');
  const { data: apiCatalog = [] } = useApiQuery<Skill[]>(['skills', 'catalog'], '/api/skills/catalog');
  const { data: availableAgents = [] } = useApiQuery<Array<{ id: string; name: string; status: string }>>(['agents', 'skill-binding'], '/api/agents');
  const { data: availableWorkflows = [] } = useApiQuery<Array<{ id: string; name: string; version: string }>>(['workflows', 'skill-binding'], '/api/workflows');
  const { data: workflowSkills = [] } = useApiQuery<WorkflowSkill[]>(['workflow-skills'], '/api/workflow-skills');

  // 列表以 API 数据为准；页面仅保留性能展示的补充字段，避免业务事实分叉。
  useEffect(() => {
    if (!apiInstalled.length) return;
    setInstalled(apiInstalled.map((skill) => {
      const visual = INITIAL_INSTALLED.find((item) => item.id === skill.id || item.name === skill.name);
      return { calls: '0/日', perf: { calls24h: 0, errorRate: 0, p95Ms: 0 }, spark: Array(12).fill(0), ...visual, ...skill };
    }));
  }, [apiInstalled]);

  // 测试运行器输入与输出
  const [testCmd, setTestCmd] = useState('');
  const [testOutputs, setTestOutputs] = useState<Array<{ cmd: string; out: string; ms: number; tone: 'success' | 'error' | 'info' }>>([]);

  // 权限矩阵（state 化）
  const [permsState, setPermsState] = useState<Record<string, { canCall: boolean; canConfig: boolean }>>({});

  // 不同 tab 的数据源
  const tabList: SkillRow[] = useMemo(() => {
    if (tab === 'workspace') return installed;
    if (tab === 'atomic') return installed.filter((skill) => skill.kind === 'skill');
    if (tab === 'integration') return installed.filter((skill) => skill.kind === 'mcp' || skill.kind === 'tool');
    if (tab === 'store') return (apiCatalog.length ? apiCatalog : STORE_LIST).map((skill: any) => ({ calls: '—', perf: { calls24h: 0, errorRate: 0, p95Ms: 0 }, ...skill })) as SkillRow[];
    return installed;
  }, [tab, installed, apiCatalog]);
  const typeFilter = tab === 'workspace' || tab === 'store' || tab === 'integration' || tab === 'governance' ? typeFilters[tab] : 'all';

  const filtered = useMemo(() => {
    return tabList
      .filter((s) => typeFilter === 'all' || s.kind === typeFilter)
      .filter((s) => tab !== 'workspace' || lifecycleFilter === 'all' || s.lifecycleStatus === lifecycleFilter)
      .filter((s) => tab !== 'workspace' || !searchQ || s.name.toLowerCase().includes(searchQ.toLowerCase()) || s.description.toLowerCase().includes(searchQ.toLowerCase()))
      .filter((s: any) => tab !== 'store' || (!storeSearchQ || `${s.name} ${s.description} ${s.publisher ?? ''}`.toLowerCase().includes(storeSearchQ.toLowerCase())) && (storeRiskFilter === 'all' || s.riskLevel === storeRiskFilter) && (!certifiedOnly || s.signed === true));
  }, [tabList, typeFilter, lifecycleFilter, searchQ, tab, storeSearchQ, storeRiskFilter, certifiedOnly]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedSkills = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage]);
  const storeTotalPages = Math.max(1, Math.ceil(filtered.length / storePageSize));
  const pagedStoreSkills = useMemo(() => filtered.slice((storePage - 1) * storePageSize, storePage * storePageSize), [filtered, storePage]);

  useEffect(() => { setCurrentPage(1); }, [tab, typeFilter, lifecycleFilter, searchQ, storeSearchQ, storeRiskFilter, certifiedOnly]);
  useEffect(() => { if (tab === 'store') setStorePage(1); }, [tab, typeFilter, storeSearchQ, storeRiskFilter, certifiedOnly]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  useEffect(() => { if (storePage > storeTotalPages) setStorePage(storeTotalPages); }, [storePage, storeTotalPages]);

  const active = tabList.find((s) => s.id === activeId);
  const activeInstalled = Boolean(active && installed.some((skill) => skill.id === active.id || skill.name === active.name));
  const activeRuntimeSettings = active
    ? runtimeSettings[active.id] ?? { cacheable: active.cacheable, timeout: '30', retries: '1' }
    : null;
  const tabSummary = {
    workspace: '已纳管且可分配给智能体、工作流的技能与工具资产。',
    store: '从经过认证、预检和依赖校验的技能目录中获取新能力。',
    integration: '导入通用 Skill，或接入企业 MCP、Tool 并完成连通性校验。',
    governance: '查看运行证据、权限范围、沙箱策略、依赖关系与审计记录。',
  }[tab];

  const openSkillDetails = (id: string, options?: { test?: boolean }) => {
    setActiveId(id);
    setShowDetails(true);
    setDetailTab('overview');
    setShowRuntimeConfig(false);
    setTestRunnerOpen(!!options?.test);
  };

  const { data: trace } = useApiQuery<any>(['skill', activeId, 'trace'], activeId ? `/api/skills/${activeId}/trace` : '');
  const { data: versions = [] } = useApiQuery<any[]>(['skill', activeId, 'versions'], activeId ? `/api/skills/${activeId}/versions` : '');
  const { data: perms = [] } = useApiQuery<SkillPermission[]>(['skill', activeId, 'permissions'], activeId ? `/api/skills/${activeId}/permissions` : '');
  const { data: impact } = useApiQuery<SkillImpactReport>(['skill', activeId, 'impact'], activeId ? `/api/skills/${activeId}/impact` : '');
  const { data: governance } = useApiQuery<SkillGovernancePolicy>(['skill', activeId, 'governance'], activeId ? `/api/skills/${activeId}/governance` : '');
  const { data: skillAudit = [] } = useApiQuery<SkillAuditEvent[]>(['skill', 'audit'], '/api/skills/audit');
  const createSkillMutation = useApiMutation<Skill, { name: string; kind: Skill['kind']; description: string; riskLevel: Skill['riskLevel'] }>('/api/skills');
  const importSkillsMutation = useApiMutation<Skill[], { items: Array<Partial<Skill>> }>('/api/skills/import');
  const installSkillMutation = useApiMutation<Skill, any>(({ id }) => `/api/skills/${id}/install`);
  const uninstallSkillMutation = useApiMutation<any, { id: string }>(({ id }) => `/api/skills/${id}/uninstall`);
  const upgradeSkillMutation = useApiMutation<Skill, { id: string }>(({ id }) => `/api/skills/${id}/upgrade`);
  const upgradePlanMutation = useApiMutation<any, { id: string; targetVersion?: string }>(({ id }) => `/api/skills/${id}/upgrade-plan`);
  const lifecycleMutation = useApiMutation<Skill, { id: string; lifecycleStatus: SkillLifecycleStatus }>(({ id }) => `/api/skills/${id}/lifecycle`, undefined, 'PATCH');
  const governanceMutation = useApiMutation<SkillGovernancePolicy, Partial<SkillGovernancePolicy>>(() => `/api/skills/${activeId}/governance`, undefined, 'PATCH');
  const testSkillMutation = useApiMutation<any, { id: string; command: string }>(({ id }) => `/api/skills/${id}/test`);
  const runtimeMutation = useApiMutation<any, { id: string; cacheable: boolean; timeout: string; retries: string }>(({ id }) => `/api/skills/${id}/runtime`, undefined, 'PATCH');
  const permissionMutation = useApiMutation<any, { id: string; role: string; canCall: boolean; canConfig: boolean }>(({ id }) => `/api/skills/${id}/permissions`, undefined, 'PATCH');
  const configureMcpMutation = useApiMutation<Skill, { name: string; endpoint: string; authMode: string }>('/api/mcp-connections');
  const configureToolMutation = useApiMutation<Skill, { name: string; endpoint: string; schema: string }>('/api/tools');
  const preflightMutation = useApiMutation<SkillInstallPreflight, { id: string }>(({ id }) => `/api/skills/${id}/preflight`);
  const bindSkillMutation = useApiMutation<any, { agentId: string; skillId: string }>(({ agentId }) => `/api/agents/${agentId}/skills`);
  const bindWorkflowCapabilityMutation = useApiMutation<any, { workflowId: string; capabilityKind: 'skill' | 'mcp' | 'tool'; capabilityId: string; pinnedVersion: string }>(({ workflowId }) => `/api/workflows/${workflowId}/capabilities`);

  const openUpgradePlan = (skill: SkillRow) => {
    setActiveId(skill.id);
    upgradePlanMutation.mutate({ id: skill.id, targetVersion: skill.upgradeVersion }, { onSuccess: (plan) => { setUpgradePlan(plan); setActiveModal('upgrade'); }, onError: (error) => setOperationNotice(error instanceof Error ? error.message : '无法生成升级预检') });
  };

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
    preflightMutation.mutate({ id: storeItem.id }, { onSuccess: (preflight) => setStorePreview({ skill: storeItem, preflight }), onError: (error) => setOperationNotice(error instanceof Error ? error.message : '安装预检失败') });
  };

  const confirmStoreInstall = () => {
    if (!storePreview) return;
    const { skill, preflight } = storePreview;
    if (preflight.decision === 'blocked') { setOperationNotice(preflight.reason ?? '预检未通过，无法安装'); setStorePreview(null); return; }
    installSkillMutation.mutate({ ...skill, approvalTicket: preflight.requiresApproval ? 'APR-MOCK-20260719' : undefined }, { onSuccess: (installedSkill) => { setInstalled((prev) => [...prev, { ...installedSkill, calls: '0/日', perf: { calls24h: 0, errorRate: 0, p95Ms: 0 }, spark: Array(12).fill(0) }]); setOperationNotice(preflight.requiresApproval ? '已提交审批并完成 Mock 安装；生产环境需等待真实审批回调。' : '技能已安装到技能列表，可继续分配给智能体或工作流。'); setStorePreview(null); }, onError: (error) => setOperationNotice(error instanceof Error ? error.message : '安装失败') });
  };

  const handleUninstall = () => {
    if (!active) return;
    if (impact && !impact.uninstallAllowed) {
      setOperationNotice(`已阻止卸载「${active.name}」：${impact.reason}`);
      setActiveModal(null);
      return;
    }
    uninstallSkillMutation.mutate({ id: active.id }, { onSuccess: () => { setInstalled((prev) => prev.filter((s) => s.id !== active.id)); setActiveId(installed.find((item) => item.id !== active.id)?.id ?? null); setActiveModal(null); }, onError: (error) => { setOperationNotice(error instanceof Error ? error.message : '卸载失败，请查看影响分析'); setActiveModal(null); } });
  };

  const handleBatchInstall = () => {
    const toInstall = Array.from(selected).map((id) => STORE_LIST.find((s) => s.id === id)).filter(Boolean);
    toInstall.forEach(handleInstallFromStore);
    setSelected(new Set());
    setBatchConfirm(null);
  };

  const handleBatchUpgrade = () => {
    selected.forEach((id) => upgradeSkillMutation.mutate({ id }, { onSuccess: (updated) => setInstalled((prev) => prev.map((item) => item.id === updated.id ? { ...item, version: updated.version } : item)) }));
    setSelected(new Set());
    setBatchConfirm(null);
  };

  const handleNewSkill = (form: { name: string; kind: string; description: string; riskLevel: string }) => {
    createSkillMutation.mutate(form as any, { onSuccess: (skill) => { setInstalled((prev) => [...prev, { ...skill, calls: '0/日', perf: { calls24h: 0, errorRate: 0, p95Ms: 0 }, spark: Array(12).fill(0) }]); setActiveId(skill.id); setActiveModal(null); } });
  };

  const handleImport = (raw: string) => {
    let items: Array<Partial<Skill>> = [];
    try {
      const obj = JSON.parse(raw);
      items = (Array.isArray(obj) ? obj : [obj]).filter((item: any) => item.name);
    } catch {
      items = raw.split('\n').map((name) => name.trim()).filter(Boolean).map((name) => ({ name, kind: 'skill', description: `从粘贴内容导入 · ${name}`, riskLevel: 'mid', cacheable: false }));
    }
    importSkillsMutation.mutate({ items }, { onSuccess: (created) => { setInstalled((prev) => [...prev, ...created.map((skill) => ({ ...skill, calls: '0/日', perf: { calls24h: 0, errorRate: 0, p95Ms: 0 }, spark: Array(12).fill(0) }))]); setActiveModal(null); } });
  };

  const handleRunTest = () => {
    if (!active || !testCmd.trim()) return;
    testSkillMutation.mutate({ id: active.id, command: testCmd }, { onSuccess: (result) => setTestOutputs((prev) => [{ cmd: testCmd, out: String(result.output), ms: Number(result.durationMs), tone: (result.status === 'success' ? 'success' : 'error') as 'success' | 'error' }, ...prev].slice(0, 6)) });
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
              onClick={() => setTypeFilters((filters) => ({ ...filters, workspace: k }))}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs mb-1',
                typeFilters.workspace === k ? 'bg-[var(--brand-light)] text-[var(--brand)] font-semibold' : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
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

      <section className="skills-shell">
        <div className="skills-header-panel px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[var(--brand)]" />
                {t('module.skills.title')}
              </h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {t('module.skills.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {tab === 'workspace' && selected.size > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--brand-light)] text-[var(--brand)] text-xs">
                  <span>已选 {selected.size}</span>
                  <Button size="sm" variant="secondary" onClick={() => setBatchConfirm('upgrade')}>
                    <RefreshCw className="h-3 w-3" />批量升级
                  </Button>
                </div>
              )}
            </div>
          </div>
          {operationNotice && <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--warning)]/35 bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]"><span>{operationNotice}</span><button type="button" onClick={() => setOperationNotice(null)} className="text-[var(--brand)]">知道了</button></div>}
          <div className="mb-3 text-xs text-[var(--text-muted)]">{tabSummary}</div>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'workspace', label: <>{t('module.skills.tabs.installed')} <Badge tone="brand" className="ml-1">{installed.length}</Badge></> },
              { key: 'store', label: <>{t('module.skills.tabs.catalog')} <Badge tone="neutral" className="ml-1">{(apiCatalog.length || STORE_LIST.length)}</Badge></> },
              { key: 'atomic', label: <>{t('module.skills.tabs.atomic')} <Badge tone="info" className="ml-1">{installed.filter((s) => s.kind === 'skill').length}</Badge></> },
              { key: 'workflowSkills', label: <>{t('module.skills.tabs.workflowSkills')} <Badge tone="purple" className="ml-1">{workflowSkills.length}</Badge></> },
              ...(isAdmin ? [{ key: 'governance', label: <>{t('module.skills.tabs.governance')} <Badge tone="info" className="ml-1">{installed.length}</Badge></> }] : []),
            ]}
          />
        </div>

        <div className="skills-content-panel p-4 pb-8 sm:p-5 sm:pb-10">
          {tab === 'workflowSkills' ? (
            <section className="space-y-3">
              <div className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand-light)]/35 px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
                流程技能来自「工作流程 → 发布技能」。此处只读展示已发布产物；装配请进入数字员工「能力装配」。
                <div className="mt-2 flex gap-2">
                  <Link to="/workflows" className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">前往工作流程</Link>
                  <Link to="/agents" className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand)]">数字员工装配</Link>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
                <div className="border-b border-[var(--border)] px-4 py-3"><h3 className="text-sm font-semibold">流程技能目录</h3><p className="mt-1 text-[11px] text-[var(--text-muted)]">{workflowSkills.length} 项 · 均回链流程版本</p></div>
                <div className="divide-y divide-[var(--border)]">
                  {workflowSkills.length ? workflowSkills.map((skill) => (
                    <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0"><div className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-[var(--brand)]" /><span className="text-sm font-medium">{skill.name}</span></div><p className="mt-1 text-[11px] text-[var(--text-muted)]">{skill.description}</p><p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{skill.sourceWorkflowId} @ {skill.sourceVersionId}</p></div>
                      <div className="flex items-center gap-2"><Badge tone={skill.status === 'published' ? 'success' : 'neutral'}>{skill.status === 'published' ? '已发布' : skill.status}</Badge>{skill.approvalRequired && <Badge tone="warn">需审批</Badge>}{skill.rollbackSupported && <Badge tone="info">可回滚</Badge>}</div>
                    </div>
                  )) : <EmptyState icon={GitBranch} title="暂无流程技能" description="在工作流程完成编排校验后，通过「发布技能」写入此处。" />}
                </div>
              </div>
            </section>
          ) : tab === 'integration' ? <IntegrationWorkspace onImport={() => setActiveModal('importSkill')} onMcp={() => setActiveModal('configureMcp')} onTool={() => setActiveModal('configureTool')} /> : tab === 'governance' ? <GovernanceWorkspace onOpenSkill={(id) => openSkillDetails(id)} /> : <>
          <div className="skills-directory-toolbar mb-4">
            <span className="skills-directory-toolbar__title">{tab === 'store' ? '技能目录' : tab === 'atomic' ? '原子技能' : '启用清单'}</span>
            <span>{tab === 'store' ? '安装前将执行发布方、签名、依赖与风险预检' : tab === 'atomic' ? '工具 / MCP / 可执行脚本等原子能力' : '选择能力后可分配给数字员工或固定版本引用'}</span>
            <Badge tone="neutral" className="ml-auto">{filtered.length} 项</Badge>
          </div>
          {tab === 'store' && <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" /><Input value={storeSearchQ} onChange={(event) => setStoreSearchQ(event.target.value)} placeholder="搜索技能、系统或发布方" className="h-8 w-56 pl-7 text-xs" /></div><div className="flex rounded-md bg-[var(--bg-elevated)] p-1">{(['all', 'skill', 'mcp', 'tool'] as const).map((kind) => <button key={kind} onClick={() => setTypeFilters((filters) => ({ ...filters, store: kind }))} className={cn('rounded px-2.5 py-1 text-[11px]', typeFilter === kind ? 'bg-[var(--surface-1)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)]')}>{kind === 'all' ? '全部类型' : kind.toUpperCase()}</button>)}</div><select value={storeRiskFilter} onChange={(event) => setStoreRiskFilter(event.target.value as typeof storeRiskFilter)} className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-[11px]"><option value="all">全部风险</option><option value="low">低风险</option><option value="mid">中风险</option><option value="high">高风险</option></select><label className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" checked={certifiedOnly} onChange={(event) => setCertifiedOnly(event.target.checked)} className="accent-[var(--brand)]" />仅企业认证</label></div><p className="mt-2 text-[10px] text-[var(--text-muted)]">安装前将校验发布方、签名、依赖、权限与风险策略；不会自动绑定到智能体或工作流。</p></div>}
          {(tab === 'workspace' || tab === 'atomic') && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
              <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="搜索技能..." className="h-8 pl-7 w-52 text-xs" />
            </div>
            <div className="flex items-center gap-1 rounded-md bg-[var(--bg-elevated)] p-1">
              {(['all', 'skill', 'mcp', 'tool'] as const).map((kind) => <button key={kind} onClick={() => setTypeFilters((filters) => ({ ...filters, workspace: kind }))} className={cn('rounded px-2.5 py-1 text-[11px] transition-colors', typeFilter === kind ? 'bg-[var(--bg)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>{kind === 'all' ? '全部' : kind === 'skill' ? 'Skill' : kind === 'mcp' ? 'MCP' : 'Tool'}</button>)}
            </div>
            <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value as typeof lifecycleFilter)} className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-[11px] text-[var(--text-secondary)]"><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已暂停</option><option value="pending_approval">待审批</option><option value="quarantined">已隔离</option><option value="deprecated">已废弃</option></select>
            <div className="ml-auto flex overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"><button type="button" aria-label="列表视图" onClick={() => setViewMode('list')} className={cn('grid h-8 w-8 place-items-center', viewMode === 'list' ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-muted)]')}><List className="h-3.5 w-3.5" /></button><button type="button" aria-label="卡片视图" onClick={() => setViewMode('cards')} className={cn('grid h-8 w-8 place-items-center', viewMode === 'cards' ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-muted)]')}><LayoutGrid className="h-3.5 w-3.5" /></button></div>
          </div>}
          {(tab === 'workspace' || tab === 'atomic') && viewMode === 'list' ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
              <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[10px] font-medium text-[var(--text-muted)]"><tr><th className="px-4 py-3">技能资产</th><th className="px-3 py-3">状态 / 风险</th><th className="px-3 py-3">来源 / 责任</th><th className="px-3 py-3">版本</th><th className="px-3 py-3">引用</th><th className="px-3 py-3">最近验证</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
                <tbody>{pagedSkills.map((skill) => { const meta = KIND_META[skill.kind]; const referenced = ['s1', 's2', 's3'].includes(skill.id); const lifecycle = skill.lifecycleStatus ?? 'enabled'; return <tr key={skill.id} onClick={() => openSkillDetails(skill.id)} className="cursor-pointer border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-hover)]"><td className="px-4 py-3"><div className="flex items-center gap-2"><input aria-label={`选择 ${skill.name}`} type="checkbox" checked={selected.has(skill.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelect(skill.id)} className="accent-[var(--brand)]" /><span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--bg-elevated)] text-[var(--brand)]"><meta.icon className="h-4 w-4" /></span><span><span className="block font-semibold text-[var(--text)]">{skill.name}</span><span className="mt-0.5 block max-w-[220px] truncate text-[10px] text-[var(--text-muted)]">{skill.description}</span></span><Badge tone={meta.tone} className="text-[9px]">{meta.label}</Badge></div></td><td className="px-3 py-3"><Badge tone={lifecycle === 'enabled' ? 'success' : lifecycle === 'pending_approval' ? 'warn' : lifecycle === 'quarantined' ? 'error' : 'neutral'} className="text-[9px]">{lifecycle === 'enabled' ? '已启用' : lifecycle === 'disabled' ? '已暂停' : lifecycle === 'pending_approval' ? '待审批' : lifecycle === 'quarantined' ? '已隔离' : '已废弃'}</Badge><div className="mt-1"><Badge tone={skill.riskLevel === 'high' ? 'error' : skill.riskLevel === 'mid' ? 'warn' : 'success'} className="text-[9px]">{skill.riskLevel === 'high' ? '高风险' : skill.riskLevel === 'mid' ? '中风险' : '低风险'}</Badge></div></td><td className="px-3 py-3"><div>{skill.source === 'market' ? '技能商店' : skill.source === 'mcp' ? 'MCP 接入' : skill.source === 'tool' ? 'Tool 接入' : '导入'}</div><div className="mt-1 text-[10px] text-[var(--text-muted)]">{skill.team ?? '平台工程组'} · {skill.owner ?? '未分配'}</div></td><td className="px-3 py-3 font-mono">v{skill.version}{skill.hasUpdate && <span className="ml-1 rounded bg-[var(--warning-bg)] px-1.5 py-0.5 text-[9px] text-[var(--warning)]">可升级</span>}</td><td className="px-3 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); openSkillDetails(skill.id); }} className={cn('rounded px-1.5 py-1 text-[10px]', referenced ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]')}>{referenced ? '查看引用' : '未引用'}</button></td><td className="px-3 py-3 text-[var(--text-muted)]">{skill.lastVerifiedAt ?? '尚未验证'}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{isAdmin && <><Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); lifecycleMutation.mutate({ id: skill.id, lifecycleStatus: lifecycle === 'enabled' ? 'disabled' : 'enabled' }); }}>{lifecycle === 'enabled' ? <><Power className="h-3 w-3" />暂停</> : <><Play className="h-3 w-3" />启用</>}</Button>{skill.hasUpdate && <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); openUpgradePlan(skill); }}><ArrowUpCircle className="h-3 w-3" />升级</Button>}</>}</div></td></tr>; })}</tbody>
              </table>
              {filtered.length === 0 && <div className="p-8"><EmptyState icon={Wrench} title="没有匹配的技能资产" description="调整筛选条件或清除搜索后重试" /></div>}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={tab === 'store' ? Sparkles : Wrench}
              title={tab === 'store' ? '商店暂无更多技能' : '没有匹配的技能'}
              description={tab === 'store' ? '试试切换分类或等待新上架' : '尝试清除搜索或切换分类'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {(tab === 'workspace' || tab === 'atomic' ? pagedSkills : tab === 'store' ? pagedStoreSkills : filtered).map((s) => {
                const meta = KIND_META[s.kind];
                const profile = KIND_PROFILE[s.kind];
                const Icon = meta.icon;
                const isInInstalled = installed.some((i) => i.id === s.id || i.name === s.name);
                const market = s as any;
                return (
                  <div
                    key={s.id}
                    onClick={() => openSkillDetails(s.id)}
                    className={cn(
                      'skill-catalog-card tile-brandable relative flex min-h-[286px] flex-col gap-3 rounded-xl border border-l-[3px] border-[var(--border)] bg-[var(--surface-1)] p-5 text-left cursor-pointer', profile.rail,
                    )}
                  >
                    {tab === 'workspace' && (
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[var(--brand)] absolute top-3 right-3"
                      />
                    )}
                    <div className="skill-catalog-card__head flex items-start gap-2 pr-5">
                      <div className={cn('grid h-10 w-10 place-items-center rounded-xl shrink-0', profile.iconSurface)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-semibold truncate">{s.name}</span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate"><span>v{s.version}</span><span>·</span><span>{profile.caption}</span></div>
                      </div>
                    </div>

                    <div className="skill-catalog-card__description line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{s.description}</div>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--bg-elevated)] p-2.5 text-[10px]">
                      <div><span className="block text-[var(--text-muted)]">{profile.primaryLabel}</span><span className="mt-0.5 block font-medium text-[var(--text-secondary)]">{profile.primaryValue}</span></div>
                      <div className="border-l border-[var(--border)] pl-2"><span className="block text-[var(--text-muted)]">{profile.secondaryLabel}</span><span className="mt-0.5 block font-medium text-[var(--text-secondary)]">{profile.secondaryValue}</span></div>
                    </div>
                    <div className="skill-catalog-card__meta flex items-center gap-1.5 flex-wrap">
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

                    <div className="skill-catalog-card__metrics grid grid-cols-3 text-[10px]">
                      <Mini label="调用" value={s.calls ?? '—'} />
                      <Mini label="安装" value={s.installCount?.toLocaleString() ?? '—'} />
                      <Mini label="缓存" value={s.cacheable ? <span className="text-[var(--success)]">支持</span> : <span className="text-[var(--text-muted)]">无</span>} />
                    </div>

                    <div className="skill-catalog-card__governance grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
                      <span className="truncate">形态：<span className="text-[var(--text-secondary)]">{profile.caption}</span></span>
                      <span className="truncate text-right">治理：<span className="text-[var(--success)]">{tab === 'store' && market.signed ? '企业认证' : '已纳管'}</span></span>
                    </div>

                    {tab === 'store' && <div className="space-y-1 rounded-lg bg-[var(--bg-elevated)] px-2.5 py-2 text-[10px] text-[var(--text-muted)]"><div className="flex justify-between gap-2"><span>发布方</span><span className="truncate text-[var(--text-secondary)]">{market.publisher ?? '社区发布方'}</span></div><div className="flex justify-between gap-2"><span>签名 / 依赖</span><span className={market.signed ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{market.signed ? '已验证' : '待验证'} · {(market.dependencies ?? []).length ? `${market.dependencies.length} 项` : '无'}</span></div></div>}

                    {/* 商店 Tab 显示安装按钮 */}
                    {tab === 'store' && (
                      <Button
                        size="sm"
                        variant={isInInstalled ? 'secondary' : 'primary'}
                        className="w-full mt-3"
                        disabled={isInInstalled}
                        onClick={(e) => { e.stopPropagation(); handleInstallFromStore(s); }}
                      >
                        {isInInstalled ? <><CheckCircle2 className="h-3 w-3" />已安装</> : <><ShieldCheck className="h-3 w-3" />预检并安装</>}
                      </Button>
                    )}
                    {tab !== 'store' && (
                      <div className="skill-catalog-card__actions mt-auto grid grid-cols-2 gap-1.5">
                        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openSkillDetails(s.id, { test: true }); }}>
                          <Terminal className="h-3 w-3" />测试
                        </Button>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openSkillDetails(s.id); }}>
                          <Eye className="h-3 w-3" />详情
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'workspace' && filtered.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">共 {filtered.length} 项，每页 {pageSize} 项</span><div className="flex items-center gap-1"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>上一页</Button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), currentPage + 2).map((page) => <button key={page} type="button" onClick={() => setCurrentPage(page)} className={cn('grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs', page === currentPage ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>{page}</button>)}<Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>下一页</Button></div></div>}
          {tab === 'store' && filtered.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">共 {filtered.length} 项，每页 {storePageSize} 项</span><div className="flex items-center gap-1"><Button size="sm" variant="outline" disabled={storePage === 1} onClick={() => setStorePage((page) => Math.max(1, page - 1))}>上一页</Button>{Array.from({ length: storeTotalPages }, (_, index) => index + 1).slice(Math.max(0, storePage - 3), storePage + 2).map((page) => <button key={page} type="button" onClick={() => setStorePage(page)} className={cn('grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs', page === storePage ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>{page}</button>)}<Button size="sm" variant="outline" disabled={storePage === storeTotalPages} onClick={() => setStorePage((page) => Math.min(storeTotalPages, page + 1))}>下一页</Button></div></div>}
          </>}
        </div>
      </section>

      {/* 按需展开的技能详情 */}
      <Drawer
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title={active ? `${active.name} · 技能详情` : '技能详情'}
        description={activeInstalled ? '已纳管能力的使用范围、运行治理与变更追溯' : '评估制品的能力边界、兼容性、安全性与安装条件'}
        width={560}
      >
      <div className="skill-detail-drawer space-y-3">
        {active ? (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-3">
                <div className={cn('grid h-11 w-11 place-items-center rounded-xl shrink-0',
                  active.kind === 'skill' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                  active.kind === 'mcp' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                  'bg-[var(--warning-bg)] text-[var(--warning)]',
                )}>
                  {(() => { const Icon = KIND_META[active.kind].icon; return <Icon className="h-5 w-5" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold tracking-[-0.01em]">{active.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge tone={KIND_META[active.kind].tone}>{KIND_META[active.kind].label}</Badge>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">v{active.version}</span>
                    {activeInstalled && <Badge tone="success" className="text-[9px]">已纳管</Badge>}
                  </div>
                </div>
              </div>
            </div>

            {activeInstalled ? <>
            <div className="grid grid-cols-3 gap-2 text-xs"><Stat label="24h 调用" value={(active as any).perf?.calls24h ?? 0} /><Stat label="错误率" value={`${(active as any).perf?.errorRate ?? 0}%`} tone={(active as any).perf?.errorRate > 1 ? 'error' : 'success'} /><Stat label="P95" value={`${(active as any).perf?.p95Ms ?? 0}ms`} /></div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
              <Button size="sm" variant="secondary" className="h-8 flex-1" onClick={() => { setShowRuntimeConfig(true); setTestRunnerOpen(false); setDetailTab('overview'); }}><Settings className="h-3.5 w-3.5" />运行配置</Button>
              <Button size="sm" variant="danger" className="h-8 px-3" onClick={() => setActiveModal('uninstall')}><Trash2 className="h-3.5 w-3.5" />卸载</Button>
            </div>
            <div className="flex overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
              {([{ key: 'overview', label: '概览与策略' }, { key: 'access', label: '引用与权限' }, { key: 'versions', label: '版本与发布' }, { key: 'runtime', label: '运行与审计' }] as const).map((item) => <button key={item.key} type="button" onClick={() => setDetailTab(item.key)} className={cn('flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] transition-colors', detailTab === item.key ? 'bg-[var(--surface-1)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>{item.label}</button>)}
            </div>

            {detailTab === 'overview' && <><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2">
              <Button size="sm" variant="secondary" className="w-full h-8" onClick={() => { setTestRunnerOpen(true); setShowRuntimeConfig(false); setDetailTab('runtime'); }}>
                <Terminal className="h-3.5 w-3.5" />运行测试
              </Button>
            </div>

            {showRuntimeConfig && activeRuntimeSettings && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold">运行配置</div>
                  <Badge tone={active.riskLevel === 'high' ? 'error' : active.riskLevel === 'mid' ? 'warn' : 'success'} className="text-[9px]">{active.riskLevel === 'high' ? '高风险变更受控' : '沙箱策略生效'}</Badge>
                </div>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                    <span><span className="block font-medium">结果缓存</span><span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">相同请求命中隔离缓存</span></span>
                    <input type="checkbox" checked={activeRuntimeSettings.cacheable} onChange={(e) => setRuntimeSettings((settings) => ({ ...settings, [active.id]: { ...activeRuntimeSettings, cacheable: e.target.checked } }))} className="h-4 w-4 accent-[var(--brand)]" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">超时（秒）<Input value={activeRuntimeSettings.timeout} onChange={(e) => setRuntimeSettings((settings) => ({ ...settings, [active.id]: { ...activeRuntimeSettings, timeout: e.target.value } }))} className="mt-1 h-8 font-mono text-xs" inputMode="numeric" /></label>
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">失败重试<Input value={activeRuntimeSettings.retries} onChange={(e) => setRuntimeSettings((settings) => ({ ...settings, [active.id]: { ...activeRuntimeSettings, retries: e.target.value } }))} className="mt-1 h-8 font-mono text-xs" inputMode="numeric" /></label>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => active && activeRuntimeSettings && runtimeMutation.mutate({ id: active.id, ...activeRuntimeSettings }, { onSuccess: () => setShowRuntimeConfig(false) })}><Save className="h-3.5 w-3.5" />保存运行配置</Button>
                </div>
              </div>
            )}

            <div className="skill-sandbox-posture rounded-lg border border-[var(--success)]/30 bg-[var(--success-bg)] p-3 text-xs">
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

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
              <div className="mb-2 flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-3.5 w-3.5 text-[var(--brand)]" />生产安全策略</div>
              <div className="space-y-1.5 text-[10px] text-[var(--text-secondary)]"><div className="flex justify-between gap-3"><span>密钥引用</span><code className="truncate text-[var(--brand)]">{governance?.secretRef ?? '加载中'}</code></div><div className="flex justify-between"><span>网络出口</span><span>{governance?.allowedEgress.join('、') ?? '—'}</span></div><div className="flex justify-between"><span>写操作审批</span><Badge tone={governance?.writeApprovalRequired ? 'warn' : 'success'} className="text-[9px]">{governance?.writeApprovalRequired ? '必须审批' : '无需审批'}</Badge></div><div className="flex justify-between"><span>数据脱敏 / 熔断</span><span>{governance?.dataMaskingEnabled ? '已启用' : '未启用'} / {governance?.circuitBreakerEnabled ? '已启用' : '未启用'}</span></div></div>
              <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" className="flex-1" onClick={() => governance && governanceMutation.mutate({ writeApprovalRequired: !governance.writeApprovalRequired })}>{governance?.writeApprovalRequired ? '关闭写审批' : '开启写审批'}</Button><Button size="sm" variant="outline" className="flex-1" onClick={() => governance && governanceMutation.mutate({ dataMaskingEnabled: !governance.dataMaskingEnabled })}>{governance?.dataMaskingEnabled ? '关闭脱敏' : '开启脱敏'}</Button></div>
            </div>

            </>}

            {detailTab === 'access' && <>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
              <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 font-semibold"><Layers className="h-3.5 w-3.5 text-[var(--brand)]" />引用影响分析</span><Badge tone={impact?.uninstallAllowed ? 'success' : 'warn'}>{impact?.uninstallAllowed ? '可安全下线' : '受引用保护'}</Badge></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center"><span><b className="block font-mono text-sm">{impact?.agents.length ?? 0}</b><small className="text-[10px] text-[var(--text-muted)]">智能体</small></span><span><b className="block font-mono text-sm">{impact?.workflows.length ?? 0}</b><small className="text-[10px] text-[var(--text-muted)]">工作流</small></span><span><b className="block font-mono text-sm">{impact?.activeRuns ?? 0}</b><small className="text-[10px] text-[var(--text-muted)]">运行中</small></span></div>
              {!impact?.uninstallAllowed && <p className="mt-2 text-[10px] leading-relaxed text-[var(--warning)]">{impact?.reason}</p>}
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
              <div className="mb-2 flex items-center gap-1.5 font-semibold"><Wrench className="h-3.5 w-3.5 text-[var(--brand)]" />安装到智能体</div>
              <p className="mb-2 text-[10px] leading-relaxed text-[var(--text-muted)]">工作区安装只表示制品可用；分配到已启用智能体后，才可在该智能体的受控工作流中调用。</p>
              <div className="flex gap-2"><select value={bindAgentId} onChange={(event) => setBindAgentId(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs">{availableAgents.map((agent) => <option key={agent.id} value={agent.id} disabled={agent.status !== 'installed'}>{agent.name}{agent.status !== 'installed' ? '（未启用）' : ''}</option>)}</select><Button size="sm" onClick={() => bindSkillMutation.mutate({ agentId: bindAgentId, skillId: active.id }, { onSuccess: () => setOperationNotice(`技能「${active.name}」已分配到智能体`), onError: (error) => setOperationNotice(error instanceof Error ? error.message : '分配失败') })}>分配</Button></div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs">
              <div className="mb-2 flex items-center gap-1.5 font-semibold"><GitBranch className="h-3.5 w-3.5 text-[var(--brand)]" />引用到工作流</div>
              <p className="mb-2 text-[10px] leading-relaxed text-[var(--text-muted)]">将当前版本固定到工作流；画布中的 Skill 执行、MCP 工具或 Tool 节点只能选择已引用的能力。</p>
              <div className="flex gap-2"><select value={bindWorkflowId} onChange={(event) => setBindWorkflowId(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs">{availableWorkflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.version}</option>)}</select><Button size="sm" onClick={() => bindWorkflowCapabilityMutation.mutate({ workflowId: bindWorkflowId, capabilityKind: active.kind, capabilityId: active.id, pinnedVersion: active.version }, { onSuccess: () => setOperationNotice(`技能「${active.name}」已固定引用到工作流`), onError: (error) => setOperationNotice(error instanceof Error ? error.message : '引用失败') })}>引用</Button></div>
            </div>

            </>}

            {/* 性能监控（含 sparkline） */}
            {detailTab === 'runtime' && <>
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

            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><History className="h-3.5 w-3.5" />治理审计</div>
              <div className="space-y-1.5 text-[10px]">{skillAudit.filter((event) => event.target.includes(active.name)).slice(0, 3).map((event) => <div key={event.id} className="flex gap-2 rounded bg-[var(--bg)] px-2 py-1.5"><span className="font-mono text-[var(--text-muted)]">{event.time}</span><span className={event.result === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}>{event.action}</span></div>)}{!skillAudit.some((event) => event.target.includes(active.name)) && <span className="text-[var(--text-muted)]">暂无该技能的治理事件</span>}</div>
            </div>

            </>}

            {/* 版本历史 */}
            {detailTab === 'versions' && versions.length > 0 && (
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
            {detailTab === 'versions' && versions.length === 0 && <EmptyState icon={History} title="暂无版本记录" description="后续升级、回滚和发布记录会在此处沉淀。" />}

            {/* 权限矩阵（可切换） */}
            {detailTab === 'access' && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
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
                          onClick={() => active && permissionMutation.mutate({ id: active.id, role: p.role, canCall: !p.canCall, canConfig: p.canConfig }, { onSuccess: (saved) => setPermsState((s) => ({ ...s, [saved.role]: { canCall: saved.canCall, canConfig: saved.canConfig } })) })}
                          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
                        >
                          {p.canCall ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" /> : <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                        </button>
                      </td>
                      <td className="px-2 text-center">
                        <button
                          onClick={() => active && permissionMutation.mutate({ id: active.id, role: p.role, canCall: p.canCall, canConfig: !p.canConfig }, { onSuccess: (saved) => setPermsState((s) => ({ ...s, [saved.role]: { canCall: saved.canCall, canConfig: saved.canConfig } })) })}
                          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--bg-hover)]"
                        >
                          {p.canConfig ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" /> : <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}

            </> : <StoreSkillDetail skill={active} detailTab={detailTab} setDetailTab={setDetailTab} onInstall={() => handleInstallFromStore(active)} />}
          </>
        ) : (
          <EmptyState icon={Wrench} title="选择一项技能查看详情" />
        )}

        {/* 依赖关系图（运行与治理页显示） */}
        {tab === 'governance' && (
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
      <ImportSkillModal open={activeModal === 'importSkill'} onClose={() => setActiveModal(null)} onSubmit={handleImport} />
      <CapabilityConfigModal
        open={activeModal === 'configureMcp'}
        onClose={() => setActiveModal(null)}
        kind="MCP"
        onSubmit={(form) => configureMcpMutation.mutate(
          { name: form.name, endpoint: form.endpoint, authMode: form.authMode ?? 'OAuth' },
          { onSuccess: () => { setOperationNotice('MCP 已完成连接预检并进入工作区能力目录'); setActiveModal(null); } },
        )}
      />
      <CapabilityConfigModal
        open={activeModal === 'configureTool'}
        onClose={() => setActiveModal(null)}
        kind="Tool"
        onSubmit={(form) => configureToolMutation.mutate(
          { name: form.name, endpoint: form.endpoint, schema: form.schema ?? '{}' },
          { onSuccess: () => { setOperationNotice('Tool 已完成 Schema 校验并进入工作区能力目录'); setActiveModal(null); } },
        )}
      />
      <Modal open={!!storePreview} onClose={() => setStorePreview(null)} title={storePreview ? `安装预览 · ${storePreview.skill.name}` : '安装预览'} description="安装仅将能力纳管到技能列表，不会自动授予智能体或工作流执行权限。" size="lg" footer={<><Button variant="ghost" onClick={() => setStorePreview(null)}>取消</Button><Button disabled={storePreview?.preflight.decision === 'blocked'} onClick={confirmStoreInstall}>{storePreview?.preflight.requiresApproval ? '提交审批并安装' : '确认安装'}</Button></>}>
        {storePreview && <div className="space-y-3 text-xs"><div className="grid grid-cols-2 gap-2"><Stat label="发布方" value={(storePreview.skill as any).publisher ?? '社区发布方'} /><Stat label="签名" value={storePreview.preflight.signatureValid ? '已验证' : '未验证'} tone={storePreview.preflight.signatureValid ? 'success' : 'error'} /></div><div className="grid grid-cols-3 gap-2"><Stat label="许可证" value={(storePreview.skill as any).license ?? '待确认'} /><Stat label="漏洞" value={`${(storePreview.skill as any).vulnerabilityCount ?? '—'} 项`} tone={(storePreview.skill as any).vulnerabilityCount ? 'error' : 'success'} /><Stat label="最近扫描" value={(storePreview.skill as any).lastScannedAt ?? '—'} /></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="mb-2 font-semibold">依赖与风险预检</div><div className="space-y-1.5">{storePreview.preflight.dependencies.length ? storePreview.preflight.dependencies.map((dependency) => <div key={dependency.name} className="flex justify-between"><span>{dependency.name}</span><Badge tone={dependency.status === 'ready' ? 'success' : 'error'} className="text-[9px]">{dependency.status === 'ready' ? '已就绪' : '缺失'}</Badge></div>) : <span className="text-[var(--success)]">无额外依赖</span>}<div className="mt-2 border-t border-[var(--border)] pt-2">适用环境：{((storePreview.skill as any).supportedEnvironments ?? ['待验证']).join('、')}<span className="ml-3">风险等级：<Badge tone={storePreview.skill.riskLevel === 'high' ? 'error' : storePreview.skill.riskLevel === 'mid' ? 'warn' : 'success'} className="ml-1 text-[9px]">{storePreview.skill.riskLevel === 'high' ? '高风险' : storePreview.skill.riskLevel === 'mid' ? '中风险' : '低风险'}</Badge></span>{storePreview.preflight.requiresApproval && <span className="ml-2 text-[var(--warning)]">需要安全审批</span>}</div></div></div><div className="rounded-lg bg-[var(--info-bg)] px-3 py-2 text-[11px] text-[var(--info)]">SBOM、许可证和漏洞为 Mock 供应链扫描结果；生产环境需由制品仓库与安全平台提供可验证数据。</div></div>}
      </Modal>

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
        open={activeModal === 'upgrade'}
        onClose={() => setActiveModal(null)}
        onConfirm={() => { if (active) upgradeSkillMutation.mutate({ id: active.id }, { onSuccess: (skill) => { setInstalled((prev) => prev.map((item) => item.id === skill.id ? { ...item, ...skill } : item)); setOperationNotice(`已完成 ${skill.name} 的版本升级，可在审计中查看预检与引用影响。`); setActiveModal(null); } }); }}
        title={`升级 ${active?.name ?? ''}？`}
        description={`将从 v${upgradePlan?.currentVersion ?? active?.version ?? '—'} 升级至 v${upgradePlan?.targetVersion ?? active?.upgradeVersion ?? '下一版本'}。预检：${(upgradePlan?.checks ?? []).map((check: any) => `${check.label}${check.status === 'passed' ? '通过' : '需复核'}`).join('、') || '待生成'}；可回滚至 v${upgradePlan?.rollbackVersion ?? active?.version ?? '—'}。`}
        confirmText="确认升级"
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

function IntegrationWorkspace({ onImport, onMcp, onTool }: { onImport: () => void; onMcp: () => void; onTool: () => void }) {
  const [statusFilter, setStatusFilter] = useState<'all' | SkillIntegration['status']>('all');
  const [selected, setSelected] = useState<SkillIntegration | null>(null);
  const { data: integrations = [] } = useApiQuery<SkillIntegration[]>(['skill-integrations'], '/api/skill-integrations');
  const testMutation = useApiMutation<SkillIntegration, { id: string }>(({ id }) => `/api/skill-integrations/${id}/test`);
  const discoverMutation = useApiMutation<SkillIntegration, { id: string }>(({ id }) => `/api/skill-integrations/${id}/discover`);
  const visible = integrations.filter((item) => statusFilter === 'all' || item.status === statusFilter);
  const statusLabel: Record<SkillIntegration['status'], string> = { draft: '草稿', validating: '验证中', pending_approval: '待审批', enabled: '已启用', failed: '验证失败', quarantined: '已隔离', disabled: '已停用' };
  const statusTone = (status: SkillIntegration['status']) => status === 'enabled' ? 'success' : status === 'pending_approval' || status === 'validating' ? 'warn' : status === 'failed' || status === 'quarantined' ? 'error' : 'neutral';
  const typeIcon = (type: SkillIntegration['type']) => type === 'mcp' ? Globe : type === 'tool' ? Box : Wrench;
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ label: '已启用', value: integrations.filter((item) => item.status === 'enabled').length, tone: 'success' as const }, { label: '待验证', value: integrations.filter((item) => item.status === 'validating').length, tone: 'warn' as const }, { label: '待审批', value: integrations.filter((item) => item.status === 'pending_approval').length, tone: 'warn' as const }, { label: '异常连接', value: integrations.filter((item) => item.health === 'attention').length, tone: 'error' as const }].map((item) => <button key={item.label} type="button" onClick={() => setStatusFilter(item.label === '已启用' ? 'enabled' : item.label === '待验证' ? 'validating' : item.label === '待审批' ? 'pending_approval' : 'failed')} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-px hover:border-[var(--brand)]"><div className="text-xs text-[var(--text-muted)]">{item.label}</div><div className={cn('mt-1 font-mono text-2xl font-semibold', item.tone === 'success' ? 'text-[var(--success)]' : item.tone === 'warn' ? 'text-[var(--warning)]' : item.tone === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text)]')}>{item.value}</div></button>)}</div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold">新建接入</div><p className="mt-1 text-xs text-[var(--text-muted)]">先完成连接、发现、策略和验证，再将能力纳管到技能列表。</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onImport}><Upload className="h-3.5 w-3.5" />导入 Skill</Button><Button size="sm" variant="secondary" onClick={onMcp}><Globe className="h-3.5 w-3.5" />连接 MCP</Button><Button size="sm" onClick={onTool}><Box className="h-3.5 w-3.5" />注册 Tool</Button></div></div><div className="mt-3 flex items-center gap-2"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="all">全部状态</option><option value="draft">草稿</option><option value="validating">验证中</option><option value="pending_approval">待审批</option><option value="enabled">已启用</option><option value="failed">验证失败</option><option value="quarantined">已隔离</option></select><span className="text-[11px] text-[var(--text-muted)]">接入凭据均以密钥引用保存，生产环境写操作需满足审批策略。</span></div></div><div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)]"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-[var(--bg-elevated)] text-[10px] text-[var(--text-muted)]"><tr><th className="px-4 py-3">接入任务</th><th className="px-3 py-3">环境 / 状态</th><th className="px-3 py-3">发现能力</th><th className="px-3 py-3">凭据与网络</th><th className="px-3 py-3">最近验证</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{visible.map((item) => { const Icon = typeIcon(item.type); return <tr key={item.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]"><td className="px-4 py-3"><div className="flex items-center gap-2"><span className={cn('grid h-8 w-8 place-items-center rounded-lg', item.type === 'mcp' ? 'bg-[var(--success-bg)] text-[var(--success)]' : item.type === 'tool' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' : 'bg-[var(--info-bg)] text-[var(--info)]')}><Icon className="h-4 w-4" /></span><span><span className="block font-semibold">{item.name}</span><span className="mt-0.5 block max-w-[240px] truncate font-mono text-[10px] text-[var(--text-muted)]">{item.endpoint}</span></span></div></td><td className="px-3 py-3"><Badge tone={statusTone(item.status) as any} className="text-[9px]">{statusLabel[item.status]}</Badge><div className="mt-1 text-[10px] text-[var(--text-muted)]">{item.environment === 'production' ? '生产' : item.environment === 'test' ? '测试' : '开发'} · {item.owner}</div></td><td className="px-3 py-3"><span className="font-mono text-sm font-semibold">{item.discoveredCapabilities}</span><span className="ml-1 text-[10px] text-[var(--text-muted)]">项</span></td><td className="px-3 py-3"><div className="max-w-[180px] truncate font-mono text-[10px] text-[var(--brand)]">{item.credentialRef}</div><div className="mt-1 max-w-[180px] truncate text-[10px] text-[var(--text-muted)]">{item.allowedEgress.join('、')}</div></td><td className="px-3 py-3"><span>{item.lastVerifiedAt}</span>{item.lastError && <div className="mt-1 max-w-[180px] truncate text-[10px] text-[var(--danger)]">{item.lastError}</div>}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => testMutation.mutate({ id: item.id })}>验证</Button><Button size="sm" variant="secondary" disabled={item.status === 'failed'} onClick={() => discoverMutation.mutate({ id: item.id })}>发现</Button><Button size="sm" variant="outline" onClick={() => setSelected(item)}>详情</Button></div></td></tr>; })}</tbody></table>{visible.length === 0 && <div className="p-8"><EmptyState icon={Network} title="没有匹配的接入任务" description="调整状态筛选或新建接入。" /></div>}</div><Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.name} · 接入详情` : '接入详情'} description="连接、发现、安全策略、验证日志与上线状态。" size="lg" footer={<><Button variant="ghost" onClick={() => setSelected(null)}>关闭</Button>{selected && <Button variant="secondary" onClick={() => testMutation.mutate({ id: selected.id })}><RefreshCw className="h-3.5 w-3.5" />重新验证</Button>}{selected && <Button onClick={() => discoverMutation.mutate({ id: selected.id })}><Sparkles className="h-3.5 w-3.5" />重新发现</Button>}</>}>
    {selected && <div className="space-y-3 text-xs"><div className="grid grid-cols-2 gap-2"><Stat label="发现能力" value={`${selected.discoveredCapabilities} 项`} /><Stat label="健康状态" value={selected.health === 'healthy' ? '正常' : selected.health === 'attention' ? '异常' : '待验证'} tone={selected.health === 'healthy' ? 'success' : selected.health === 'attention' ? 'error' : undefined} /></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="mb-2 font-semibold">连接与凭据</div><div className="space-y-1.5"><div className="flex justify-between gap-3"><span>服务地址</span><code className="max-w-[280px] truncate text-[var(--brand)]">{selected.endpoint}</code></div><div className="flex justify-between gap-3"><span>凭据引用</span><code className="max-w-[280px] truncate text-[var(--brand)]">{selected.credentialRef}</code></div><div className="flex justify-between gap-3"><span>网络出口</span><span>{selected.allowedEgress.join('、')}</span></div></div></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="mb-2 font-semibold">安全与上线策略</div><div className="flex items-center justify-between"><span>生产写操作审批</span><Badge tone={selected.writeApprovalRequired ? 'warn' : 'success'}>{selected.writeApprovalRequired ? '必须审批' : '无需审批'}</Badge></div><p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">P2 策略：私网连接、mTLS、凭据轮换、熔断与健康检查在生产环境需由后端控制面实际执行；当前用于展示 Mock 策略状态。</p></div></div>}
  </Modal></div>;
}

function GovernanceWorkspace({ onOpenSkill }: { onOpenSkill: (id: string) => void }) {
  const [healthFilter, setHealthFilter] = useState<'all' | SkillRuntimeHealth['status']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [incident, setIncident] = useState<SkillGovernanceIncident | null>(null);
  const { data: overview } = useApiQuery<{ calls24h: number; successRate: number; p95Ms: number; abnormalSkills: number; pendingActions: number }>(['skills', 'governance', 'overview'], '/api/skills/governance/overview');
  const { data: health = [] } = useApiQuery<SkillRuntimeHealth[]>(['skills', 'governance', 'health'], '/api/skills/governance/health');
  const { data: incidents = [] } = useApiQuery<SkillGovernanceIncident[]>(['skills', 'governance', 'incidents'], '/api/skills/governance/incidents');
  const { data: events = [] } = useApiQuery<SkillGovernanceEvent[]>(['skills', 'governance', 'events'], '/api/skills/governance/events');
  const { data: trends = [] } = useApiQuery<Array<{ time: string; calls: number; errorRate: number; p95: number }>>(['skills', 'governance', 'trends'], '/api/skills/governance/trends');
  const revalidate = useApiMutation<SkillRuntimeHealth, { id: string }>(({ id }) => `/api/skills/${id}/revalidate`);
  const isolate = useApiMutation<SkillRuntimeHealth, { id: string }>(({ id }) => `/api/skills/${id}/isolate`);
  const batch = useApiMutation<SkillRuntimeHealth[], { skillIds: string[]; action: 'revalidate' | 'pause' }>('/api/skills/governance/batch');
  const visible = health.filter((item) => healthFilter === 'all' || item.status === healthFilter);
  const healthLabel: Record<SkillRuntimeHealth['status'], string> = { healthy: '健康', attention: '关注', incident: '异常', paused: '已暂停', quarantined: '已隔离' };
  const healthTone = (status: SkillRuntimeHealth['status']) => status === 'healthy' ? 'success' : status === 'attention' ? 'warn' : status === 'incident' || status === 'quarantined' ? 'error' : 'neutral';
  const maxCalls = Math.max(...trends.map((item) => item.calls), 1);
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[{ label: '24h 调用', value: overview?.calls24h?.toLocaleString() ?? '—', tone: 'brand' }, { label: '成功率', value: overview ? `${overview.successRate}%` : '—', tone: 'success' }, { label: '全局 P95', value: overview ? `${overview.p95Ms}ms` : '—', tone: 'info' }, { label: '异常能力', value: overview?.abnormalSkills ?? '—', tone: 'error' }, { label: '待处置', value: overview?.pendingActions ?? '—', tone: 'warn' }].map((item) => <button key={item.label} type="button" onClick={() => { if (item.label === '异常能力') setHealthFilter('incident'); }} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-px hover:border-[var(--brand)]"><div className="text-xs text-[var(--text-muted)]">{item.label}</div><div className={cn('mt-1 font-mono text-xl font-semibold', item.tone === 'success' ? 'text-[var(--success)]' : item.tone === 'error' ? 'text-[var(--danger)]' : item.tone === 'warn' ? 'text-[var(--warning)]' : item.tone === 'brand' ? 'text-[var(--brand)]' : 'text-[var(--text)]')}>{item.value}</div></button>)}</div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold">调用与延迟趋势</div><p className="mt-1 text-xs text-[var(--text-muted)]">24 小时聚合 · 错误率或 P95 异常会进入处置队列</p></div><Badge tone="neutral">24h</Badge></div><div className="mt-5 flex h-32 items-end gap-2">{trends.map((item) => <div key={item.time} className="group flex flex-1 flex-col items-center gap-1"><div className="relative flex w-full flex-1 items-end rounded-t bg-[var(--brand-light)]"><div style={{ height: `${Math.max(8, item.calls / maxCalls * 100)}%` }} className="w-full rounded-t bg-[var(--brand)] transition-all group-hover:bg-[var(--brand-hover)]" title={`${item.time} · ${item.calls} 调用 · P95 ${item.p95}ms`} /></div><span className="text-[9px] text-[var(--text-muted)]">{item.time}</span></div>)}</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex items-center justify-between"><div className="text-sm font-semibold">异常与待处置</div><Badge tone="error">{incidents.filter((item) => item.status === 'open').length}</Badge></div><div className="mt-3 space-y-2">{incidents.filter((item) => item.status !== 'resolved').slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => setIncident(item)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-left hover:border-[var(--brand)]"><div className="flex items-center gap-1.5"><Badge tone={item.severity === 'P0' ? 'error' : item.severity === 'P1' ? 'warn' : 'info'} className="text-[9px]">{item.severity}</Badge><span className="min-w-0 flex-1 truncate text-xs font-medium">{item.skillName}</span><span className="text-[10px] text-[var(--text-muted)]">{item.createdAt}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{item.title}</p></button>)}</div></div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex flex-wrap items-center gap-2"><div><div className="text-sm font-semibold">能力健康列表</div><p className="mt-1 text-xs text-[var(--text-muted)]">查看健康、引用、风险与负责人，并执行紧急处置。</p></div><select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as typeof healthFilter)} className="ml-auto h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="all">全部健康状态</option><option value="healthy">健康</option><option value="attention">关注</option><option value="incident">异常</option><option value="paused">已暂停</option><option value="quarantined">已隔离</option></select>{selected.size > 0 && <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => batch.mutate({ skillIds: Array.from(selected), action: 'revalidate' }, { onSuccess: () => setSelected(new Set()) })}>批量验证</Button><Button size="sm" variant="outline" onClick={() => batch.mutate({ skillIds: Array.from(selected), action: 'pause' }, { onSuccess: () => setSelected(new Set()) })}>批量暂停</Button></div>}</div><div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full min-w-[940px] text-left text-xs"><thead className="bg-[var(--bg-elevated)] text-[10px] text-[var(--text-muted)]"><tr><th className="px-3 py-2.5">能力</th><th className="px-3 py-2.5">健康 / 风险</th><th className="px-3 py-2.5">调用 / 成功率</th><th className="px-3 py-2.5">P95</th><th className="px-3 py-2.5">引用 / 负责人</th><th className="px-3 py-2.5">更新时间</th><th className="px-3 py-2.5 text-right">操作</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-hover)]"><td className="px-3 py-2.5"><label className="flex items-center gap-2"><input type="checkbox" checked={selected.has(item.skillId)} onChange={() => toggle(item.skillId)} className="accent-[var(--brand)]" /><span><span className="font-medium">{item.name}</span><span className="ml-1.5 font-mono text-[10px] text-[var(--text-muted)]">{item.kind.toUpperCase()}</span></span></label></td><td className="px-3 py-2.5"><Badge tone={healthTone(item.status) as any} className="text-[9px]">{healthLabel[item.status]}</Badge><Badge tone={item.riskLevel === 'high' ? 'error' : item.riskLevel === 'mid' ? 'warn' : 'success'} className="ml-1 text-[9px]">{item.riskLevel === 'high' ? '高' : item.riskLevel === 'mid' ? '中' : '低'}</Badge></td><td className="px-3 py-2.5"><span className="font-mono">{item.calls24h.toLocaleString()}</span><span className="ml-1 text-[var(--text-muted)]">/ {item.successRate}%</span></td><td className={cn('px-3 py-2.5 font-mono', item.p95Ms > 500 ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]')}>{item.p95Ms}ms</td><td className="px-3 py-2.5">{item.references} 个引用 · {item.owner}</td><td className="px-3 py-2.5 text-[var(--text-muted)]">{item.updatedAt}</td><td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => onOpenSkill(item.skillId)}>运行</Button><Button size="sm" variant="secondary" onClick={() => revalidate.mutate({ id: item.skillId })}>验证</Button>{item.status !== 'quarantined' && <Button size="sm" variant="outline" onClick={() => isolate.mutate({ id: item.skillId })}>隔离</Button>}</div></td></tr>)}</tbody></table></div></div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="text-sm font-semibold">治理事件流</div><div className="mt-3 space-y-1.5">{events.slice(0, 6).map((event) => <div key={event.id} className="flex items-center gap-3 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-xs"><span className="font-mono text-[var(--text-muted)]">{event.time}</span><Badge tone={event.result === 'success' ? 'success' : event.result === 'blocked' ? 'warn' : 'error'} className="text-[9px]">{event.result === 'success' ? '完成' : event.result === 'blocked' ? '阻断' : '失败'}</Badge><span className="font-medium">{event.skillName}</span><span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{event.action}</span>{event.requestId && <span className="font-mono text-[10px] text-[var(--text-muted)]">{event.requestId}</span>}</div>)}</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--brand)]" />策略命中</div><div className="mt-3 space-y-2 text-xs"><div className="flex justify-between"><span>写操作审批阻断</span><Badge tone="warn">1</Badge></div><div className="flex justify-between"><span>错误率阈值告警</span><Badge tone="error">1</Badge></div><div className="flex justify-between"><span>凭据到期提醒</span><Badge tone="info">1</Badge></div></div><p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">P2 策略中心可进一步配置阈值、持续时间、通知对象与自动隔离动作；当前显示 Mock 策略命中结果。</p></div></div><Modal open={!!incident} onClose={() => setIncident(null)} title={incident ? `${incident.severity} · ${incident.title}` : '异常详情'} description="影响范围、请求证据、关联能力与推荐处置。" size="md" footer={<><Button variant="ghost" onClick={() => setIncident(null)}>关闭</Button>{incident && <Button variant="secondary" onClick={() => revalidate.mutate({ id: incident.skillId })}>重新验证</Button>}{incident && <Button variant="danger" onClick={() => isolate.mutate({ id: incident.skillId })}>隔离能力</Button>}</>}>{incident && <div className="space-y-3 text-xs"><div className="rounded-lg bg-[var(--bg-elevated)] p-3"><div className="font-semibold">{incident.skillName}</div><p className="mt-1 leading-relaxed text-[var(--text-secondary)]">{incident.detail}</p></div><div className="grid grid-cols-2 gap-2"><Stat label="关联请求" value={incident.requestId} /><Stat label="事件时间" value={incident.createdAt} /></div><div className="rounded-lg bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[var(--warning)]">推荐先验证连接和运行时策略；若影响持续扩大，可隔离能力以阻断新的调用。</div></div>}</Modal></div>;
}

function StoreSkillDetail({ skill, detailTab, setDetailTab, onInstall }: { skill: SkillRow; detailTab: 'overview' | 'access' | 'versions' | 'runtime'; setDetailTab: (tab: 'overview' | 'access' | 'versions' | 'runtime') => void; onInstall: () => void }) {
  const market = skill as any;
  const profile = KIND_PROFILE[skill.kind];
  const tabs = [{ key: 'overview' as const, label: '能力概览' }, { key: 'access' as const, label: '兼容与依赖' }, { key: 'versions' as const, label: '安全与合规' }, { key: 'runtime' as const, label: '安装记录' }];
  return <div className="space-y-3"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs text-[var(--text-secondary)]">该能力尚未纳管到当前工作区。完成预检与安装后，才能分配给智能体或引用到工作流。</div><div className="flex overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1">{tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setDetailTab(tab.key)} className={cn('flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px]', detailTab === tab.key ? 'bg-[var(--surface-1)] font-semibold text-[var(--brand)] shadow-sm' : 'text-[var(--text-muted)]')}>{tab.label}</button>)}</div>{detailTab === 'overview' && <><div className="grid grid-cols-2 gap-2"><Stat label="能力形态" value={profile.caption} /><Stat label="发布方" value={market.publisher ?? '社区发布方'} /></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"><div className="font-semibold">适用场景</div><p className="mt-1.5 leading-relaxed text-[var(--text-secondary)]">{skill.description}</p><div className="mt-3 flex flex-wrap gap-1.5"><Badge tone={KIND_META[skill.kind].tone}>{KIND_META[skill.kind].label}</Badge><Badge tone={skill.riskLevel === 'high' ? 'error' : skill.riskLevel === 'mid' ? 'warn' : 'success'}>{skill.riskLevel === 'high' ? '高风险' : skill.riskLevel === 'mid' ? '中风险' : '低风险'}</Badge><Badge tone="neutral">v{skill.version}</Badge></div></div></>}{detailTab === 'access' && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"><div className="mb-2 font-semibold">兼容性与依赖</div><div className="space-y-2"><div className="flex justify-between"><span>适用环境</span><span>{(market.supportedEnvironments ?? ['待验证']).join('、')}</span></div><div className="flex justify-between"><span>运行形态</span><span>{profile.primaryValue}</span></div><div className="border-t border-[var(--border)] pt-2"><span className="text-[var(--text-muted)]">依赖项</span>{(market.dependencies ?? []).length ? market.dependencies.map((dependency: string) => <div key={dependency} className="mt-1 flex justify-between"><span>{dependency}</span><Badge tone="success" className="text-[9px]">安装时校验</Badge></div>) : <div className="mt-1 text-[var(--success)]">无额外依赖</div>}</div></div></div>}{detailTab === 'versions' && <div className="space-y-2"><div className="grid grid-cols-3 gap-2"><Stat label="签名" value={market.signed ? '已验证' : '未验证'} tone={market.signed ? 'success' : 'error'} /><Stat label="许可证" value={market.license ?? '待确认'} /><Stat label="漏洞" value={`${market.vulnerabilityCount ?? '—'} 项`} tone={market.vulnerabilityCount ? 'error' : 'success'} /></div><div className="rounded-lg bg-[var(--info-bg)] px-3 py-2 text-[11px] text-[var(--info)]">供应链信息将在安装预检时再次校验；生产环境需以制品仓库和安全平台的签名、SBOM 与扫描结果为准。</div></div>}{detailTab === 'runtime' && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs"><div className="font-semibold">安装与使用记录</div><p className="mt-1.5 leading-relaxed text-[var(--text-muted)]">尚未安装到当前工作区，因此暂无智能体引用、工作流引用、运行记录和治理审计。</p></div>}<Button className="w-full" onClick={onInstall}><ShieldCheck className="h-3.5 w-3.5" />预检并安装</Button></div>;
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

function CapabilityConfigModal({ open, onClose, kind, onSubmit }: { open: boolean; onClose: () => void; kind: 'MCP' | 'Tool'; onSubmit: (form: { name: string; endpoint: string; authMode?: string; schema?: string }) => void }) {
  const [name, setName] = useState(''); const [endpoint, setEndpoint] = useState(''); const [detail, setDetail] = useState(kind === 'MCP' ? 'OAuth' : ''); const [schemaError, setSchemaError] = useState<string | null>(null); const [fileName, setFileName] = useState<string | null>(null);
  const validateToolSchema = (raw: string) => { try { const parsed = JSON.parse(raw); const isOpenApi = typeof parsed?.openapi === 'string' && typeof parsed?.info === 'object' && typeof parsed?.paths === 'object'; const isJsonSchema = typeof parsed?.$schema === 'string' && (typeof parsed?.type === 'string' || typeof parsed?.properties === 'object'); if (!isOpenApi && !isJsonSchema) return '仅支持标准 OpenAPI 3.x 或 JSON Schema Draft 文档'; return null; } catch { return '文件不是有效的 JSON'; } };
  const handleSchemaChange = (value: string, source?: string) => { setDetail(value); setFileName(source ?? null); setSchemaError(value.trim() ? validateToolSchema(value) : '请上传或粘贴 Schema'); };
  const handleFile = async (file?: File) => { if (!file) return; if (file.size > 2 * 1024 * 1024) { setSchemaError('JSON 文件不能超过 2 MB'); return; } if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') { setSchemaError('请上传 .json 格式文件'); return; } try { handleSchemaChange(await file.text(), file.name); } catch { setSchemaError('无法读取上传文件'); } };
  const valid = Boolean(name.trim() && endpoint.trim() && (kind === 'MCP' || (!schemaError && detail.trim())));
  return <Modal open={open} onClose={onClose} title={`配置 ${kind}`} description={kind === 'MCP' ? '保存后执行连接、认证和工具发现预检。' : '上传或粘贴标准契约文件，完成本地与服务端双重校验后接入。'} size="md" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button disabled={!valid} onClick={() => onSubmit(kind === 'MCP' ? { name: name.trim(), endpoint: endpoint.trim(), authMode: detail } : { name: name.trim(), endpoint: endpoint.trim(), schema: detail })}>预检并接入</Button></>}><div className="space-y-3"><Field label="名称" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'MCP' ? '例如：企业 GitLab MCP' : '例如：变更工单 API'} /></Field><Field label={kind === 'MCP' ? '服务地址' : 'API 地址'} required><Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://service.example.com" /></Field>{kind === 'MCP' ? <Field label="认证方式"><Input value={detail} onChange={(event) => setDetail(event.target.value)} /></Field> : <Field label="OpenAPI / JSON Schema" required><div className="space-y-2"><label className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs transition-colors hover:border-[var(--brand)]"><span className="flex items-center gap-2"><Upload className="h-3.5 w-3.5 text-[var(--brand)]" />{fileName ? fileName : '上传标准 JSON 文件'}</span><span className="text-[10px] text-[var(--text-muted)]">.json · 最大 2 MB</span><input type="file" accept=".json,application/json" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} /></label><textarea value={detail} onChange={(event) => handleSchemaChange(event.target.value)} placeholder={'粘贴 OpenAPI 3.x 或 JSON Schema，例如：\n{"openapi":"3.0.3","info":{"title":"Tool"},"paths":{}}'} className="h-28 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[11px] outline-none focus:border-[var(--brand)]" />{schemaError ? <p className="text-[10px] text-[var(--danger)]">{schemaError}</p> : detail && <p className="text-[10px] text-[var(--success)]"><CheckCircle2 className="mr-1 inline h-3 w-3" />契约格式校验通过</p>}</div></Field>}</div></Modal>;
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
