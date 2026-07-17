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
import { useApiQuery } from '@/services/query';
import { Badge, Button, Modal, Avatar, Input, KpiCard, KpiMini, Row, FilterGroup, FilterRadio, ChipBtn, Section, FormField, CollapsedPanelHandle } from '@de/web-ui';
import {
  Bot, Star, Download, Settings, Plus, X, Zap, ShieldCheck, Sparkles, GitCompare,
  TrendingUp, History, Award, Tag as TagIcon, CheckCircle2, Filter, Search, ChevronRight,
  ChevronLeft, Activity, Wrench, Database, Lock, Cpu, BarChart3, MessageSquare,
  ChevronDown, AlertTriangle, FileText, RefreshCw, Play, Pause, Network, Copy,
  Layers, ArrowRight, Send, Beaker, Gauge, AlertOctagon, Clock, Hash, Eye, Pencil,
  Server, Boxes, FlaskConical, Monitor, LineChart as LineIcon, Brain,
  Users, Archive, RotateCcw,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, Line, LineChart, PieChart, Pie, Cell, Legend } from 'recharts';
import { cn } from '@de/web-utils';
import type { Agent } from '@de/web-types';
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
  { key: 'agents', label: '智能体', icon: Bot },
  { key: 'evaluate', label: '评测', icon: FlaskConical },
  { key: 'monitor', label: '监控', icon: Monitor },
] as const;
type MainTab = typeof MAIN_TABS[number]['key'];

const AGENT_SUB_TABS = [
  { key: 'installed', label: '已安装', icon: CheckCircle2 },
  { key: 'store', label: '商店', icon: Download },
  { key: 'shared', label: '共享', icon: Users },
  { key: 'archived', label: '已归档', icon: Archive },
] as const;

const RISK_TONE: Record<string, 'success' | 'info' | 'warn' | 'error'> = {
  L0: 'success', L1: 'info', L2: 'warn', L3: 'error',
};

