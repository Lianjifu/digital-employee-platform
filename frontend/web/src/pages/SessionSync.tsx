import { useEffect } from 'react';
import { useSessionSync } from '@/features/session-sync';
import { useT } from '@/i18n';

export default function SessionSync() {
  const sync = useSessionSync();
  const { t } = useT();

  // When this page mounts, broadcast a conversation:focus event for the
  // landing screen so other tabs of the same device can update.
  useEffect(() => {
    sync.focusConversation('session-sync-overview');
  }, [sync]);

  const otherTabs = Math.max(0, sync.tabCount - 1);

  return (
    <div data-testid="session-sync-page" className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('sessionSync.title', '会话同步')}
        </h1>
        <p className="text-sm text-slate-600">
          {t(
            'sessionSync.subtitle',
            '同一设备下多个标签页实时共享当前会话焦点与状态，无需登录即可对齐。',
          )}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-medium text-slate-800">
          {t('sessionSync.device.title', '设备指纹')}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">{t('sessionSync.device.id', '设备 ID')}</dt>
            <dd className="font-mono text-slate-800" data-testid="session-sync-page-device-id">
              {sync.deviceId || '…'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('sessionSync.tab.id', '当前标签 ID')}</dt>
            <dd className="font-mono text-slate-800" data-testid="session-sync-page-tab-id">
              {sync.tabId || '…'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('sessionSync.tab.total', '在线标签')}</dt>
            <dd className="font-mono text-slate-800" data-testid="session-sync-page-tab-count">
              {sync.tabCount}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('sessionSync.tab.last', '最近事件')}</dt>
            <dd className="font-mono text-slate-800">
              {sync.lastEventAt ? new Date(sync.lastEventAt).toLocaleTimeString() : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-medium text-slate-800">
          {t('sessionSync.sharedState.title', '共享状态')}
        </h2>
        {Object.keys(sync.sharedState).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            {t('sessionSync.sharedState.empty', '其他标签页尚未广播状态。')}
          </p>
        ) : (
          <ul
            data-testid="session-sync-shared-state"
            className="mt-3 space-y-1 text-sm text-slate-700"
          >
            {Object.entries(sync.sharedState).map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-slate-500">{k}</span>
                <span className="text-slate-800">
                  {typeof v === 'string' ? v : JSON.stringify(v)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-medium text-slate-800">
          {t('sessionSync.recentFocus.title', '最近会话焦点')}
        </h2>
        {sync.recentFocus.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            {t('sessionSync.recentFocus.empty', '尚无焦点事件。打开另一个标签页查看同步效果。')}
          </p>
        ) : (
          <ul
            data-testid="session-sync-recent-focus"
            className="mt-3 space-y-1 text-sm text-slate-700"
          >
            {sync.recentFocus.map((f) => (
              <li key={`${f.tabId}-${f.at}`} className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-slate-500">
                  {f.tabId.slice(0, 8)}
                </span>
                <span className="text-slate-800">{f.conversationId}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {new Date(f.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
        {otherTabs === 0
          ? t('sessionSync.footer.solo', '当前仅本标签页在线。打开新标签页会自动加入同步。')
          : t(
              'sessionSync.footer.multi',
              `检测到 ${otherTabs} 个其他标签页，所有焦点与状态会实时同步。`,
            )}
      </footer>
    </div>
  );
}