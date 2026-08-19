import { useState } from 'react';
import { Badge, Button, Input } from '@de/web-ui';
import { Box, CheckCircle2, Package, ShieldAlert } from 'lucide-react';
import { useApiMutation, useApiQuery } from '@/services/query';

type SkillPack = {
  packId: string;
  packName: string;
  phase: string;
  autoInstall: boolean;
  requiresApproval?: boolean;
  skillCount: number;
  skills: string[];
};

type SkillPacksResponse = {
  packs: SkillPack[];
};

type DependencyRow = {
  skill?: string;
  skillName?: string;
  externalBins?: string[];
  ready?: boolean;
  missing?: string[];
};

type DependencyMatrixResponse = {
  skills?: DependencyRow[];
  items?: DependencyRow[];
  matrix?: DependencyRow[];
};

const PHASE_LABEL: Record<string, string> = {
  P0: '通用（自动）',
  P1: '协作扩展',
  P2: '重依赖',
  P3: '全量',
};

export function PackInstallPanel({ onInstalled }: { onInstalled?: (msg: string) => void }) {
  const [approvalTicket, setApprovalTicket] = useState('');
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  const { data: packsData, isLoading } = useApiQuery<SkillPacksResponse>(
    ['skills', 'packs'],
    '/api/skills/packs',
  );
  const { data: depData } = useApiQuery<DependencyMatrixResponse>(
    ['skills', 'dependency-matrix'],
    '/api/skills/dependency-matrix',
  );

  const applyPack = useApiMutation<
    { packId: string; packName: string; installed: number },
    { packId: string; approvalTicket?: string }
  >(({ packId }) => `/api/skills/apply-pack/${packId}`, {
    onSuccess: (result) => {
      onInstalled?.(`已安装岗位包「${result.packName}」${result.installed} 项技能`);
      setPendingPack(null);
      setApprovalTicket('');
    },
    onError: (err) => {
      onInstalled?.(err instanceof Error ? err.message.replace(/^E_[A-Z_]+:\s*/, '') : '安装失败');
    },
  });

  const packs = (packsData?.packs ?? []).slice().sort((a, b) => a.phase.localeCompare(b.phase));
  const depItems = depData?.skills ?? depData?.items ?? depData?.matrix ?? [];
  const missingBins = depItems.filter((row) => row.missing && row.missing.length > 0);

  const handleApply = (pack: SkillPack) => {
    if (pack.requiresApproval && !approvalTicket.trim()) {
      setPendingPack(pack.packId);
      return;
    }
    applyPack.mutate({
      packId: pack.packId,
      approvalTicket: pack.requiresApproval ? approvalTicket.trim() : undefined,
    });
  };

  if (isLoading) {
    return <p className="text-xs text-[var(--text-muted)]">加载岗位包…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[var(--brand)]" />
          <h3 className="text-sm font-semibold">技能岗位包</h3>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">
          通用包冷启动自动安装；协作扩展、重依赖（需审批）、全量包可按需一键安装到当前工作区。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {packs.map((pack) => (
          <article
            key={pack.packId}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Box className="h-4 w-4 text-[var(--brand)]" />
              <strong className="text-sm">{pack.packName}</strong>
              <Badge tone="neutral">{PHASE_LABEL[pack.phase] ?? pack.phase}</Badge>
              {pack.autoInstall && <Badge tone="success">自动</Badge>}
              {pack.requiresApproval && <Badge tone="warn">需审批</Badge>}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {pack.skillCount} 项技能 · {pack.skills.slice(0, 4).join('、')}
              {pack.skills.length > 4 ? ` 等 ${pack.skillCount} 项` : ''}
            </p>
            {pendingPack === pack.packId && pack.requiresApproval && (
              <div className="mt-3 space-y-2">
                <Input
                  value={approvalTicket}
                  onChange={(e) => setApprovalTicket(e.target.value)}
                  placeholder="审批单号（重依赖包必填）"
                  className="h-8 text-xs"
                />
              </div>
            )}
            <Button
              size="sm"
              className="mt-3 w-full"
              variant={pack.autoInstall ? 'secondary' : 'primary'}
              disabled={pack.autoInstall || applyPack.isPending}
              loading={applyPack.isPending && pendingPack === pack.packId}
              onClick={() => handleApply(pack)}
            >
              {pack.autoInstall ? (
                <><CheckCircle2 className="h-3.5 w-3.5" />已自动安装</>
              ) : (
                <>安装 {pack.packName}</>
              )}
            </Button>
          </article>
        ))}
      </div>

      {missingBins.length > 0 && (
        <section className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--warning)]">
            <ShieldAlert className="h-4 w-4" />
            外部依赖预检
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-[var(--text-secondary)]">
            {missingBins.slice(0, 6).map((row) => (
              <li key={row.skillName ?? row.skill}>
                <code>{row.skillName ?? row.skill}</code> 缺少：{(row.missing ?? []).join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
