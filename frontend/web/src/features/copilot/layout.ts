/** 会话历史在可保留工作列的宽度下始终可见，窄屏才退化为抽屉。 */
export function sessionHistoryPresentation(viewportWidth: number) {
  return viewportWidth >= 900 ? 'pinned' : 'drawer';
}