const CATEGORIES = ['全部', 'AIOps', 'SecOps', 'DevOps', 'DataOps', 'BizOps'] as const;
const STATUS_FILTERS = ['全部', '已启用', '已停用', '有更新'] as const;
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
  const [detailTab, setDetailTab] = useState<'meta' | 'prompt' | 'tools' | 'versions' | 'monitor'>('meta');
  const [compareOpen, setCompareOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // 补全（10 按钮接 handler）：
  // 视图切换（行 286-287）
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // 评测 / 监控 / 运行 / 配置 / A/B 报告 / 等
  const [newEvalOpen, setNewEvalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toolCfg, setToolCfg] = useState<{ open: boolean; toolKey: string | null }>({ open: false, toolKey: null });
  const [abReportOpen, setAbReportOpen] = useState(false);
  // 数据层 state
  const [evaluations, setEvaluations] = useState<any[]>(INITIAL_EVALUATIONS);
  const [liveCalls, setLiveCalls] = useState<any[]>(INITIAL_LIVE_CALLS);
  const [alerts, setAlerts] = useState<any[]>(INITIAL_ALERTS);
  const { data: evalQ } = useApiQuery<any[]>(['evaluations'], '/api/evaluations');
  const { data: alertsQ } = useApiQuery<any[]>(['agents', 'alerts'], '/api/agents/alerts');
  const { data: callsQ } = useApiQuery<any[]>(['agents', 'liveCalls'], '/api/agents/calls/live');
  useEffect(() => { if (evalQ && evalQ.length) setEvaluations(evalQ); }, [evalQ]);
  useEffect(() => { if (alertsQ && alertsQ.length) setAlerts(alertsQ); }, [alertsQ]);
  useEffect(() => { if (callsQ && callsQ.length) setLiveCalls(callsQ); }, [callsQ]);

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
    <div className="agents-page h-full min-w-0 overflow-y-auto overscroll-contain bg-[var(--bg-elevated)]">
      {/* ============ 左侧筛选栏（可折叠） ============ */}
      <section className="mx-auto min-w-0 w-full max-w-[1680px] bg-[var(--bg)]">
        {/* 顶栏 */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold flex items-center gap-2">
                {mainTab === 'evaluate' ? (
                  <FlaskConical className="h-4 w-4 text-[var(--info)]" />
                ) : mainTab === 'monitor' ? (
                  <Monitor className="h-4 w-4 text-[var(--warning)]" />
                ) : (
                  <Bot className="h-4 w-4 text-[var(--brand)]" />
                )}
                {mainTab === 'evaluate' ? '评测中心' : mainTab === 'monitor' ? '运行监控' : '智能体控制台'}
                <Badge tone="brand" className="text-[9px]">企业版</Badge>
              </h1>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                {mainTab === 'evaluate'
                  ? `12 评测批次 · 3 进行中 · 平均准确率 ${INITIAL_EVALUATIONS.length > 0 ? Math.round(INITIAL_EVALUATIONS.reduce((s, e) => s + e.accuracy, 0) / INITIAL_EVALUATIONS.length * 10) / 10 : 0}% · 满意度 4.6★`
                  : mainTab === 'monitor'
                  ? `8 Provider 运行中 · 1 高优告警 · 平均 P95 ${Math.round(TREND_FULL.reduce((s, d) => s + d.latency, 0) / TREND_FULL.length)}ms · 0 异常`
                  : `${kpis.total} Agent · ${kpis.installed} 已启用 · ${kpis.totalCalls.toLocaleString()} 累计调用 · SLA ${kpis.avgRating}★`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {mainTab !== 'monitor' && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setCompareOpen(true)} className="hidden md:inline-flex">
                  <GitCompare className="h-3.5 w-3.5" />对比
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)} className="hidden md:inline-flex">
                  <Sparkles className="h-3.5 w-3.5" />从模板
                </Button>
              </>
            )}
            {mainTab === 'agents' && (
              <Button size="sm" variant="outline" onClick={() => setShowDetails(true)} disabled={!active} className="hidden sm:inline-flex">
                <Eye className="h-3.5 w-3.5" />详情
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />{mainTab === 'monitor' ? '新增' : '新建'}
            </Button>
          </div>
        </div>

        {/* ============ 顶部筛选条（先于模块/视图 Tab） ============ */}
        {mainTab === 'agents' && (
          <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[180px] flex-1 max-w-[260px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="搜索 名称 / 工具 / 描述"
                  className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] pl-7 pr-2 text-xs outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-light)]"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-1">分类</span>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] transition-colors whitespace-nowrap',
                      cat === c
                        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                        : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                    )}
                  >
                    {c} <span className="ml-0.5 font-mono opacity-70">({c === '全部' ? agents.length : agents.filter((a) => a.category === c).length})</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-1">评分</span>
                {RATING_FILTERS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRating(r)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] font-mono transition-colors',
                      rating === r ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-1">状态</span>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] transition-colors',
                      status === s ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                    )}
                  >
                    {s} <span className="ml-0.5 font-mono opacity-70">({s === '全部' ? agents.length : s === '已启用' ? agents.filter((a) => a.status === 'installed').length : s === '有更新' ? 2 : 0})</span>
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setCat('全部'); setStatus('全部'); setRating('全部'); setTagFilter(null); setSearchQ(''); }}
                  className="ml-auto rounded-md border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-2 py-1 text-[11px] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />重置 ({activeFilterCount})
                </button>
              )}
            </div>
            {allTags.length > 0 && (
              <div className="mt-2 flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mt-1">能力</span>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setTagFilter(null)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-mono transition-colors',
                      !tagFilter ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                    )}
                  >
                    全部
                  </button>
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagFilter(tagFilter === t ? null : t)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-mono transition-colors',
                        tagFilter === t ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--bg)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--brand)]',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ 顶部模块 Tab + 视图子 Tab（视图仅智能体模块下显示） ============ */}
        <div className="border-b border-[var(--border)] bg-[var(--bg)] px-5 pt-3">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-2">模块</span>
            {MAIN_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setMainTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs transition-colors',
                  mainTab === t.key
                    ? 'bg-[var(--surface-1)] border border-[var(--border)] border-b-[var(--surface-1)] text-[var(--text)] font-semibold -mb-px'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
          {mainTab === 'agents' && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5 pl-4">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-2">视图</span>
              {AGENT_SUB_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAgentSubTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                    agentSubTab === t.key
                      ? 'bg-[var(--brand)] text-white border border-[var(--brand)]'
                      : 'bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--brand)]',
                  )}
                >
                  <t.icon className="h-3 w-3" />
                  {t.label}
                  <span className="font-mono opacity-70 text-[10px]">
                    {t.key === 'installed' ? agents.filter((a) => a.status === 'installed').length : t.key === 'store' ? agents.filter((a) => a.status !== 'installed').length : 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* KPI 矩阵 */}
        {mainTab === 'agents' && (
          <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 px-5 py-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <KpiCard label="总 Agent" value={kpis.total} sub="个" tone="brand" icon={Bot} />
              <KpiCard label="已启用" value={kpis.installed} sub="个" tone="success" icon={CheckCircle2} />
              <KpiCard label="累计调用" value={kpis.totalCalls.toLocaleString()} sub="次" tone="info" icon={Zap} />
              <KpiCard label="平均评分" value={kpis.avgRating} sub="★" tone="warn" icon={Star} />
              <KpiCard label="平均 P95" value={kpis.avgP95} sub="ms" tone="info" icon={Activity} />
            </div>
          </div>
        )}

        {/* 批量操作栏（选中时）— 简化版 */}
        {mainTab === 'agents' && (
          <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-5 py-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">{filtered.length} 个结果</span>
            <span>·</span>
            <span>显示 AIOps / SecOps / DevOps</span>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[10px]">视图</span>
              <button className="grid h-6 w-6 place-items-center rounded bg-[var(--bg)] text-[var(--text)]"><Layers className="h-3 w-3" /></button>
              <button className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--bg)]"><ListChecks className="h-3 w-3" /></button>
            </div>
          </div>
        )}

        {/* 主视图 */}
        <div>
          {mainTab === 'agents' ? (
            <>
              <AgentGridView agents={filtered} onSelect={setActiveId} activeId={activeId} agentSubTab={agentSubTab} />
            </>
          ) : mainTab === 'evaluate' ? <EvaluateView agents={agents} active={active} compare={compare} /> : <MonitorView agents={agents} />}
        </div>
      </section>

      {/* ============ 按需打开的 Agent 详情 ============ */}
      <Drawer
        open={showDetails && !!active}
        onClose={() => setShowDetails(false)}
        title={active ? `${active.name} · Agent 详情` : 'Agent 详情'}
        description="配置、能力、版本、运行和监控信息"
        width={520}
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
          />
        ) : <EmptyState icon={Bot} title="选择 Agent 查看详情" />}
      </Drawer>

      {/* ============ 新建 Agent Modal ============ */}
      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(form) => {
          const id = `usr_${Math.random().toString(36).slice(2, 8)}`;
          setEvaluations((prev) => [
            {
              id: `e_usr_${Math.random().toString(36).slice(2, 8)}`,
              name: `${form.name}-初评`,
              agentId: id,
              agentName: form.name,
              version: '0.1.0',
              totalCases: 200,
              accuracy: 0,
              recall: 0,
              p95Ms: 0,
              tokensPerCall: 0,
              rating: 0,
              calls: 0,
              status: 'baseline',
              passedAt: new Date().toISOString(),
              dataset: 'pending',
              judgeModel: 'pending',
            },
            ...prev,
          ]);
          alert(`✓ Agent "${form.name}" 创建成功\n已自动创建基线评测（200 用例）`);
        }}
      />

      {/* ============ 对比 Modal ============ */}
      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} agents={agents} active={active} />

      {/* ============ 新增的 Modal：NewEval / Run / PromptTest / Preview / ToolCfg / ABReport ============ */}
      <NewEvalModal
        open={newEvalOpen}
        onClose={() => setNewEvalOpen(false)}
        onSubmit={(form) => {
          setEvaluations((prev) => [
            {
              id: `e_${Math.random().toString(36).slice(2, 8)}`,
              name: form.name,
              agentId: 'a1',
              agentName: '待分配 Agent',
              version: '1.0.0',
              totalCases: form.totalCases,
              accuracy: 0,
              recall: 0,
              p95Ms: 0,
              tokensPerCall: 0,
              rating: 0,
              calls: 0,
              status: 'baseline',
              passedAt: new Date().toISOString(),
              dataset: form.dataset,
              judgeModel: form.judgeModel,
            },
            ...prev,
          ]);
          alert(`✓ 评测批次 ${form.name} 已创建，等待运行`);
          setNewEvalOpen(false);
        }}
      />

      <ModalX open={runOpen} onClose={() => setRunOpen(false)} title={`运行 · ${agents.find((a) => a.id === activeId)?.name ?? ''}`} size="md" footer={
        <>
          <Button variant="ghost" onClick={() => setRunOpen(false)}>关闭</Button>
        </>
      }>
        <RunAgentBody agent={agents.find((a) => a.id === activeId)} onComplete={(r) => {
          setLiveCalls((prev) => [r, ...prev].slice(0, 24));
          setAlerts((prev) => r.status === 'timeout' ? [{ id: `al_run_${Date.now().toString(36)}`, agent: r.agent, agentId: r.agentId, severity: 'warn', type: 'latency', title: `Agent 运行超时 ${r.latencyMs}ms`, ts: '刚刚', acknowledged: false }, ...prev] : prev);
        }} />
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
          <Button onClick={() => { alert('✓ 工具配置已保存'); setToolCfg({ open: false, toolKey: null }); }}>保存</Button>
        </>
      }>
        <ToolConfigBody />
      </ModalX>

      <ModalX open={abReportOpen} onClose={() => setAbReportOpen(false)} title={`A/B Test 详细报告 · ${agents.find((a) => a.id === activeId)?.name ?? ''}`} size="lg" footer={
        <Button onClick={() => setAbReportOpen(false)}>关闭</Button>
      }>
        <ABReportBody agent={agents.find((a) => a.id === activeId)} />
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
  const byCategory = agents.reduce<Record<string, AgentFull[]>>((acc, a) => {
    acc[a.category] = acc[a.category] ?? [];
    acc[a.category].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6 bg-[var(--bg-elevated)]/30 p-5 pb-10">
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <Badge tone={cat === 'AIOps' ? 'info' : 'warn'} className="text-[10px]">{cat}</Badge>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">{items.length} 个</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((a) => (
              <AgentCard key={a.id} agent={a} active={a.id === activeId} onClick={() => onSelect(a.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentCard({ agent, active, onClick }: { agent: AgentFull; active: boolean; onClick: () => void }) {
  const isInstalled = agent.status === 'installed';
  const isHot = (agent.todayCalls ?? 0) > 100;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-[var(--surface-1)] p-3 text-left transition-all hover:border-[var(--brand)] hover:shadow-md',
        active ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/30' : 'border-[var(--border)]',
      )}
    >
      {/* 头部：图标 + 状态徽标 */}
      <div className="flex items-start gap-2">
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', agent.category === 'AIOps' ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-[var(--warning-bg)] text-[var(--warning)]')}>
          <Bot className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm truncate">{agent.name}</span>
            {isHot && <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--danger)] text-white text-[8px]" title="高频">🔥</span>}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">v{agent.version} · {(agent as any).riskLevel ?? 'L1'}</div>
        </div>
        <div className="shrink-0 flex items-center gap-0.5 text-[var(--text-muted)]">
          <Star className="h-3 w-3 fill-current text-amber-500" />
          <span className="text-[10px] font-mono font-semibold text-[var(--text)]">{agent.rating}</span>
        </div>
      </div>

      {/* 描述 */}
      <div className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed min-h-[2.4em]">{agent.description}</div>

      {/* 能力栈 chip */}
      <div className="flex flex-wrap gap-0.5">
        {agent.tools.slice(0, 4).map((t) => (
          <span key={t} className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)] font-mono">{t}</span>
        ))}
        {agent.tools.length > 4 && <span className="text-[9px] text-[var(--text-muted)]">+{agent.tools.length - 4}</span>}
      </div>

      {/* 指标：调用 / 缓存 / P95 */}
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <div className="rounded bg-[var(--bg-elevated)] px-1.5 py-1 text-center">
          <div className="text-[var(--text-muted)]">调用</div>
          <div className="font-mono font-semibold text-[var(--text)]">{(agent.installCount / 1000).toFixed(1)}k</div>
        </div>
        <div className="rounded bg-[var(--bg-elevated)] px-1.5 py-1 text-center">
          <div className="text-[var(--text-muted)]">缓存</div>
          <div className="font-mono font-semibold text-[var(--success)]">{(agent as any).cacheHitRate ?? 32}%</div>
        </div>
        <div className="rounded bg-[var(--bg-elevated)] px-1.5 py-1 text-center">
          <div className="text-[var(--text-muted)]">P95</div>
          <div className="font-mono font-semibold text-[var(--text)]">{agent.p95Ms}ms</div>
        </div>
      </div>

      {/* 状态 + 风险 */}
      <div className="flex items-center justify-between text-[10px]">
        {isInstalled ? (
          <Badge tone="success" className="text-[9px]"><CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />已启用</Badge>
        ) : (
          <Badge tone="neutral" className="text-[9px]"><Download className="mr-0.5 h-2.5 w-2.5" />可安装</Badge>
        )}
        {(agent as any).sla && (
          <span className="font-mono text-[var(--text-muted)]">SLA {(agent as any).sla}%</span>
        )}
      </div>
    </button>
  );
}

