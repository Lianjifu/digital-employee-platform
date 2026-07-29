import { AlertTriangle, ClipboardCheck, MessagesSquare, ShieldAlert } from 'lucide-react';

export type TaskPreset = 'pending' | 'human_action' | 'risk' | 'conversation';

export function TaskActionSummary({ counts, onPreset }: {
  counts: Record<TaskPreset, number>;
  onPreset: (preset: TaskPreset) => void;
}) {
  const items = [
    { key: 'pending' as const, label: '待处理', hint: '等待开始或分派', icon: ClipboardCheck, tone: 'warning' },
    { key: 'human_action' as const, label: '待双重审批', hint: '专家确认或接管', icon: ShieldAlert, tone: 'neutral' },
    { key: 'risk' as const, label: '风险异常', hint: '超时、失败或阻塞', icon: AlertTriangle, tone: 'danger' },
    { key: 'conversation' as const, label: '会话关联', hint: '可回协作现场', icon: MessagesSquare, tone: 'info' },
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
