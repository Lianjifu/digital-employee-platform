/** 每工作区记住专家协助上次打开的会话 id。 */
export function copilotLastSessionKey(workspaceId: string): string {
  return `de-copilot-last-session:${workspaceId}`;
}

export function rememberCopilotSession(workspaceId: string, sessionId: string): void {
  const ws = workspaceId.trim();
  const id = sessionId.trim();
  if (!ws || !id) return;
  try {
    localStorage.setItem(copilotLastSessionKey(ws), id);
  } catch {
    /* ignore quota */
  }
}

export function readCopilotLastSession(workspaceId: string): string | null {
  const ws = workspaceId.trim();
  if (!ws) return null;
  try {
    const id = localStorage.getItem(copilotLastSessionKey(ws));
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function clearCopilotLastSession(workspaceId: string, sessionId?: string): void {
  const ws = workspaceId.trim();
  if (!ws) return;
  try {
    const key = copilotLastSessionKey(ws);
    if (!sessionId || localStorage.getItem(key) === sessionId) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
