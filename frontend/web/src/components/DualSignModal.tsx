/**
 * 双重审批 Modal — 等保 3 写动作必须 2 人签发
 */
import { Modal, Button, Badge } from '@de/web-ui';
import { ShieldCheck, UserCheck, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  currentIdentity?: { id: string; name: string; role: string } | null;
  targetSigner?: { userId: string; name: string; role: string };
  canApprove: boolean;
  eligibilityMessage: string;
  onApprove: () => Promise<void>;
  onClose: () => void;
}

const roleLabel: Record<string, string> = { operator: '执行复核', auditor: '审计复核', approver: '变更审批' };

export function DualSignModal({ open, title, description, currentIdentity, targetSigner, canApprove, eligibilityMessage, onApprove, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setSubmitting(false); setError(null); }
  }, [open]);

  const confirm = async () => {
    if (!canApprove || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onApprove();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '签发失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="双重审批"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!canApprove || submitting}
            onClick={() => void confirm()}
          >
            {submitting ? '正在校验…' : '确认签发'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />该操作会修改生产环境数据，需由不同职责的已授权用户完成双重审批。签发身份由当前登录会话校验，不接受手工填写姓名。
        </div>
        <div>
          <div className="mb-1 text-xs text-[var(--color-text-muted)]">操作</div>
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</div>}
        </div>
        <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] text-[var(--text-muted)]">当前登录身份</div>
            <div className="flex items-center gap-1.5 font-medium"><UserCheck className="h-3.5 w-3.5 text-[var(--brand)]" />{currentIdentity?.name ?? '未登录'}</div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">{currentIdentity?.role ?? '—'}</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-[var(--text-muted)]">待签审批席位</div>
            <div className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-3.5 w-3.5 text-[var(--warning)]" />{targetSigner?.name ?? '—'}</div>
            <div className="mt-1"><Badge tone="info" className="text-[9px]">{targetSigner ? (roleLabel[targetSigner.role] ?? targetSigner.role) : '—'}</Badge></div>
          </div>
        </div>
        <div className={canApprove ? 'rounded-md bg-[var(--success-bg)] px-3 py-2 text-[11px] text-[var(--success)]' : 'rounded-md bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[var(--warning)]'}>
          {canApprove ? '身份与审批席位已匹配。确认后将写入不可抵赖的审批记录。' : eligibilityMessage}
        </div>
        {error && <div role="alert" className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-[11px] text-[var(--danger)]">{error}</div>}
      </div>
    </Modal>
  );
}
