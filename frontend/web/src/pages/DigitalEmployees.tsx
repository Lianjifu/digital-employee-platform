import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiMutation, useApiQuery } from '@/services/query';
import { useAuthStore } from '@/stores/authStore';
import { Badge, Button, KpiCard } from '@de/web-ui';
import { EmptyState, Modal } from '@/components/shared';
import { cn } from '@de/web-utils';
import { useT } from '@/i18n';
import type { DigitalEmployee, DigitalEmployeeBoundaryPolicy, DigitalEmployeeConfigurationVersion, DigitalEmployeeExecutionMode, DigitalEmployeeLifecycle, DigitalEmployeeResponsibility, DigitalEmployeeTemplate, DigitalEmployeeTemplateAdoption } from '@de/web-types';
import { DigitalEmployeeAvatar } from '@/components/DigitalEmployeeAvatar';
import { DepartmentTeamPanel } from '@/components/DepartmentTeamPanel';
import { compareDigitalEmployees, DIGITAL_EMPLOYEE_DEPARTMENT_ORDER, employeePrimaryLabel, employeeSecondaryLabel, isDepartmentHead } from '@/lib/digital-employees';
import {
  ArrowUpRight, BriefcaseBusiness, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Database,
  HeartPulse, Layers3, MessageSquare, Pause, Play, Plus,
  Route, Save, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, UserRoundCheck, UsersRound,
  XCircle, Trash2,
} from 'lucide-react';

type ModuleTab = 'catalog' | 'roleSetup' | 'capabilities' | 'release' | 'operations';
type DetailTab = 'team' | 'profile' | 'boundary' | 'capabilities' | 'memory' | 'runtime' | 'evidence';

const CATALOG_PAGE_SIZE_OPTIONS = [4, 8, 12, 16, 24] as const;
const CATALOG_PAGE_SIZE_KEY = 'de.catalog.pageSize';
const CATALOG_DEFAULT_PAGE_SIZE = 8;
const PLAZA_PAGE_SIZE = 4;

function readCatalogPageSize() {
  if (typeof window === 'undefined') return CATALOG_DEFAULT_PAGE_SIZE;
  const raw = Number(window.localStorage.getItem(CATALOG_PAGE_SIZE_KEY));
  return (CATALOG_PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : CATALOG_DEFAULT_PAGE_SIZE;
}

const tabs: Array<{ key: ModuleTab; labelKey: string; icon: typeof BriefcaseBusiness; description: string }> = [
  { key: 'catalog', labelKey: 'module.agents.tabs.catalog', icon: UsersRound, description: '按岗位与部门发现、筛选专家团队中的数字员工。' },
  { key: 'roleSetup', labelKey: 'module.agents.tabs.roleSetup', icon: BriefcaseBusiness, description: '配置岗位档案、职责边界与人工升级条件。' },
  { key: 'capabilities', labelKey: 'module.agents.tabs.capabilities', icon: Layers3, description: '仅引用已发布的模型、知识、技能与流程技能。' },
  { key: 'release', labelKey: 'module.agents.tabs.release', icon: Route, description: '质量评测、上岗门禁与受控审批。' },
  { key: 'operations', labelKey: 'module.agents.tabs.operations', icon: HeartPulse, description: '在岗健康、人工交接与例外处置。' },
];

const lifecycleMeta: Record<DigitalEmployeeLifecycle, { label: string; tone: 'neutral' | 'success' | 'warn' | 'error' | 'info' }> = {
  draft: { label: '草稿', tone: 'neutral' }, testing: { label: '试运行', tone: 'info' }, pending_approval: { label: '待上岗审批', tone: 'warn' }, active: { label: '在岗', tone: 'success' }, paused: { label: '已暂停', tone: 'neutral' }, quarantined: { label: '已隔离', tone: 'error' },
};

const riskMeta = { low: { label: '低风险', tone: 'success' as const }, medium: { label: '中风险', tone: 'warn' as const }, high: { label: '高风险', tone: 'error' as const } };
const departmentOrder = DIGITAL_EMPLOYEE_DEPARTMENT_ORDER;

const catalogSegments = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '可协作', hint: '已上岗，可发起专家协同' },
  { key: 'onboarding', label: '待上岗', hint: '草稿、试运行或待双重审批' },
  { key: 'attention', label: '需关注', hint: '异常、暂停或隔离' },
] as const;

type CatalogSegment = (typeof catalogSegments)[number]['key'];

function matchesCatalogSegment(employee: DigitalEmployee, segment: CatalogSegment) {
  if (segment === 'all') return true;
  if (segment === 'active') return employee.lifecycle === 'active' && employee.runtime.anomalies === 0;
  if (segment === 'onboarding') return !['active', 'paused', 'quarantined'].includes(employee.lifecycle);
  return employee.lifecycle === 'paused' || employee.lifecycle === 'quarantined' || (employee.lifecycle === 'active' && employee.runtime.anomalies > 0);
}

function EmployeeAvatar({ employee, size = 40 }: { employee: DigitalEmployee; size?: number }) {
  return <DigitalEmployeeAvatar employee={employee} size={size} />;
}

function gateLabel(employee: DigitalEmployee) {
  if (employee.lifecycle === 'quarantined' || (employee.lifecycle === 'active' && employee.runtime.anomalies > 0)) return '需关注';
  if (employee.lifecycle === 'active') return '可协作';
  if (employee.release.status === 'pending_approval') return '待双重审批上岗';
  if (employee.evaluation.status === 'passed') return `评测 ${employee.evaluation.score ?? '—'} · 可申请上岗`;
  if (employee.evaluation.status === 'failed') return '评测未通过';
  if (employee.lifecycle === 'paused') return '已暂停';
  if (employee.runtime.anomalies > 0) return '需关注';
  return '配置与评测中';
}

