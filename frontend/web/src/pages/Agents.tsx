/**
 * P5 智能体控制台 — 企业级数字员工平台
 *
 * 3 大模块（智能体 / 评测 / 监控）+ 左侧筛选 + 右侧可折叠详情
 *
 * 智能体模块：5 卡 KPI + Agent 卡片网格（能力栈/版本/认证/SLA/实时流量） + 详情 5 tab
 * 评测模块：A/B 测试 + 多模型对比 + 准确率/召回率/用户评分
 * 监控模块：实时流量 / 错误率 / 延迟 / Token / 满意度 + 异常告警
 *
 * 编排能力在 P6 工作流页面提供，本页不重复。
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useApiMutation, useApiQuery } from '@/services/query';
import { Badge, Button, Modal, Avatar, Input, KpiCard, KpiMini, Row, FilterGroup, FilterRadio, ChipBtn, Section, FormField, CollapsedPanelHandle } from '@de/web-ui';
import {
  Bot, Star, Download, Settings, Plus, X, Zap, ShieldCheck, Sparkles, GitCompare,
  TrendingUp, History, Award, Tag as TagIcon, CheckCircle2, Filter, Search, ChevronRight,
  ChevronLeft, Activity, Wrench, Database, Lock, Cpu, BarChart3, MessageSquare, FileCheck,
  ChevronDown, AlertTriangle, FileText, RefreshCw, Play, Pause, Network, Copy,
  ArrowRight, Send, Beaker, Gauge, AlertOctagon, Clock, Hash, Eye, Pencil,
  Server, Boxes, FlaskConical, Monitor, LineChart as LineIcon, Brain,
  Users, Archive, RotateCcw,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, Line, LineChart, PieChart, Pie, Cell, Legend } from 'recharts';
import { cn } from '@de/web-utils';
import type { Agent, CapabilityBinding, KnowledgePackage, Skill } from '@de/web-types';
import { Modal as ModalX, Drawer, EmptyState } from '@/components/shared';

/* ============ 类型 ============ */

interface AgentVersion {
  version: string; date: string; changelog: string[]; type: 'major' | 'minor' | 'patch'; author: string; status: 'current' | 'stable' | 'beta' | 'deprecated';
}

interface AgentFull extends Agent {
  longDescription?: string;
  capabilities?: { tools: number; mcps: number; knowledgeBases: number; skills: number; sandboxes: number };
  sla?: { availability: number; responseP95Ms: number; responseP99Ms: number; monthlyQuota: number };
  certifications?: string[];
  collaborators?: string[];
  contractEnd?: string;
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
  permissions?: { canEdit: boolean; canApprove: boolean; canInvoke: boolean; canExport: boolean };
  installDate?: string;
  weeklyCalls?: number[];
  todayCalls?: number;
  errorRate24h?: number;
  approvalCount?: number;
  /** 内部带 - extra fields shown only in detail */
  promptTemplate?: string;
  promptVars?: { name: string; type: 'string' | 'number' | 'enum'; required: boolean; default?: string; options?: string[]; desc: string }[];
  toolConfig?: { key: string; name: string; enabled: boolean; permission: 'auto' | 'approval' | 'denied'; sandbox: 'gvisor' | 'docker' | 'native'; calls24h: number }[];
  knowledgeBindings?: { name: string; docCount: number; rerankModel: string; refreshCron: string }[];
}

/* ============ 数据层：评测 / 实时调用 / 异常 / 趋势 ============ */

interface EvalRow {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  version: string;
  totalCases: number;
  accuracy: number;
  recall: number;
  p95Ms: number;
  tokensPerCall: number;
  rating: number;
  calls: number;
  status: 'champion' | 'baseline' | 'control';
  passedAt: string;
  dataset: string;
  judgeModel: string;
}

interface LiveCallRow {
  id: string;
  agentId: string;
  agent: string;
  ts: string;
  latencyMs: number;
  tokens: number;
  status: 'ok' | 'error' | 'timeout';
  channel: 'api' | 'mcp' | 'cli';
}

interface AlertRow {
  id: string;
  agent: string;
  agentId: string;
  severity: 'warn' | 'error' | 'info';
  type: 'latency' | 'token' | 'error' | 'approval' | 'quota';
  title: string;
  ts: string;
  acknowledged: boolean;
}

interface AgentImportRecord {
  id: string;
  agentId: string;
  agentName: string;
  source: string;
  status: 'pending_review' | 'approved' | 'rejected';
  submittedBy: string;
  submittedAt: string;
  checks: { key: string; label: string; status: string }[];
  mapping: { tools: string[]; mcp: string[] };
  risks: string[];
  audit?: { id: string; action: string; actor: string; time: string; result: string }[];
}

function parseOpenClawPackage(raw: string) {
  const parsed = JSON.parse(raw) as Record<string, any>;
  const tools = Array.isArray(parsed.tools) ? parsed.tools.map((tool: any) => typeof tool === 'string' ? tool : tool.name).filter(Boolean) : [];
  const mcp = Array.isArray(parsed.mcpServers) ? parsed.mcpServers.map((server: any) => typeof server === 'string' ? server : server.name).filter(Boolean) : Object.keys(parsed.mcp ?? {});
  const permissions = Array.isArray(parsed.permissions) ? parsed.permissions : Object.keys(parsed.permissions ?? {});
  const risks = permissions.filter((permission: string) => /shell|exec|write|network|filesystem|admin/i.test(permission));
  return { name: parsed.name ?? parsed.agent?.name ?? 'OpenClaw 导入智能体', description: parsed.description ?? parsed.agent?.description ?? '', version: parsed.version ?? '0.1.0', model: parsed.model ?? parsed.agent?.model ?? '待映射', tools, mcp, permissions, risks };
}

const INITIAL_EVALUATIONS: EvalRow[] = [
  { id:'e01', name:'故障自愈-2026-W28-A', agentId:'a1', agentName:'故障自愈', version:'1.4.2', totalCases:2400, accuracy:92.4, recall:90.1, p95Ms:580, tokensPerCall:820, rating:4.7, calls:12453, status:'champion', passedAt:'2026-07-14T03:20:00Z', dataset:'incident-v3', judgeModel:'gpt-4o' },
  { id:'e02', name:'故障自愈-2026-W28-B', agentId:'a1', agentName:'故障自愈', version:'1.4.1', totalCases:2400, accuracy:89.8, recall:88.0, p95Ms:640, tokensPerCall:840, rating:4.5, calls:12011, status:'control', passedAt:'2026-07-14T03:20:00Z', dataset:'incident-v3', judgeModel:'gpt-4o' },
  { id:'e03', name:'变更辅助-2026-W27', agentId:'a2', agentName:'变更辅助', version:'2.1.0', totalCases:1200, accuracy:94.1, recall:92.0, p95Ms:520, tokensPerCall:640, rating:4.6, calls:8210, status:'champion', passedAt:'2026-07-08T09:00:00Z', dataset:'changeqa-v2', judgeModel:'claude-sonnet' },
  { id:'e04', name:'威胁狩猎-2026-W27', agentId:'a3', agentName:'威胁狩猎', version:'3.0.0', totalCases:800, accuracy:87.3, recall:91.2, p95Ms:720, tokensPerCall:980, rating:4.4, calls:5430, status:'baseline', passedAt:'2026-07-07T08:30:00Z', dataset:'threatbench-v1', judgeModel:'gpt-4o' },
  { id:'e05', name:'容量预测-Q2', agentId:'a4', agentName:'容量预测', version:'1.8.0', totalCases:600, accuracy:96.2, recall:95.0, p95Ms:460, tokensPerCall:520, rating:4.8, calls:4310, status:'champion', passedAt:'2026-07-05T02:10:00Z', dataset:'capacitybench-v1', judgeModel:'claude-sonnet' },
  { id:'e06', name:'SQL 诊断-2026-W26', agentId:'a5', agentName:'SQL 诊断', version:'0.9.3', totalCases:400, accuracy:88.5, recall:86.0, p95Ms:380, tokensPerCall:300, rating:4.3, calls:2980, status:'baseline', passedAt:'2026-07-01T11:00:00Z', dataset:'sqlbench-v1', judgeModel:'gpt-4o-mini' },
  { id:'e07', name:'日志异常-2026-W25', agentId:'a6', agentName:'日志异常', version:'1.2.0', totalCases:1500, accuracy:91.0, recall:89.5, p95Ms:540, tokensPerCall:720, rating:4.5, calls:6700, status:'champion', passedAt:'2026-06-24T07:00:00Z', dataset:'logbench-v2', judgeModel:'gpt-4o' },
  { id:'e08', name:'工单分诊-2026-W25', agentId:'a7', agentName:'工单分诊', version:'2.0.1', totalCases:1000, accuracy:93.0, recall:90.8, p95Ms:610, tokensPerCall:680, rating:4.6, calls:5210, status:'control', passedAt:'2026-06-23T03:40:00Z', dataset:'ticketbench', judgeModel:'claude-sonnet' },
  { id:'e09', name:'安全合规-W24', agentId:'a8', agentName:'安全合规', version:'1.5.0', totalCases:500, accuracy:95.4, recall:94.2, p95Ms:490, tokensPerCall:560, rating:4.7, calls:3300, status:'champion', passedAt:'2026-06-18T05:00:00Z', dataset:'compliance-v2', judgeModel:'gpt-4o' },
  { id:'e10', name:'资产盘点-2026-W23', agentId:'a9', agentName:'资产盘点', version:'0.8.0', totalCases:300, accuracy:86.2, recall:84.5, p95Ms:330, tokensPerCall:280, rating:4.2, calls:1840, status:'baseline', passedAt:'2026-06-10T08:00:00Z', dataset:'assetqa-v1', judgeModel:'gpt-4o-mini' },
  { id:'e11', name:'告警降噪-W22', agentId:'a10', agentName:'告警降噪', version:'1.0.2', totalCases:2000, accuracy:90.1, recall:88.6, p95Ms:470, tokensPerCall:540, rating:4.4, calls:9100, status:'champion', passedAt:'2026-06-04T06:00:00Z', dataset:'alertbench-v2', judgeModel:'claude-sonnet' },
  { id:'e12', name:'故障自愈-回滚对照', agentId:'a1', agentName:'故障自愈', version:'1.3.5', totalCases:2400, accuracy:85.7, recall:83.4, p95Ms:760, tokensPerCall:880, rating:4.3, calls:9800, status:'control', passedAt:'2026-06-01T02:00:00Z', dataset:'incident-v3', judgeModel:'gpt-4o' },
];

const INITIAL_LIVE_CALLS: LiveCallRow[] = [
  { id:'lc01', agentId:'a1', agent:'故障自愈', ts:'14:55', latencyMs:620, tokens:880, status:'ok', channel:'api' },
  { id:'lc02', agentId:'a2', agent:'变更辅助', ts:'14:54', latencyMs:510, tokens:640, status:'ok', channel:'cli' },
  { id:'lc03', agentId:'a3', agent:'威胁狩猎', ts:'14:53', latencyMs:880, tokens:1020, status:'ok', channel:'mcp' },
  { id:'lc04', agentId:'a4', agent:'容量预测', ts:'14:52', latencyMs:420, tokens:520, status:'ok', channel:'api' },
  { id:'lc05', agentId:'a5', agent:'SQL 诊断', ts:'14:50', latencyMs:310, tokens:290, status:'ok', channel:'cli' },
  { id:'lc06', agentId:'a7', agent:'工单分诊', ts:'14:47', latencyMs:590, tokens:700, status:'ok', channel:'api' },
  { id:'lc07', agentId:'a1', agent:'故障自愈', ts:'14:44', latencyMs:720, tokens:860, status:'ok', channel:'api' },
  { id:'lc08', agentId:'a2', agent:'变更辅助', ts:'14:41', latencyMs:530, tokens:660, status:'ok', channel:'cli' },
  { id:'lc09', agentId:'a1', agent:'故障自愈', ts:'14:38', latencyMs:1500, tokens:880, status:'timeout', channel:'api' },
  { id:'lc10', agentId:'a3', agent:'威胁狩猎', ts:'14:36', latencyMs:860, tokens:990, status:'ok', channel:'mcp' },
  { id:'lc11', agentId:'a4', agent:'容量预测', ts:'14:33', latencyMs:480, tokens:540, status:'ok', channel:'api' },
  { id:'lc12', agentId:'a1', agent:'故障自愈', ts:'14:30', latencyMs:660, tokens:900, status:'ok', channel:'api' },
  { id:'lc13', agentId:'a7', agent:'工单分诊', ts:'14:27', latencyMs:0, tokens:0, status:'error', channel:'api' },
  { id:'lc14', agentId:'a2', agent:'变更辅助', ts:'14:25', latencyMs:560, tokens:650, status:'ok', channel:'cli' },
  { id:'lc15', agentId:'a3', agent:'威胁狩猎', ts:'14:22', latencyMs:880, tokens:1010, status:'ok', channel:'mcp' },
  { id:'lc16', agentId:'a4', agent:'容量预测', ts:'14:19', latencyMs:470, tokens:530, status:'ok', channel:'api' },
  { id:'lc17', agentId:'a7', agent:'工单分诊', ts:'14:16', latencyMs:610, tokens:720, status:'ok', channel:'api' },
  { id:'lc18', agentId:'a1', agent:'故障自愈', ts:'14:13', latencyMs:680, tokens:890, status:'ok', channel:'api' },
  { id:'lc19', agentId:'a2', agent:'变更辅助', ts:'14:10', latencyMs:520, tokens:660, status:'ok', channel:'cli' },
  { id:'lc20', agentId:'a1', agent:'故障自愈', ts:'14:07', latencyMs:2100, tokens:1200, status:'timeout', channel:'api' },
  { id:'lc21', agentId:'a4', agent:'容量预测', ts:'14:04', latencyMs:430, tokens:510, status:'ok', channel:'api' },
  { id:'lc22', agentId:'a3', agent:'威胁狩猎', ts:'14:01', latencyMs:910, tokens:1050, status:'ok', channel:'mcp' },
  { id:'lc23', agentId:'a5', agent:'SQL 诊断', ts:'13:58', latencyMs:330, tokens:310, status:'ok', channel:'cli' },
  { id:'lc24', agentId:'a7', agent:'工单分诊', ts:'13:55', latencyMs:580, tokens:680, status:'ok', channel:'api' },
];