/* ==================== 评测视图 ==================== */

function EvaluateView({ agents, active, compare }: { agents: AgentFull[]; active: AgentFull | undefined; compare: AgentFull | undefined }) {
  const [localNewEvalOpen, setLocalNewEvalOpen] = useState(false);
  const submitEval = (form: { name: string; dataset: string; judgeModel: string; totalCases: number }) => {
    alert(`✓ 评测批次 ${form.name} 已创建（${form.totalCases} 用例 · ${form.judgeModel}）`);
    setLocalNewEvalOpen(false);
  };
  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 bg-[var(--bg-elevated)]/30">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <EvalCard title="进行中评测" value="3" sub="批次" icon={FlaskConical} tone="info" />
        <EvalCard title="平均准确率" value="92.4%" sub="↑ 1.2%" icon={CheckCircle2} tone="success" />
        <EvalCard title="用户满意度" value="4.6" sub="★ / 5" icon={Star} tone="warn" />
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <div className="text-xs font-semibold flex items-center gap-1.5"><GitCompare className="h-3.5 w-3.5 text-[var(--brand)]" />多模型对比 · A/B Test</div>
          <Button size="sm" onClick={() => setLocalNewEvalOpen(true)}>
            <Play className="h-3.5 w-3.5" />启动新评测
          </Button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="text-left p-2">Agent</th>
              <th className="text-left p-2">版本</th>
              <th className="text-right p-2">准确率</th>
              <th className="text-right p-2">召回率</th>
              <th className="text-right p-2">P95</th>
              <th className="text-right p-2">Token / 次</th>
              <th className="text-right p-2">用户评分</th>
              <th className="text-right p-2">调用</th>
              <th className="text-left p-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {INITIAL_EVALUATIONS.slice(0, 6).map((a, i) => {
              const accuracy = a.accuracy;
              const recall = a.recall;
              const tokens = a.tokensPerCall;
              const statusLabel = a.status === 'champion' ? '冠军' : a.status === 'control' ? '对照' : '基线';
              const statusTone = a.status === 'champion' ? 'success' : a.status === 'control' ? 'info' : 'neutral';
              return (
                <tr key={a.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)]">
                  <td className="p-2"><div className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-[var(--brand)]" /><span className="font-semibold">{a.agentName}</span></div></td>
                  <td className="p-2 font-mono text-[var(--text-muted)]">v{a.version}</td>
                  <td className="p-2 text-right font-mono text-[var(--success)]">{accuracy}%</td>
                  <td className="p-2 text-right font-mono">{recall}%</td>
                  <td className="p-2 text-right font-mono">{a.p95Ms}ms</td>
                  <td className="p-2 text-right font-mono">{tokens}</td>
                  <td className="p-2 text-right"><span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{a.rating}</span></td>
                  <td className="p-2 text-right font-mono">{a.calls.toLocaleString()}</td>
                  <td className="p-2"><Badge tone={statusTone as any} className="text-[9px]">{statusLabel}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-[var(--brand)]" />评分趋势（30 天）</div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={INITIAL_TREND_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} domain={[3, 5]} />
            <Tooltip contentStyle={{ fontSize: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="a" name="故障自愈 v1.4.2" stroke="var(--brand)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="b" name="故障自愈 v1.4.1" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <NewEvalModal open={localNewEvalOpen} onClose={() => setLocalNewEvalOpen(false)} onSubmit={submitEval} />
    </div>
  );
}

/* ==================== 监控视图 ==================== */

function MonitorView({ agents }: { agents: AgentFull[] }) {
  const liveData = useMemo(() => TREND_FULL.map((d) => ({ ...d, t: `${d.t}` })), []);
  const totalCalls = liveData.reduce((s, d) => s + d.calls, 0);
  const avgLatency = Math.round(liveData.reduce((s, d) => s + d.latency, 0) / liveData.length);
  const errorRate = (liveData.reduce((s, d) => s + d.errors, 0) / totalCalls * 100).toFixed(2);

  // 告警列表 state（纯前端交互）
  const [alertList, setAlertList] = useState<typeof INITIAL_ALERTS>(INITIAL_ALERTS);
  const ackAlert = (id: string) => setAlertList((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));
  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 bg-[var(--bg-elevated)]/30">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="实时调用" value={totalCalls.toFixed(0)} sub="次/小时" tone="brand" icon={Zap} />
        <KpiCard label="平均延迟" value={avgLatency} sub="ms" tone="info" icon={Clock} />
        <KpiCard label="错误率" value={errorRate} sub="%" tone="error" icon={AlertOctagon} />
        <KpiCard label="Token 消耗" value={(totalCalls * 480 / 1000).toFixed(1)} sub="K" tone="warn" icon={Hash} />
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
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

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" />异常告警
            <Badge tone="warn" className="text-[9px] ml-1">{alertList.filter((a) => !a.acknowledged).length}</Badge>
          </div>
          <button
            onClick={() => setAlertList((prev) => prev.map((a) => ({ ...a, acknowledged: true })))}
            disabled={alertList.every((a) => a.acknowledged)}
            className="text-[10px] text-[var(--brand)] hover:underline disabled:text-[var(--text-muted)] disabled:no-underline disabled:cursor-not-allowed"
          >
            全部 ACK
          </button>
        </div>
        <div className="space-y-1.5">
          {alertList.map((a) => (
            <div key={a.id} className={cn(
              'flex items-center gap-2 rounded border bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[10px]',
              a.acknowledged ? 'opacity-60 border-[var(--border)]' : 'border-[var(--warning)]/30',
            )}>
              <Badge tone={a.severity === 'error' ? 'error' : a.severity === 'warn' ? 'warn' : 'info'} className="text-[9px]">{a.ts}</Badge>
              <Bot className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="flex-1 truncate">{a.agent} · {a.title}</span>
              <button
                onClick={() => ackAlert(a.id)}
                disabled={a.acknowledged}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  a.acknowledged
                    ? 'text-[var(--text-muted)] cursor-not-allowed'
                    : 'text-[var(--warning)] hover:bg-[var(--warning-bg)]',
                )}
              >
                {a.acknowledged ? '已确认' : '确认'}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <div className="text-xs font-semibold mb-3 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-[var(--brand)]" />调用排行 Top 5</div>
          <div className="space-y-1.5">
            {agents.slice(0, 5).map((a, i) => (
              <div key={a.id} className="flex items-center gap-2 text-[10px]">
                <span className="font-mono text-[var(--text-muted)] w-4">{i + 1}</span>
                <Bot className="h-3 w-3 text-[var(--brand)]" />
                <span className="flex-1 truncate font-mono">{a.name}</span>
                <div className="w-20 h-1.5 rounded-full bg-[var(--bg)] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[var(--brand)] to-[var(--purple)]" style={{ width: `${Math.max(20, 100 - i * 18)}%` }} />
                </div>
                <span className="font-mono text-[var(--text-muted)] w-12 text-right">{a.installCount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== 详情面板 ==================== */

function AgentDetailPanel({ agent, trendData, compare, compareTrendData, versions, rank, onClose, onCompareToggle, showCompare, tab, setTab, onConfigOpen, onRunOpen, onTestOpen, onPreviewOpen, onToolCfg, onABReportOpen }: {
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
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md', agent.category === 'AIOps' ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-[var(--warning-bg)] text-[var(--warning)]')}>
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold truncate">{agent.name}</span>
              <Badge tone="brand" className="text-[9px]">v{agent.version}</Badge>
            </div>
            <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{agent.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onCompareToggle}
            className={cn('grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--brand)] transition-colors', showCompare && 'border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand)]')}
            title="对比"
            aria-label="对比 Agent"
          >
            <GitCompare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] transition-colors"
            aria-label="关闭详情"
            title="关闭详情（Esc）"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 overflow-x-auto">
        {([
          { k: 'meta', label: '元数据', icon: FileText },
          { k: 'prompt', label: 'Prompt', icon: Sparkles },
          { k: 'tools', label: '工具与权限', icon: Wrench },
          { k: 'versions', label: '版本与 A/B', icon: History },
          { k: 'monitor', label: '监控', icon: Activity },
        ] as const).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cn('relative flex items-center gap-1 px-3 py-2 text-[10px] whitespace-nowrap', tab === t.k ? 'text-[var(--brand)] font-semibold border-b-2 border-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
            <t.icon className="h-3 w-3" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {tab === 'meta' && <MetaTab agent={agent} rank={rank} />}
        {tab === 'prompt' && <PromptTab agent={agent} onTestOpen={onTestOpen} onPreviewOpen={onPreviewOpen} />}
        {tab === 'tools' && <ToolsTab agent={agent} onToolCfg={onToolCfg} />}
        {tab === 'versions' && <VersionsTab versions={versions} agent={agent} />}
        {tab === 'monitor' && <MonitorTab agent={agent} trendData={trendData} compare={compare} compareTrendData={compareTrendData} showCompare={showCompare} />}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] p-3">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onConfigOpen}><Settings className="h-3.5 w-3.5" />配置</Button>
        <Button size="sm" className="flex-1" onClick={onRunOpen}><Play className="h-3.5 w-3.5" />运行</Button>
      </div>
    </>
  );
}

function MetaTab({ agent, rank }: { agent: AgentFull; rank: { rank: number; id: string; name: string; calls: number; change: number }[] }) {
  const r = rank.find((x) => x.id === agent.id);
  return (
    <>
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">基础</div>
        <div className="space-y-1">
          <Row label="名称" value={agent.name} />
          <Row label="分类" value={<Badge tone="info" className="text-[9px]">{agent.category}</Badge>} />
          <Row label="版本" value={<span className="font-mono">v{agent.version}</span>} />
          <Row label="风险等级" value={<Badge tone={RISK_TONE[(agent as any).riskLevel ?? 'L1']} className="text-[9px]">{(agent as any).riskLevel ?? 'L1'}</Badge>} />
          <Row label="评分" value={<span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" />{agent.rating} {((agent as any).ratingCount ? `(${(agent as any).ratingCount})` : '')}</span>} />
          <Row label="状态" value={agent.status === 'installed' ? <Badge tone="success" className="text-[9px]">已启用</Badge> : <Badge tone="neutral" className="text-[9px]">可安装</Badge>} />
          <Row label="排行" value={r ? `#${r.rank} (${r.change > 0 ? '↑' : r.change < 0 ? '↓' : '·'} ${Math.abs(r.change)})` : '—'} />
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">SLA 与性能</div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <KpiMini label="SLA" value={`${(agent as any).sla ?? 99}%`} />
          <KpiMini label="P95" value={`${agent.p95Ms}ms`} />
          <KpiMini label="安装" value={agent.installCount.toLocaleString()} />
          <KpiMini label="缓存" value={`${(agent as any).cacheHitRate ?? 32}%`} />
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">能力栈</div>
        <div className="grid grid-cols-5 gap-1 text-[10px]">
          <KpiMini label="工具" value={String((agent as any).capabilities?.tools ?? agent.tools.length)} />
          <KpiMini label="MCP" value={String((agent as any).capabilities?.mcps ?? 0)} />
          <KpiMini label="知识库" value={String((agent as any).capabilities?.knowledgeBases ?? 4)} />
          <KpiMini label="技能" value={String((agent as any).capabilities?.skills ?? 0)} />
          <KpiMini label="沙箱" value={String((agent as any).capabilities?.sandboxes ?? 1)} />
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">认证</div>
        <div className="flex flex-wrap gap-1">
          {((agent as any).certifications as string[] | undefined)?.map((c) => (
            <Badge key={c} tone="success" className="text-[9px]"><ShieldCheck className="mr-0.5 h-2.5 w-2.5" />{c}</Badge>
          )) ?? <span className="text-[10px] text-[var(--text-muted)]">未配置</span>}
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">权限</div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          {((agent as any).permissions as any ?? { canEdit: false, canApprove: false, canInvoke: true, canExport: false }).canEdit && <Badge tone="info" className="text-[9px]">编辑</Badge>}
          {((agent as any).permissions as any ?? {}).canApprove && <Badge tone="warn" className="text-[9px]">审批</Badge>}
          {((agent as any).permissions as any ?? { canInvoke: true }).canInvoke && <Badge tone="success" className="text-[9px]">调用</Badge>}
          {((agent as any).permissions as any ?? {}).canExport && <Badge tone="neutral" className="text-[9px]">导出</Badge>}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">描述</div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-[11px] leading-relaxed">{agent.description}</div>
      </div>
    </>
  );
}

function PromptTab({ agent, onTestOpen, onPreviewOpen }: { agent: AgentFull; onTestOpen: () => void; onPreviewOpen: () => void }) {
  const [template, setTemplate] = useState((agent as any).promptTemplate ?? '');
  return (
    <>
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5"><Sparkles className="h-3 w-3" />Prompt 模板</div>
          <Badge tone="info" className="text-[9px]">v{agent.version}</Badge>
        </div>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-[11px] font-mono leading-relaxed resize-y"
          placeholder="你是 ACME 的 {role}，负责 {responsibility}。&#10;&#10;## 上下文&#10;{context}&#10;&#10;## 输出&#10;{output_format}"
        />
        <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">支持变量：<code className="bg-[var(--bg)] px-1 rounded">{'{var}'}</code>、<code className="bg-[var(--bg)] px-1 rounded">{'{{var}}'}</code></div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5"><Hash className="h-3 w-3" />变量</div>
        <div className="space-y-1">
          {[
            { name: 'role', type: 'enum', required: true, default: '故障自愈 Agent', options: ['故障自愈', '变更辅助', '威胁狩猎'], desc: 'Agent 角色定位' },
            { name: 'responsibility', type: 'string', required: true, default: '自动化故障定位与恢复', desc: '职责描述' },
            { name: 'context', type: 'string', required: false, default: '', desc: '运行时上下文（告警 / 资产 / 变更）' },
            { name: 'output_format', type: 'enum', required: false, default: 'markdown', options: ['markdown', 'json', 'table'], desc: '输出格式' },
          ].map((v) => (
            <div key={v.name} className="flex items-center gap-2 text-[10px] rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
              <code className="font-mono font-semibold text-[var(--brand)]">{`{{${v.name}}}`}</code>
              <Badge tone="neutral" className="text-[8px]">{v.type}</Badge>
              {v.required && <Badge tone="error" className="text-[8px]">必填</Badge>}
              <span className="text-[var(--text-muted)] flex-1 truncate">默认: <span className="font-mono">{v.default}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onTestOpen}><Beaker className="h-3.5 w-3.5" />试运行</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={onPreviewOpen}><Eye className="h-3.5 w-3.5" />预览</Button>
        <Button size="sm" className="flex-1"><Pencil className="h-3.5 w-3.5" />保存</Button>
      </div>
    </>
  );
}

function ToolsTab({ agent, onToolCfg }: { agent: AgentFull; onToolCfg: (key: string) => void }) {
  return (
    <>
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5"><Wrench className="h-3 w-3" />工具 / MCP</div>
        <div className="space-y-1">
          {agent.tools.map((t) => (
            <div key={t} className="rounded border border-[var(--border)] bg-[var(--bg)] p-2">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-semibold">{t}</span>
                <Badge tone="success" className="text-[8px]">auto</Badge>
                <Badge tone="info" className="text-[8px]"><Lock className="mr-0.5 h-2 w-2" />gvisor</Badge>
                <span className="ml-auto text-[9px] font-mono text-[var(--text-muted)]">2,450 calls/24h</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[var(--text-muted)]">
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

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5"><Database className="h-3 w-3" />知识库绑定</div>
        <div className="space-y-1">
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

function VersionsTab({ versions, agent }: { versions: AgentVersion[]; agent: AgentFull }) {
  return (
    <>
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5"><History className="h-3 w-3" />版本历史</div>
          <Button size="sm" variant="secondary"><GitCompare className="h-3 w-3" />对比</Button>
        </div>
        <div className="space-y-1.5">
          {versions.length === 0 && <div className="text-[10px] text-[var(--text-muted)]">暂无版本记录</div>}
          {versions.slice(0, 4).map((v) => (
            <div key={v.version} className={cn('rounded border p-2 text-[10px]', v.status === 'current' ? 'border-[var(--brand)]/40 bg-[var(--brand-light)]/30' : 'border-[var(--border)] bg-[var(--bg)]')}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-mono font-semibold">v{v.version}</span>
                <Badge tone={v.type === 'major' ? 'error' : v.type === 'minor' ? 'warn' : 'neutral'} className="text-[8px]">{v.type}</Badge>
                <Badge tone={v.status === 'current' ? 'success' : v.status === 'beta' ? 'warn' : 'neutral'} className="text-[8px]">{v.status === 'current' ? '当前' : v.status === 'beta' ? '灰度' : v.status === 'deprecated' ? '废弃' : '稳定'}</Badge>
                <span className="ml-auto text-[var(--text-muted)] font-mono">{v.date}</span>
              </div>
              <ul className="space-y-0.5 text-[10px] text-[var(--text-muted)]">
                {v.changelog.map((c, i) => <li key={i}>· {c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5"><Beaker className="h-3 w-3" />A/B Test</div>
        <div className="text-[10px] text-[var(--text-muted)] mb-1.5">将流量按 50/50 分到 v{agent.version} 与 v{(parseFloat(agent.version) - 0.1).toFixed(1)}，对比准确率与延迟</div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="rounded border border-[var(--brand)]/30 bg-[var(--brand-light)]/30 p-2">
            <div className="font-semibold mb-0.5">A · v{agent.version}</div>
            <div className="text-[var(--text-muted)]">流量 50% · 准确率 92.4% · P95 580ms</div>
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-2">
            <div className="font-semibold mb-0.5">B · v{(parseFloat(agent.version) - 0.1).toFixed(1)}</div>
            <div className="text-[var(--text-muted)]">流量 50% · 准确率 89.8% · P95 640ms</div>
          </div>
        </div>
        <Button size="sm" className="w-full mt-1.5">查看详细 A/B 报告</Button>
      </div>
    </>
  );
}

function MonitorTab({ agent, trendData, compare, compareTrendData, showCompare }: { agent: AgentFull; trendData: { day: string; calls: number }[]; compare?: AgentFull; compareTrendData: { day: string; calls: number }[]; showCompare: boolean }) {
  return (
    <>
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1.5"><TrendingUp className="h-3 w-3" />7 天调用趋势{showCompare && compare && ' · 对比'}</div>
        <ResponsiveContainer width="100%" height={140}>
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
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
            <Tooltip contentStyle={{ fontSize: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }} />
            <Area type="monotone" dataKey="calls" name={agent.name} stroke="var(--brand)" fill="url(#grad-a)" strokeWidth={2} />
            {showCompare && compare && <Area type="monotone" dataKey="calls" name={compare.name} stroke="var(--text-muted)" fill="url(#grad-b)" strokeWidth={1.5} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">实时指标</div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <KpiMini label="今日调用" value={String((agent as any).todayCalls ?? 320)} />
          <KpiMini label="错误率 24h" value={`${((agent as any).errorRate24h ?? 1.2).toFixed(2)}%`} />
          <KpiMini label="P95" value={`${agent.p95Ms}ms`} />
          <KpiMini label="Token" value="780" />
          <KpiMini label="双签" value={String((agent as any).approvalCount ?? 1)} />
          <KpiMini label="满意度" value={`${agent.rating}★`} />
        </div>
      </div>
    </>
  );
}

/* ==================== 通用组件 ==================== */

function EvalCard({ title, value, sub, icon: Icon, tone }: { title: string; value: any; sub?: string; icon: any; tone: 'success' | 'warn' | 'info' | 'error' }) {
  const color = tone === 'success' ? 'text-[var(--success)]' : tone === 'info' ? 'text-[var(--info)]' : tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--danger)]';
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 flex items-center gap-3">
      <div className={cn('grid h-9 w-9 place-items-center rounded-md bg-[var(--bg-elevated)]', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">{title}</div>
        <div className={cn('text-xl font-bold font-mono', color)}>{value} <span className="text-[10px] text-[var(--text-muted)] font-normal">{sub}</span></div>
      </div>
    </div>
  );
}

/* ==================== 新建 Agent Modal ==================== */

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
                {['Redis 故障 Runbook v3.2', 'K8s 运维手册 v2.1', 'CMDB 全量资产清单', 'CVE 漏洞库'].map((kb) => {
                  const on = form.knowledge.includes(kb);
                  return (
                    <button key={kb} onClick={() => setForm((f) => ({ ...f, knowledge: on ? f.knowledge.filter((x) => x !== kb) : [...f.knowledge, kb] }))} className={cn('flex w-full items-center gap-1.5 rounded border px-2 py-1 text-[10px]', on ? 'border-[var(--brand)] bg-[var(--brand-light)]/30' : 'border-[var(--border)] bg-[var(--bg)]')}>
                      <Database className="h-3 w-3 text-[var(--info)]" />
                      <span className="flex-1 text-left">{kb}</span>
                      {on && <CheckCircle2 className="h-3 w-3 text-[var(--brand)]" />}
                    </button>
                  );
                })}
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

const ListChecks = Sparkles as any;

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
