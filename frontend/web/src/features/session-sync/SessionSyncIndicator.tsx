import type { CSSProperties } from 'react';
import { Activity, MonitorSmartphone } from 'lucide-react';
import { useSessionSync } from './useSessionSync';

export type SessionSyncIndicatorProps = {
  className?: string;
  style?: CSSProperties;
  /** When provided, label each extra tab as '... ({suffix})'. */
  extraLabel?: string;
};

export function SessionSyncIndicator({
  className,
  style,
  extraLabel,
}: SessionSyncIndicatorProps): JSX.Element {
  const sync = useSessionSync();
  const otherTabs = Math.max(0, sync.tabCount - 1);

  return (
    <span
      data-testid="session-sync-indicator"
      data-tab-count={sync.tabCount}
      data-other-tabs={otherTabs}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm'
      }
      style={style}
      title={
        otherTabs === 0
          ? `当前设备 ${sync.tabId.slice(0, 8)}`
          : `当前设备 ${sync.tabId.slice(0, 8)}，另有 ${otherTabs} 个标签页`
      }
    >
      <MonitorSmartphone className="h-3.5 w-3.5" />
      <span data-testid="session-sync-tab-count">
        {sync.tabCount} 个标签
        {extraLabel ? ` (${extraLabel})` : ''}
      </span>
      {otherTabs > 0 && (
        <Activity className="h-3 w-3 text-emerald-500" data-testid="session-sync-active" />
      )}
    </span>
  );
}

export default SessionSyncIndicator;