const INITIAL_ALERTS: AlertRow[] = [
  { id:'al1', agent:'故障自愈', agentId:'a1', severity:'warn',  type:'latency',  title:'P95 超阈值（800ms &gt; 600ms）', ts:'14:32', acknowledged:false },
  { id:'al2', agent:'容量预测', agentId:'a4', severity:'warn',  type:'token',    title:'Token 用量超预算 80%', ts:'13:18', acknowledged:false },
  { id:'al3', agent:'变更辅助', agentId:'a2', severity:'info',  type:'error',    title:'1 次失败重试后恢复', ts:'12:45', acknowledged:true },
  { id:'al4', agent:'威胁狩猎', agentId:'a3', severity:'error', type:'approval', title:'高风险操作 30 分钟未审批（待双签）', ts:'11:05', acknowledged:false },
  { id:'al5', agent:'工单分诊', agentId:'a7', severity:'warn',  type:'quota',    title:'调用配额剩余 12%，预计 4h 后耗尽', ts:'09:42', acknowledged:false },
  { id:'al6', agent:'故障自愈', agentId:'a1', severity:'info',  type:'latency',  title:'3 次 P99 抖动 (1.2s) 自动恢复', ts:'08:20', acknowledged:true },
];

const INITIAL_TREND_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: `D${i + 1}`,
  a: Number((4.20 + 0.012 * i - 0.001 * (i % 5)).toFixed(2)),
  b: Number((4.05 + 0.008 * i).toFixed(2)),
}));

const TREND_FULL = Array.from({ length: 60 }, (_, i) => ({
  t: `${60 - i - 1}m`,
  calls: Math.round(120 + 30 * Math.sin((i / 60) * Math.PI * 2) + (i % 7 === 0 ? 20 : 0)),
  errors: Math.max(0, Math.round(2 + 1.5 * Math.sin((i / 11) * Math.PI))),
  latency: Math.round(380 + 60 * Math.sin((i / 17) * Math.PI + 0.6)),
}));

/* ============ 常量 ============ */

const MAIN_TABS = [
  { key: 'agents', label: '我的智能体', icon: Bot },
  { key: 'store', label: '智能体市场', icon: Download },
  { key: 'evaluate', label: '评测中心', icon: FlaskConical },
  { key: 'monitor', label: '治理与监控', icon: Monitor },
] as const;
type MainTab = typeof MAIN_TABS[number]['key'];

const MAIN_TAB_META: Record<MainTab, { description: string; action?: string }> = {
  agents: { description: '管理已纳管智能体的状态、配置与运行入口', action: '新建智能体' },
  store: { description: '发现并纳管经过评估的企业智能体资产', action: '导入智能体' },
  evaluate: { description: '通过评测任务和质量门禁判断智能体是否达标', action: '启动评测' },
  monitor: { description: '持续跟踪生产健康、风险告警与调用审计' },
};

const AGENT_SUB_TABS = [
  { key: 'installed', label: '已安装', icon: CheckCircle2 },
  { key: 'store', label: '待配置', icon: Download },
] as const;

const RISK_TONE: Record<string, 'success' | 'info' | 'warn' | 'error'> = {
  L0: 'success', L1: 'info', L2: 'warn', L3: 'error',
};

const CATEGORIES = ['全部', 'AIOps', 'SecOps', 'DevOps', 'DataOps', 'BizOps'] as const;
const STATUS_FILTERS = ['全部', '已启用', '已停用', '待配置', '待评测', '有更新'] as const;
const RATING_FILTERS = ['全部', '4.5+', '4.0+', '3.5+'] as const;

/* ============ 页面 ============ */

