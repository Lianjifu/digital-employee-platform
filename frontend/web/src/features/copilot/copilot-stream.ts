/**
 * Copilot SSE client — 对接 de-core /api/copilot/conversations/:id/stream
 */
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export type CopilotSSEEvent = {
  type: string;
  stage?: string;
  status?: string;
  correlationId?: string;
  text?: string;
  message?: string;
  name?: string;
  hits?: unknown;
  decision?: string;
  units?: number;
  employee?: unknown;
  ok?: boolean;
};

export function isMockChatMode(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true';
}

/** 解析 SSE 文本缓冲，返回已完成事件与剩余缓冲。 */
export function parseSSEChunk(
  buffer: string,
  onEvent: (event: string, data: CopilotSSEEvent) => void,
): string {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  let eventName = 'message';
  for (const raw of parts) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      if (payload) {
        try {
          onEvent(eventName, JSON.parse(payload) as CopilotSSEEvent);
        } catch {
          /* ignore malformed */
        }
      }
      eventName = 'message';
    }
  }
  return rest;
}

export type StreamTurnInput = {
  conversationId: string;
  content: string;
  correlationId: string;
  digitalEmployeeId?: string;
  signal?: AbortSignal;
  onEvent: (event: string, data: CopilotSSEEvent) => void;
};

export async function streamCopilotTurn(input: StreamTurnInput): Promise<void> {
  const token = localStorage.getItem('token');
  const user = useAuthStore.getState().user;
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? user?.workspaceId ?? 'w1';

  const res = await fetch(
    `/api/copilot/conversations/${encodeURIComponent(input.conversationId)}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-workspace-id': workspaceId,
        'x-correlation-id': input.correlationId,
        ...(user
          ? {
              'x-tenant-id': user.tenantId,
              'x-mock-role': user.role,
              // fetch headers must be ISO-8859-1; Chinese display names need encoding
              'x-mock-actor': encodeURIComponent(user.name),
              'x-mock-user-id': user.id,
              'x-mock-permissions': user.permissions.join(','),
            }
          : {}),
      },
      body: JSON.stringify({
        content: input.content,
        correlationId: input.correlationId,
        digitalEmployeeId: input.digitalEmployeeId,
      }),
      signal: input.signal,
    },
  );

  if (!res.ok) {
    let message = `流式请求失败 (${res.status})`;
    try {
      const json = (await res.json()) as { error?: { message?: string; code?: string } };
      if (json.error?.message) message = json.error.message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error('浏览器不支持流式响应');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSSEChunk(buffer, input.onEvent);
  }
  if (buffer.trim()) {
    parseSSEChunk(`${buffer}\n`, input.onEvent);
  }
}
