import { AlertTriangle, ClipboardCheck, ShieldAlert } from 'lucide-react';

export type TaskPreset = 'pending' | 'human_action' | 'risk';

export function TaskActionSummary({ counts, onPreset }: {
  counts: Record<TaskPreset, number>;
  onPreset: (preset: TaskPreset) => void;
}) {
  const items = [
    { key: 'pending' as const, label: '待处理', hint: '等待开始、确认或分派', icon: ClipboardCheck, tone: 'warning' },
    { key: 'human_action' as const, label: '待审批或接管', hint: '等待人工处置', icon: ShieldAlert, tone: 'brand' },
    { key: 'risk' as const, label: '风险异常', hint: '超时、失败或阻塞', icon: AlertTriangle, tone: 'danger' },
  ];
  return <section className="task-action-summary" aria-label="行动摘要">
    {items.map(({ key, label, hint, icon: Icon, tone }) => (
      <button key={key} type="button" className={`task-action-card ${tone}`} onClick={() => onPreset(key)}>
        <Icon aria-hidden="true" size={19} />
        <span><strong>{label}</strong><small>{hint}</small></span>
        <b>{counts[key]}</b>
      </button>
    ))}
  </section>;
}
