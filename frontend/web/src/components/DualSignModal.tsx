/**
 * 双签 Modal — 等保 3 写动作必须 2 人签发
 */
import { Modal, Button } from '@de/web-ui';
import { useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onApprove: (approver: string) => void;
  onClose: () => void;
}

export function DualSignModal({ open, title, description, onApprove, onClose }: Props) {
  const [name, setName] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🔐 双签审批（等保 3）"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => {
              onApprove(name.trim());
              setName('');
            }}
          >
            确认签发
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
          ⚠️ 该操作会修改生产环境数据，需要 2 名不同角色用户签发。当前为第一签。
        </div>
        <div>
          <div className="mb-1 text-xs text-[var(--color-text-muted)]">操作</div>
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</div>}
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-muted)]">签发人姓名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入您的姓名"
            className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
          />
        </div>
      </div>
    </Modal>
  );
}