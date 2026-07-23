import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Bot, Brain, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Database, FileCheck2, ShieldCheck, Sparkles, Workflow, X } from 'lucide-react';
import { Button } from '@de/web-ui';

type OnboardingGuideProps = {
  open: boolean;
  onClose: () => void;
};

const VALUE_CARDS = [
  { icon: ShieldCheck, title: '安全受控执行', description: '身份、权限、审批与策略边界贯穿每次关键操作。' },
  { icon: Bot, title: '能力统一编排', description: '组合智能体、模型、知识、技能与工作流，形成可复用能力。' },
  { icon: ClipboardCheck, title: '全过程可追溯', description: '会话、任务、执行与审计证据统一关联，便于复核与运营。' },
];

const JOURNEY_CARDS = [
  { number: '01', title: '能力接入', description: '配置模型供应商、知识与技能，建立可调用的能力基础。' },
  { number: '02', title: '智能编排', description: '组合智能体与工作流，将业务规则转化为可复用执行路径。' },
  { number: '03', title: '受控运行', description: '在审批、零信策略与审计记录的保护下开展协同执行。' },
];

export function OnboardingGuide({ open, onClose }: OnboardingGuideProps) {
  const [page, setPage] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  if (!open) return null;

  const isJourney = page === 2;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="grid h-[calc(100dvh-24px)] max-h-[650px] w-full max-w-6xl grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] overflow-y-auto rounded-[24px] border border-white/80 bg-white/65 shadow-[0_24px_72px_rgba(15,23,42,0.28)] backdrop-blur-2xl sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(410px,0.9fr)]">
        <PlatformPreview page={page} />

        <div className="relative flex min-h-[590px] flex-col border-l border-white/70 bg-[#eaf4ff]/70 p-3 backdrop-blur-xl sm:p-6 lg:p-9">
          <button type="button" onClick={onClose} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:border-white/80 hover:bg-white/60 hover:text-[var(--text)] sm:right-5 sm:top-5 sm:h-8 sm:w-8" aria-label="关闭引导">
            <X className="h-4 w-4" />
          </button>

          {!isJourney ? (
            <div className="pr-7 pt-4 sm:pr-10">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--brand)] sm:gap-2 sm:text-xs"><Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />数字员工平台</div>
              <p className="mt-5 text-xs font-medium text-[var(--text-secondary)] sm:mt-8 sm:text-sm">欢迎进入数字员工平台</p>
              <h1 id="onboarding-title" className="mt-2 max-w-md text-lg font-semibold leading-snug text-[#155eef] sm:text-[30px] sm:leading-tight">让数字员工在受控边界内协同工作</h1>
              <p className="mt-3 max-w-md text-[11px] leading-5 text-[var(--text-secondary)] sm:mt-4 sm:text-sm sm:leading-6">以持续验证守住身份、权限、数据与执行边界，让智能能力可复用、可度量、可审计。</p>
            </div>
          ) : (
            <div className="pr-7 pt-4 sm:pr-10">
              <div className="text-[10px] font-semibold text-[var(--brand)] sm:text-xs">核心路径</div>
              <h1 id="onboarding-title" className="mt-5 text-lg font-semibold leading-snug text-[#155eef] sm:mt-7 sm:text-[30px] sm:leading-tight">建立数字员工执行闭环</h1>
              <p className="mt-3 max-w-md text-[11px] leading-5 text-[var(--text-secondary)] sm:mt-4 sm:text-sm sm:leading-6">从能力接入到受控运行，逐步完成企业级数字员工的启用与治理。</p>
            </div>
          )}

          <div className="mt-5 space-y-2 sm:mt-8 sm:space-y-3">
            {isJourney ? JOURNEY_CARDS.map((item) => (
              <div key={item.number} className="flex gap-2 rounded-xl border border-white/90 bg-white/65 px-2.5 py-3 shadow-[0_8px_20px_rgba(31,86,164,0.08)] backdrop-blur-md sm:gap-4 sm:px-4 sm:py-4">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#e6f0ff] text-[9px] font-semibold text-[#155eef] sm:h-8 sm:w-8 sm:text-xs">{item.number}</span>
                <div><h2 className="text-xs font-semibold text-[var(--text)] sm:text-sm">{item.title}</h2><p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)] sm:text-xs sm:leading-5">{item.description}</p></div>
              </div>
            )) : VALUE_CARDS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-2 rounded-xl border border-white/90 bg-white/65 px-2.5 py-3 shadow-[0_8px_20px_rgba(31,86,164,0.08)] backdrop-blur-md sm:gap-4 sm:px-4 sm:py-4">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#e6f0ff] text-[#155eef] sm:h-8 sm:w-8"><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></span>
                <div><h2 className="text-xs font-semibold text-[var(--text)] sm:text-sm">{title}</h2><p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)] sm:text-xs sm:leading-5">{description}</p></div>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-1.5 pt-6 sm:gap-3 sm:pt-8">
            <div className="mr-auto flex items-center gap-1 text-[10px] font-medium text-[var(--text-muted)] sm:text-xs">
              <button type="button" onClick={() => setPage(1)} disabled={page === 1} className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-white/65 hover:text-[#155eef] disabled:cursor-not-allowed disabled:opacity-35" aria-label="上一页"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="min-w-7 text-center">{page}/2</span>
              <button type="button" onClick={() => setPage(2)} disabled={page === 2} className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-white/65 hover:text-[#155eef] disabled:cursor-not-allowed disabled:opacity-35" aria-label="下一页"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
            {!isJourney && <Button variant="ghost" onClick={onClose}>跳过</Button>}
            {isJourney ? <Button onClick={onClose}>开始使用<CheckCircle2 className="h-3.5 w-3.5" /></Button> : <Button onClick={() => setPage(2)}>下一步<ArrowRight className="h-3.5 w-3.5" /></Button>}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlatformPreview({ page }: { page: 1 | 2 }) {
  return (
    <div className="relative min-h-[590px] overflow-hidden bg-[#eaf3ff] p-2.5 sm:p-6 lg:p-9">
      <div className="flex h-full overflow-hidden rounded-2xl border border-white/90 bg-white/80 shadow-[0_16px_36px_rgba(31,86,164,0.12)] backdrop-blur-xl">
        <PreviewNavigation active={page === 1 ? '能力中心' : '运行中心'} />
        <div className="min-w-0 flex-1 p-2.5 sm:p-4 lg:p-5">
          <PreviewHeader title={page === 1 ? '能力中心' : '运行中心'} detail={page === 1 ? '统一管理企业数字员工能力资产' : '查看数字员工受控执行状态'} />
          {page === 1 ? <CapabilitiesThumbnail /> : <OperationsThumbnail />}
        </div>
      </div>
    </div>
  );
}

function PreviewNavigation({ active }: { active: string }) {
  const items = ['工作台', '会话任务', '智能编排', '能力中心', '运行中心', '安全治理'];
  return (
    <aside className="hidden w-[104px] shrink-0 border-r border-[#e5edf8] bg-white/70 p-3 sm:flex sm:flex-col lg:w-[126px]">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#155eef]"><span className="grid h-6 w-6 place-items-center rounded-md bg-[#155eef] text-[9px] font-bold text-white">DE</span><span className="hidden lg:inline">Digital</span></div>
      <div className="mt-7 space-y-1">{items.map((item) => <div key={item} className={`rounded-md px-2 py-1.5 text-[9px] ${item === active ? 'bg-[#e8f1ff] font-semibold text-[#155eef]' : 'text-[var(--text-muted)]'}`}>{item}</div>)}</div>
      <div className="mt-auto rounded-md bg-[#f4f8fe] px-2 py-1.5 text-[9px] text-[var(--text-muted)]">当前工作区</div>
    </aside>
  );
}

function PreviewHeader({ title, detail }: { title: string; detail: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-[#e5edf8] pb-2.5 sm:pb-3"><div><div className="text-[11px] font-semibold text-[var(--text)] sm:text-sm">{title}</div><div className="mt-0.5 hidden text-[9px] text-[var(--text-muted)] sm:block">{detail}</div></div><div className="flex items-center gap-1.5"><span className="hidden rounded-md border border-[#d8e8ff] bg-[#f5f9ff] px-2 py-1 text-[9px] text-[#155eef] sm:inline">生产</span><span className="h-2 w-2 rounded-full bg-[#22a06b]" /></div></div>;
}

function CapabilitiesThumbnail() {
  const capabilities = [
    { icon: Brain, label: '模型', value: '06' },
    { icon: Bot, label: '智能体', value: '12' },
    { icon: Database, label: '知识', value: '24' },
    { icon: Workflow, label: '工作流', value: '08' },
  ];
  return (
    <div className="pt-3 sm:pt-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">{capabilities.map(({ icon: Icon, label, value }) => <div key={label} className="rounded-xl border border-[#e1ebf8] bg-white p-2.5 shadow-[0_4px_12px_rgba(31,86,164,0.05)] sm:p-3"><Icon className="h-3.5 w-3.5 text-[#155eef]" /><div className="mt-3 text-lg font-semibold text-[var(--text)] sm:text-xl">{value}</div><div className="mt-0.5 text-[9px] text-[var(--text-muted)] sm:text-[10px]">{label}</div></div>)}</div>
      <div className="mt-3 rounded-xl border border-[#e1ebf8] bg-white p-2.5 sm:p-3"><div className="flex items-center justify-between"><div className="text-[10px] font-medium text-[var(--text)] sm:text-xs">能力接入状态</div><span className="text-[9px] text-[#155eef]">18 已就绪</span></div><div className="mt-3 grid grid-cols-4 gap-1.5"><div className="h-1.5 rounded-full bg-[#155eef]" /><div className="h-1.5 rounded-full bg-[#5d95f5]" /><div className="h-1.5 rounded-full bg-[#9fc5ff]" /><div className="h-1.5 rounded-full bg-[#d9e9ff]" /></div></div>
    </div>
  );
}

function OperationsThumbnail() {
  const runs = [{ name: '客户服务协同', state: '运行中' }, { name: '合同审核流程', state: '待复核' }, { name: '知识更新任务', state: '已完成' }];
  return (
    <div className="pt-3 sm:pt-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3"><PreviewMetric label="运行中" value="12" /><PreviewMetric label="待复核" value="03" /><PreviewMetric label="风险事件" value="00" /></div>
      <div className="mt-3 rounded-xl border border-[#e1ebf8] bg-white p-2.5 sm:p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-medium text-[var(--text)] sm:text-xs">执行队列</span><Activity className="h-3.5 w-3.5 text-[#155eef]" /></div><div className="space-y-2">{runs.map((run, index) => <div key={run.name} className="flex items-center gap-2 rounded-md bg-[#f7faff] px-2 py-2"><span className="grid h-5 w-5 place-items-center rounded bg-[#e8f1ff] text-[9px] font-semibold text-[#155eef]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[9px] text-[var(--text)] sm:text-[10px]">{run.name}</span><span className="text-[9px] text-[#155eef]">{run.state}</span></div>)}</div></div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-[#d8e8ff] bg-[#eff6ff] px-2.5 py-2 text-[9px] text-[#155eef] sm:px-3 sm:py-2.5 sm:text-[10px]"><span>策略命中</span><span className="inline-flex items-center gap-1"><FileCheck2 className="h-3 w-3" />审计已关联</span></div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#e1ebf8] bg-white p-2 sm:p-3"><div className="text-[9px] text-[var(--text-muted)] sm:text-[10px]">{label}</div><div className="mt-1 text-base font-semibold text-[#155eef] sm:mt-2 sm:text-lg">{value}</div></div>;
}