export default function Agents() {
  const [mainTab, setMainTab] = useState<MainTab>('agents');
  const [agentSubTab, setAgentSubTab] = useState<typeof AGENT_SUB_TABS[number]['key']>('installed');
  const [searchQ, setSearchQ] = useState('');
  const [cat, setCat] = useState<typeof CATEGORIES[number]>('全部');
  const [status, setStatus] = useState<typeof STATUS_FILTERS[number]>('全部');
  const [rating, setRating] = useState<typeof RATING_FILTERS[number]>('全部');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>('a1');
  const [showCompare, setShowCompare] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'meta' | 'prompt' | 'tools' | 'versions' | 'monitor'>('meta');
  const [compareOpen, setCompareOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // 生命周期操作与详情状态
  // 评测 / 监控 / 运行 / 配置 / A/B 报告 / 等
  const [newEvalOpen, setNewEvalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toolCfg, setToolCfg] = useState<{ open: boolean; toolKey: string | null }>({ open: false, toolKey: null });
  const [abReportOpen, setAbReportOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  // 数据层 state
  const [evaluations, setEvaluations] = useState<any[]>(INITIAL_EVALUATIONS);
  const [liveCalls, setLiveCalls] = useState<any[]>(INITIAL_LIVE_CALLS);
  const [alerts, setAlerts] = useState<any[]>(INITIAL_ALERTS);
  const [imports, setImports] = useState<AgentImportRecord[]>([]);
  const { data: evalQ } = useApiQuery<any[]>(['evaluations'], '/api/evaluations');
  const { data: alertsQ } = useApiQuery<any[]>(['agents', 'alerts'], '/api/agents/alerts');
  const { data: callsQ } = useApiQuery<any[]>(['agents', 'liveCalls'], '/api/agents/calls/live');
  const createAgentApi = useApiMutation<any, Record<string, any>>('/api/agents', { onSuccess: () => { setCreateOpen(false); setImportOpen(false); } });
  const importAgentApi = useApiMutation<any, Record<string, any>>('/api/agents/import', { onSuccess: () => setImportOpen(false) });
  const importReviewApi = useApiMutation<AgentImportRecord, { id: string; action: 'approve' | 'reject' }>(({ id, action }) => `/api/agents/imports/${id}/${action}`, { onSuccess: (record) => setImports((prev) => prev.map((item) => item.id === record.id ? record : item)) });
  const createEvaluationApi = useApiMutation<any, Record<string, any>>('/api/evaluations', { onSuccess: (evaluation) => { setEvaluations((prev) => [evaluation, ...prev]); setNewEvalOpen(false); } });
  const runAgentApi = useApiMutation<LiveCallRow, LiveCallRow>('/api/agents/calls/live', { onSuccess: (call) => setLiveCalls((prev) => [call, ...prev].slice(0, 24)) });
  const saveAgentConfigApi = useApiMutation<any, Record<string, any>>(() => `/api/agents/${activeId ?? 'a1'}/config`, { onSuccess: () => setToolCfg({ open: false, toolKey: null }) });
  const savePromptApi = useApiMutation<any, Record<string, any>>(() => `/api/agents/${activeId ?? 'a1'}/config`, {});
  const lifecycleApi = useApiMutation<any, { id: string; action: 'install' | 'uninstall' | 'enable' | 'disable' | 'publish' }>(({ id, action }) => `/api/agents/${id}/${action}`, { onSuccess: () => setShowDetails(false) });
  useEffect(() => { if (evalQ && evalQ.length) setEvaluations(evalQ); }, [evalQ]);
  useEffect(() => { if (alertsQ && alertsQ.length) setAlerts(alertsQ); }, [alertsQ]);
  useEffect(() => { if (callsQ && callsQ.length) setLiveCalls(callsQ); }, [callsQ]);
  const { data: importsQ } = useApiQuery<AgentImportRecord[]>(['agents', 'imports'], '/api/agents/imports');
  useEffect(() => { if (importsQ) setImports(importsQ); }, [importsQ]);

  const { data: agents = [] } = useApiQuery<AgentFull[]>(['agents'], '/api/agents');
  const { data: versions = [] } = useApiQuery<AgentVersion[]>(['agent', activeId, 'versions'], `/api/agents/${activeId}/versions`);
  const { data: trend = [] } = useApiQuery<number[]>(['agent', activeId, 'trend'], `/api/agents/${activeId}/trend`);
  const { data: rank = [] } = useApiQuery<{ rank: number; id: string; name: string; calls: number; change: number }[]>(['agent', 'rank'], '/api/agents/rank');
  const { data: compareTrend = [] } = useApiQuery<number[]>(['agent', compareId, 'trend'], `/api/agents/${compareId}/trend`);

  /* ============ 派生 ============ */
  const allTags = useMemo(() => {
    const s = new Set<string>();
    agents.forEach((a) => a.tools.forEach((t) => s.add(t)));
    return Array.from(s).slice(0, 12);
  }, [agents]);

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return agents.filter((a) => {
      if (agentSubTab === 'installed' && a.status !== 'installed') return false;
      if (agentSubTab === 'store' && a.status === 'installed') return false;
      if (cat !== '全部' && a.category !== cat) return false;
      if (status === '已启用' && a.status !== 'installed') return false;
      if (status === '已停用' && a.status === 'installed') return false;
      if (status === '待配置' && (a.status === 'installed' || (a as any).lifecycleStatus === 'pending_review')) return false;
      if (status === '待评测' && (a as any).lifecycleStatus !== 'pending_review') return false;
      if (rating === '4.5+' && a.rating < 4.5) return false;
      if (rating === '4.0+' && a.rating < 4.0) return false;
      if (rating === '3.5+' && a.rating < 3.5) return false;
      if (tagFilter && !a.tools.includes(tagFilter)) return false;
      if (q && !`${a.name} ${a.description ?? ''} ${a.tools.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agents, agentSubTab, cat, status, rating, tagFilter, searchQ]);

  const active = useMemo(() => agents.find((a) => a.id === activeId), [agents, activeId]);
  const compare = useMemo(() => agents.find((a) => a.id === compareId), [agents, compareId]);

  const trendData = useMemo(() => trend.map((v, i) => ({ day: `D${i + 1}`, calls: v })), [trend]);
  const compareTrendData = useMemo(() => compareTrend.map((v, i) => ({ day: `D${i + 1}`, calls: v })), [compareTrend]);

  // KPI
  const kpis = useMemo(() => {
    const installed = agents.filter((a) => a.status === 'installed');
    return {
      total: agents.length,
      installed: installed.length,
      totalCalls: installed.reduce((s, a) => s + (a.installCount ?? 0), 0),
      avgRating: installed.length ? (installed.reduce((s, a) => s + a.rating, 0) / installed.length).toFixed(1) : '0',
      avgP95: installed.length ? Math.round(installed.reduce((s, a) => s + (a.p95Ms ?? 0), 0) / installed.length) : 0,
    };
  }, [agents]);

  const activeFilterCount = (cat !== '全部' ? 1 : 0) + (status !== '全部' ? 1 : 0) + (rating !== '全部' ? 1 : 0) + (tagFilter ? 1 : 0) + (searchQ ? 1 : 0);

  return (
    <div className="agents-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      {/* ============ 左侧筛选栏（可折叠） ============ */}
      <section className="min-h-full min-w-0 w-full">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
        {/* 顶栏 */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-[var(--brand)]" />
                智能体
              </h1>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {MAIN_TAB_META[mainTab].description}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {MAIN_TAB_META[mainTab].action && <Button size="sm" onClick={() => mainTab === 'evaluate' ? setNewEvalOpen(true) : mainTab === 'store' ? setImportOpen(true) : setCreateOpen(true)}><Plus className="h-3.5 w-3.5" />{MAIN_TAB_META[mainTab].action}</Button>}
          </div>
        </div>

        {/* ============ 一级模块导航：先确定工作上下文 ============ */}
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-5 pt-3">
          <div className="flex items-center gap-1 flex-wrap">
            {MAIN_TABS.map((t) => <button key={t.key} onClick={() => setMainTab(t.key)} className={cn('flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[13px] transition-colors', mainTab === t.key ? 'bg-[var(--surface-1)] border border-[var(--border)] border-b-[var(--surface-1)] text-[var(--text)] font-semibold -mb-px' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]')}><t.icon className="h-3.5 w-3.5" />{t.label}</button>)}
          </div>
        </div>

        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
        {/* 生命周期摘要：先展示运营状态，再进入资产筛选 */}
        {mainTab === 'agents' && (
      <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">生命周期摘要</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">快速了解智能体资产的纳管状态与生命周期待办</p>
              </div>
              <span className="hidden text-[11px] text-[var(--text-muted)] sm:inline">实时更新</span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="已启用" value={kpis.installed} sub="个" tone="success" icon={CheckCircle2} size="comfortable" className="border-l-2 border-l-[var(--success)]" />
              <KpiCard label="待配置" value={agents.filter((a) => a.status !== 'installed' && (a as any).lifecycleStatus !== 'pending_review').length} sub="个" tone="warn" icon={Settings} size="comfortable" className="border-l-2 border-l-[var(--warning)]" />
              <KpiCard label="待评测" value={agents.filter((a) => (a as any).lifecycleStatus === 'pending_review').length} sub="个" tone="info" icon={FlaskConical} size="comfortable" className="border-l-2 border-l-[var(--info)]" />
              <KpiCard label="有新版本" value={agents.filter((a) => (a as any).hasUpdate).length} sub="个" tone="neutral" icon={RefreshCw} size="comfortable" />
            </div>
          </div>
        )}

        {/* ============ 资产筛选：只保留决策必需条件 ============ */}
        {mainTab === 'agents' && (
          <div className="border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-[240px] flex-1 max-w-[360px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="搜索智能体名称、能力或描述"
                  className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] pl-8 pr-3 text-[13px] outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"
                />
              </div>
              <div className="flex items-center gap-1.5" role="group" aria-label="范围">
                <span className="text-xs font-semibold text-[var(--text-secondary)] mr-1">范围</span>
                {AGENT_SUB_TABS.map((t) => <button key={t.key} onClick={() => setAgentSubTab(t.key)} className={cn('flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors', agentSubTab === t.key ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]')}><t.icon className="h-3 w-3" />{t.label}</button>)}
              </div>
              <div className="flex items-center gap-1.5" role="group" aria-label="状态">
                <span className="text-xs font-semibold text-[var(--text-secondary)] mr-1">状态</span>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                      status === s ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setCat('全部'); setStatus('全部'); setRating('全部'); setTagFilter(null); setSearchQ(''); }}
                  className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />重置筛选
                </button>
              )}
            </div>
          </div>
        )}

        {/* 批量操作栏（选中时）— 简化版 */}
        {mainTab === 'agents' && (
          <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-5 py-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">{filtered.length} 个智能体</span>
            <span>当前资产范围</span>
          </div>
        )}

        {/* 主视图 */}
        <div>
          {mainTab === 'agents' ? (
            <>
              <AgentGridView agents={filtered} onSelect={(id) => { setActiveId(id); setShowDetails(true); }} activeId={activeId} agentSubTab={agentSubTab} />
            </>
          ) : mainTab === 'store' ? <AgentMarketView agents={agents.filter((agent) => agent.status !== 'installed')} imports={imports} onReview={(id, action) => importReviewApi.mutate({ id, action })} onSelect={(id) => { setActiveId(id); setShowDetails(true); }} activeId={activeId} /> : mainTab === 'evaluate' ? <EvaluateView agents={agents} active={active} compare={compare} evaluations={evaluations} /> : <MonitorView agents={agents} alerts={alerts} liveCalls={liveCalls} />}
        </div>
        </div>
      </section>

      {/* ============ 按需打开的 Agent 详情 ============ */}
      <Drawer
        open={showDetails && !!active}
        onClose={() => setShowDetails(false)}
        flush
        width={560}
      >
        {active ? (
          <AgentDetailPanel
            agent={active}
            trendData={trendData}
            compare={compare}
            compareTrendData={compareTrendData}
            versions={versions}
            rank={rank}
            onClose={() => setShowDetails(false)}
            onCompareToggle={() => setShowCompare(!showCompare)}
            showCompare={showCompare}
            tab={detailTab}
            setTab={setDetailTab}
            onConfigOpen={() => setConfigOpen(true)}
            onRunOpen={() => setRunOpen(true)}
            onTestOpen={() => setTestOpen(true)}
            onPreviewOpen={() => setPreviewOpen(true)}
            onToolCfg={(key) => setToolCfg({ open: true, toolKey: key })}
            onABReportOpen={() => setAbReportOpen(true)}
            onLifecycle={(action) => action === 'publish' ? setPublishConfirmOpen(true) : lifecycleApi.mutate({ id: active.id, action })}
            onPromptSave={(prompt) => savePromptApi.mutate({ prompt })}
            lifecyclePending={lifecycleApi.isPending}
          />
        ) : <EmptyState icon={Bot} title="选择 Agent 查看详情" />}
      </Drawer>

      {/* ============ 新建 Agent Modal ============ */}
      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(form) => {
          createAgentApi.mutate({ name: form.name, category: form.category, description: form.description, riskLevel: form.risk, tools: form.tools });
        }}
      />
      <ImportAgentModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        loading={importAgentApi.isPending}
        onSubmit={(form) => importAgentApi.mutate({ name: form.name, category: form.category, description: form.description, riskLevel: form.risk, source: form.source, tools: form.tools, mapping: form.mapping, risks: form.risks })}
      />

      {/* ============ 对比 Modal ============ */}
      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} agents={agents} active={active} />

      {/* ============ 新增的 Modal：NewEval / Run / PromptTest / Preview / ToolCfg / ABReport ============ */}
      <NewEvalModal
        open={newEvalOpen}
        onClose={() => setNewEvalOpen(false)}
        onSubmit={(form) => {
          createEvaluationApi.mutate({ name: form.name, agentId: activeId ?? 'a1', agentName: active?.name ?? '待分配智能体', version: active?.version ?? '1.0.0', totalCases: form.totalCases, dataset: form.dataset, judgeModel: form.judgeModel, status: 'baseline' });
        }}
      />

      <ModalX open={runOpen} onClose={() => setRunOpen(false)} title={`运行 · ${agents.find((a) => a.id === activeId)?.name ?? ''}`} size="md" footer={
        <>
          <Button variant="ghost" onClick={() => setRunOpen(false)}>关闭</Button>
        </>
      }>
        <RunAgentBody agent={agents.find((a) => a.id === activeId)} onComplete={(r) => runAgentApi.mutate(r)} />
      </ModalX>

      <ModalX open={testOpen} onClose={() => setTestOpen(false)} title="Prompt 试运行" size="lg" footer={
        <Button variant="ghost" onClick={() => setTestOpen(false)}>关闭</Button>
      }>
        <PromptTestBody agent={agents.find((a) => a.id === activeId)} />
      </ModalX>

      <ModalX open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Prompt 预览 · 变量已替换（占位）`} size="lg" footer={
        <Button variant="ghost" onClick={() => setPreviewOpen(false)}>关闭</Button>
      }>
        <PromptPreviewBody agent={agents.find((a) => a.id === activeId)} />
      </ModalX>

      <ModalX open={toolCfg.open} onClose={() => setToolCfg({ open: false, toolKey: null })} title={`工具配置 · ${toolCfg.toolKey ?? ''}`} size="sm" footer={
        <>
          <Button variant="ghost" onClick={() => setToolCfg({ open: false, toolKey: null })}>取消</Button>
          <Button loading={saveAgentConfigApi.isPending} onClick={() => saveAgentConfigApi.mutate({ toolKey: toolCfg.toolKey, enabled: true, permission: 'approval' })}>保存</Button>
        </>
      }>
        <ToolConfigBody />
      </ModalX>

      <ModalX open={abReportOpen} onClose={() => setAbReportOpen(false)} title={`A/B Test 详细报告 · ${agents.find((a) => a.id === activeId)?.name ?? ''}`} size="lg" footer={
        <Button onClick={() => setAbReportOpen(false)}>关闭</Button>
      }>
        <ABReportBody agent={agents.find((a) => a.id === activeId)} />
      </ModalX>
      <ModalX open={publishConfirmOpen} onClose={() => setPublishConfirmOpen(false)} title="申请发布" size="sm" footer={<><Button variant="ghost" onClick={() => setPublishConfirmOpen(false)}>取消</Button><Button loading={lifecycleApi.isPending} onClick={() => { if (active) lifecycleApi.mutate({ id: active.id, action: 'publish' }); setPublishConfirmOpen(false); }}>提交申请</Button></>}>
        <div className="space-y-3 text-sm"><div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="font-medium">确认申请发布「{active?.name ?? ''}」？</div><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">申请将携带当前版本、评测结论和权限配置，提交后由发布流程继续处理。</p></div><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><span className="text-[var(--text-muted)]">当前版本</span><div className="mt-1 font-mono font-medium">v{active?.version ?? '—'}</div></div><div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><span className="text-[var(--text-muted)]">评测状态</span><div className="mt-1 font-medium">{(active as any)?.evaluationStatus === 'passed' ? '已通过' : '待复核'}</div></div></div></div>
      </ModalX>
    </div>
  );
}

/* ==================== Agent 网格视图 ==================== */

function AgentGridView({ agents, onSelect, activeId, agentSubTab }: {
  agents: AgentFull[];
  onSelect: (id: string) => void;
  activeId: string | null;
  agentSubTab: string;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(agents.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedAgents = agents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [agents, agentSubTab]);

  if (agents.length === 0) {
    return (
      <div className="grid min-h-[360px] place-items-center text-center text-[var(--text-muted)]">
        <div>
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">没有符合条件的 Agent</div>
          <div className="text-[10px] mt-1">调整左侧筛选条件或新建一个</div>
        </div>
      </div>
    );
  }
  // 按分类分组
  const byCategory = pagedAgents.reduce<Record<string, AgentFull[]>>((acc, a) => {
    acc[a.category] = acc[a.category] ?? [];
    acc[a.category].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6 bg-[var(--bg-elevated)]/30 p-5 pb-6">
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <Badge tone={cat === 'AIOps' ? 'info' : 'warn'} className="text-[10px]">{cat}</Badge>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">{items.length} 个</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((a) => (
              <AgentCard key={a.id} agent={a} active={a.id === activeId} onClick={() => onSelect(a.id)} market={agentSubTab === 'store'} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
        <span>显示第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, agents.length)} 个，共 {agents.length} 个智能体</span>
        <nav className="flex items-center gap-1" aria-label="智能体分页">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="上一页"><ChevronLeft className="h-3.5 w-3.5" /></button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => <button key={item} type="button" onClick={() => setPage(item)} aria-current={item === currentPage ? 'page' : undefined} className={cn('grid h-8 min-w-8 place-items-center rounded-md px-2 font-medium transition-colors', item === currentPage ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>{item}</button>)}
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="下一页"><ChevronRight className="h-3.5 w-3.5" /></button>
        </nav>
      </div>
    </div>
  );
}

function AgentMarketView({ agents, imports, onReview, onSelect, activeId }: { agents: AgentFull[]; imports: AgentImportRecord[]; onReview: (id: string, action: 'approve' | 'reject') => void; onSelect: (id: string) => void; activeId: string | null }) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('全部来源');
  const [section, setSection] = useState<'discover' | 'review' | 'audit'>('discover');
  const approved = agents.filter((agent) => agent.status === 'available').length;
  const beta = agents.filter((agent) => agent.status === 'beta').length;
  const visibleAgents = agents.filter((agent) => {
    const matchesQuery = !query || `${agent.name} ${agent.description} ${agent.tools.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const source = agent.status === 'beta' ? '灰度资产' : '官方资产';
    return matchesQuery && (sourceFilter === '全部来源' || source === sourceFilter);
  });
  return (
    <div className="space-y-4 bg-[var(--bg-elevated)]/30 p-5 pb-10">
      <div className="flex items-center gap-1 border-b border-[var(--border)]"><button onClick={() => setSection('discover')} className={cn('border-b-2 px-3 py-2 text-sm', section === 'discover' ? 'border-[var(--brand)] font-semibold text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)]')}>市场发现</button><button onClick={() => setSection('review')} className={cn('border-b-2 px-3 py-2 text-sm', section === 'review' ? 'border-[var(--brand)] font-semibold text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)]')}>待审核 {imports.filter((item) => item.status === 'pending_review').length > 0 && <span className="ml-1 rounded-full bg-[var(--warning-bg)] px-1.5 py-0.5 text-[10px] text-[var(--warning)]">{imports.filter((item) => item.status === 'pending_review').length}</span>}</button><button onClick={() => setSection('audit')} className={cn('border-b-2 px-3 py-2 text-sm', section === 'audit' ? 'border-[var(--brand)] font-semibold text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)]')}>导入审计</button></div>
      {section === 'review' ? <ImportReviewView imports={imports} onReview={onReview} /> : section === 'audit' ? <ImportAuditView imports={imports} /> : <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--text)]"><Download className="h-4 w-4 text-[var(--brand)]" />企业智能体市场</div>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">浏览已完成基础安全检查和能力说明的智能体。安装前可查看版本、依赖、风险等级与服务指标。</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5"><div className="text-lg font-mono font-semibold text-[var(--brand)]">{approved}</div><div className="text-[11px] text-[var(--text-muted)]">可纳管</div></div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5"><div className="text-lg font-mono font-semibold text-[var(--warning)]">{beta}</div><div className="text-[11px] text-[var(--text-muted)]">灰度中</div></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]"><span className="rounded-md bg-[var(--surface-1)] px-2.5 py-1.5">✓ 版本可追溯</span><span className="rounded-md bg-[var(--surface-1)] px-2.5 py-1.5">✓ 风险等级已标注</span><span className="rounded-md bg-[var(--surface-1)] px-2.5 py-1.5">✓ 安装后纳入治理</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索市场智能体" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-8 pr-3 text-sm outline-none focus:border-[var(--brand)]" /></div>
        <div className="flex items-center gap-1.5 text-xs"><span className="font-semibold text-[var(--text-secondary)]">来源</span>{['全部来源', '官方资产', '灰度资产'].map((source) => <button key={source} onClick={() => setSourceFilter(source)} className={cn('rounded-md border px-2.5 py-1.5', sourceFilter === source ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]')}>{source}</button>)}</div>
        <span className="text-xs text-[var(--text-muted)]">{visibleAgents.length} 个可引入资产</span>
      </div>
      <AgentGridView agents={visibleAgents} onSelect={onSelect} activeId={activeId} agentSubTab="store" />
      </>}
    </div>
  );
}

function ImportReviewView({ imports, onReview }: { imports: AgentImportRecord[]; onReview: (id: string, action: 'approve' | 'reject') => void }) {
  const pending = imports.filter((item) => item.status === 'pending_review');
  return <div className="space-y-3"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="text-sm font-semibold">导入审核</div><p className="mt-1 text-xs text-[var(--text-muted)]">审核来源可信度、依赖映射和风险项后，才能进入安装流程。</p></div>{pending.length === 0 ? <EmptyState icon={ShieldCheck} title="暂无待审核智能体" description="新的导入资产会出现在这里" /> : pending.map((item) => <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold">{item.agentName}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{item.source} · {new Date(item.submittedAt).toLocaleString('zh-CN')}</div></div><Badge tone="warn" className="text-[10px]">待审核</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4"><div><span className="text-[var(--text-muted)]">工具映射</span><div className="mt-1 font-semibold">{item.mapping?.tools?.length ?? 0} 项</div></div><div><span className="text-[var(--text-muted)]">MCP 映射</span><div className="mt-1 font-semibold">{item.mapping?.mcp?.length ?? 0} 项</div></div><div><span className="text-[var(--text-muted)]">风险项</span><div className="mt-1 font-semibold text-[var(--warning)]">{item.risks?.length ?? 0} 项</div></div><div><span className="text-[var(--text-muted)]">提交人</span><div className="mt-1 font-semibold">{item.submittedBy}</div></div></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => onReview(item.id, 'reject')}>驳回</Button><Button size="sm" onClick={() => onReview(item.id, 'approve')}><CheckCircle2 className="h-3.5 w-3.5" />通过审核</Button></div></div>)}</div>;
}

function ImportAuditView({ imports }: { imports: AgentImportRecord[] }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3"><div className="text-sm font-semibold">导入审计记录</div><div className="mt-1 text-xs text-[var(--text-muted)]">记录来源、提交、审核和纳管动作</div></div>{imports.length === 0 ? <div className="p-8"><EmptyState icon={FileText} title="暂无导入记录" description="导入智能体后会自动生成审计记录" /></div> : <table className="w-full text-xs"><thead className="bg-[var(--bg-elevated)] text-[10px] text-[var(--text-muted)]"><tr><th className="p-3 text-left">智能体</th><th className="p-3 text-left">来源</th><th className="p-3 text-left">提交人</th><th className="p-3 text-left">时间</th><th className="p-3 text-left">状态</th></tr></thead><tbody>{imports.map((item) => <tr key={item.id} className="border-t border-[var(--border)]"><td className="p-3 font-medium">{item.agentName}</td><td className="p-3 text-[var(--text-muted)]">{item.source}</td><td className="p-3">{item.submittedBy}</td><td className="p-3 font-mono text-[var(--text-muted)]">{new Date(item.submittedAt).toLocaleString('zh-CN')}</td><td className="p-3"><Badge tone={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warn'} className="text-[10px]">{item.status === 'approved' ? '已通过' : item.status === 'rejected' ? '已驳回' : '待审核'}</Badge></td></tr>)}</tbody></table>}</div>;
}

function AgentCard({ agent, active, onClick, market = false }: { agent: AgentFull; active: boolean; onClick: () => void; market?: boolean }) {
  const isInstalled = agent.status === 'installed';
  return (
    <button
      onClick={onClick}
      className={cn(
        'workflow-agent-card group relative flex min-h-[268px] flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[0_14px_30px_rgba(15,23,42,0.10)]',
        active ? 'border-[var(--brand)] bg-[var(--brand-light)]/35 shadow-[0_8px_24px_rgba(79,70,229,0.12)]' : '',
      )}
    >
      {/* 头部：图标 + 状态徽标 */}
      <div className="flex items-start gap-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--brand)]">
          <Bot className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-base truncate text-[var(--text)]">{agent.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
            <span className="font-mono">v{agent.version}</span><span>·</span><span>风险 {(agent as any).riskLevel ?? 'L1'}</span>
          </div>
        </div>
        <div className="shrink-0">
          {isInstalled ? <Badge tone="success" className="text-[10px]">已启用</Badge> : <Badge tone={agent.status === 'deprecated' ? 'error' : 'neutral'} className="text-[10px]">{agent.status === 'beta' ? '测试中' : agent.status === 'deprecated' ? '已弃用' : market ? '可安装' : '待配置'}</Badge>}
        </div>
      </div>

      {/* 描述 */}
      <div className="text-[13px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed min-h-[2.6em]">{agent.description}</div>

      {/* 能力栈 chip */}
      <div className="flex min-h-[25px] flex-wrap gap-1">
        {agent.tools.slice(0, 4).map((t) => (
          <span key={t} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{t}</span>
        ))}
        {agent.tools.length > 4 && <span className="self-center text-[11px] text-[var(--text-muted)]">+{agent.tools.length - 4}</span>}
      </div>

      {/* 指标：调用 / 缓存 / P95 */}
      <div className="grid grid-cols-3 gap-2 border-y border-[var(--border)] py-3 text-xs">
        <div className="text-center">
          <div className="text-[var(--text-muted)]">调用量</div>
          <div className="mt-0.5 text-sm font-mono font-semibold text-[var(--text)]">{(agent.installCount / 1000).toFixed(1)}k</div>
        </div>
        <div className="border-x border-[var(--border)] text-center">
          <div className="text-[var(--text-muted)]">缓存</div>
          <div className="mt-0.5 text-sm font-mono font-semibold text-[var(--success)]">{(agent as any).cacheHitRate ?? 32}%</div>
        </div>
        <div className="text-center">
          <div className="text-[var(--text-muted)]">P95</div>
          <div className="mt-0.5 text-sm font-mono font-semibold text-[var(--text)]">{agent.p95Ms}ms</div>
        </div>
      </div>

      {/* 状态 + 风险 */}
      <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
        <span className="truncate">负责人：<span className="text-[var(--text-secondary)]">{(agent as any).owner ?? '未分配'}</span></span>
        <span className="truncate text-right">工作区：<span className="text-[var(--text-secondary)]">{(agent as any).workspace ?? '未指定'}</span></span>
        <span className="truncate">最近运行：<span className="text-[var(--text-secondary)]">{(agent as any).lastRunAt ?? '—'}</span></span>
        <span className="truncate text-right">质量：<span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{agent.rating}</span></span>
      </div>
    </button>
  );
}

/* ==================== 评测视图 ==================== */

function EvaluateView({ agents, active, compare, evaluations }: { agents: AgentFull[]; active: AgentFull | undefined; compare: AgentFull | undefined; evaluations: EvalRow[] }) {
  const [localNewEvalOpen, setLocalNewEvalOpen] = useState(false);
  const [releaseNotice, setReleaseNotice] = useState<string | null>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<EvalRow | null>(null);
  const [qualityAction, setQualityAction] = useState<'review' | 'release' | null>(null);
  const [evalFilter, setEvalFilter] = useState<'all' | 'champion' | 'review'>('all');
  const [showAllEvaluations, setShowAllEvaluations] = useState(false);
  const completed = evaluations.filter((e) => e.status === 'champion').length;
  const pendingReview = evaluations.filter((e) => e.status !== 'champion').length;
  const visibleEvaluations = evaluations.filter((evaluation) => evalFilter === 'all' || (evalFilter === 'champion' ? evaluation.status === 'champion' : evaluation.status !== 'champion')).slice(0, showAllEvaluations ? evaluations.length : 6);
  const submitEval = (form: { name: string; dataset: string; judgeModel: string; totalCases: number }) => {
    setReleaseNotice(`评测批次「${form.name}」已创建，正在等待数据准备（${form.totalCases} 用例 · ${form.judgeModel}）`);
    setLocalNewEvalOpen(false);
  };
  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 bg-[var(--bg-elevated)]/30">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EvalCard title="进行中评测" value="3" sub="批次" icon={FlaskConical} tone="info" />
        <EvalCard title="质量门禁通过" value={completed} sub="批次" icon={CheckCircle2} tone="success" />
        <EvalCard title="平均准确率" value="92.4%" sub="↑ 1.2%" icon={BarChart3} tone="success" />
        <EvalCard title="待复核批次" value={pendingReview} sub="个" icon={FileCheck} tone="warn" />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--brand)]" />质量门禁</div>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">统一校验准确率、延迟、风险策略与评测结论，判断智能体是否达标</p>
          </div>
          <Badge tone="warn" className="text-[10px]">{pendingReview} 个批次待复核</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: '准确率 ≥ 90%', value: '通过', tone: 'success' as const, icon: CheckCircle2 },
            { label: 'P95 ≤ 800ms', value: '通过', tone: 'success' as const, icon: Gauge },
            { label: '风险策略校验', value: '需复核', tone: 'warn' as const, icon: AlertTriangle },
            { label: '审批记录', value: '待补充', tone: 'warn' as const, icon: FileText },
          ].map((gate) => (
            <div key={gate.label} className={cn('min-h-[92px] rounded-xl border p-4 transition-colors', gate.tone === 'success' ? 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--success)]/40' : 'border-[var(--warning)]/25 bg-[var(--warning-bg)]/35 hover:border-[var(--warning)]/45')}>
              <div className="flex items-center justify-between gap-2"><div className="text-[13px] font-medium text-[var(--text-secondary)]">{gate.label}</div><gate.icon className={cn('h-4 w-4', gate.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--warning)]')} /></div>
              <div className={cn('mt-2 text-lg font-semibold', gate.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--warning)]')}>{gate.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setQualityAction('review')}><ShieldCheck className="h-3.5 w-3.5" />提交质量复核</Button>
          <Button size="sm" variant="secondary" onClick={() => setQualityAction('release')}><FileText className="h-3.5 w-3.5" />生成发布申请材料</Button>
          {releaseNotice && <span className="text-[13px] text-[var(--brand)]">{releaseNotice}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div><div className="text-sm font-semibold flex items-center gap-1.5"><GitCompare className="h-3.5 w-3.5 text-[var(--brand)]" />多模型对比 · A/B Test</div><div className="mt-1 text-xs text-[var(--text-muted)]">对比不同模型版本的质量、延迟与调用表现</div></div>
          <div className="flex items-center gap-2"><Badge tone="success" className="text-[10px]">{completed} 个质量领先</Badge><span className="text-xs text-[var(--text-muted)]">共 {evaluations.length} 个评测批次</span></div>
        </div>
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3"><span className="text-xs font-medium text-[var(--text-secondary)]">批次筛选</span>{[{ key: 'all', label: '全部' }, { key: 'champion', label: '质量领先' }, { key: 'review', label: '待复核' }].map((filter) => <button key={filter.key} onClick={() => { setEvalFilter(filter.key as typeof evalFilter); setShowAllEvaluations(false); }} className={cn('rounded-md border px-2.5 py-1.5 text-xs', evalFilter === filter.key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]')}>{filter.label}</button>)}</div>
        <div className="overflow-x-auto px-3 pb-3"><table className="w-full min-w-[920px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[13px]">
          <thead className="bg-[var(--bg-elevated)] text-[11px] tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="text-left p-2">智能体 / 评测批次</th>
              <th className="text-left p-2">版本</th>
              <th className="text-right p-2">准确率</th>
              <th className="text-right p-2">召回率</th>
              <th className="text-right p-2">P95</th>
              <th className="text-right p-2">Token / 次</th>
              <th className="text-right p-2">用户评分</th>
              <th className="text-right p-2">调用</th>
              <th className="text-left p-2">质量结论</th>
              <th className="text-right p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvaluations.map((a) => {
              const accuracy = a.accuracy;
              const recall = a.recall;
              const tokens = a.tokensPerCall;
              const statusLabel = a.status === 'champion' ? '冠军' : a.status === 'control' ? '对照' : '基线';
              const statusTone = a.status === 'champion' ? 'success' : a.status === 'control' ? 'info' : 'neutral';
              return (
                <tr key={a.id} className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-hover)]">
                  <td className="p-3"><div className="flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-[var(--brand)]" /><span className="font-semibold">{a.agentName}</span></div></td>
                  <td className="p-3 font-mono text-[var(--text-muted)]">v{a.version}</td>
                  <td className="p-3 text-right font-mono text-[var(--success)]">{accuracy}%</td>
                  <td className="p-3 text-right font-mono">{recall}%</td>
                  <td className="p-3 text-right font-mono">{a.p95Ms}ms</td>
                  <td className="p-3 text-right font-mono">{tokens}</td>
                  <td className="p-3 text-right"><span className="inline-flex items-center gap-1 text-amber-500"><Star className="h-3.5 w-3.5 fill-current" />{a.rating}</span></td>
                  <td className="p-3 text-right font-mono">{a.calls.toLocaleString()}</td>
                  <td className="p-3"><Badge tone={statusTone as any} className="text-[10px]">{statusLabel}</Badge></td>
                  <td className="p-3 text-right"><button onClick={() => setSelectedEvaluation(a)} className="rounded-md px-2 py-1 text-xs text-[var(--brand)] hover:bg-[var(--brand-light)]">查看报告</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]"><span>显示 {visibleEvaluations.length ? 1 : 0}-{visibleEvaluations.length} / 共 {evaluations.length} 个评测批次</span><button onClick={() => setShowAllEvaluations((value) => !value)} className="text-[var(--brand)] hover:underline">{showAllEvaluations ? '收起列表' : '查看全部评测'}</button></div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div><div className="text-sm font-semibold flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-[var(--brand)]" />评分趋势</div><div className="mt-1 text-xs text-[var(--text-muted)]">对比版本在最近 30 天的质量评分变化</div></div>
          <Badge tone="info" className="text-[10px]">最近 30 天</Badge>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/45 p-3">
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={INITIAL_TREND_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={[3, 5]} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(15,23,42,0.08)' }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="a" name="故障自愈 v1.4.2" stroke="var(--brand)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="b" name="故障自愈 v1.4.1" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>

      <NewEvalModal open={localNewEvalOpen} onClose={() => setLocalNewEvalOpen(false)} onSubmit={submitEval} />
      <ModalX open={!!selectedEvaluation} onClose={() => setSelectedEvaluation(null)} title="评测报告" size="md" footer={<Button onClick={() => setSelectedEvaluation(null)}>关闭</Button>}>
        {selectedEvaluation && <div className="space-y-4"><div className="flex items-start justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div><div className="text-[15px] font-semibold">{selectedEvaluation.agentName}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{selectedEvaluation.name} · v{selectedEvaluation.version}</div></div><Badge tone={selectedEvaluation.status === 'champion' ? 'success' : 'warn'} className="text-[10px]">{selectedEvaluation.status === 'champion' ? '质量领先' : '待复核'}</Badge></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-xs text-[var(--text-muted)]">准确率</div><div className="mt-1 text-xl font-mono font-semibold text-[var(--success)]">{selectedEvaluation.accuracy}%</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-xs text-[var(--text-muted)]">召回率</div><div className="mt-1 text-xl font-mono font-semibold">{selectedEvaluation.recall}%</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-xs text-[var(--text-muted)]">P95 延迟</div><div className="mt-1 text-xl font-mono font-semibold">{selectedEvaluation.p95Ms}ms</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-xs text-[var(--text-muted)]">测试用例</div><div className="mt-1 text-xl font-mono font-semibold">{selectedEvaluation.totalCases}</div></div></div><div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 text-xs text-[var(--text-muted)]">数据集：{selectedEvaluation.dataset} · 评测模型：{selectedEvaluation.judgeModel} · 完成时间：{selectedEvaluation.passedAt}</div></div>}
      </ModalX>
      <ModalX open={!!qualityAction} onClose={() => setQualityAction(null)} title={qualityAction === 'review' ? '提交质量复核' : '生成发布申请材料'} size="sm" footer={<><Button variant="ghost" onClick={() => setQualityAction(null)}>取消</Button><Button onClick={() => { setQualityAction(null); setReleaseNotice(qualityAction === 'review' ? '质量复核已提交，等待审核人处理' : '发布申请材料已生成，请在我的智能体详情中提交'); }}>确认</Button></>}>
        <div className="space-y-3 text-sm"><div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="font-medium">{qualityAction === 'review' ? '确认提交当前质量门禁结果？' : '确认生成发布申请材料？'}</div><div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{qualityAction === 'review' ? '提交后将由审核人复核风险策略、评测结论和审批记录。' : '材料将包含最新评测报告、版本信息和风险检查结果。'}</div></div></div>
      </ModalX>
    </div>
  );
}

/* ==================== 监控视图 ==================== */

function MonitorView({ agents, alerts, liveCalls }: { agents: AgentFull[]; alerts: AlertRow[]; liveCalls: LiveCallRow[] }) {
  const liveData = useMemo(() => TREND_FULL.map((d) => ({ ...d, t: `${d.t}` })), []);
  const totalCalls = liveData.reduce((s, d) => s + d.calls, 0);
  const avgLatency = Math.round(liveData.reduce((s, d) => s + d.latency, 0) / liveData.length);
  const errorRate = (liveData.reduce((s, d) => s + d.errors, 0) / totalCalls * 100).toFixed(2);

  // 告警列表 state（纯前端交互）
  const [alertList, setAlertList] = useState<AlertRow[]>(alerts);
  const [alertPage, setAlertPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditFilter, setAuditFilter] = useState<'all' | 'error'>('all');
  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);
  const [selectedCall, setSelectedCall] = useState<LiveCallRow | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<{ name: string; desc: string; status: string; tone: 'success' | 'warn' } | null>(null);
  const [exportNotice, setExportNotice] = useState(false);
  useEffect(() => setAlertList(alerts), [alerts]);
  const ackAlert = (id: string) => setAlertList((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));
  const openAlerts = alertList.filter((alert) => !alert.acknowledged).length;
  const activeAgents = agents.filter((a) => a.status === 'installed').length;
  const failedCalls = liveCalls.filter((call) => call.status !== 'ok').length;
  const pageSize = 5;
  const alertTotalPages = Math.max(1, Math.ceil(alertList.length / pageSize));
  const visibleAlerts = alertList.slice((alertPage - 1) * pageSize, alertPage * pageSize);
  const filteredAudit = liveCalls.filter((call) => auditFilter === 'all' || call.status !== 'ok');
  const auditTotalPages = Math.max(1, Math.ceil(filteredAudit.length / pageSize));
  const visibleAudit = filteredAudit.slice((auditPage - 1) * pageSize, auditPage * pageSize);
  useEffect(() => { if (alertPage > alertTotalPages) setAlertPage(alertTotalPages); }, [alertPage, alertTotalPages]);
  useEffect(() => { if (auditPage > auditTotalPages) setAuditPage(auditTotalPages); }, [auditPage, auditTotalPages]);
  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 bg-[var(--bg-elevated)]/30">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="实时调用" value={totalCalls.toFixed(0)} sub="次/小时" tone="brand" icon={Zap} size="comfortable" />
        <KpiCard label="平均延迟" value={avgLatency} sub="ms" tone="info" icon={Clock} size="comfortable" />
        <KpiCard label="错误率" value={errorRate} sub="%" tone="error" icon={AlertOctagon} size="comfortable" />
        <KpiCard label="Token 消耗" value={(totalCalls * 480 / 1000).toFixed(1)} sub="K" tone="warn" icon={Hash} size="comfortable" />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--brand)]" />治理健康度</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">面向生产运营的智能体运行状态与治理待办</p>
          </div>
          <Badge tone={openAlerts > 0 ? 'warn' : 'success'} className="text-[10px]">{openAlerts > 0 ? '需要关注' : '运行正常'}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-h-[108px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--success)]/40"><div className="flex items-center justify-between"><div className="text-[13px] font-medium text-[var(--text-secondary)]">生产中智能体</div><Activity className="h-4 w-4 text-[var(--success)]" /></div><div className="mt-2 text-2xl font-mono font-semibold text-[var(--success)]">{activeAgents}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">个</span></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">当前处于可调用状态</div></div>
          <div className="min-h-[108px] rounded-xl border border-[var(--warning)]/25 bg-[var(--warning-bg)]/30 p-4 transition-colors hover:border-[var(--warning)]/45"><div className="flex items-center justify-between"><div className="text-[13px] font-medium text-[var(--text-secondary)]">未确认告警</div><AlertTriangle className="h-4 w-4 text-[var(--warning)]" /></div><div className="mt-2 text-2xl font-mono font-semibold text-[var(--warning)]">{openAlerts}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">项</span></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">需要运营人员关注</div></div>
          <div className="min-h-[108px] rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-bg)]/30 p-4 transition-colors hover:border-[var(--danger)]/45"><div className="flex items-center justify-between"><div className="text-[13px] font-medium text-[var(--text-secondary)]">异常调用</div><AlertOctagon className="h-4 w-4 text-[var(--danger)]" /></div><div className="mt-2 text-2xl font-mono font-semibold text-[var(--danger)]">{failedCalls}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">次</span></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">失败或超时调用</div></div>
          <div className="min-h-[108px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--text-muted)]"><div className="flex items-center justify-between"><div className="text-[13px] font-medium text-[var(--text-secondary)]">策略覆盖率</div><ShieldCheck className="h-4 w-4 text-[var(--brand)]" /></div><div className="mt-2 text-2xl font-mono font-semibold text-[var(--brand)]">96<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">%</span></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">已纳入治理策略</div></div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-[var(--brand)]" />实时调用 / 错误率（最近 60 分钟）</div>
          <Badge tone="success" className="text-[9px]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse mr-1" />LIVE</Badge>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={liveData}>
            <defs>
              <linearGradient id="grad-calls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-err" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={9} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
            <Tooltip contentStyle={{ fontSize: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }} />
            <Area type="monotone" dataKey="calls" name="调用" stroke="var(--brand)" fill="url(#grad-calls)" strokeWidth={2} />
            <Area type="monotone" dataKey="errors" name="错误" stroke="var(--danger)" fill="url(#grad-err)" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />异常告警
            <Badge tone="warn" className="text-[10px] ml-1">{alertList.filter((a) => !a.acknowledged).length}</Badge>
          </div>
          <button
            onClick={() => setAlertList((prev) => prev.map((a) => ({ ...a, acknowledged: true })))}
            disabled={alertList.every((a) => a.acknowledged)}
            className="text-xs text-[var(--brand)] hover:underline disabled:text-[var(--text-muted)] disabled:no-underline disabled:cursor-not-allowed"
          >
            全部 ACK
          </button>
        </div>
      <div className="space-y-2">
          {visibleAlerts.map((a) => {
            const SeverityIcon = a.severity === 'error' ? AlertOctagon : a.severity === 'warn' ? AlertTriangle : Activity;
            const severityColor = a.severity === 'error' ? 'text-[var(--danger)]' : a.severity === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--info)]';
            return (
              <div key={a.id} className={cn('flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]', a.acknowledged && 'opacity-60')}>
                <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-1)]', severityColor)}><SeverityIcon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[var(--text)]">{a.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]"><span>{a.agent}</span><span>·</span><span className="font-mono">{a.ts}</span><Badge tone={a.severity === 'error' ? 'error' : a.severity === 'warn' ? 'warn' : 'info'} className="text-[10px]">{a.severity === 'error' ? '高风险' : a.severity === 'warn' ? '需关注' : '提示'}</Badge></div>
                </div>
                <div className="flex shrink-0 items-center gap-1"><button onClick={() => setSelectedAlert(a)} className="rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">详情</button><button onClick={() => ackAlert(a.id)} disabled={a.acknowledged} className={cn('rounded-md px-2.5 py-1.5 text-xs transition-colors', a.acknowledged ? 'cursor-not-allowed text-[var(--text-muted)]' : 'text-[var(--brand)] hover:bg-[var(--brand-light)]')}>{a.acknowledged ? '已确认' : '确认告警'}</button></div>
              </div>
            );
      })}
    </div>
        <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
          <span>{alertList.length ? `显示 ${(alertPage - 1) * pageSize + 1}-${Math.min(alertPage * pageSize, alertList.length)} / 共 ${alertList.length} 条` : '暂无告警'}</span>
          <div className="flex items-center gap-1"><button onClick={() => setAlertPage((page) => Math.max(1, page - 1))} disabled={alertPage === 1} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="min-w-[52px] text-center font-mono">{alertPage} / {alertTotalPages}</span><button onClick={() => setAlertPage((page) => Math.min(alertTotalPages, page + 1))} disabled={alertPage === alertTotalPages} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button></div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div><div className="flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-[var(--brand)]" />最近调用审计</div><div className="mt-1 text-xs text-[var(--text-muted)]">记录调用来源、执行结果与延迟，支持问题追溯</div></div>
          <div className="flex items-center gap-2"><div className="flex rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5"><button onClick={() => { setAuditFilter('all'); setAuditPage(1); }} className={cn('rounded px-2 py-1 text-xs', auditFilter === 'all' ? 'bg-[var(--surface-1)] font-medium text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]')}>全部</button><button onClick={() => { setAuditFilter('error'); setAuditPage(1); }} className={cn('rounded px-2 py-1 text-xs', auditFilter === 'error' ? 'bg-[var(--surface-1)] font-medium text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]')}>异常</button></div><button onClick={() => setExportNotice(true)} className="text-xs text-[var(--brand)] hover:underline">导出审计记录</button></div>
        </div>
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full min-w-[620px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-xs">
            <thead className="bg-[var(--bg-elevated)] text-[11px] text-[var(--text-muted)]"><tr><th className="p-3 text-left font-medium">智能体</th><th className="p-3 text-left font-medium">时间</th><th className="p-3 text-left font-medium">来源</th><th className="p-3 text-right font-medium">延迟</th><th className="p-3 text-left font-medium">结果</th><th className="p-3 text-right font-medium">追溯</th></tr></thead>
            <tbody>{visibleAudit.length ? visibleAudit.map((call) => <tr key={call.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-hover)]"><td className="p-3"><div className="font-medium">{call.agent}</div><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{call.id}</div></td><td className="p-3 font-mono text-[var(--text-muted)]">{call.ts}</td><td className="p-3 text-[var(--text-secondary)]"><span className="rounded bg-[var(--bg-elevated)] px-1.5 py-1 text-[11px]">{call.channel.toUpperCase()}</span></td><td className="p-3 text-right font-mono">{call.latencyMs ? `${call.latencyMs}ms` : '—'}</td><td className="p-3"><Badge tone={call.status === 'ok' ? 'success' : 'error'} className="text-[10px]">{call.status === 'ok' ? '成功' : call.status === 'timeout' ? '超时' : '失败'}</Badge></td><td className="p-3 text-right"><button onClick={() => setSelectedCall(call)} className="rounded-md px-2 py-1 text-xs text-[var(--brand)] hover:bg-[var(--brand-light)]">查看详情</button></td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-xs text-[var(--text-muted)]">暂无符合条件的调用记录</td></tr>}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]"><span>共 {filteredAudit.length} 条记录</span><div className="flex items-center gap-1"><button onClick={() => setAuditPage((page) => Math.max(1, page - 1))} disabled={auditPage === 1} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="min-w-[52px] text-center font-mono">{auditPage} / {auditTotalPages}</span><button onClick={() => setAuditPage((page) => Math.min(auditTotalPages, page + 1))} disabled={auditPage === auditTotalPages} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button></div></div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--brand)]" />治理策略</div><div className="mt-1 text-xs text-[var(--text-muted)]">控制工具调用、数据访问和高风险操作的生产策略</div></div><Badge tone="success" className="text-[10px]">覆盖率 96%</Badge></div>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {[{ name: '高风险操作双签', desc: '写入、变更和删除动作需双人审批', status: '已启用', tone: 'success' as const }, { name: '工具调用沙箱', desc: '生产工具调用统一运行在 gVisor 沙箱', status: '已启用', tone: 'success' as const }, { name: '敏感数据脱敏', desc: '输出内容自动过滤账号、密钥和个人信息', status: '需补充', tone: 'warn' as const }, { name: '成本预算控制', desc: '按工作区限制 Token 与调用预算', status: '已启用', tone: 'success' as const }].map((policy) => <button key={policy.name} onClick={() => setSelectedPolicy(policy)} className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-left transition-colors hover:bg-[var(--bg-hover)]"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--surface-1)]"><ShieldCheck className={cn('h-4 w-4', policy.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--warning)]')} /></div><div className="min-w-0 flex-1"><div className="text-[13px] font-medium">{policy.name}</div><div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{policy.desc}</div></div><Badge tone={policy.tone} className="shrink-0 text-[10px]">{policy.status}</Badge></button>)}
        </div>
      </div>
      <ModalX open={!!selectedAlert} onClose={() => setSelectedAlert(null)} title="告警详情" size="sm" footer={<Button onClick={() => setSelectedAlert(null)}>关闭</Button>}>
        {selectedAlert && <div className="space-y-3 text-sm"><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"><div className="font-medium">{selectedAlert.title}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{selectedAlert.agent} · {selectedAlert.ts}</div></div><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-[var(--text-muted)]">告警类型</span><div className="mt-1 font-medium">{selectedAlert.type}</div></div><div><span className="text-[var(--text-muted)]">处理状态</span><div className="mt-1 font-medium">{selectedAlert.acknowledged ? '已确认' : '待处理'}</div></div></div><p className="text-xs leading-relaxed text-[var(--text-secondary)]">建议检查对应智能体的运行指标和最近调用审计，并在确认影响范围后进行处置。</p></div>}
      </ModalX>
      <ModalX open={!!selectedCall} onClose={() => setSelectedCall(null)} title="调用审计详情" size="sm" footer={<Button onClick={() => setSelectedCall(null)}>关闭</Button>}>
        {selectedCall && <div className="space-y-4 text-sm"><div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-1)] text-[var(--brand)]"><Activity className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-[15px] font-semibold">{selectedCall.agent}</div><div className="mt-1 font-mono text-xs text-[var(--text-muted)]">{selectedCall.id} · {selectedCall.ts}</div></div><Badge tone={selectedCall.status === 'ok' ? 'success' : 'error'} className="text-[10px]">{selectedCall.status === 'ok' ? '成功' : selectedCall.status === 'timeout' ? '超时' : '失败'}</Badge></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-xs text-[var(--text-muted)]">调用延迟</div><div className="mt-1 text-lg font-mono font-semibold">{selectedCall.latencyMs ? `${selectedCall.latencyMs}ms` : '—'}</div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><div className="text-xs text-[var(--text-muted)]">Token 消耗</div><div className="mt-1 text-lg font-mono font-semibold">{selectedCall.tokens.toLocaleString()}</div></div></div><div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="mb-2 text-xs font-semibold text-[var(--text)]">调用上下文</div><div className="divide-y divide-[var(--border)]"><Row size="comfortable" label="调用来源" value={selectedCall.channel.toUpperCase()} /><Row size="comfortable" label="执行时间" value={selectedCall.ts} /><Row size="comfortable" label="结果状态" value={selectedCall.status === 'ok' ? '成功' : selectedCall.status === 'timeout' ? '超时' : '失败'} /><Row size="comfortable" label="审计标识" value={<span className="font-mono text-xs">{selectedCall.id}</span>} /></div></div><div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-muted)]">该记录已纳入生产调用审计，可结合智能体、任务和告警记录进行问题追溯。</div></div>}
      </ModalX>
      <ModalX open={!!selectedPolicy} onClose={() => setSelectedPolicy(null)} title="治理策略详情" size="sm" footer={<Button onClick={() => setSelectedPolicy(null)}>关闭</Button>}>
        {selectedPolicy && <div className="space-y-3 text-sm"><div className="flex items-center gap-2"><ShieldCheck className={cn('h-5 w-5', selectedPolicy.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--warning)]')} /><span className="font-semibold">{selectedPolicy.name}</span><Badge tone={selectedPolicy.tone} className="text-[10px]">{selectedPolicy.status}</Badge></div><p className="text-xs leading-relaxed text-[var(--text-secondary)]">{selectedPolicy.desc}</p><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">策略命中记录、适用工作区和负责人将在接入策略中心后展示。</div></div>}
      </ModalX>
      <ModalX open={exportNotice} onClose={() => setExportNotice(false)} title="导出审计记录" size="sm" footer={<Button onClick={() => setExportNotice(false)}>完成</Button>}><div className="space-y-3 text-sm"><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">已生成当前筛选条件下的审计记录导出任务。</div><p className="text-xs text-[var(--text-muted)]">Mock 环境中导出文件以任务记录形式模拟，生产环境将生成带签名的审计文件。</p></div></ModalX>
    </div>
  );
}

/* ==================== 详情面板 ==================== */

function AgentDetailPanel({ agent, trendData, compare, compareTrendData, versions, rank, onClose, onCompareToggle, showCompare, tab, setTab, onConfigOpen, onRunOpen, onTestOpen, onPreviewOpen, onToolCfg, onABReportOpen, onLifecycle, onPromptSave, lifecyclePending }: {
  agent: AgentFull;
  trendData: { day: string; calls: number }[];
  compare?: AgentFull;
  compareTrendData: { day: string; calls: number }[];
  versions: AgentVersion[];
  rank: { rank: number; id: string; name: string; calls: number; change: number }[];
  onClose: () => void;
  onCompareToggle: () => void;
  showCompare: boolean;
  tab: 'meta' | 'prompt' | 'tools' | 'versions' | 'monitor';
  setTab: (t: any) => void;
  onConfigOpen: () => void;
  onRunOpen: () => void;
  onTestOpen: () => void;
  onPreviewOpen: () => void;
  onToolCfg: (key: string) => void;
  onABReportOpen: () => void;
  onLifecycle: (action: 'install' | 'uninstall' | 'enable' | 'disable' | 'publish') => void;
  onPromptSave: (prompt: string) => void;
  lifecyclePending: boolean;
}) {
  const statusTone = agent.status === 'installed' ? 'success' : agent.status === 'deprecated' ? 'error' : 'neutral';
  const statusLabel = agent.status === 'installed' ? '已启用' : (agent as any).lifecycleStatus === 'pending_review' ? '待评测' : agent.status === 'available' ? '待配置' : agent.status === 'beta' ? '测试中' : '已弃用';
  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-6 py-5">
        <div className="flex items-start gap-2 min-w-0">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--brand)]">
            <Bot className="h-[22px] w-[22px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold truncate text-[var(--text)]">{agent.name}</span>
              <Badge tone={statusTone as any} className="text-[11px]">{statusLabel}</Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <span>{agent.category}</span><span className="text-[var(--border-strong)]">·</span><span className="font-mono">v{agent.version}</span><span className="text-[var(--border-strong)]">·</span><span>风险 {(agent as any).riskLevel ?? 'L1'}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭详情" className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          <Button size="sm" variant="secondary" disabled={lifecyclePending} loading={lifecyclePending} onClick={() => onLifecycle(agent.status === 'installed' ? 'disable' : 'install')}>
            {agent.status === 'installed' ? <Pause className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}{agent.status === 'installed' ? '停用' : '安装'}
          </Button>
          <Button size="sm" variant="outline" disabled={lifecyclePending || agent.status !== 'installed'} onClick={() => onLifecycle('publish')}>申请发布</Button>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onConfigOpen}><Settings className="h-3.5 w-3.5" />配置</Button>
          <Button size="sm" onClick={onRunOpen}><Play className="h-3.5 w-3.5" />运行</Button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <KpiMini size="comfortable" className="min-h-[72px] bg-[var(--surface-1)] shadow-[0_2px_8px_rgba(15,23,42,0.04)]" label="调用量" value={`${(agent.installCount / 1000).toFixed(1)}k`} />
          <KpiMini size="comfortable" className="min-h-[72px] bg-[var(--surface-1)] shadow-[0_2px_8px_rgba(15,23,42,0.04)]" label="P95 延迟" value={`${agent.p95Ms}ms`} />
          <KpiMini size="comfortable" className="min-h-[72px] bg-[var(--surface-1)] shadow-[0_2px_8px_rgba(15,23,42,0.04)]" label="质量评分" value={`${agent.rating}/5`} />
        </div>
      </div>

      <div className="agent-detail-tabs flex border-b border-[var(--border)] bg-[var(--bg-elevated)]/55 overflow-x-auto px-2">
        {([
          { k: 'meta', label: '概览', icon: FileText },
          { k: 'prompt', label: '行为定义', icon: Sparkles },
          { k: 'tools', label: '工具与权限', icon: Wrench },
          { k: 'versions', label: '版本与发布', icon: History },
          { k: 'monitor', label: '运行监控', icon: Activity },
        ] as const).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cn('relative flex items-center gap-1.5 rounded-t-lg px-4 py-3.5 text-[13px] whitespace-nowrap transition-colors', tab === t.k ? 'bg-[var(--brand-light)]/45 text-[var(--brand)] font-semibold after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]')}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--bg-elevated)]/25 p-6 space-y-5 text-sm">
        {tab === 'meta' && <MetaTab agent={agent} />}
        {tab === 'prompt' && <PromptTab agent={agent} onTestOpen={onTestOpen} onPreviewOpen={onPreviewOpen} onSave={onPromptSave} />}
        {tab === 'tools' && <ToolsTab agent={agent} onToolCfg={onToolCfg} />}
        {tab === 'versions' && <VersionsTab versions={versions} />}
        {tab === 'monitor' && <MonitorTab agent={agent} trendData={trendData} compare={compare} compareTrendData={compareTrendData} showCompare={showCompare} />}
      </div>

    </>
  );
}

function MetaTab({ agent }: { agent: AgentFull }) {
  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><FileText className="h-4 w-4 text-[var(--brand)]" />资产信息</div>
        <div className="divide-y divide-[var(--border)]">
          <Row size="comfortable" label="名称" value={agent.name} />
          <Row size="comfortable" label="分类" value={<Badge tone="info" className="text-[10px]">{agent.category}</Badge>} />
          <Row size="comfortable" label="版本" value={<span className="font-mono">v{agent.version}</span>} />
          <Row size="comfortable" label="风险等级" value={<Badge tone={RISK_TONE[(agent as any).riskLevel ?? 'L1']} className="text-[10px]">{(agent as any).riskLevel ?? 'L1'}</Badge>} />
          <Row size="comfortable" label="负责人" value={(agent as any).owner ?? '未分配'} />
          <Row size="comfortable" label="所属工作区" value={(agent as any).workspace ?? '未指定'} />
          <Row size="comfortable" label="质量评分" value={<span className="inline-flex items-center gap-1 text-amber-500"><Star className="h-3.5 w-3.5 fill-current" />{agent.rating} {((agent as any).ratingCount ? `(${(agent as any).ratingCount})` : '')}</span>} />
          <Row size="comfortable" label="当前状态" value={agent.status === 'installed' ? <Badge tone="success" className="text-[10px]">已启用</Badge> : <Badge tone="neutral" className="text-[10px]">可安装</Badge>} />
          <Row size="comfortable" label="配置状态" value={(agent as any).configStatus === 'configured' ? <Badge tone="success" className="text-[10px]">已完成</Badge> : <Badge tone="warn" className="text-[10px]">待配置</Badge>} />
          <Row size="comfortable" label="评测状态" value={(agent as any).evaluationStatus === 'passed' ? <Badge tone="success" className="text-[10px]">已通过</Badge> : <Badge tone="warn" className="text-[10px]">待评测</Badge>} />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><Gauge className="h-4 w-4 text-[var(--brand)]" />服务水平与性能</div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <KpiMini size="comfortable" label="SLA" value={`${(agent as any).sla ?? 99}%`} />
          <KpiMini size="comfortable" label="P95" value={`${agent.p95Ms}ms`} />
          <KpiMini size="comfortable" label="安装" value={agent.installCount.toLocaleString()} />
          <KpiMini size="comfortable" label="缓存" value={`${(agent as any).cacheHitRate ?? 32}%`} />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><Boxes className="h-4 w-4 text-[var(--brand)]" />能力与依赖</div>
        <div className="grid grid-cols-5 gap-2 text-xs">
          <KpiMini size="comfortable" label="工具" value={String((agent as any).capabilities?.tools ?? agent.tools.length)} />
          <KpiMini size="comfortable" label="MCP" value={String((agent as any).capabilities?.mcps ?? 0)} />
          <KpiMini size="comfortable" label="知识库" value={String((agent as any).capabilities?.knowledgeBases ?? 4)} />
          <KpiMini size="comfortable" label="技能" value={String((agent as any).capabilities?.skills ?? 0)} />
          <KpiMini size="comfortable" label="沙箱" value={String((agent as any).capabilities?.sandboxes ?? 1)} />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><ShieldCheck className="h-4 w-4 text-[var(--success)]" />合规与认证</div>
        <div className="flex flex-wrap gap-2">
          {((agent as any).certifications as string[] | undefined)?.map((c) => (
            <Badge key={c} tone="success" className="text-[9px]"><ShieldCheck className="mr-0.5 h-2.5 w-2.5" />{c}</Badge>
          )) ?? <span className="text-[10px] text-[var(--text-muted)]">未配置</span>}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><Lock className="h-4 w-4 text-[var(--warning)]" />访问权限</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {((agent as any).permissions as any ?? { canEdit: false, canApprove: false, canInvoke: true, canExport: false }).canEdit && <Badge tone="info" className="text-[9px]">编辑</Badge>}
          {((agent as any).permissions as any ?? {}).canApprove && <Badge tone="warn" className="text-[9px]">审批</Badge>}
          {((agent as any).permissions as any ?? { canInvoke: true }).canInvoke && <Badge tone="success" className="text-[9px]">调用</Badge>}
          {((agent as any).permissions as any ?? {}).canExport && <Badge tone="neutral" className="text-[9px]">导出</Badge>}
        </div>
      </div>

      <div>
        <div className="mb-3 text-[13px] font-semibold text-[var(--text)]">职责说明</div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">{agent.description}</div>
      </div>
    </>
  );
}

function PromptTab({ agent, onTestOpen, onPreviewOpen, onSave }: { agent: AgentFull; onTestOpen: () => void; onPreviewOpen: () => void; onSave: (prompt: string) => void }) {
  const [template, setTemplate] = useState((agent as any).promptTemplate ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />行为定义</div>
          <Badge tone="info" className="text-[10px]">v{agent.version}</Badge>
        </div>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={10}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs font-mono leading-relaxed resize-y outline-none focus:border-[var(--brand)]"
          placeholder="你是 ACME 的 {role}，负责 {responsibility}。&#10;&#10;## 上下文&#10;{context}&#10;&#10;## 输出&#10;{output_format}"
        />
        <div className="mt-2 text-xs text-[var(--text-muted)]">支持变量：<code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5">{'{var}'}</code>、<code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5">{'{{var}}'}</code></div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-[var(--brand)]" />输入变量</div>
        <div className="space-y-2">
          {[
            { name: 'role', type: 'enum', required: true, default: '故障自愈 Agent', options: ['故障自愈', '变更辅助', '威胁狩猎'], desc: 'Agent 角色定位' },
            { name: 'responsibility', type: 'string', required: true, default: '自动化故障定位与恢复', desc: '职责描述' },
            { name: 'context', type: 'string', required: false, default: '', desc: '运行时上下文（告警 / 资产 / 变更）' },
            { name: 'output_format', type: 'enum', required: false, default: 'markdown', options: ['markdown', 'json', 'table'], desc: '输出格式' },
          ].map((v) => (
            <div key={v.name} className="flex items-center gap-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
              <code className="font-mono font-semibold text-[var(--brand)]">{`{{${v.name}}}`}</code>
              <Badge tone="neutral" className="text-[10px]">{v.type}</Badge>
              {v.required && <Badge tone="error" className="text-[10px]">必填</Badge>}
              <span className="text-[var(--text-muted)] flex-1 truncate">默认: <span className="font-mono">{v.default}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onTestOpen}><Beaker className="h-3.5 w-3.5" />试运行</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={onPreviewOpen}><Eye className="h-3.5 w-3.5" />预览</Button>
        <Button size="sm" className="flex-1" onClick={() => { onSave(template); setSaved(true); setTimeout(() => setSaved(false), 1800); }}><Pencil className="h-3.5 w-3.5" />{saved ? '已保存' : '保存'}</Button>
      </div>
    </>
  );
}

function ToolsTab({ agent, onToolCfg }: { agent: AgentFull; onToolCfg: (key: string) => void }) {
  const [selectedCapabilityId, setSelectedCapabilityId] = useState('');
  const { data: workspaceCapabilities = [] } = useApiQuery<Skill[]>(['skills', 'agent-capability-picker'], '/api/skills');
  const { data: bindings = [] } = useApiQuery<CapabilityBinding[]>(['agents', agent.id, 'capabilities'], `/api/agents/${agent.id}/capabilities`);
  const { data: preflight } = useApiQuery<{ ready: boolean; checks: Array<{ key: string; label: string; passed: boolean }> }>(['agents', agent.id, 'publish-preflight'], `/api/agents/${agent.id}/publish-preflight`);
  const bindCapability = useApiMutation<CapabilityBinding, { capabilityKind: 'skill' | 'mcp' | 'tool'; capabilityId: string; pinnedVersion: string }>(() => `/api/agents/${agent.id}/capabilities`);
  const unbindCapability = useApiMutation<CapabilityBinding, { id: string }>(({ id }) => `/api/agents/${agent.id}/capabilities/${id}`, undefined, 'DELETE');
  const boundCapabilityIds = new Set(bindings.map((binding) => binding.capabilityId));
  const availableCapabilities = workspaceCapabilities.filter((capability) => !boundCapabilityIds.has(capability.id));

  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-[var(--text)]">发布就绪度</div><p className="mt-1 text-xs text-[var(--text-muted)]">发布前校验配置、评测、依赖和受限数据审批。</p></div><Badge tone={preflight?.ready ? 'success' : 'warn'}>{preflight?.ready ? '可发布' : '需处理'}</Badge></div>
        <div className="mt-3 grid grid-cols-2 gap-2">{(preflight?.checks ?? []).map((check) => <div key={check.key} className="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] px-2.5 py-2 text-xs"><span className={check.passed ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{check.passed ? '通过' : '待处理'}</span><span className="min-w-0 truncate">{check.label}</span></div>)}</div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5 text-[var(--brand)]" />已引用能力</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">工作区安装不等于可用。仅在此处绑定并固定版本的 Skill、MCP、Tool 才会进入该智能体的调用范围。</p>
          </div>
          <Badge tone="brand" className="shrink-0 text-[10px]">{bindings.length} 项</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {bindings.length === 0 ? <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 text-xs text-[var(--text-muted)]">尚未引用工作区能力</div> : bindings.map((binding) => {
            const capability = workspaceCapabilities.find((item) => item.id === binding.capabilityId);
            return <div key={binding.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs"><Badge tone={capability?.kind === 'mcp' ? 'success' : capability?.kind === 'tool' ? 'warn' : 'info'} className="text-[10px]">{(capability?.kind ?? binding.capabilityKind).toUpperCase()}</Badge><span className="min-w-0 flex-1 truncate font-medium">{capability?.name ?? binding.capabilityId}</span><span className="font-mono text-[10px] text-[var(--text-muted)]">v{binding.pinnedVersion}</span><button type="button" className="text-[var(--text-muted)] hover:text-[var(--danger)]" onClick={() => unbindCapability.mutate({ id: binding.id })}>移除</button></div>;
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <select value={selectedCapabilityId} onChange={(event) => setSelectedCapabilityId(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="">选择工作区能力</option>{availableCapabilities.map((capability) => <option key={capability.id} value={capability.id}>{capability.name} · {capability.kind.toUpperCase()} · v{capability.version}</option>)}</select>
          <Button size="sm" disabled={!selectedCapabilityId} loading={bindCapability.isPending} onClick={() => { const capability = workspaceCapabilities.find((item) => item.id === selectedCapabilityId); if (capability) bindCapability.mutate({ capabilityKind: capability.kind, capabilityId: capability.id, pinnedVersion: capability.version }, { onSuccess: () => setSelectedCapabilityId('') }); }}><Plus className="h-3.5 w-3.5" />引用</Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-[var(--brand)]" />工具与 MCP</div>
        <div className="space-y-2">
          {agent.tools.map((t) => (
            <div key={t} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold">{t}</span>
                <Badge tone="success" className="text-[10px]">自动</Badge>
                <Badge tone="info" className="text-[10px]"><Lock className="mr-0.5 h-2.5 w-2.5" />gVisor</Badge>
                <span className="ml-auto text-[11px] font-mono text-[var(--text-muted)]">2,450 次 / 24h</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <span>权限: 自动</span>
                <span>·</span>
                <span>沙箱: gVisor</span>
                <span>·</span>
                <span>P95: 80ms</span>
                <button onClick={() => onToolCfg(((agent as any).toolConfig ?? [])[0]?.key ?? 'default')} className="ml-auto text-[var(--brand)] hover:underline">配置</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-[var(--brand)]" />知识库绑定</div>
        <div className="space-y-2">
          {[
            { name: 'Redis 故障 Runbook v3.2', docs: 142, rerank: 'bge-reranker-large', cron: '0 2 * * *' },
            { name: 'CMDB 全量资产清单', docs: 8420, rerank: 'bge-reranker-large', cron: '0 4 * * *' },
            { name: 'K8s 运维手册 v2.1', docs: 87, rerank: 'bge-reranker-base', cron: '0 6 * * 0' },
          ].map((kb) => (
            <div key={kb.name} className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[10px]">
              <Database className="h-3 w-3 text-[var(--info)]" />
              <span className="font-semibold flex-1 truncate">{kb.name}</span>
              <span className="text-[var(--text-muted)] font-mono">{kb.docs} 文档</span>
              <span className="text-[var(--text-muted)] font-mono">{kb.rerank}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function VersionsTab({ versions }: { versions: AgentVersion[] }) {
  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2"><History className="h-4 w-4 text-[var(--brand)]" />版本历史</div>
        </div>
        <div className="space-y-2">
          {versions.length === 0 && <div className="rounded-lg bg-[var(--bg-elevated)] p-4 text-xs text-[var(--text-muted)]">暂无版本记录</div>}
          {versions.slice(0, 4).map((v) => (
            <div key={v.version} className={cn('rounded-lg border p-3 text-xs', v.status === 'current' ? 'border-[var(--brand)]/30 bg-[var(--brand-light)]/25' : 'border-[var(--border)] bg-[var(--bg-elevated)]')}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono font-semibold text-[13px]">v{v.version}</span>
                <Badge tone={v.type === 'major' ? 'error' : v.type === 'minor' ? 'warn' : 'neutral'} className="text-[10px]">{v.type}</Badge>
                <Badge tone={v.status === 'current' ? 'success' : v.status === 'beta' ? 'warn' : 'neutral'} className="text-[10px]">{v.status === 'current' ? '当前' : v.status === 'beta' ? '灰度' : v.status === 'deprecated' ? '废弃' : '稳定'}</Badge>
                <span className="ml-auto text-[var(--text-muted)] font-mono text-[11px]">{v.date}</span>
              </div>
              <ul className="space-y-1 text-xs leading-relaxed text-[var(--text-muted)]">
                {v.changelog.map((c, i) => <li key={i}>· {c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </>
  );
}

function MonitorTab({ agent, trendData, compare, compareTrendData, showCompare }: { agent: AgentFull; trendData: { day: string; calls: number }[]; compare?: AgentFull; compareTrendData: { day: string; calls: number }[]; showCompare: boolean }) {
  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center justify-between"><div className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[var(--brand)]" />7 天调用趋势{showCompare && compare && ' · 对比'}</div><span className="text-xs text-[var(--text-muted)]">调用次数</span></div>
        <div className="rounded-lg bg-[var(--bg-elevated)]/45 p-2"><ResponsiveContainer width="100%" height={170}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="grad-a" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-b" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--text-muted)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--text-muted)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8 }} />
            <Area type="monotone" dataKey="calls" name={agent.name} stroke="var(--brand)" fill="url(#grad-a)" strokeWidth={2} />
            {showCompare && compare && <Area type="monotone" dataKey="calls" name={compare.name} stroke="var(--text-muted)" fill="url(#grad-b)" strokeWidth={1.5} />}
          </AreaChart>
        </ResponsiveContainer></div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="mb-4 text-[13px] font-semibold text-[var(--text)]">实时指标</div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <KpiMini size="comfortable" label="今日调用" value={String((agent as any).todayCalls ?? 320)} />
          <KpiMini size="comfortable" label="错误率 24h" value={`${((agent as any).errorRate24h ?? 1.2).toFixed(2)}%`} />
          <KpiMini size="comfortable" label="P95" value={`${agent.p95Ms}ms`} />
          <KpiMini size="comfortable" label="Token" value="780" />
          <KpiMini size="comfortable" label="双签" value={String((agent as any).approvalCount ?? 1)} />
          <KpiMini size="comfortable" label="满意度" value={`${agent.rating}★`} />
        </div>
      </div>
    </>
  );
}

/* ==================== 通用组件 ==================== */

function EvalCard({ title, value, sub, icon: Icon, tone }: { title: string; value: any; sub?: string; icon: any; tone: 'success' | 'warn' | 'info' | 'error' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'info' ? 'text-[var(--info)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--danger)]';
  return (
    <div className="min-h-[88px] rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)] flex items-center gap-3">
      <div className={cn('grid h-9 w-9 place-items-center rounded-md bg-[var(--bg-elevated)]', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-[var(--text-muted)] font-semibold">{title}</div>
        <div className={cn('mt-1 text-2xl font-bold font-mono', color)}>{value} <span className="text-xs text-[var(--text-muted)] font-normal">{sub}</span></div>
      </div>
    </div>
  );
}

/* ==================== 新建 Agent Modal ==================== */

function ImportAgentModal({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (form: { name: string; category: string; risk: string; description: string; source: string; tools: string[]; mapping: { tools: string[]; mcp: string[] }; risks: string[] }) => void; loading?: boolean }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState('本地配置包');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('AIOps');
  const [risk, setRisk] = useState('L1');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [parseError, setParseError] = useState('');
  const [mapping, setMapping] = useState<{ tools: string[]; mcp: string[] }>({ tools: [], mcp: [] });
  const [risks, setRisks] = useState<string[]>([]);
  const submit = () => { if (!name.trim()) return; onSubmit({ name: name.trim(), category, risk, description: description || '待补充智能体职责说明', source: `${source}${reference ? ` · ${reference}` : ''}`, tools: mapping.tools, mapping, risks }); };
  const close = () => { setStep(1); onClose(); };
  const handlePackage = async (file?: File) => { if (!file) return; try { const parsed = parseOpenClawPackage(await file.text()); setName(parsed.name); setDescription(parsed.description); setReference(file.name); setMapping({ tools: parsed.tools, mcp: parsed.mcp }); setRisks(parsed.risks); setParseError(''); } catch { setParseError('无法解析配置包，请上传合法 JSON 格式的 OpenClaw 配置文件'); } };
  return (
    <ModalX open={open} onClose={close} title="导入智能体" size="md" footer={<><Button variant="ghost" onClick={close}>取消</Button>{step === 1 ? <Button disabled={!name.trim() || !reference.trim()} onClick={() => setStep(2)}>检查配置<ChevronRight className="h-3.5 w-3.5" /></Button> : <Button loading={loading} onClick={submit}><ShieldCheck className="h-3.5 w-3.5" />提交审核</Button>}</>}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"><span className={cn('rounded-full px-2 py-1', step === 1 ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)]')}>1 基本信息</span><span className="h-px flex-1 bg-[var(--border)]" /><span className={cn('rounded-full px-2 py-1', step === 2 ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg-elevated)]')}>2 兼容性检查</span></div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">导入后将进入“待审核”状态，完成依赖检查和评测后才能安装到生产环境。</div>
        {step === 2 ? <div className="space-y-3"><div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"><div className="text-sm font-semibold">{name}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{source}{reference ? ` · ${reference}` : ''} · {category} · 风险 {risk}</div></div><div className="space-y-2">{[{ label: '配置格式解析', status: '通过', tone: 'success' as const }, { label: `工具映射（${mapping.tools.length}）/ MCP（${mapping.mcp.length}）`, status: mapping.tools.length || mapping.mcp.length ? '需复核' : '待检查', tone: 'warn' as const }, { label: '风险与权限扫描', status: risks.length ? `${risks.length} 项需复核` : '通过', tone: risks.length ? 'warn' as const : 'success' as const }].map((check) => <div key={check.label} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-xs"><span className="flex items-center gap-2"><ShieldCheck className={cn('h-3.5 w-3.5', check.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--warning)]')} />{check.label}</span><Badge tone={check.tone} className="text-[10px]">{check.status}</Badge></div>)}</div><p className="text-xs leading-relaxed text-[var(--text-muted)]">提交后将生成导入审计记录，并由管理员完成权限和风险复核。</p></div> : <>
        <FormField label="导入来源">
          <div className="grid grid-cols-2 gap-2">{['本地配置包', 'OpenClaw 配置包', '企业 Git', '内部注册中心'].map((item) => <button key={item} onClick={() => setSource(item)} className={cn('rounded-md border px-3 py-2 text-xs transition-colors', source === item ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]')}>{item}</button>)}</div>
        </FormField>
        {(source === '本地配置包' || source === 'OpenClaw 配置包') && <FormField label="配置包文件 *"><input type="file" accept=".json,.jsonl,.yaml,.yml" onChange={(e) => handlePackage(e.target.files?.[0])} className="block w-full rounded-md border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text-muted)]" />{parseError && <div className="mt-1 text-xs text-[var(--danger)]">{parseError}</div>}<div className="mt-1 text-[11px] text-[var(--text-muted)]">当前支持 JSON 配置解析；YAML 文件需先转换为 JSON。</div></FormField>}
        <FormField label={source === '本地配置包' ? '配置包名称 *' : '仓库或注册中心地址 *'}>
          <input value={source === '本地配置包' ? name : reference} onChange={(e) => source === '本地配置包' ? setName(e.target.value) : setReference(e.target.value)} placeholder={source === '本地配置包' ? '例如：故障自愈智能体' : '输入受信任的企业来源地址'} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-[var(--brand)]" />
        </FormField>
        {source !== '本地配置包' && <FormField label="智能体名称 *"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="输入智能体名称" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-[var(--brand)]" /></FormField>}
        <div className="grid grid-cols-2 gap-3"><FormField label="业务领域"><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm"><option>AIOps</option><option>SecOps</option><option>DevOps</option><option>DataOps</option></select></FormField><FormField label="风险等级"><select value={risk} onChange={(e) => setRisk(e.target.value)} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm"><option>L0</option><option>L1</option><option>L2</option><option>L3</option></select></FormField></div>
        <FormField label="职责说明"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="说明智能体解决的问题和适用范围" className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" /></FormField>
      </>}
      </div>
    </ModalX>
  );
}

function CreateAgentModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit?: (form: any) => void }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'AIOps',
    risk: 'L1',
    description: '',
    prompt: '',
    tools: [] as string[],
    knowledge: [] as string[],
    sla: 99,
  });
  const { data: knowledgePackages = [] } = useApiQuery<KnowledgePackage[]>(['agent-create', 'knowledge-packages'], '/api/knowledge/packages');
  const publishedKnowledgePackages = knowledgePackages.filter((item) => item.status === 'published' && item.currentVersion.status === 'published');
  const handleCreate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setTimeout(() => {
      if (onSubmit) onSubmit(form);
      setSubmitting(false);
      setStep(1);
      setForm({ name: '', category: 'AIOps', risk: 'L1', description: '', prompt: '', tools: [], knowledge: [], sla: 99 });
      onClose();
    }, 600);
  };
  return (
    <Modal open={open} onClose={onClose} title={`新建 Agent · ${step}/4 步`} width={620} footer={
      <div className="flex w-full gap-2">
        <Button variant="secondary" size="sm" onClick={() => step > 1 ? setStep(step - 1) : onClose()}>上一步</Button>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
        {step < 4
          ? <Button size="sm" onClick={() => setStep(step + 1)}>下一步</Button>
          : <Button size="sm" onClick={handleCreate} disabled={submitting || !form.name.trim()}>{submitting ? '创建中…' : '创建'}</Button>}
      </div>
    }>
      <div className="space-y-3">
        {/* 步骤指示 */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={cn('h-1 flex-1 rounded-full', s <= step ? 'bg-[var(--brand)]' : 'bg-[var(--border)]')} />
          ))}
        </div>
        {step === 1 && (
          <>
            <FormField label="名称 *">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：日志异常检测" className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" autoFocus />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="分类">
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                  {CATEGORIES.filter((c) => c !== '全部').map((c) => <option key={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="风险等级">
                <select value={form.risk} onChange={(e) => setForm((f) => ({ ...f, risk: e.target.value }))} className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
                  <option>L0 - 只读</option>
                  <option>L1 - 低风险</option>
                  <option>L2 - 中风险</option>
                  <option>L3 - 高风险（写）</option>
                </select>
              </FormField>
            </div>
            <FormField label="描述">
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Agent 职责、适用场景..." rows={2} className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" />
            </FormField>
          </>
        )}
        {step === 2 && (
          <>
            <FormField label="Prompt 模板（支持 {var} 与 {{var}} 变量）">
              <textarea value={form.prompt} onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))} placeholder="你是 ACME 的 {role}，负责..." rows={6} className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-mono" />
            </FormField>
            <div className="grid grid-cols-3 gap-1.5">
              {['role', 'context', 'output_format'].map((v) => (
                <div key={v} className="rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-[10px]">
                  <code className="font-mono font-semibold text-[var(--brand)]">{`{{${v}}}`}</code>
                </div>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <FormField label="工具 / MCP">
              <div className="grid grid-cols-3 gap-1.5">
                {['redis-cli', 'kubectl', 'prometheus', 'loki-query', 'siem', 'jira', 'cmdb', 'argocd', 'mysql-cli'].map((t) => {
                  const on = form.tools.includes(t);
                  return (
                    <button key={t} onClick={() => setForm((f) => ({ ...f, tools: on ? f.tools.filter((x) => x !== t) : [...f.tools, t] }))} className={cn('rounded border p-1.5 text-[10px] font-mono flex items-center gap-1', on ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]')}>
                      {on ? <CheckCircle2 className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}{t}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <FormField label="知识库">
              <div className="space-y-1">
                {publishedKnowledgePackages.map((knowledgePackage) => {
                  const reference = `${knowledgePackage.name} · ${knowledgePackage.currentVersion.version}`;
                  const on = form.knowledge.includes(reference);
                  return (
                    <button key={knowledgePackage.id} onClick={() => setForm((f) => ({ ...f, knowledge: on ? f.knowledge.filter((x) => x !== reference) : [...f.knowledge, reference] }))} className={cn('flex w-full items-center gap-1.5 rounded border px-2 py-1 text-[10px]', on ? 'border-[var(--brand)] bg-[var(--brand-light)]/30' : 'border-[var(--border)] bg-[var(--bg)]')}>
                      <Database className="h-3 w-3 text-[var(--info)]" />
                      <span className="flex-1 text-left">{reference}<small className="ml-1 text-[var(--text-muted)]">{knowledgePackage.domain}</small></span>
                      {on && <CheckCircle2 className="h-3 w-3 text-[var(--brand)]" />}
                    </button>
                  );
                })}
                {publishedKnowledgePackages.length === 0 && <div className="rounded border border-dashed border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)]">暂无可引用知识包，请先在知识库中心完成发布。</div>}
              </div>
            </FormField>
          </>
        )}
        {step === 4 && (
          <>
            <FormField label="SLA 要求">
              <div className="grid grid-cols-3 gap-1.5">
                {[95, 99, 99.5, 99.9, 99.99].map((v) => (
                  <button key={v} onClick={() => setForm((f) => ({ ...f, sla: v }))} className={cn('rounded border p-2 text-[10px] font-mono', form.sla === v ? 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]' : 'border-[var(--border)] bg-[var(--bg)]')}>
                    {v}%
                  </button>
                ))}
              </div>
            </FormField>
            <div className="rounded-md border border-[var(--brand)]/30 bg-[var(--brand-light)]/30 p-3 text-[10px] space-y-1">
              <div className="font-semibold text-[var(--brand)]">配置摘要</div>
              <div>名称: <span className="font-mono">{form.name || '—'}</span></div>
              <div>分类: <span className="font-mono">{form.category}</span> · 风险: <span className="font-mono">{form.risk}</span></div>
              <div>工具: <span className="font-mono">{form.tools.length} 个</span> · 知识库: <span className="font-mono">{form.knowledge.length} 个</span></div>
              <div>SLA: <span className="font-mono">{form.sla}%</span></div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function CompareModal({ open, onClose, agents, active }: { open: boolean; onClose: () => void; agents: AgentFull[]; active?: AgentFull }) {
  const [aId, setAId] = useState(active?.id ?? agents[0]?.id ?? '');
  const [bId, setBId] = useState(agents[1]?.id ?? '');
  const a = agents.find((x) => x.id === aId);
  const b = agents.find((x) => x.id === bId);
  return (
    <Modal open={open} onClose={onClose} title="Agent 对比" width={720} footer={
      <div className="flex w-full gap-2">
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={onClose}>关闭</Button>
      </div>
    }>
      <div className="grid grid-cols-2 gap-3">
        <select value={aId} onChange={(e) => setAId(e.target.value)} className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
          {agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select value={bId} onChange={(e) => setBId(e.target.value)} className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm">
          {agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[a, b].map((x, i) => x ? (
          <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4 text-[var(--brand)]" />
              <span className="font-semibold">{x.name}</span>
              <Badge tone="brand" className="text-[9px]">v{x.version}</Badge>
            </div>
            <div className="space-y-1 text-[10px]">
              <Row label="评分" value={<span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{x.rating}</span>} />
              <Row label="分类" value={<Badge tone="info" className="text-[9px]">{x.category}</Badge>} />
              <Row label="SLA" value={`${x.sla ?? 99}%`} />
              <Row label="P95" value={`${x.p95Ms}ms`} />
              <Row label="缓存" value={`${(x as any).cacheHitRate ?? 32}%`} />
              <Row label="安装数" value={x.installCount.toLocaleString()} />
              <Row label="状态" value={x.status === 'installed' ? <Badge tone="success" className="text-[9px]">已启用</Badge> : <Badge tone="neutral" className="text-[9px]">未启用</Badge>} />
            </div>
            <div className="mt-2 flex flex-wrap gap-0.5">
              {x.tools.slice(0, 4).map((t) => <span key={t} className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] font-mono">{t}</span>)}
            </div>
          </div>
        ) : null)}
      </div>
    </Modal>
  );
}

/* ==================== 补全：6 个 Modal/Drawer 子组件 ==================== */

function NewEvalModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (form: { name: string; dataset: string; judgeModel: string; totalCases: number; splitPct: number }) => void }) {
  const [name, setName] = useState('新评测-W28');
  const [dataset, setDataset] = useState('incident-v3');
  const [judgeModel, setJudgeModel] = useState('gpt-4o');
  const [totalCases, setTotalCases] = useState(2000);
  const [splitPct, setSplitPct] = useState(50);
  return (
    <ModalX open={open} onClose={onClose} title="启动新评测 · 选择数据集与判官模型" size="md" footer={
      <>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={() => onSubmit({ name, dataset, judgeModel, totalCases, splitPct })}>启动</Button>
      </>
    }>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">批次名</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">数据集</label>
            <select value={dataset} onChange={(e) => setDataset(e.target.value)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
              <option value="incident-v3">incident-v3 (故障事件)</option>
              <option value="changeqa-v2">changeqa-v2 (变更问答)</option>
              <option value="threatbench-v1">threatbench-v1 (威胁检测)</option>
              <option value="sqlbench-v1">sqlbench-v1 (SQL 诊断)</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">判官模型</label>
            <select value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="claude-sonnet">claude-sonnet</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">用例数</label>
          <input type="number" value={totalCases} onChange={(e) => setTotalCases(Number(e.target.value))} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">流量分配 (A : B)</label>
          <div className="grid grid-cols-5 gap-1">
            {[10, 25, 50, 75, 90].map((p) => (
              <button key={p} onClick={() => setSplitPct(p)} className={cn('rounded-md border px-2 py-1 text-xs font-mono', splitPct === p ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)]')}>
                {p}/{100 - p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ModalX>
  );
}

function RunAgentBody({ agent, onComplete }: { agent?: AgentFull; onComplete: (r: { id: string; agentId: string; agent: string; ts: string; latencyMs: number; tokens: number; status: 'ok' | 'error' | 'timeout'; channel: 'api' | 'mcp' | 'cli' }) => void }) {
  const [task, setTask] = useState('请分析最近一周 P95 异常并给出建议');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ latencyMs: number; tokens: number } | null>(null);
  if (!agent) return <div className="text-sm text-[var(--text-muted)]">请先选择一个 Agent</div>;
  const run = () => {
    setRunning(true);
    setOutput(null);
    setMetrics(null);
    setTimeout(() => {
      const latency = 480 + Math.floor(Math.random() * 400);
      const tokens = 600 + Math.floor(Math.random() * 400);
      const isTimeout = latency > 800;
      const result = isTimeout
        ? '⛔ 调用超时（已超过 800ms 阈值），将自动降级到备份模型'
        : `✓ 完成。\n\n分析发现：\n1. 过去 7 天 P95 在周二/周四显著偏高（+24%）\n2. 主要原因：磁盘 IO 抖动 + 缓存命中率下降\n3. 建议：\n   - 扩容 IO 配额 30%\n   - 提高缓存命中率 (当前 78% → 目标 90%)\n   - 周二/周四设置巡检任务\n\n[基于 1247 条日志样本，已通过 4 个 RAG 引用校验]`;
      setOutput(result);
      setMetrics({ latencyMs: latency, tokens });
      setRunning(false);
      onComplete({
        id: `lc_${Date.now().toString(36)}`,
        agentId: agent.id,
        agent: agent.name,
        ts: '刚刚',
        latencyMs: latency,
        tokens,
        status: isTimeout ? 'timeout' : 'ok',
        channel: 'api',
      });
    }, 1800);
  };
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">任务描述</label>
        <textarea value={task} onChange={(e) => setTask(e.target.value)} className="w-full h-20 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs resize-none" />
      </div>
      <Button onClick={run} disabled={running} className="w-full">
        {running ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />运行中…</> : <><Play className="h-3.5 w-3.5" />立即执行（沙箱隔离）</>}
      </Button>
      {output && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
          <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">{output}</pre>
          {metrics && (
            <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              <span className="font-mono">延迟 {metrics.latencyMs}ms</span>
              <span className="font-mono">Token {metrics.tokens}</span>
              <Badge tone={metrics.latencyMs > 800 ? 'warn' : 'success'} className="text-[9px]">{metrics.latencyMs > 800 ? '超时降级' : '正常'}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PromptTestBody({ agent }: { agent?: AgentFull }) {
  const [vars, setVars] = useState<{ role: string; context: string; query: string }>({ role: '故障自愈 SRE', context: '内存 92% · 缓存命中 78%', query: '如何处理 Redis OOM？' });
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; turn: 'user' | 'assistant'; text: string }>>([]);
  if (!agent) return <div className="text-sm text-[var(--text-muted)]">请先选择 Agent</div>;
  const run = () => {
    setRunning(true);
    setHistory((prev) => [...prev, { id: `t_${Date.now()}`, turn: 'user', text: `[${vars.role}] ${vars.query} [${vars.context}]` }]);
    setTimeout(() => {
      setHistory((prev) => [...prev, { id: `r_${Date.now()}`, turn: 'assistant', text: `（基于 ${agent.name} v${agent.version}）\n建议按以下步骤处理：\n1. 立即执行 CONFIG SET volatile-lru 保持服务可用\n2. 在维护窗口扩容 memory 至 16GB\n3. 同步检查 [RAG: Runbook §3.1] 与 INC-019 历史记录` }]);
      setRunning(false);
    }, 1200);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">角色</label>
          <Input value={vars.role} onChange={(e) => setVars((v) => ({ ...v, role: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">上下文</label>
          <Input value={vars.context} onChange={(e) => setVars((v) => ({ ...v, context: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">问题</label>
        <Input value={vars.query} onChange={(e) => setVars((v) => ({ ...v, query: e.target.value }))} />
      </div>
      <Button onClick={run} disabled={running} className="w-full">
        {running ? '运行中…' : '发送'}
      </Button>
      <div className="max-h-48 overflow-y-auto space-y-2 border-t border-[var(--border)] pt-2">
        {history.length === 0 ? (
          <div className="text-[10px] text-[var(--text-muted)] text-center py-3">尚无对话</div>
        ) : (
          history.map((m) => (
            <div key={m.id} className={cn('rounded-md p-2 text-[11px]', m.turn === 'user' ? 'bg-[var(--brand-light)] text-[var(--text)]' : 'bg-[var(--bg-elevated)] text-[var(--text)]')}>
              <div className="text-[9px] text-[var(--text-muted)] mb-0.5 font-mono">{m.turn === 'user' ? 'USER' : 'ASSISTANT'}</div>
              <pre className="whitespace-pre-wrap font-mono">{m.text}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PromptPreviewBody({ agent }: { agent?: AgentFull }) {
  if (!agent) return <div className="text-sm text-[var(--text-muted)]">请先选择 Agent</div>;
  const content = agent.promptTemplate ?? '你是一个企业数字员工 Agent，职责是 {{role}}。\n\n# 上下文\n{{context}}\n\n# 任务\n{{query}}\n\n# 输出要求\n1. 引用 Runbook 章节\n2. 给出可执行步骤\n3. 风险点标注';
  const rendered = content.replace(/\{\{(\w+)\}\}/g, (_, k) => `[${k}]`);
  return (
    <div className="space-y-3">
      <pre className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
        {rendered}
      </pre>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[var(--text-muted)]">变量已替换为占位符 [name]，运行时会注入实际值</span>
        <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(rendered)}>
          <Copy className="h-3 w-3" />复制
        </Button>
      </div>
    </div>
  );
}

function ToolConfigBody() {
  const [permission, setPermission] = useState<'auto' | 'approval' | 'denied'>('auto');
  const [sandbox, setSandbox] = useState<'gvisor' | 'docker' | 'native'>('gvisor');
  const [callLimit, setCallLimit] = useState(1000);
  const [needSign, setNeedSign] = useState(false);
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">权限模式</label>
        <select value={permission} onChange={(e) => setPermission(e.target.value as any)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
          <option value="auto">自动执行</option>
          <option value="approval">需审批</option>
          <option value="denied">禁用</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">沙箱</label>
          <select value={sandbox} onChange={(e) => setSandbox(e.target.value as any)} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs">
            <option value="gvisor">gVisor runsc</option>
            <option value="docker">Docker</option>
            <option value="native">Native</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">24h 调用上限</label>
          <input type="number" value={callLimit} onChange={(e) => setCallLimit(Number(e.target.value))} className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs" />
        </div>
      </div>
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={needSign} onChange={(e) => setNeedSign(e.target.checked)} className="accent-[var(--brand)]" />
        <span className="text-xs">高风险操作需要双签</span>
      </label>
    </div>
  );
}

function ABReportBody({ agent }: { agent?: AgentFull }) {
  if (!agent) return <div className="text-sm text-[var(--text-muted)]">请先选择 Agent</div>;
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--brand)]/40 bg-[var(--brand-light)] p-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--brand)] font-semibold mb-1">显著性结论</div>
        <div className="text-sm font-semibold">版本 v1.4.2 vs v1.4.1</div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          p-value = 0.023 &lt; 0.05 → <strong className="text-[var(--success)]">v1.4.2 显著优于 v1.4.1</strong>（94.1% vs 89.8% 准确率）
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold mb-2">6 项关键指标对比</div>
        <table className="w-full text-xs">
          <thead className="text-[10px] text-[var(--text-muted)]">
            <tr><th className="text-left p-2">指标</th><th className="text-right p-2">v1.4.1 (B)</th><th className="text-right p-2">v1.4.2 (A)</th><th className="text-right p-2">Δ</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--border)]"><td className="p-2">准确率</td><td className="p-2 text-right font-mono">89.8%</td><td className="p-2 text-right font-mono text-[var(--success)]">92.4%</td><td className="p-2 text-right font-mono text-[var(--success)]">+2.6%</td></tr>
            <tr className="border-t border-[var(--border)]"><td className="p-2">召回率</td><td className="p-2 text-right font-mono">88.0%</td><td className="p-2 text-right font-mono text-[var(--success)]">90.1%</td><td className="p-2 text-right font-mono text-[var(--success)]">+2.1%</td></tr>
            <tr className="border-t border-[var(--border)]"><td className="p-2">P95 延迟</td><td className="p-2 text-right font-mono">640ms</td><td className="p-2 text-right font-mono text-[var(--success)]">580ms</td><td className="p-2 text-right font-mono text-[var(--success)]">-60ms</td></tr>
            <tr className="border-t border-[var(--border)]"><td className="p-2">Token/次</td><td className="p-2 text-right font-mono">840</td><td className="p-2 text-right font-mono">820</td><td className="p-2 text-right font-mono text-[var(--success)]">-20</td></tr>
            <tr className="border-t border-[var(--border)]"><td className="p-2">用户评分</td><td className="p-2 text-right font-mono">4.5</td><td className="p-2 text-right font-mono text-[var(--success)]">4.7</td><td className="p-2 text-right font-mono text-[var(--success)]">+0.2</td></tr>
            <tr className="border-t border-[var(--border)]"><td className="p-2">失败率</td><td className="p-2 text-right font-mono">1.2%</td><td className="p-2 text-right font-mono text-[var(--success)]">0.4%</td><td className="p-2 text-right font-mono text-[var(--success)]">-0.8%</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">样本与置信</div>
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <span>N = 2400 用例 / 2 个版本</span>
          <span>·</span>
          <span>95% CI [1.4%, 3.8%]</span>
        </div>
      </div>
    </div>
  );
}
