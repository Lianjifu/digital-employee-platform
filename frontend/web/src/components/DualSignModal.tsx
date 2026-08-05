/**
 * 单人人工审核授权 Modal（替代双重审批）
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
  onApprove: (note?: string) => Promise<void>;
  onClose: () => void;
}

export function DualSignModal({ open, title, description, currentIdentity, canApprove, eligibilityMessage, onApprove, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) { setSubmitting(false); setError(null); setNote(''); }
  }, [open]);

  const confirm = async () => {
    if (!canApprove || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onApprove(note.trim() || undefined);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '授权失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="人工审核授权"
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
            {submitting ? '正在校验…' : '确认授权'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />该操作需一名授权人人工审核通过后方可执行。发起人不可自批。
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
            <div className="mb-1 text-[10px] text-[var(--text-muted)]">审核方式</div>
            <div className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-3.5 w-3.5 text-[var(--warning)]" />单人授权</div>
            <div className="mt-1"><Badge tone="info" className="text-[9px]">required = 1</Badge></div>
          </div>
        </div>
        <label className="block text-xs">
          <span className="text-[var(--text-muted)]">备注（可选）</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs"
            rows={2}
            placeholder="授权说明"
          />
        </label>
        <div className={canApprove ? 'rounded-md bg-[var(--success-bg)] px-3 py-2 text-[11px] text-[var(--success)]' : 'rounded-md bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[var(--warning)]'}>
          {canApprove ? '当前身份可审核授权。确认后将写入不可抵赖的授权记录。' : eligibilityMessage}
        </div>
        {error && <div role="alert" className="rounded-md bg-[var(--danger-bg)] px-3 py-2 text-[11px] text-[var(--danger)]">{error}</div>}
      </div>
    </Modal>
  );
}