function employeeTags(employee: DigitalEmployee) {
  return [...employee.capabilities.skills, ...employee.capabilities.knowledge, ...employee.capabilities.workflows].slice(0, 3);
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"><div className="text-[11px] text-[var(--text-muted)]">{label}</div><div className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">{value}{sub && <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">{sub}</span>}</div></div>;
}

export default function DigitalEmployees() {
  const { t } = useT();
  const [tab, setTab] = useState<ModuleTab>('catalog');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('全部部门');
  const [lifecycle, setLifecycle] = useState('全部状态');
  const [catalogSegment, setCatalogSegment] = useState<CatalogSegment>('all');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(readCatalogPageSize);
  const { data: employees = [], isLoading } = useApiQuery<DigitalEmployee[]>(['digital-employees'], '/api/digital-employees');
  const { data: overview } = useApiQuery<{ total: number; active: number; pending: number; anomalies: number; costToday: number }>(['digital-employees', 'overview'], '/api/digital-employees/overview');
  const createEmployee = useApiMutation<DigitalEmployee, Partial<DigitalEmployee>>('/api/digital-employees', { onSuccess: (employee) => { setCreateOpen(false); setSelectedId(employee.id); } });

  const selected = employees.find((employee) => employee.id === selectedId) ?? null;
  const departments = useMemo(() => {
    const present = Array.from(new Set(employees.map((employee) => employee.department)));
    const ordered = departmentOrder.filter((item) => present.includes(item));
    const rest = present.filter((item) => !departmentOrder.includes(item)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return ['全部部门', ...ordered, ...rest];
  }, [employees]);
  const orderedEmployees = useMemo(() => [...employees].sort(compareDigitalEmployees), [employees]);
  const filtered = useMemo(() => employees.filter((employee) => {
    const matchesText = !query || [employee.name, employee.role, employee.department, employee.owner].join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesText && (department === '全部部门' || employee.department === department) && (lifecycle === '全部状态' || lifecycleMeta[employee.lifecycle].label === lifecycle);
  }).sort(compareDigitalEmployees), [employees, query, department, lifecycle]);

  const catalogSegmentCounts = useMemo(() => ({
    all: filtered.length,
    active: filtered.filter((item) => matchesCatalogSegment(item, 'active')).length,
    onboarding: filtered.filter((item) => matchesCatalogSegment(item, 'onboarding')).length,
    attention: filtered.filter((item) => matchesCatalogSegment(item, 'attention')).length,
  }), [filtered]);

  const catalogItems = useMemo(
    () => filtered.filter((item) => matchesCatalogSegment(item, catalogSegment)),
    [filtered, catalogSegment],
  );

  useEffect(() => { setCatalogPage(1); }, [query, department, lifecycle, catalogPageSize, catalogSegment]);
  useEffect(() => { window.localStorage.setItem(CATALOG_PAGE_SIZE_KEY, String(catalogPageSize)); }, [catalogPageSize]);

  const catalogPageCount = Math.max(1, Math.ceil(catalogItems.length / catalogPageSize));
  const catalogPageSafe = Math.min(catalogPage, catalogPageCount);
  const catalogPageItems = useMemo(
    () => catalogItems.slice((catalogPageSafe - 1) * catalogPageSize, catalogPageSafe * catalogPageSize),
    [catalogItems, catalogPageSafe, catalogPageSize],
  );

  return (
    <div className="de-employee-page h-full min-w-0 overflow-y-auto bg-[var(--bg-elevated)] p-3 md:p-4 lg:p-5">
      <div className="space-y-3">
        <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg text-[var(--text-secondary)]"><BriefcaseBusiness className="h-4 w-4" /></div>
                <h1 className="text-base font-semibold text-[var(--text)]">{t('nav.agents')}</h1>
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">专家团队协同的数字员工：岗位边界清晰，双重审批与人工接管可追溯。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="de-employee-btn" onClick={() => { setTab('catalog'); setTemplateOpen(true); }}><Sparkles className="h-3.5 w-3.5" />从岗位蓝图创建</button>
              <button type="button" className="de-employee-btn de-employee-btn--primary" onClick={() => { setTab('catalog'); setCreateOpen(true); }}><Plus className="h-3.5 w-3.5" />新建数字员工</button>
            </div>
          </div>
          <div className="de-employee-tabs flex overflow-x-auto px-3" role="tablist" aria-label="数字员工功能">
            {tabs.map((item) => <button type="button" key={item.key} onClick={() => setTab(item.key)} className={cn('de-employee-tab flex shrink-0 items-center gap-1.5 px-3 py-3 text-xs transition-colors', tab === item.key && 'is-active')}><item.icon className="h-3.5 w-3.5" />{t(item.labelKey)}</button>)}
          </div>
        </section>

        {tab === 'catalog' && <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="在册专家" value={overview?.total ?? 0} sub="个" icon={UsersRound} tone="neutral" size="comfortable" />
            <KpiCard label="已上岗" value={overview?.active ?? 0} sub="个" icon={CheckCircle2} tone="success" size="comfortable" />
            <KpiCard label="待上岗审批" value={overview?.pending ?? 0} sub="个" icon={Clock3} tone="warn" size="comfortable" />
            <KpiCard label="运行异常" value={overview?.anomalies ?? 0} sub="个" icon={ShieldAlert} tone={(overview?.anomalies ?? 0) > 0 ? 'warn' : 'success'} size="comfortable" />
          </section>
          <section className="de-employee-shell overflow-hidden rounded-xl bg-[var(--surface-1)]">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ boxShadow: 'var(--saas-divider)' }}>
              <div className="relative min-w-[210px] flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索专家、岗位、部门或负责人" className="de-employee-input h-9 w-full rounded-lg bg-[var(--bg)] pl-8 pr-3 text-xs outline-none" /></div>
              <select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)} className="de-employee-input h-9 rounded-lg bg-[var(--bg)] px-2 text-xs text-[var(--text-secondary)]">{['全部状态', ...Object.values(lifecycleMeta).map((item) => item.label)].map((item) => <option key={item}>{item}</option>)}</select>
            </div>
            <div className="flex gap-1 overflow-x-auto px-4 py-2.5" style={{ boxShadow: 'var(--saas-divider)' }}>{departments.map((item) => <button type="button" key={item} onClick={() => setDepartment(item)} className={cn('de-employee-chip shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors', department === item && 'is-active')}>{item}</button>)}</div>
            <div className="flex gap-1 overflow-x-auto px-4 py-2.5" style={{ boxShadow: 'var(--saas-divider)' }} role="tablist" aria-label="专家目录分类">
              {catalogSegments.map((segment) => (
                <button
                  type="button"
                  key={segment.key}
                  role="tab"
                  aria-selected={catalogSegment === segment.key}
                  title={'hint' in segment ? segment.hint : undefined}
                  onClick={() => setCatalogSegment(segment.key)}
                  className={cn('de-employee-chip shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors', catalogSegment === segment.key && 'is-active')}
                >
                  {segment.label}
                  <span className="ml-1.5 tabular-nums text-[10px] opacity-70">{catalogSegmentCounts[segment.key]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
              <div>
                <h2 className="text-sm font-semibold">专家目录</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {catalogSegment === 'all'
                    ? '按岗位与部门发现可协作的数字员工；上岗与双重审批在门禁中推进。'
                    : (catalogSegments.find((item) => item.key === catalogSegment) as { hint?: string } | undefined)?.hint ?? '按分类浏览数字员工。'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  每页
                  <select
                    value={catalogPageSize}
                    onChange={(event) => setCatalogPageSize(Number(event.target.value))}
                    className="de-employee-input h-8 rounded-lg bg-[var(--bg)] px-2 text-xs text-[var(--text-secondary)]"
                    aria-label="每页展示数量"
                  >
                    {CATALOG_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} 个</option>)}
                  </select>
                </label>
                <span className="text-xs text-[var(--text-muted)]">{catalogItems.length} 位专家</span>
              </div>
            </div>
            {isLoading ? <div className="p-8 text-center text-xs text-[var(--text-muted)]">正在载入数字员工…</div> : catalogItems.length === 0 ? <EmptyState icon={BriefcaseBusiness} title="没有匹配的数字员工" description="调整筛选或分类条件，或新建岗位数字员工。" /> : (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {catalogPageItems.map((employee) => <EmployeeCard key={employee.id} employee={employee} onSelect={() => setSelectedId(employee.id)} />)}
                </div>
                {catalogPageCount > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                    <span className="text-[11px] text-[var(--text-muted)]">第 {catalogPageSafe} / {catalogPageCount} 页 · 每页 {catalogPageSize} 个</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" disabled={catalogPageSafe <= 1} onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}><ChevronLeft className="h-3.5 w-3.5" />上一页</Button>
                      <Button size="sm" variant="secondary" disabled={catalogPageSafe >= catalogPageCount} onClick={() => setCatalogPage((page) => Math.min(catalogPageCount, page + 1))}>下一页<ChevronRight className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
          <Modal open={templateOpen} onClose={() => setTemplateOpen(false)} title="从岗位蓝图创建" description="采用经治理验证的岗位模板，在当前工作区生成可配置草稿；仍需评测与双重审批后上岗。" size="xl"><EmployeePlaza employees={employees} onCreate={() => setCreateOpen(true)} onAdopt={(employeeId) => { setTemplateOpen(false); setSelectedId(employeeId); }} onClose={() => setTemplateOpen(false)} /></Modal>
        </>}

        {tab === 'roleSetup' && (
          <SimpleList
            title="岗位配置"
            description="完善岗位档案、职责边界与记忆策略；能力装配请到「能力装配」Tab。生产/高风险/在岗变更需另一名管理员双重审批后生效。"
            employees={filtered}
            onSelect={setSelectedId}
            empty="暂无需要配置的员工"
            right={(employee) => (
              <div className="text-right text-[11px] text-[var(--text-muted)]">
                <span className="block">职责 {employee.responsibilities.length} 项</span>
                <span className="mt-1 block text-[var(--brand)]">配置岗位 →</span>
              </div>
            )}
          />
        )}

        {tab === 'capabilities' && (
          <section className="space-y-3">
            <div className="de-employee-hint rounded-xl px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
              能力只引用已发布版本。流程类能力请先在「工作流程 → 发布技能」生成流程技能，再在此装配；模型 / 知识 / 技能请从对应能力中心发布后进入。
              <div className="mt-2 flex flex-wrap gap-2">
                <Link to="/workflows" className="de-employee-btn text-[11px]">工作流程</Link>
                <Link to="/skills" className="de-employee-btn text-[11px]">技能中心</Link>
                <Link to="/models" className="de-employee-btn text-[11px]">模型服务</Link>
                <Link to="/knowledge" className="de-employee-btn text-[11px]">知识中心</Link>
              </div>
            </div>
            <SimpleList
              title="能力装配"
              description="仅引用各能力中心已发布资产；装配变更走配置版本，生产/在岗需双重审批。岗位职责请到「岗位配置」。"
              employees={filtered}
              onSelect={setSelectedId}
              empty="暂无员工可装配"
              right={(employee) => {
                const count = employee.capabilities.skills.length + employee.capabilities.tools.length + employee.capabilities.workflows.length + employee.capabilities.knowledge.length;
                return (
                  <div className="text-right text-[11px] text-[var(--text-muted)]">
                    <span className="block">{count} 项已装配 · {employee.capabilities.model || '未绑模型'}</span>
                    <span className="mt-1 block text-[var(--brand)]">打开装配 →</span>
                  </div>
                );
              }}
            />
          </section>
        )}

        {tab === 'release' && <OnboardingManagementView employees={orderedEmployees} onSelect={setSelectedId} />}
        {tab === 'operations' && <OperationsView employees={orderedEmployees} onSelect={setSelectedId} />}
      </div>
      <EmployeeDetailModal employee={selected} context={tab} onClose={() => setSelectedId(null)} />
      <CreateEmployeeModal open={createOpen} onClose={() => setCreateOpen(false)} loading={createEmployee.isPending} onCreate={(input) => createEmployee.mutate(input)} />
    </div>
  );
}

function EmployeeCard({ employee, onSelect }: { employee: DigitalEmployee; onSelect: () => void }) {
  const navigate = useNavigate();
  const meta = lifecycleMeta[employee.lifecycle];
  const tags = employeeTags(employee);
  const gate = gateLabel(employee);
  return (
    <article className="de-employee-card group relative overflow-hidden rounded-xl bg-[var(--surface-1)] p-4 text-left">
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <EmployeeAvatar employee={employee} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-sm font-semibold text-[var(--text)]">{employeePrimaryLabel(employee)}</div>
                {employee.lifecycle === 'active' && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--success)]" title="在岗" />}
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">{employeeSecondaryLabel(employee)}</div>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isDepartmentHead(employee) && <Badge tone="info">部门负责人</Badge>}
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Badge tone={riskMeta[employee.risk].tone}>{riskMeta[employee.risk].label}</Badge>
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{isDepartmentHead(employee) ? '可调度本部门专家，并可发起跨部门协办。' : gate}</p>
        {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <span key={tag} className="max-w-[110px] truncate rounded px-2 py-0.5 text-[10px] text-[var(--text-muted)]" style={{ boxShadow: 'var(--saas-ring)' }}>{tag}</span>)}</div>}
      </button>
      {employee.lifecycle === 'active' && (
        <div className="mt-3 flex justify-end gap-2 pt-3" style={{ boxShadow: 'inset 0 1px 0 rgba(15,23,42,0.06)' }}>
          {isDepartmentHead(employee) && (
            <button type="button" className="de-employee-btn" onClick={(event) => { event.stopPropagation(); onSelect(); }}>
              <UsersRound className="h-3.5 w-3.5" />班组调度
            </button>
          )}
          <button type="button" className="de-employee-btn de-employee-btn--primary" onClick={(event) => { event.stopPropagation(); navigate(`/copilot?employeeId=${employee.id}`); }}>
            <MessageSquare className="h-3.5 w-3.5" />发起协作
          </button>
        </div>
      )}
    </article>
  );
}

function EmployeePlaza({ employees, onCreate, onAdopt, onClose }: { employees: DigitalEmployee[]; onCreate: () => void; onAdopt: (employeeId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('全部部门');
  const [source, setSource] = useState<'all' | 'platform' | 'department'>('all');
  const [publishOpen, setPublishOpen] = useState(false);
  const [page, setPage] = useState(1);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const { data: templates = [] } = useApiQuery<DigitalEmployeeTemplate[]>(['digital-employee-templates'], '/api/digital-employee-templates');
  const { data: adoptions = [] } = useApiQuery<DigitalEmployeeTemplateAdoption[]>(['digital-employee-template-adoptions'], '/api/digital-employee-template-adoptions');
  const adopt = useApiMutation<DigitalEmployee, { templateId: string }>((input) => `/api/digital-employee-templates/${input.templateId}/adopt`, { onSuccess: (employee) => onAdopt(employee.id) });
  const govern = useApiMutation<DigitalEmployeeTemplate, { id: string; status: 'certified' | 'deprecated' }>((input) => `/api/digital-employee-templates/${input.id}`, undefined, 'PATCH');
  const departments = useMemo(() => {
    const present = Array.from(new Set(templates.map((item) => item.department)));
    const ordered = departmentOrder.filter((item) => present.includes(item));
    const rest = present.filter((item) => !departmentOrder.includes(item)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return ['全部部门', ...ordered, ...rest];
  }, [templates]);
  const filtered = useMemo(
    () => templates.filter((item) => (department === '全部部门' || item.department === department) && (source === 'all' || item.source === source) && (!query || [item.name, item.role, item.department, ...item.tags].join(' ').toLowerCase().includes(query.toLowerCase()))),
    [templates, department, source, query],
  );
  useEffect(() => { setPage(1); }, [query, department, source]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PLAZA_PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageItems = filtered.slice((pageSafe - 1) * PLAZA_PAGE_SIZE, pageSafe * PLAZA_PAGE_SIZE);
  const statusLabel = (status: DigitalEmployeeTemplate['status']): readonly [string, 'success' | 'warn' | 'neutral'] => (
    status === 'certified' ? ['已认证', 'success'] : status === 'review' ? ['待认证', 'warn'] : ['已弃用', 'neutral']
  );
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl bg-[var(--surface-1)]" style={{ boxShadow: 'var(--saas-ring), var(--saas-elev-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="de-employee-icon-tile grid h-8 w-8 place-items-center rounded-lg"><Sparkles className="h-4 w-4" /></div>
              <h3 className="text-base font-semibold">岗位蓝图</h3>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">采用已认证蓝图生成草稿；仍需配置、评测与双重审批后上岗。步骤：选蓝图 → 生成草稿 → 完善门禁。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && <Button size="sm" variant="secondary" onClick={() => setPublishOpen(true)}><Plus className="h-3.5 w-3.5" />发布部门蓝图</Button>}
            <Button size="sm" variant="secondary" onClick={onCreate}><Plus className="h-3.5 w-3.5" />新建自定义员工</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位、部门或能力标签" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] pl-8 pr-3 text-xs outline-none focus:border-[var(--brand)]" />
          </div>
          <select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs">
            <option value="all">全部来源</option>
            <option value="platform">平台认证</option>
            <option value="department">部门共享</option>
          </select>
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-[var(--border)] px-5 py-2.5">
          {departments.map((item) => (
            <button type="button" key={item} onClick={() => setDepartment(item)} className={cn('shrink-0 rounded-md px-3 py-1.5 text-xs', department === item ? 'bg-[var(--brand-light)] font-semibold text-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]')}>{item}</button>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">可采用蓝图</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{filtered.length} 个蓝图 · 每页 {PLAZA_PAGE_SIZE} 个 · 认证蓝图可直接采用</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pageItems.map((template) => {
            const [label, tone] = statusLabel(template.status);
            return (
              <article key={template.id} className="flex min-h-[285px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <DigitalEmployeeAvatar employee={{ id: template.id, name: template.name, department: template.department }} size={40} />
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold">{template.name}</h4>
                      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{template.role}</p>
                    </div>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{template.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{template.department}</Badge>
                  <Badge tone={riskMeta[template.risk].tone}>{riskMeta[template.risk].label}</Badge>
                  <Badge tone="info">v{template.version}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {template.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-[var(--surface-1)] px-2 py-1 text-[11px] text-[var(--text-muted)]">{tag}</span>)}
                </div>
                <div className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
                  <span>质量 {template.evaluationScore ?? '—'} 分</span>
                  <span className="text-right">已采用 {template.adoptionCount} 次</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" className="flex-1" disabled={template.status === 'deprecated'} loading={adopt.isPending && adopt.variables?.templateId === template.id} onClick={() => adopt.mutate({ templateId: template.id })}>采用为草稿</Button>
                  {isAdmin && template.source === 'department' && template.status !== 'deprecated' && (
                    <Button size="sm" variant="secondary" loading={govern.isPending && govern.variables?.id === template.id} onClick={() => govern.mutate({ id: template.id, status: template.status === 'review' ? 'certified' : 'deprecated' })}>
                      {template.status === 'review' ? '认证' : '下架'}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <span className="text-[11px] text-[var(--text-muted)]">第 {pageSafe} / {pageCount} 页</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={pageSafe <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-3.5 w-3.5" />上一页</Button>
              <Button size="sm" variant="secondary" disabled={pageSafe >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页<ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-sm font-semibold">采用记录</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">保留蓝图来源和版本；实例后续评测、上岗与审计独立执行。</p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {adoptions.length ? adoptions.map((item) => {
            const template = templates.find((candidate) => candidate.id === item.templateId);
            const employee = employees.find((candidate) => candidate.id === item.employeeId);
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <DigitalEmployeeAvatar employee={{ id: template?.id ?? item.templateId, name: template?.name ?? item.templateId, department: template?.department }} size={32} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{template?.name ?? item.templateId}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">蓝图 v{item.templateVersion} · 采用人 {item.adoptedBy} · 员工 {employee?.name ?? '已归档'}</div>
                  </div>
                </div>
                <Badge tone={lifecycleMeta[item.status].tone}>{lifecycleMeta[item.status].label}</Badge>
              </div>
            );
          }) : <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">尚未采用岗位蓝图</div>}
        </div>
      </section>
      <PublishDepartmentTemplateModal open={publishOpen} onClose={() => setPublishOpen(false)} />
    </div>
  );
}

function PublishDepartmentTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [serviceObject, setServiceObject] = useState('');
  const [description, setDescription] = useState('');
  const [risk, setRisk] = useState<DigitalEmployee['risk']>('low');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const publish = useApiMutation<DigitalEmployeeTemplate, Partial<DigitalEmployeeTemplate>>('/api/digital-employee-templates', {
    onSuccess: () => { setError(null); onClose(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : '模板发布失败，请稍后重试。'),
  });
  const submit = () => {
    if (!name.trim() || !role.trim() || !department.trim()) return;
    publish.mutate({ name, role, department, serviceObject, description, risk, tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) });
  };
  return <Modal open={open} onClose={onClose} title="发布部门蓝图" description="蓝图仅在当前工作区共享，发布后进入待认证状态；不会直接创建或上岗数字员工。" size="md" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button loading={publish.isPending} disabled={!name.trim() || !role.trim() || !department.trim()} onClick={submit}>提交认证</Button></>}><div className="grid gap-4"><div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">蓝图承载岗位边界与默认能力；模型、知识、技能、工作流和渠道仍须在各自中心完成治理与发布。</div><div className="grid gap-3 sm:grid-cols-2"><Field label="蓝图名称" value={name} onChange={setName} placeholder="例如：变更风险分析专员" required /><Field label="岗位角色" value={role} onChange={setRole} placeholder="例如：变更影响评估" required /><Field label="所属部门" value={department} onChange={setDepartment} placeholder="例如：信息技术部" required /><Field label="服务对象" value={serviceObject} onChange={setServiceObject} placeholder="例如：应用交付团队" /><SelectField label="风险等级" value={risk} onChange={(value) => setRisk(value as DigitalEmployee['risk'])} options={[['low', '低风险'], ['medium', '中风险'], ['high', '高风险']]} /><Field label="能力标签" value={tags} onChange={setTags} placeholder="例如：变更、风险评估" /></div><label className="grid gap-1.5 text-xs font-medium">岗位说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="说明岗位服务目标、默认职责与需要人工介入的边界。" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal outline-none focus:border-[var(--brand)]" /></label>{error && <p role="alert" className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-light)] px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}</div></Modal>;
}

function OnboardingManagementView({ employees, onSelect }: { employees: DigitalEmployee[]; onSelect: (id: string) => void }) {
  const pending = employees.filter((item) => item.release.status === 'pending_approval');
  const ready = employees.filter((item) => item.evaluation.status === 'passed' && item.release.status === 'not_released');
  const incomplete = employees.filter((item) => item.release.status === 'not_released' && item.evaluation.status !== 'passed' && item.lifecycle !== 'active');
  const queue = employees.filter((item) => item.release.status !== 'released' || item.lifecycle === 'pending_approval');
  return <div className="space-y-3"><section className="grid gap-3 sm:grid-cols-3"><KpiCard label="待执行评测" value={incomplete.length} sub="个" icon={ClipboardCheck} tone="neutral" /><KpiCard label="可申请上岗" value={ready.length} sub="个" icon={CheckCircle2} tone="success" /><KpiCard label="待双重审批" value={pending.length} sub="个" icon={Clock3} tone="warn" /></section><section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_12px_rgba(15,23,42,0.05)]"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div><h2 className="text-sm font-semibold">上岗发布</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">按「配置完成 → 质量评测 → 上岗申请 → 双重审批生效」推进。缺档案、未绑已发布能力或评测未过不可申请上岗。</p></div><Badge tone="info">当前工作区</Badge></div><div className="divide-y divide-[var(--border)]">{queue.map((employee) => { const gate = employee.release.status === 'pending_approval' ? '待双重审批' : employee.evaluation.status === 'passed' ? '可申请上岗' : employee.evaluation.status === 'failed' ? '评测未通过' : employee.evaluation.status === 'running' ? '评测进行中' : '待执行评测'; return <button type="button" key={employee.id} onClick={() => onSelect(employee.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-hover)]"><div className="flex min-w-0 items-center gap-3"><EmployeeAvatar employee={employee} size={38} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{employeePrimaryLabel(employee)}</span>{isDepartmentHead(employee) && <Badge tone="info">部门负责人</Badge>}<Badge tone={employee.evaluation.status === 'passed' ? 'success' : employee.evaluation.status === 'failed' ? 'error' : 'warn'}>{employee.evaluation.status === 'passed' ? `评测 ${employee.evaluation.score}` : employee.evaluation.status === 'failed' ? '评测未通过' : employee.evaluation.status === 'running' ? '评测中' : '待评测'}</Badge><Badge tone={employee.release.status === 'pending_approval' ? 'warn' : 'neutral'}>{employee.release.status === 'pending_approval' ? '待双重审批' : '未上岗'}</Badge></div><p className="mt-1 text-xs text-[var(--text-muted)]">{employeeSecondaryLabel(employee)} · {employee.environment === 'production' ? '生产环境' : employee.environment === 'staging' ? '预发环境' : '沙箱环境'} · {employee.risk === 'high' ? '高风险岗位' : '常规风险岗位'}</p></div></div><div className="shrink-0 text-right"><span className="block text-xs font-medium text-[var(--brand)]">{gate}</span><span className="mt-1 block text-[11px] text-[var(--text-muted)]">查看门禁与处置 →</span></div></button>; })}{!queue.length && <EmptyState icon={CheckCircle2} title="所有员工均已完成上岗" description="后续配置变更将按版本化双重审批和定期复测管理。" />}</div></section></div>;
}

function OperationsView({ employees, onSelect }: { employees: DigitalEmployee[]; onSelect: (id: string) => void }) {
  const active = employees.filter((item) => item.lifecycle === 'active');
  const anomalies = active.filter((item) => item.runtime.anomalies > 0);
  const handoffs = active.reduce((sum, item) => sum + item.runtime.handoffs24h, 0);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const transition = useApiMutation<DigitalEmployee, { id: string; lifecycle: DigitalEmployeeLifecycle }>(({ id }) => `/api/digital-employees/${id}/lifecycle`);
  const operated = employees.filter((item) => ['active', 'paused', 'quarantined'].includes(item.lifecycle)).sort((a, b) => Number(b.lifecycle !== 'active') - Number(a.lifecycle !== 'active') || b.runtime.anomalies - a.runtime.anomalies || b.runtime.handoffs24h - a.runtime.handoffs24h || compareDigitalEmployees(a, b));
  return <div className="space-y-3"><section className="grid gap-3 sm:grid-cols-3"><KpiCard label="在岗运行" value={active.length} sub="个" icon={HeartPulse} tone="success" /><KpiCard label="人工交接" value={handoffs} sub="次 / 24h" icon={UserRoundCheck} tone="neutral" /><KpiCard label="待处置异常" value={anomalies.length} sub="个员工" icon={ShieldAlert} tone={anomalies.length ? 'warn' : 'success'} /></section><section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[0_2px_12px_rgba(15,23,42,0.05)]"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div><h2 className="text-sm font-semibold">运行管理</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">稳定员工仅展示运行摘要；异常、频繁交接、暂停或隔离状态才需要下钻处置与证据。</p></div><span className="rounded-md bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">{operated.length} 个运行对象</span></div><div className="grid gap-3 p-4 lg:grid-cols-2">{operated.map((employee) => <OperationsEmployeeCard key={employee.id} employee={employee} isAdmin={isAdmin} loading={transition.isPending && transition.variables?.id === employee.id} onSelect={onSelect} onTransition={(lifecycle) => { const action = lifecycle === 'paused' ? '暂停运行' : lifecycle === 'quarantined' ? '隔离运行' : '恢复运行'; if (window.confirm(`确认${action}「${employeePrimaryLabel(employee)}」？此操作将记录审计证据。`)) transition.mutate({ id: employee.id, lifecycle }); }} />)}{!operated.length && <EmptyState icon={HeartPulse} title="暂无运行对象" description="完成评测与发布审批后，员工会进入运行运营视图。" />}</div></section></div>;
}

function OperationsEmployeeCard({ employee, isAdmin, loading, onSelect, onTransition }: { employee: DigitalEmployee; isAdmin: boolean; loading: boolean; onSelect: (id: string) => void; onTransition: (lifecycle: DigitalEmployeeLifecycle) => void }) {
  const navigate = useNavigate();
  const attention = employee.runtime.anomalies > 0 || employee.runtime.handoffs24h >= 10 || employee.lifecycle === 'paused' || employee.lifecycle === 'quarantined';
  const status = employee.lifecycle === 'paused' ? '已暂停' : employee.lifecycle === 'quarantined' ? '已隔离' : employee.runtime.anomalies ? `${employee.runtime.anomalies} 项异常` : employee.runtime.handoffs24h >= 10 ? '交接偏高' : '运行稳定';
  const tone = employee.lifecycle === 'quarantined' ? 'error' : attention ? 'warn' : 'success';
  const detail = employee.runtime.anomalies ? `存在异常信号，建议由 ${employee.escalationOwner} 接管处置。` : employee.lifecycle === 'paused' || employee.lifecycle === 'quarantined' ? '运行已受控停止，可查看处置与审计证据。' : employee.runtime.handoffs24h >= 10 ? '人工交接高于运营阈值，建议检查工作负载与边界策略。' : '核心指标正常，无需进入详情。';
  return <article className={cn('rounded-xl border bg-[var(--bg)] p-4', attention ? 'border-[var(--warning)]/35' : 'border-[var(--border)]')}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><EmployeeAvatar employee={employee} size={40} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><div className="truncate text-sm font-semibold">{employeePrimaryLabel(employee)}</div>{isDepartmentHead(employee) && <Badge tone="info">部门负责人</Badge>}</div><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{employeeSecondaryLabel(employee)}</p></div></div><Badge tone={tone}>{status}</Badge></div><div className="mt-4 grid grid-cols-4 gap-2 border-t border-[var(--border)] pt-3 text-center"><Metric label="调用" value={employee.runtime.calls24h} /><Metric label="成功率" value={employee.runtime.successRate ? `${(employee.runtime.successRate * 100).toFixed(1)}%` : '—'} /><Metric label="交接" value={employee.runtime.handoffs24h} /><Metric label="成本" value={`¥${employee.runtime.costToday}`} /></div><div className="mt-3 flex min-h-8 items-center justify-between gap-2"><p className="text-[11px] leading-4 text-[var(--text-muted)]">{detail}</p><div className="flex shrink-0 gap-2">{employee.lifecycle === 'active' && <Button size="sm" onClick={() => navigate(`/copilot?employeeId=${employee.id}`)}><MessageSquare className="h-3.5 w-3.5" />发起协作</Button>}{attention && <Button size="sm" variant="secondary" onClick={() => onSelect(employee.id)}>查看处置</Button>}{isAdmin && employee.lifecycle === 'active' && <Button size="sm" variant="ghost" loading={loading} onClick={() => onTransition('paused')}>暂停</Button>}{isAdmin && employee.lifecycle === 'active' && <Button size="sm" variant="ghost" loading={loading} onClick={() => onTransition('quarantined')}>隔离</Button>}{isAdmin && (employee.lifecycle === 'paused' || employee.lifecycle === 'quarantined') && employee.release.status === 'released' && <Button size="sm" loading={loading} onClick={() => onTransition('active')}>恢复</Button>}</div></div></article>;
}

function SimpleList({ title, description, employees, onSelect, empty, right }: { title: string; description: string; employees: DigitalEmployee[]; onSelect: (id: string) => void; empty?: string; right: (employee: DigitalEmployee) => ReactNode }) { return <section className="de-employee-shell rounded-xl bg-[var(--surface-1)]"><div className="px-5 py-4" style={{ boxShadow: 'var(--saas-divider)' }}><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p></div>{employees.length ? <div className="divide-y divide-[var(--border)]">{employees.map((employee) => <button type="button" key={employee.id} onClick={() => onSelect(employee.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[var(--bg-hover)]"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-medium">{employeePrimaryLabel(employee)}</span>{isDepartmentHead(employee) && <Badge tone="info">部门负责人</Badge>}<Badge tone={lifecycleMeta[employee.lifecycle].tone}>{lifecycleMeta[employee.lifecycle].label}</Badge></div><div className="mt-1 text-xs text-[var(--text-muted)]">{employeeSecondaryLabel(employee)}</div></div><div className="shrink-0">{right(employee)}</div></button>)}</div> : <EmptyState icon={BriefcaseBusiness} title={empty ?? '暂无记录'} />}</section>; }

type EmployeeConfigurationInput = {
  profile: Pick<DigitalEmployee, 'name' | 'role' | 'department' | 'description' | 'owner' | 'escalationOwner' | 'serviceObject' | 'risk' | 'environment'>;
  boundary: Pick<DigitalEmployee, 'responsibilities' | 'prohibitedActions' | 'handoffPolicy' | 'boundaryPolicy'>;
  capabilities: DigitalEmployee['capabilities'];
  memoryPolicy: DigitalEmployee['memoryPolicy'];
};
type EmployeeConfigurationResult = DigitalEmployeeConfigurationVersion & { requiresApproval: boolean };
type EmployeeConfigurationSection = 'profile' | 'boundary' | 'capabilities' | 'memory';
type CapabilityCatalogOption = { id: string; name: string; meta: string };
type DigitalEmployeeCapabilityCatalog = { models: CapabilityCatalogOption[]; knowledge: CapabilityCatalogOption[]; skills: CapabilityCatalogOption[]; tools: CapabilityCatalogOption[]; workflows: CapabilityCatalogOption[]; channels: CapabilityCatalogOption[] };

const executionModeOptions: Array<[DigitalEmployeeExecutionMode, string]> = [['recommend', '仅建议'], ['approval_required', '需双重审批后执行'], ['execute', '可执行'], ['prohibited', '禁止']];
const environmentOptions = [['sandbox', '沙箱'], ['staging', '预发'], ['production', '生产']] as const;

function resolveBoundaryPolicy(employee: DigitalEmployee): DigitalEmployeeBoundaryPolicy {
  if (employee.boundaryPolicy) return {
    ...employee.boundaryPolicy,
    responsibilities: employee.boundaryPolicy.responsibilities.map((item) => ({ ...item, deliverables: [...item.deliverables] })),
    capabilityModes: employee.boundaryPolicy.capabilityModes.map((item) => ({ ...item })),
    allowedEnvironments: [...employee.boundaryPolicy.allowedEnvironments],
    handoff: { ...employee.boundaryPolicy.handoff, triggers: [...employee.boundaryPolicy.handoff.triggers], approvers: [...employee.boundaryPolicy.handoff.approvers], notificationChannels: [...employee.boundaryPolicy.handoff.notificationChannels] },
  };
  return {
    responsibilities: employee.responsibilities.map((title, index) => ({ id: `${employee.id}-responsibility-${index}`, title, objective: '在岗位授权范围内形成可复核的业务结果。', trigger: '收到工作请求或命中服务事件', deliverables: ['处理结论与处置证据'], evidenceRequired: true })),
    capabilityModes: [
      ...employee.capabilities.tools.map((capabilityName) => ({ capabilityType: 'tool' as const, capabilityName, mode: 'approval_required' as DigitalEmployeeExecutionMode })),
      ...employee.capabilities.workflows.map((capabilityName) => ({ capabilityType: 'workflow' as const, capabilityName, mode: 'approval_required' as DigitalEmployeeExecutionMode })),
      ...employee.capabilities.skills.map((capabilityName) => ({ capabilityType: 'skill' as const, capabilityName, mode: 'recommend' as DigitalEmployeeExecutionMode })),
    ],
    dataClassification: employee.risk === 'high' ? 'restricted' : 'confidential',
    allowedEnvironments: [employee.environment],
    handoff: { triggers: employee.handoffPolicy?.triggers?.length ? [...employee.handoffPolicy.triggers] : ['命中禁止行为', '需要业务判断'], approvers: [employee.escalationOwner], notificationChannels: [...employee.capabilities.channels], slaMinutes: employee.risk === 'high' ? 15 : 30 },
  };
}

function BoundaryPolicyEditor({ policy, capabilities, onChange }: { policy: DigitalEmployeeBoundaryPolicy; capabilities: DigitalEmployee['capabilities']; onChange: (policy: DigitalEmployeeBoundaryPolicy) => void }) {
  const updateResponsibility = (index: number, patch: Partial<DigitalEmployeeResponsibility>) => onChange({ ...policy, responsibilities: policy.responsibilities.map((item, current) => current === index ? { ...item, ...patch } : item) });
  const setHandoff = (key: keyof DigitalEmployeeBoundaryPolicy['handoff'], value: string[] | number) => onChange({ ...policy, handoff: { ...policy.handoff, [key]: value } });
  const rows = [
    ...capabilities.tools.map((capabilityName) => ({ capabilityType: 'tool' as const, capabilityName, label: '工具' })),
    ...capabilities.workflows.map((capabilityName) => ({ capabilityType: 'workflow' as const, capabilityName, label: '工作流' })),
    ...capabilities.skills.map((capabilityName) => ({ capabilityType: 'skill' as const, capabilityName, label: '技能' })),
  ];
  const setCapabilityMode = (capabilityType: 'tool' | 'workflow' | 'skill', capabilityName: string, mode: DigitalEmployeeExecutionMode) => {
    const exists = policy.capabilityModes.some((item) => item.capabilityType === capabilityType && item.capabilityName === capabilityName);
    onChange({ ...policy, capabilityModes: exists ? policy.capabilityModes.map((item) => item.capabilityType === capabilityType && item.capabilityName === capabilityName ? { ...item, mode } : item) : [...policy.capabilityModes, { capabilityType, capabilityName, mode }] });
  };
  const modeOf = (capabilityType: 'tool' | 'workflow' | 'skill', capabilityName: string) => policy.capabilityModes.find((item) => item.capabilityType === capabilityType && item.capabilityName === capabilityName)?.mode ?? 'recommend';
  const setEnvironment = (environment: DigitalEmployeeBoundaryPolicy['allowedEnvironments'][number], checked: boolean) => onChange({ ...policy, allowedEnvironments: checked ? [...new Set([...policy.allowedEnvironments, environment])] : policy.allowedEnvironments.filter((item) => item !== environment) });
  const addResponsibility = () => onChange({ ...policy, responsibilities: [...policy.responsibilities, { id: `responsibility-${Date.now()}`, title: '未命名岗位职责', objective: '', trigger: '', deliverables: [], evidenceRequired: true }] });
  const updateArrayItem = (key: 'triggers' | 'approvers' | 'notificationChannels', index: number, value: string) => setHandoff(key, policy.handoff[key].map((item, current) => current === index ? value : item));
  const addArrayItem = (key: 'triggers' | 'approvers' | 'notificationChannels', placeholder: string) => setHandoff(key, [...policy.handoff[key], placeholder]);
  return <div className="space-y-6"><section><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">岗位职责</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">每项职责需说明目标、触发条件与可复核交付，构成岗位授权的业务契约。</p></div><Button size="sm" variant="secondary" onClick={addResponsibility}><Plus className="h-3.5 w-3.5" />新增职责</Button></div><div className="mt-3 space-y-3">{policy.responsibilities.map((item, index) => <article key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5"><div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-semibold text-[var(--brand)]">职责 {String(index + 1).padStart(2, '0')}</span>{policy.responsibilities.length > 1 && <button type="button" onClick={() => onChange({ ...policy, responsibilities: policy.responsibilities.filter((_, current) => current !== index) })} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]" aria-label={`删除职责 ${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="职责名称" value={item.title} onChange={(value) => updateResponsibility(index, { title: value })} placeholder="例如：运行态势汇总" required /><Field label="业务目标" value={item.objective} onChange={(value) => updateResponsibility(index, { objective: value })} placeholder="例如：形成风险优先级建议" required /><Field label="触发条件" value={item.trigger} onChange={(value) => updateResponsibility(index, { trigger: value })} placeholder="例如：每日 09:00 / 重大事件" required /><Field label="交付与证据" value={item.deliverables.join('、')} onChange={(value) => updateResponsibility(index, { deliverables: value.split('、').map((entry) => entry.trim()).filter(Boolean) })} placeholder="例如：态势摘要、风险清单" /><label className="flex items-center gap-2 text-xs font-medium sm:col-span-2"><input type="checkbox" checked={item.evidenceRequired} onChange={(event) => updateResponsibility(index, { evidenceRequired: event.target.checked })} />要求留存处置证据</label></div></article>)}</div></section><section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5"><div><h3 className="text-sm font-semibold">执行边界</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">仅可对当前已装配的工具、工作流和技能授予执行模式；能力本体仍由各中心独立治理。</p></div><div className="mt-3 overflow-x-auto"><div className="min-w-[540px] divide-y divide-[var(--border)] text-xs"><div className="grid grid-cols-[minmax(180px,1fr)_92px_150px] gap-3 px-2 pb-2 text-[11px] text-[var(--text-muted)]"><span>已绑定能力</span><span>类型</span><span>授权模式</span></div>{rows.map((row) => <div key={`${row.capabilityType}-${row.capabilityName}`} className="grid grid-cols-[minmax(180px,1fr)_92px_150px] items-center gap-3 px-2 py-2.5"><span className="truncate font-medium">{row.capabilityName}</span><Badge tone="info">{row.label}</Badge><select value={modeOf(row.capabilityType, row.capabilityName)} onChange={(event) => setCapabilityMode(row.capabilityType, row.capabilityName, event.target.value as DigitalEmployeeExecutionMode)} className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus:border-[var(--brand)]">{executionModeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}{!rows.length && <p className="px-2 py-3 text-xs text-[var(--text-muted)]">请先在能力装配中引用至少一项工具、工作流或技能。</p>}</div></div></section><div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5"><h3 className="text-sm font-semibold">升级与审批</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">命中触发条件后中止自主执行，通知接管人并保留审批、交接证据。</p><div className="mt-3 space-y-2">{([['triggers', '接管触发条件', '例如：置信度不足'] as const, ['approvers', '接管负责人', '例如：值班经理'] as const, ['notificationChannels', '通知渠道', '例如：事件中心'] as const]).map(([key, label, placeholder]) => <div key={key}><div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-medium">{label}</span><button type="button" onClick={() => addArrayItem(key, placeholder)} className="text-[11px] text-[var(--brand)]">+ 添加</button></div>{policy.handoff[key].map((value, index) => <div key={`${key}-${index}`} className="mb-1.5 flex gap-1.5"><input value={value} onChange={(event) => updateArrayItem(key, index, event.target.value)} placeholder={placeholder} className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus:border-[var(--brand)]" />{policy.handoff[key].length > 1 && <button type="button" onClick={() => setHandoff(key, policy.handoff[key].filter((_, current) => current !== index))} className="rounded-md px-2 text-[var(--text-muted)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]">×</button>}</div>)}</div>)}<NumberField label="接管 SLA" value={policy.handoff.slaMinutes} suffix="分钟" onChange={(value) => setHandoff('slaMinutes', value)} /></div></section><section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5"><h3 className="text-sm font-semibold">数据与范围</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">仅声明此岗位策略允许使用的数据级别和运行环境，不替代零信任、数据权限策略。</p><div className="mt-3 grid gap-3"><SelectField label="最高数据分类" value={policy.dataClassification} onChange={(value) => onChange({ ...policy, dataClassification: value as DigitalEmployeeBoundaryPolicy['dataClassification'] })} options={[['internal', '内部'], ['confidential', '敏感'], ['restricted', '受限']]} /><fieldset><legend className="mb-1.5 text-xs font-medium">允许运行环境</legend><div className="flex flex-wrap gap-3">{environmentOptions.map(([value, label]) => <label key={value} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={policy.allowedEnvironments.includes(value)} onChange={(event) => setEnvironment(value, event.target.checked)} />{label}</label>)}</div></fieldset></div></section></div></div>;
}

function ContextualEmployeeDetail({ employee, context, onClose }: { employee: DigitalEmployee; context: 'release' | 'operations'; onClose: () => void }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const [message, setMessage] = useState<string | null>(null);
  const { data: evidence = [] } = useApiQuery<Array<{ id: string; time: string; actor: string; action: string; target: string; result: string }>>(['digital-employee', employee.id, 'evidence'], `/api/digital-employees/${employee.id}/evidence`);
  const evaluate = useApiMutation<DigitalEmployee, Record<string, never>>(() => `/api/digital-employees/${employee.id}/evaluate`, {
    onSuccess: (result) => setMessage(result.evaluation.status === 'passed' ? '评测已通过，可作为上岗门禁依据。' : '评测未通过，请完善岗位配置后复测。'),
    onError: (err) => setMessage(err instanceof Error ? err.message : '评测失败'),
  });
  const release = useApiMutation<DigitalEmployee, Record<string, never>>(() => `/api/digital-employees/${employee.id}/release`, {
    onSuccess: () => setMessage('已提交上岗申请，须由另一名管理员完成双重审批。'),
    onError: (err) => setMessage(err instanceof Error ? err.message : '申请失败'),
  });
  const transition = useApiMutation<DigitalEmployee, { lifecycle: DigitalEmployeeLifecycle }>(() => `/api/digital-employees/${employee.id}/lifecycle`, {
    onSuccess: (_, input) => setMessage(input.lifecycle === 'active' ? (employee.release.status === 'pending_approval' ? '双重审批已通过，员工已上岗。' : '已恢复运行。') : input.lifecycle === 'paused' ? '已暂停员工运行。' : input.lifecycle === 'quarantined' ? '已隔离员工运行。' : '状态已更新。'),
    onError: (err) => setMessage(err instanceof Error ? err.message : '状态变更失败'),
  });
  const meta = context === 'release'
    ? { title: '上岗发布详情', description: '集中处理质量评测、上岗门禁与双重审批。' }
    : { title: '运行管理详情', description: '仅展示岗位服务健康、人工交接与运行处置；不可修改岗位或能力。' };
  const selfRequested = Boolean(employee.release.requestedById && user?.id && employee.release.requestedById === user.id);
  const releaseGate = [
    { label: '岗位档案', passed: Boolean(employee.owner && employee.escalationOwner && employee.escalationOwner !== '待指定' && employee.serviceObject), detail: employee.owner ? `负责人：${employee.owner}` : '待指定负责人' },
    { label: '能力边界', passed: Boolean(employee.capabilities.model) && employee.responsibilities.length > 0 && (employee.capabilities.skills.length + employee.capabilities.tools.length + employee.capabilities.workflows.length) > 0, detail: `${employee.capabilities.skills.length + employee.capabilities.tools.length + employee.capabilities.workflows.length} 项已绑定能力` },
    { label: '质量评测', passed: employee.evaluation.status === 'passed', detail: employee.evaluation.status === 'failed' ? `未通过 ${employee.evaluation.score ?? ''}`.trim() : employee.evaluation.score ? `${employee.evaluation.score} 分` : '尚未通过' },
    { label: '双重审批上岗', passed: employee.release.status === 'released', detail: employee.release.status === 'released' ? `申请人 ${employee.release.requestedBy ?? '—'} · 批准人 ${employee.release.approver ?? '—'}` : employee.release.status === 'pending_approval' ? `待批准 · 申请人 ${employee.release.requestedBy ?? '—'}` : '尚未申请' },
  ];
  const releaseActions = (
    <>
      {employee.release.status === 'not_released' && employee.evaluation.status !== 'passed' && (
        <Button size="sm" variant="secondary" loading={evaluate.isPending} onClick={() => evaluate.mutate({})}><ClipboardCheck className="h-3.5 w-3.5" />执行评测</Button>
      )}
      {employee.evaluation.status === 'failed' && employee.release.status === 'not_released' && (
        <Button size="sm" variant="secondary" loading={evaluate.isPending} onClick={() => evaluate.mutate({})}><ClipboardCheck className="h-3.5 w-3.5" />重新评测</Button>
      )}
      {employee.evaluation.status === 'passed' && employee.release.status === 'not_released' && (
        <Button size="sm" loading={release.isPending} onClick={() => release.mutate({})}><Route className="h-3.5 w-3.5" />申请上岗</Button>
      )}
      {employee.release.status === 'pending_approval' && isAdmin && !selfRequested && (
        <Button size="sm" loading={transition.isPending} onClick={() => transition.mutate({ lifecycle: 'active' })}><CheckCircle2 className="h-3.5 w-3.5" />确认双重审批上岗</Button>
      )}
      {employee.release.status === 'pending_approval' && selfRequested && (
        <span className="text-[11px] text-[var(--text-muted)]">您是申请人，须由另一名管理员批准</span>
      )}
      <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
    </>
  );
  const operationsActions = (
    <>
      {employee.lifecycle === 'active' && <Button size="sm" onClick={() => navigate(`/copilot?employeeId=${employee.id}`)}><MessageSquare className="h-3.5 w-3.5" />发起协作</Button>}
      {isAdmin && employee.lifecycle === 'active' && <Button size="sm" variant="secondary" loading={transition.isPending} onClick={() => transition.mutate({ lifecycle: 'paused' })}><Pause className="h-3.5 w-3.5" />暂停运行</Button>}
      {isAdmin && employee.lifecycle === 'active' && <Button size="sm" variant="secondary" loading={transition.isPending} onClick={() => transition.mutate({ lifecycle: 'quarantined' })}><ShieldAlert className="h-3.5 w-3.5" />隔离</Button>}
      {isAdmin && (employee.lifecycle === 'paused' || employee.lifecycle === 'quarantined') && employee.release.status === 'released' && <Button size="sm" loading={transition.isPending} onClick={() => transition.mutate({ lifecycle: 'active' })}><Play className="h-3.5 w-3.5" />恢复运行</Button>}
      <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
    </>
  );
  return (
    <Modal open onClose={onClose} title={`${meta.title} · ${employeePrimaryLabel(employee)}`} description={`${employeeSecondaryLabel(employee)} · 岗位版本 ${employee.version} · ${meta.description}`} size="xl" footer={context === 'release' ? releaseActions : operationsActions}>
      <div className="space-y-5">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3">
              <EmployeeAvatar employee={employee} size={54} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{employeePrimaryLabel(employee)}</h2>
                  <Badge tone={lifecycleMeta[employee.lifecycle].tone}>{lifecycleMeta[employee.lifecycle].label}</Badge>
                  <Badge tone={riskMeta[employee.risk].tone}>{riskMeta[employee.risk].label}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{employeeSecondaryLabel(employee)} · 服务 {employee.serviceObject}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">岗位负责人 {employee.owner} · 人工接管 {employee.escalationOwner}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-7 gap-y-2 text-xs">
              <span><span className="block text-[11px] text-[var(--text-muted)]">运行环境</span><strong className="mt-0.5 block font-medium">{employee.environment === 'production' ? '生产环境' : employee.environment === 'staging' ? '预发环境' : '沙箱环境'}</strong></span>
              <span><span className="block text-[11px] text-[var(--text-muted)]">质量评测</span><strong className="mt-0.5 block font-medium">{employee.evaluation.status === 'failed' ? '未通过' : employee.evaluation.score ?? '待评测'}{employee.evaluation.score ? ' 分' : ''}</strong></span>
            </div>
          </div>
        </section>
        {message && <p role="status" className="rounded-lg border border-[var(--brand)]/25 bg-[var(--brand-light)] px-3 py-2 text-xs text-[var(--text-secondary)]">{message}</p>}
        {context === 'release' && (
          <section className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold">质量与上岗门禁</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">缺岗位档案、未绑已发布能力、评测未过或审批未齐时不可上岗；申请人与批准人必须分离。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {releaseGate.map((gate) => (
                <div key={gate.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{gate.label}</span><Badge tone={gate.passed ? 'success' : 'warn'}>{gate.passed ? '已满足' : '待处理'}</Badge></div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{gate.detail}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <BoundaryList icon={ClipboardCheck} tone="text-[var(--brand)]" title="评测覆盖" values={['岗位任务正确性', '职责与边界遵循', '能力调用可控性', '人工接管可达性']} />
              <BoundaryList icon={ShieldCheck} tone="text-[var(--success)]" title="当前评测依据" values={[`岗位版本 ${employee.version}`, `已绑定能力 ${employee.capabilities.skills.length + employee.capabilities.tools.length + employee.capabilities.workflows.length} 项`]} />
            </div>
          </section>
        )}
        {context === 'operations' && (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">运行健康与处置</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">仅提供业务运行观测和受控启停/隔离，不允许在运行场景修改岗位、能力或记忆策略。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="24 小时调用" value={employee.runtime.calls24h} />
              <Metric label="成功率" value={employee.runtime.successRate ? `${(employee.runtime.successRate * 100).toFixed(1)}%` : '—'} />
              <Metric label="P95 延迟" value={employee.runtime.p95Ms || '—'} sub={employee.runtime.p95Ms ? 'ms' : undefined} />
              <Metric label="今日成本" value={`¥${employee.runtime.costToday}`} />
              <Metric label="人工交接" value={employee.runtime.handoffs24h} sub="次" />
              <Metric label="异常信号" value={employee.runtime.anomalies} sub="项" />
            </div>
            <div className={cn('rounded-lg border p-3 text-xs leading-5', employee.runtime.anomalies || employee.lifecycle === 'quarantined' ? 'border-[var(--warning)]/40 bg-[var(--warning-light)] text-[var(--text-secondary)]' : 'border-[var(--success)]/30 bg-[var(--success-bg)] text-[var(--text-secondary)]')}>
              <HeartPulse className="mr-1 inline h-3.5 w-3.5" />
              {employee.lifecycle === 'quarantined' ? '员工已隔离，恢复前请确认异常已处置并保留证据。' : employee.runtime.anomalies ? `检测到 ${employee.runtime.anomalies} 项异常信号；如影响扩大，请暂停或隔离并交由 ${employee.escalationOwner} 接管。` : '当前未发现异常信号，仍应按岗位授权契约执行人工接管和审批要求。'}
            </div>
          </section>
        )}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">审计证据</h3>
          {evidence.length ? evidence.map((event) => (
            <div key={event.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
              <div className="text-sm font-medium">{event.action}</div>
              <div className="mt-1 text-xs text-[var(--text-secondary)]">{event.target}</div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">{event.actor} · {new Date(event.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div>
            </div>
          )) : <p className="text-xs text-[var(--text-muted)]">暂无证据记录。</p>}
        </section>
      </div>
    </Modal>
  );
}

function EmployeeDetailModal({ employee, context, onClose }: { employee: DigitalEmployee | null; context: ModuleTab; onClose: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>('profile');
  const [configOpen, setConfigOpen] = useState(false);
  const { data: evidence = [] } = useApiQuery<Array<{ id: string; time: string; actor: string; action: string; target: string; result: string }>>(['digital-employee', employee?.id, 'evidence'], `/api/digital-employees/${employee?.id}/evidence`, undefined, { enabled: Boolean(employee) });
  useEffect(() => {
    if (!employee) return;
    if (isDepartmentHead(employee) && (context === 'catalog' || context === 'roleSetup')) setTab('team');
    else setTab(context === 'capabilities' ? 'capabilities' : context === 'roleSetup' ? 'boundary' : 'profile');
    setConfigOpen(false);
  }, [employee, context]);
  if (!employee) return null;
  if (context === 'release' || context === 'operations') return <ContextualEmployeeDetail employee={employee} context={context} onClose={onClose} />;
  // 配置模式复用当前员工详情的状态；页面上始终只保留一个模态窗，返回即可回到原详情。
  if (configOpen) return <EmployeeConfigurationWorkbench employee={employee} open onClose={() => setConfigOpen(false)} initialSection={context === 'capabilities' ? 'capabilities' : context === 'roleSetup' ? 'boundary' : 'profile'} />;
  const head = isDepartmentHead(employee);
  const detailTabs: Array<{ key: DetailTab; label: string }> = context === 'capabilities'
    ? [
        { key: 'capabilities', label: '能力装配' },
        { key: 'boundary', label: '执行边界（只读）' },
        { key: 'evidence', label: '审计证据' },
      ]
    : context === 'roleSetup'
      ? [
          ...(head ? [{ key: 'team' as const, label: '部门班组' }] : []),
          { key: 'profile', label: '档案与岗位' },
          { key: 'boundary', label: '职责与边界' },
          { key: 'memory', label: '记忆与上下文' },
          { key: 'evidence', label: '审计证据' },
        ]
      : [
          ...(head ? [{ key: 'team' as const, label: '部门班组' }] : []),
          { key: 'profile', label: '档案与岗位' },
          { key: 'boundary', label: '职责与边界' },
          { key: 'capabilities', label: '能力装配' },
          { key: 'memory', label: '记忆与上下文' },
          { key: 'runtime', label: '运行观测' },
          { key: 'evidence', label: '审计证据' },
        ];
  const nextStepHint = employee.release.status === 'pending_approval'
    ? '上岗申请待双重审批'
    : employee.evaluation.status !== 'passed'
      ? '下一步：上岗发布 · 执行评测'
      : employee.release.status !== 'released'
        ? '下一步：上岗发布 · 申请上岗'
        : null;
  const actions = (
    <>
      {employee.lifecycle === 'active' && <Button size="sm" onClick={() => navigate(`/copilot?employeeId=${employee.id}`)}><MessageSquare className="h-3.5 w-3.5" />发起协作</Button>}
      {head && employee.lifecycle === 'active' && (context === 'catalog' || context === 'roleSetup') && <Button size="sm" variant="secondary" onClick={() => setTab('team')}>班组调度</Button>}
      {(context === 'catalog' || context === 'roleSetup' || context === 'capabilities') && <Button size="sm" variant="secondary" onClick={() => navigate(`/tasks?task=${encodeURIComponent(employeePrimaryLabel(employee))}`)}>相关任务</Button>}
      {(context === 'roleSetup' || context === 'capabilities') && <Button size="sm" variant="secondary" onClick={() => setConfigOpen(true)}><SlidersHorizontal className="h-3.5 w-3.5" />{context === 'capabilities' ? '打开装配' : '配置岗位'}</Button>}
      {context === 'catalog' && nextStepHint && <span className="hidden text-[11px] text-[var(--text-muted)] sm:inline">{nextStepHint}</span>}
      <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
    </>
  );
  return <><Modal open onClose={onClose} title={`员工详情 · ${employeePrimaryLabel(employee)}`} description={`${employeeSecondaryLabel(employee)} · 岗位版本 ${employee.version}`} size="xl" footer={actions}><section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex min-w-0 items-center gap-3"><EmployeeAvatar employee={employee} size={56} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-[var(--text)]">{employeePrimaryLabel(employee)}</h2>{head && <Badge tone="info">部门负责人</Badge>}<Badge tone={lifecycleMeta[employee.lifecycle].tone}>{lifecycleMeta[employee.lifecycle].label}</Badge><Badge tone={riskMeta[employee.risk].tone}>{riskMeta[employee.risk].label}</Badge></div><p className="mt-1 text-xs text-[var(--text-secondary)]">{employeeSecondaryLabel(employee)}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">服务 {employee.serviceObject} · 岗位负责人 {employee.owner}</p></div></div><div className="grid grid-cols-2 gap-x-7 gap-y-2 text-xs"><span><span className="block text-[11px] text-[var(--text-muted)]">运行环境</span><strong className="mt-0.5 block font-medium">{employee.environment === 'production' ? '生产环境' : employee.environment === 'staging' ? '预发环境' : '沙箱环境'}</strong></span><span><span className="block text-[11px] text-[var(--text-muted)]">质量评测</span><strong className="mt-0.5 block font-medium">{employee.evaluation.score ?? '待评测'}{employee.evaluation.score ? ' 分' : ''}</strong></span></div></div></section><div className="mt-5 grid gap-5 md:grid-cols-[164px_minmax(0,1fr)]"><nav className="flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-3 md:flex-col md:border-b-0 md:border-r md:pb-0 md:pr-4" aria-label="员工详情导航">{detailTabs.map((item) => <button type="button" key={item.key} onClick={() => setTab(item.key)} className={cn('shrink-0 rounded-lg px-3 py-2.5 text-left text-xs transition-colors', tab === item.key ? 'bg-[var(--brand-light)] font-semibold text-[var(--brand)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]')}>{item.label}</button>)}</nav><div className="min-h-[330px] min-w-0">{tab === 'team' && head && <DepartmentTeamPanel head={employee} />}
{tab === 'profile' && <ProfileContent employee={employee} />}
{tab === 'boundary' && <StructuredBoundaryContent employee={employee} />}
{tab === 'capabilities' && <CapabilityContent employee={employee} />}
{tab === 'memory' && <MemoryContent employee={employee} />}
{tab === 'runtime' && <RuntimeContent employee={employee} />}
{tab === 'evidence' && <div className="space-y-3">{evidence.map((event) => <div key={event.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3"><div className="text-sm font-medium">{event.action}</div><div className="mt-1 text-xs text-[var(--text-secondary)]">{event.target}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{event.actor} · {new Date(event.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div></div>)}</div>}</div></div></Modal><EmployeeConfigurationWorkbench employee={employee} open={configOpen} onClose={() => setConfigOpen(false)} initialSection={context === 'capabilities' ? 'capabilities' : context === 'roleSetup' ? 'boundary' : 'profile'} /></>;
}

function EmployeeConfigurationWorkbench({ employee, open, onClose, initialSection = 'profile' }: { employee: DigitalEmployee; open: boolean; onClose: () => void; initialSection?: EmployeeConfigurationSection }) {
  const [section, setSection] = useState<EmployeeConfigurationSection>(initialSection);
  const [profile, setProfile] = useState({ name: employee.name, role: employee.role, department: employee.department, description: employee.description, owner: employee.owner, escalationOwner: employee.escalationOwner, serviceObject: employee.serviceObject, risk: employee.risk, environment: employee.environment });
  const [boundaryPolicy, setBoundaryPolicy] = useState<DigitalEmployeeBoundaryPolicy>(() => resolveBoundaryPolicy(employee));
  const [capabilities, setCapabilities] = useState({ ...employee.capabilities, knowledge: employee.capabilities.knowledge.join('\n'), skills: employee.capabilities.skills.join('\n'), tools: employee.capabilities.tools.join('\n'), workflows: employee.capabilities.workflows.join('\n'), channels: employee.capabilities.channels.join('\n') });
  const [memory, setMemory] = useState({ ...employee.memoryPolicy });
  const [message, setMessage] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const { data: versions = [] } = useApiQuery<DigitalEmployeeConfigurationVersion[]>(['digital-employee', employee.id, 'configuration-versions'], `/api/digital-employees/${employee.id}/configuration-versions`, undefined, { enabled: open });
  const { data: capabilityCatalog } = useApiQuery<DigitalEmployeeCapabilityCatalog>(['digital-employee-capability-catalog'], '/api/digital-employee-capability-catalog', undefined, { enabled: open });
  const save = useApiMutation<EmployeeConfigurationResult, EmployeeConfigurationInput>(() => `/api/digital-employees/${employee.id}/configuration`, { onSuccess: (result) => setMessage(result.requiresApproval ? `${result.version} 已提交双重审批；批准前不会影响在岗员工。` : `${result.version} 已保存，可继续执行评测与上岗流程。`), onError: () => setMessage('保存未完成，请检查必填项与岗位边界。') });
  const approve = useApiMutation<DigitalEmployeeConfigurationVersion, { versionId: string }>(({ versionId }) => `/api/digital-employees/${employee.id}/configuration-versions/${versionId}/approve`);
  const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
  useEffect(() => { if (!open) return; setSection(initialSection); setMessage(null); setProfile({ name: employee.name, role: employee.role, department: employee.department, description: employee.description, owner: employee.owner, escalationOwner: employee.escalationOwner, serviceObject: employee.serviceObject, risk: employee.risk, environment: employee.environment }); setBoundaryPolicy(resolveBoundaryPolicy(employee)); setCapabilities({ ...employee.capabilities, knowledge: employee.capabilities.knowledge.join('\n'), skills: employee.capabilities.skills.join('\n'), tools: employee.capabilities.tools.join('\n'), workflows: employee.capabilities.workflows.join('\n'), channels: employee.capabilities.channels.join('\n') }); setMemory({ ...employee.memoryPolicy }); }, [employee, open, initialSection]);
  const blocking = [!profile.name.trim() && '员工名称', !profile.role.trim() && '岗位名称', !profile.department.trim() && '所属部门', !capabilities.model.trim() && '模型路由', !boundaryPolicy.responsibilities.length && '至少一项岗位职责', boundaryPolicy.responsibilities.some((item) => !item.title.trim() || !item.objective.trim() || !item.trigger.trim()) && '完整的职责目标与触发条件', !boundaryPolicy.handoff.triggers.some(Boolean) && '至少一项接管触发条件', !boundaryPolicy.handoff.approvers.some(Boolean) && '至少一名接管负责人', !boundaryPolicy.allowedEnvironments.length && '至少一个运行环境'].filter(Boolean) as string[];
  const controlled = employee.lifecycle === 'active' || profile.environment === 'production' || profile.risk === 'high';
  const submit = () => { if (blocking.length) { setMessage(`请补齐：${blocking.join('、')}`); return; } const normalizedPolicy = { ...boundaryPolicy, responsibilities: boundaryPolicy.responsibilities.map((item) => ({ ...item, title: item.title.trim(), objective: item.objective.trim(), trigger: item.trigger.trim(), deliverables: item.deliverables.filter(Boolean) })), handoff: { ...boundaryPolicy.handoff, triggers: boundaryPolicy.handoff.triggers.map((item) => item.trim()).filter(Boolean), approvers: boundaryPolicy.handoff.approvers.map((item) => item.trim()).filter(Boolean), notificationChannels: boundaryPolicy.handoff.notificationChannels.map((item) => item.trim()).filter(Boolean) } }; save.mutate({ profile, boundary: { responsibilities: normalizedPolicy.responsibilities.map((item) => item.title), prohibitedActions: normalizedPolicy.capabilityModes.filter((item) => item.mode === 'prohibited').map((item) => `禁止使用：${item.capabilityName}`), handoffPolicy: { triggers: normalizedPolicy.handoff.triggers, approvalRequiredFor: normalizedPolicy.capabilityModes.filter((item) => item.mode === 'approval_required').map((item) => item.capabilityName) }, boundaryPolicy: normalizedPolicy }, capabilities: { agentId: capabilities.agentId || undefined, model: capabilities.model, knowledge: lines(capabilities.knowledge), skills: lines(capabilities.skills), tools: lines(capabilities.tools), workflows: lines(capabilities.workflows), channels: lines(capabilities.channels) }, memoryPolicy: memory }); };
  const nav: Array<{ key: EmployeeConfigurationSection; label: string; note: string }> = initialSection === 'capabilities'
    ? [{ key: 'capabilities', label: '能力装配', note: '受控能力引用' }, { key: 'boundary', label: '执行边界', note: '授权模式' }]
    : initialSection === 'boundary' || initialSection === 'profile' || initialSection === 'memory'
      ? [{ key: 'profile', label: '岗位档案', note: '身份与责任' }, { key: 'boundary', label: '职责与边界', note: '可做与不可做' }, { key: 'memory', label: '记忆策略', note: '三层沉淀策略' }]
      : [{ key: 'profile', label: '岗位档案', note: '身份与责任' }, { key: 'boundary', label: '职责与边界', note: '可做与不可做' }, { key: 'capabilities', label: '能力装配', note: '受控能力引用' }, { key: 'memory', label: '记忆策略', note: '三层沉淀策略' }];
  const pendingVersion = versions.find((item) => item.status === 'pending_approval');
  return <Modal open={open} onClose={onClose} title="配置数字员工" description="配置只维护岗位档案、边界、能力引用和记忆策略；高风险与在岗变更需双重审批后生效。" size="xl" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button loading={save.isPending} disabled={Boolean(blocking.length)} onClick={submit}><Save className="h-3.5 w-3.5" />{controlled ? '提交双重审批变更' : '保存配置草稿'}</Button></>}><div className="space-y-5"><section className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-[var(--bg-elevated)] px-4 py-3" style={{ boxShadow: 'var(--saas-ring)' }}><div className="flex min-w-0 items-center gap-3"><EmployeeAvatar employee={employee} size={44} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{employeePrimaryLabel(employee)}</h2><Badge tone={lifecycleMeta[employee.lifecycle].tone}>{lifecycleMeta[employee.lifecycle].label}</Badge><Badge tone={riskMeta[profile.risk].tone}>{riskMeta[profile.risk].label}</Badge></div><p className="mt-1 text-xs text-[var(--text-muted)]">{employeeSecondaryLabel(employee)} · 当前配置 {versions.find((item) => item.status === 'current')?.version ?? '配置 v1'}</p></div></div><div className={cn('rounded-lg px-3 py-2 text-xs', controlled ? 'bg-[var(--warning-bg)] text-[var(--text-secondary)]' : 'bg-[var(--success-bg)] text-[var(--text-secondary)]')} style={{ boxShadow: 'var(--saas-ring)' }}>{controlled ? '本次变更将进入双重审批，批准后生效' : '草稿配置可直接保存，仍需完成评测与上岗'}</div></section>{message && <p role="status" className="rounded-lg border border-[var(--brand)]/25 bg-[var(--brand-light)] px-3 py-2 text-xs text-[var(--text-secondary)]">{message}</p>}<div className="grid gap-5 lg:grid-cols-[164px_minmax(0,1fr)_220px]"><aside><p className="mb-2 px-3 text-[11px] font-medium text-[var(--text-muted)]">配置分区</p><nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="员工配置导航">{nav.map((item) => <button type="button" key={item.key} onClick={() => setSection(item.key)} className={cn('shrink-0 rounded-lg px-3 py-2.5 text-left transition-colors', section === item.key ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}><span className="block text-xs font-medium">{item.label}</span><span className="mt-0.5 block text-[10px] opacity-75">{item.note}</span></button>)}</nav></aside><main className="min-w-0 border-y border-[var(--border)] py-1 lg:border-y-0 lg:border-x lg:px-5">{section === 'profile' && <div className="space-y-4"><div><h3 className="text-sm font-semibold">岗位档案</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">明确岗位身份、责任归属和服务范围；生产环境与高风险调整会进入受控变更。</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="员工名称（花名）" value={profile.name} onChange={(value) => setProfile({ ...profile, name: value })} placeholder="例如：北辰" required /><Field label="岗位名称" value={profile.role} onChange={(value) => setProfile({ ...profile, role: value })} placeholder="例如：信息技术部负责人" required /><Field label="所属部门" value={profile.department} onChange={(value) => setProfile({ ...profile, department: value })} placeholder="例如：信息技术部" required /><Field label="岗位负责人" value={profile.owner} onChange={(value) => setProfile({ ...profile, owner: value })} placeholder="明确业务责任人" /><Field label="人工接管负责人" value={profile.escalationOwner} onChange={(value) => setProfile({ ...profile, escalationOwner: value })} placeholder="异常或越权时的接管人" /><Field label="服务对象" value={profile.serviceObject} onChange={(value) => setProfile({ ...profile, serviceObject: value })} placeholder="例如：生产业务系统" /><SelectField label="风险等级" value={profile.risk} onChange={(value) => setProfile({ ...profile, risk: value as DigitalEmployee['risk'] })} options={[['low', '低风险'], ['medium', '中风险'], ['high', '高风险']]} /><SelectField label="运行环境" value={profile.environment} onChange={(value) => setProfile({ ...profile, environment: value as DigitalEmployee['environment'] })} options={[['sandbox', '沙箱环境'], ['staging', '预发环境'], ['production', '生产环境']]} /><label className="grid gap-1.5 text-xs font-medium sm:col-span-2">岗位说明<textarea value={profile.description} onChange={(event) => setProfile({ ...profile, description: event.target.value })} rows={4} placeholder="说明服务目标、覆盖范围与人工介入边界。" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-[var(--brand)]" /></label></div></div>}
{section === 'boundary' && <BoundaryPolicyEditor policy={boundaryPolicy} capabilities={{ agentId: capabilities.agentId || undefined, model: capabilities.model, knowledge: lines(capabilities.knowledge), skills: lines(capabilities.skills), tools: lines(capabilities.tools), workflows: lines(capabilities.workflows), channels: lines(capabilities.channels) }} onChange={setBoundaryPolicy} />}
{section === 'capabilities' && <CapabilityAssemblySelector catalog={capabilityCatalog} capabilities={{ agentId: capabilities.agentId || undefined, model: capabilities.model, knowledge: lines(capabilities.knowledge), skills: lines(capabilities.skills), tools: lines(capabilities.tools), workflows: lines(capabilities.workflows), channels: lines(capabilities.channels) }} onChange={(next) => setCapabilities({ ...next, knowledge: next.knowledge.join('\n'), skills: next.skills.join('\n'), tools: next.tools.join('\n'), workflows: next.workflows.join('\n'), channels: next.channels.join('\n') })} />}
{section === 'memory' && <div className="space-y-4"><div><h3 className="text-sm font-semibold">三层记忆策略</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">短期记忆支撑当前会话，工作记忆支撑岗位协作，长期记忆仅可通过审核沉淀为知识候选。</p></div><div className="grid gap-3 sm:grid-cols-2"><NumberField label="短期记忆保留" value={memory.shortTermHours} suffix="小时" onChange={(value) => setMemory({ ...memory, shortTermHours: value })} /><NumberField label="工作记忆保留" value={memory.workingDays} suffix="天" onChange={(value) => setMemory({ ...memory, workingDays: value })} /><SelectField label="长期记忆提炼" value={memory.longTermCadence} onChange={(value) => setMemory({ ...memory, longTermCadence: value as DigitalEmployee['memoryPolicy']['longTermCadence'] })} options={[['daily', '每日提炼'], ['weekly', '每周提炼']]} /><SelectField label="转知识策略" value={memory.knowledgePromotion} onChange={(value) => setMemory({ ...memory, knowledgePromotion: value as DigitalEmployee['memoryPolicy']['knowledgePromotion'] })} options={[['approval_required', '审核后转知识'], ['disabled', '不转知识']]} /></div><div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-light)] p-3 text-xs leading-5 text-[var(--text-secondary)]"><Database className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />长期记忆不会直接成为企业知识；通过内容审核后，才进入知识中心的权威资产目录。</div></div>}</main><aside className="space-y-3"><section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><h3 className="text-xs font-semibold">配置校验</h3><div className="mt-3 space-y-2 text-[11px]">{blocking.length ? blocking.map((item) => <div key={item} className="flex gap-1.5 text-[var(--danger)]"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />待补齐：{item}</div>) : <div className="flex gap-1.5 text-[var(--success)]"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />必填配置已完整</div>}<div className="flex gap-1.5 text-[var(--text-secondary)]"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[var(--brand)]" />{controlled ? '需双重审批后生效' : '可保存为草稿配置'}</div></div></section><section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><h3 className="text-xs font-semibold">配置版本</h3><div className="mt-3 space-y-3">{versions.slice(0, 3).map((version) => <div key={version.id} className="text-[11px]"><div className="flex items-center justify-between gap-2"><span className="font-medium">{version.version}</span><Badge tone={version.status === 'current' ? 'success' : version.status === 'pending_approval' ? 'warn' : 'neutral'}>{version.status === 'current' ? '当前' : version.status === 'pending_approval' ? '待审批' : '已替代'}</Badge></div><p className="mt-1 leading-4 text-[var(--text-muted)]">{version.changeSummary}</p>{version.status === 'pending_approval' && isAdmin && version.updatedById !== user?.id && version.updatedBy !== user?.name && <Button size="sm" className="mt-2 w-full" loading={approve.isPending && approve.variables?.versionId === version.id} onClick={() => approve.mutate({ versionId: version.id })}>批准并生效</Button>}{version.status === 'pending_approval' && isAdmin && (version.updatedById === user?.id || version.updatedBy === user?.name) && <p className="mt-2 text-[10px] text-[var(--text-muted)]">您是提交人，须由另一名管理员批准</p>}</div>)}{!versions.length && <p className="text-[11px] text-[var(--text-muted)]">正在读取配置版本…</p>}</div></section>{pendingVersion && <p className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-light)] px-3 py-2 text-[11px] leading-4 text-[var(--text-secondary)]">存在待审批配置 {pendingVersion.version}，批准前当前岗位不会改变。</p>}</aside></div></div></Modal>;
}

function LinkedAssetPicker({ label, hint, options, values, onChange }: { label: string; hint: string; options: CapabilityCatalogOption[]; values: string[]; onChange: (values: string[]) => void }) {
  const available = options.filter((item) => !values.includes(item.name));
  const remove = (name: string) => onChange(values.filter((item) => item !== name));
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-xs font-semibold">{label}</h3><p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{hint}</p></div><select aria-label={`添加${label}`} value="" onChange={(event) => { const selected = event.target.value; if (selected) onChange([...values, selected]); }} className="h-8 max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 text-xs outline-none focus:border-[var(--brand)]"><option value="">+ 选择已发布资产</option>{available.map((item) => <option key={item.id} value={item.name}>{item.name} · {item.meta}</option>)}</select></div><div className="mt-3 min-h-8 space-y-1.5">{values.length ? values.map((value) => { const option = options.find((item) => item.name === value); return <div key={value} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-2"><div className="min-w-0"><span className="block truncate text-xs font-medium">{value}</span><span className="block truncate text-[11px] text-[var(--text-muted)]">{option?.meta ?? '历史已绑定资产'}</span></div><button type="button" onClick={() => remove(value)} className="rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)]">移除</button></div>; }) : <p className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">尚未选择</p>}</div></section>;
}

function CapabilityAssemblySelector({ catalog, capabilities, onChange }: { catalog?: DigitalEmployeeCapabilityCatalog; capabilities: DigitalEmployee['capabilities']; onChange: (capabilities: DigitalEmployee['capabilities']) => void }) {
  const update = (key: 'knowledge' | 'skills' | 'tools' | 'workflows' | 'channels', values: string[]) => onChange({ ...capabilities, [key]: values });
  const modelOptions = catalog?.models ?? [];
  return <div className="space-y-4"><div><h3 className="text-sm font-semibold">能力装配</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">从模型、知识、技能、工作流和渠道中心选择当前工作区内已发布、已准入的资产。名称不可手填，保存后将记录引用关系并纳入变更审批。</p></div><section className="rounded-xl bg-[var(--bg-elevated)] p-3.5" style={{ boxShadow: 'var(--saas-ring)' }}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-semibold">模型路由 <span className="text-[var(--danger)]">*</span></h3><p className="mt-1 text-[11px] text-[var(--text-muted)]">仅展示当前工作区已激活供应商的可用模型。</p></div><select value={capabilities.model} onChange={(event) => onChange({ ...capabilities, model: event.target.value })} className="h-9 min-w-[230px] rounded-lg bg-[var(--surface-1)] px-2 text-xs outline-none" style={{ boxShadow: 'var(--saas-ring)' }}><option value={capabilities.model}>{capabilities.model}（当前引用）</option>{modelOptions.filter((item) => item.name !== capabilities.model).map((item) => <option key={item.id} value={item.name}>{item.name} · {item.meta}</option>)}</select></div>{capabilities.agentId && <div className="mt-3 flex items-center gap-2 pt-3 text-[11px] text-[var(--text-muted)]" style={{ boxShadow: 'inset 0 1px 0 rgba(15,23,42,0.06)' }}><BriefcaseBusiness className="h-3.5 w-3.5" />执行运行时已绑定（内部），由上岗与配置流程维护，不作为对外身份。</div>}</section>{!catalog && <div className="rounded-xl px-3 py-5 text-center text-xs text-[var(--text-muted)]" style={{ boxShadow: 'var(--saas-ring)' }}>正在同步各能力中心的可选资产…</div>}{catalog && <div className="grid gap-3 lg:grid-cols-2"><LinkedAssetPicker label="知识" hint="来自知识中心已发布知识包" options={catalog.knowledge} values={capabilities.knowledge} onChange={(values) => update('knowledge', values)} /><LinkedAssetPicker label="技能" hint="来自技能中心已启用技能" options={catalog.skills} values={capabilities.skills} onChange={(values) => update('skills', values)} /><LinkedAssetPicker label="工具与 MCP" hint="来自技能中心已启用工具或 MCP 接入" options={catalog.tools} values={capabilities.tools} onChange={(values) => update('tools', values)} /><LinkedAssetPicker label="流程技能与工作流" hint="优先引用「工作流程 → 发布技能」产物，也可绑定已激活工作流" options={catalog.workflows} values={capabilities.workflows} onChange={(values) => update('workflows', values)} /><LinkedAssetPicker label="渠道" hint="来自渠道中心已启用渠道" options={catalog.channels} values={capabilities.channels} onChange={(values) => update('channels', values)} /></div>}<div className="rounded-lg bg-[var(--warning-bg)] p-3 text-xs leading-5 text-[var(--text-secondary)]" style={{ boxShadow: 'var(--saas-ring)' }}><ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-[var(--warning)]" />引用关系仅允许选择可用资产；生产、在岗或高风险员工调整能力装配时，将作为受控变更提交双重审批（提交人不可自批）。</div></div>;
}

function ProfileContent({ employee }: { employee: DigitalEmployee }) {
  return <div className="space-y-4"><div><h3 className="text-sm font-semibold">岗位档案</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">数字员工以岗位责任服务业务对象，不以底层模型或技术组件作为业务身份。</p></div><div className="grid grid-cols-2 gap-3"><Metric label="花名" value={employee.name} /><Metric label="岗位名称" value={employee.role} /><Metric label="所属部门" value={employee.department} /><Metric label="岗位负责人" value={employee.owner} /><Metric label="服务对象" value={employee.serviceObject} /><Metric label="人工接管负责人" value={employee.escalationOwner} /><Metric label="运行环境" value={employee.environment === 'production' ? '生产' : employee.environment === 'staging' ? '预发' : '沙箱'} /><Metric label="风险等级" value={riskMeta[employee.risk].label} /></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-xs leading-6 text-[var(--text-secondary)]">{employee.description}</div></div>;
}
function StructuredBoundaryContent({ employee }: { employee: DigitalEmployee }) {
  const policy = resolveBoundaryPolicy(employee);
  const modeLabel = Object.fromEntries(executionModeOptions);
  return <div className="space-y-4"><div><h3 className="text-sm font-semibold">岗位授权契约</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">职责、执行授权、人工接管和数据范围作为同一份可审计策略展示。</p></div><div className="space-y-2">{policy.responsibilities.map((item) => <article key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.title}</span>{item.evidenceRequired && <Badge tone="success">留存证据</Badge>}</div><dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><div><dt className="text-[11px] text-[var(--text-muted)]">目标</dt><dd className="mt-0.5 text-[var(--text-secondary)]">{item.objective}</dd></div><div><dt className="text-[11px] text-[var(--text-muted)]">触发</dt><dd className="mt-0.5 text-[var(--text-secondary)]">{item.trigger}</dd></div><div><dt className="text-[11px] text-[var(--text-muted)]">交付</dt><dd className="mt-0.5 text-[var(--text-secondary)]">{item.deliverables.join('、') || '—'}</dd></div></dl></article>)}</div><section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3"><h3 className="text-xs font-semibold">执行边界</h3><div className="mt-2 flex flex-wrap gap-1.5">{policy.capabilityModes.map((item) => <Badge key={`${item.capabilityType}-${item.capabilityName}`} tone={item.mode === 'execute' ? 'success' : item.mode === 'prohibited' ? 'error' : item.mode === 'approval_required' ? 'warn' : 'info'}>{item.capabilityName} · {modeLabel[item.mode]}</Badge>)}</div></section><div className="grid gap-3 sm:grid-cols-2"><BoundaryList icon={UserRoundCheck} tone="text-[var(--brand)]" title={`人工接管 · SLA ${policy.handoff.slaMinutes} 分钟`} values={[...policy.handoff.triggers, `接管人：${policy.handoff.approvers.join('、')}`]} /><BoundaryList icon={ShieldCheck} tone="text-[var(--warning)]" title="数据与范围" values={[`数据分类：${policy.dataClassification === 'internal' ? '内部' : policy.dataClassification === 'confidential' ? '敏感' : '受限'}`, `运行环境：${policy.allowedEnvironments.map((item) => item === 'production' ? '生产' : item === 'staging' ? '预发' : '沙箱').join('、')}`]} /></div></div>;
}
function BoundaryList({ icon: Icon, tone, title, values }: { icon: typeof CheckCircle2; tone: string; title: string; values: string[] }) { return <div><h3 className="mb-2 text-sm font-semibold">{title}</h3><div className="space-y-2">{values.map((value) => <div key={value} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-xs text-[var(--text-secondary)]"><Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone)} />{value}</div>)}</div></div>; }
function CapabilityContent({ employee }: { employee: DigitalEmployee }) {
  const rows = [
    { label: '模型', values: [employee.capabilities.model] },
    { label: '知识', values: employee.capabilities.knowledge },
    { label: '技能', values: employee.capabilities.skills },
    { label: '工具', values: employee.capabilities.tools },
    { label: '工作流', values: employee.capabilities.workflows },
    { label: '渠道', values: employee.capabilities.channels },
  ];
  return <div className="space-y-3"><p className="text-xs leading-5 text-[var(--text-muted)]">仅绑定工作区内已发布、经治理批准的能力版本。能力本体仍由模型、知识、技能、工作流和渠道中心独立治理。</p>{employee.capabilities.agentId && <p className="rounded-lg px-3 py-2 text-[11px] text-[var(--text-muted)]" style={{ boxShadow: 'var(--saas-ring)' }}>执行运行时已绑定（内部），不作为对外岗位身份。</p>}{rows.map((row) => <div key={row.label} className="rounded-lg bg-[var(--bg)] p-3" style={{ boxShadow: 'var(--saas-ring)' }}><div className="text-xs font-semibold">{row.label}</div><div className="mt-2 flex flex-wrap gap-1.5">{row.values.length ? row.values.map((value) => <Badge key={value} tone="neutral">{value}</Badge>) : <span className="text-xs text-[var(--text-muted)]">未绑定</span>}</div></div>)}</div>;
}
function MemoryContent({ employee }: { employee: DigitalEmployee }) { const policy = employee.memoryPolicy; return <div className="space-y-4"><div><h3 className="text-sm font-semibold">三层记忆策略</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">会话短期记忆、岗位工作记忆和经审核的长期记忆彼此分层，长期记忆不会自动成为企业知识。</p></div><div className="grid grid-cols-2 gap-3"><Metric label="短期记忆" value={policy.shortTermHours} sub="小时" /><Metric label="工作记忆" value={policy.workingDays} sub="天" /><Metric label="长期提炼" value={policy.longTermCadence === 'daily' ? '每日' : '每周'} /><Metric label="转知识" value={policy.knowledgePromotion === 'approval_required' ? '需审核' : '已关闭'} /></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs leading-5 text-[var(--text-secondary)]"><Database className="mr-1 inline h-3.5 w-3.5 text-[var(--brand)]" />长期记忆按策略提炼为知识候选，审核通过后才进入知识中心的权威资产目录。</div></div>; }
function RuntimeContent({ employee }: { employee: DigitalEmployee }) { const runtime = employee.runtime; return <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Metric label="24 小时调用" value={runtime.calls24h} /><Metric label="成功率" value={runtime.successRate ? `${(runtime.successRate * 100).toFixed(1)}%` : '—'} /><Metric label="P95 延迟" value={runtime.p95Ms || '—'} sub={runtime.p95Ms ? 'ms' : undefined} /><Metric label="今日成本" value={`¥${runtime.costToday}`} /><Metric label="人工交接" value={runtime.handoffs24h} sub="次" /><Metric label="异常信号" value={runtime.anomalies} sub="项" /></div><div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs leading-5 text-[var(--text-secondary)]"><HeartPulse className="mr-1 inline h-3.5 w-3.5 text-[var(--success)]" />运行运营聚焦业务服务质量；模型、工具与渠道的深度技术指标分别在其所属控制面查看。</div></div>; }

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <label className="grid gap-1.5 text-xs font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-normal outline-none focus:border-[var(--brand)]">{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>; }
function TextAreaField({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint: string }) { return <label className="grid gap-1.5 text-xs font-medium">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-[var(--brand)]" /><span className="font-normal leading-5 text-[var(--text-muted)]">{hint}</span></label>; }
function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) { return <label className="grid gap-1.5 text-xs font-medium">{label}<div className="flex h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)]"><input type="number" min={1} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))} className="min-w-0 flex-1 bg-transparent px-3 text-xs font-normal outline-none" /><span className="flex items-center pr-3 text-xs text-[var(--text-muted)]">{suffix}</span></div></label>; }

function CreateEmployeeModal({ open, onClose, loading, onCreate }: { open: boolean; onClose: () => void; loading: boolean; onCreate: (input: Partial<DigitalEmployee>) => void }) { const [name, setName] = useState(''); const [role, setRole] = useState(''); const [department, setDepartment] = useState(''); const [description, setDescription] = useState(''); const submit = () => { if (!name.trim() || !role.trim() || !department.trim()) return; onCreate({ name, role, department, description, risk: 'low', responsibilities: ['待配置岗位职责'], prohibitedActions: ['待配置禁止行为'] }); }; return <Modal open={open} onClose={onClose} title="新建数字员工" description="创建岗位档案后，再装配能力、完成评测并申请上岗。" size="md" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button loading={loading} disabled={!name.trim() || !role.trim() || !department.trim()} onClick={submit}>创建草稿</Button></>}><div className="grid gap-4"><Field label="员工名称（花名）" value={name} onChange={setName} placeholder="例如：听潮" required /><Field label="岗位名称" value={role} onChange={setRole} placeholder="例如：安全事件分析专员" required /><Field label="所属部门" value={department} onChange={setDepartment} placeholder="例如：信息技术部" required /><label className="grid gap-1.5 text-xs font-medium">岗位说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="说明服务对象、业务目标与人工升级条件。" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal outline-none focus:border-[var(--brand)]" /></label></div></Modal>; }
function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) { return <label className="grid gap-1.5 text-xs font-medium">{label}{required && <span className="ml-1 text-[var(--danger)]">*</span>}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-normal outline-none focus:border-[var(--brand)]" /></label>; }
