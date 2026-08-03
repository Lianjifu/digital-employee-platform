import { type ReactNode } from 'react';
import { Modal, ModalActions } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}

/**
 * 二次确认弹窗。内部基于 Modal + ModalActions。
 * - tone='danger' 用红色主按钮（用于删除 / 清空 / 批量升级）
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  tone = 'default',
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      overlayClassName="z-[300]"
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => {
            onConfirm();
            onClose();
          }}
          confirmText={confirmText}
          cancelText={cancelText}
          confirmTone={tone === 'danger' ? 'danger' : 'primary'}
        />
      }
    >
      <div className="py-2" />
    </Modal>
  );
}