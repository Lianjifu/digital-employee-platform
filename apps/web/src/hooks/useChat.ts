/**
 * 会话状态管理 hook — 完整可交互
 * - 消息流（增/删/重生成）
 * - 多会话管理（增/删/切换）
 * - 输入 + 草稿保存
 * - 流式响应（typing 动画）
 * - localStorage 持久化
 * - 双签进度
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ChatMessageEx } from './types';
export type { ChatMessageEx };

// ============ 状态 ============

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  agent: string;
  status: 'active' | 'done';
  group: 'today' | 'yesterday' | 'week';
  time: string;
  pinned?: boolean;
  unread?: number;
  messages: ChatMessageEx[];
  createdAt: number;
}

interface State {
  sessions: Record<string, ChatSession>;
  activeId: string;
  draftInput: string;
  typing: boolean;
  abortRef: { current: AbortController | null };
}

type Action =
  | { type: 'set_draft'; value: string }
  | { type: 'new_session'; session: ChatSession }
  | { type: 'del_session'; id: string }
  | { type: 'switch'; id: string }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'append_msg'; sid: string; msg: ChatMessageEx }
  | { type: 'replace_msg'; sid: string; mid: string; msg: ChatMessageEx }
  | { type: 'del_msg'; sid: string; mid: string }
  | { type: 'regenerate'; sid: string; mid: string; msg: ChatMessageEx }
  | { type: 'update_session'; sid: string; patch: Partial<ChatSession> }
  | { type: 'set_typing'; typing: boolean }
  | { type: 'stop_typing' }
  | { type: 'set_abort'; ctrl: AbortController | null }
  | { type: 'clear_unread'; id: string }
  | { type: 'hydrate'; state: State };

const STORAGE_KEY = 'de-chat-state';

const initial: State = {
  sessions: {},
  activeId: '',
  draftInput: '',
  typing: false,
  abortRef: { current: null },
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set_draft':
      return { ...s, draftInput: a.value };
    case 'new_session':
      return { ...s, sessions: { ...s.sessions, [a.session.id]: a.session }, activeId: a.session.id };
    case 'del_session': {
      const next = { ...s.sessions };
      delete next[a.id];
      const firstId = Object.keys(next)[0] ?? '';
      return { ...s, sessions: next, activeId: s.activeId === a.id ? firstId : s.activeId };
    }
    case 'switch':
      return { ...s, activeId: a.id };
    case 'pin':
      return { ...s, sessions: { ...s.sessions, [a.id]: { ...s.sessions[a.id], pinned: a.pinned } } };
    case 'append_msg': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const updated = { ...sess, messages: [...sess.messages, a.msg], preview: previewOf(a.msg), status: 'active' as const, time: nowHHMM() };
      return { ...s, sessions: { ...s.sessions, [a.sid]: updated } };
    }
    case 'replace_msg': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const msgs = sess.messages.map((m) => (m.id === a.mid ? a.msg : m));
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages: msgs } } };
    }
    case 'del_msg': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages: sess.messages.filter((m) => m.id !== a.mid) } } };
    }
    case 'regenerate': {
      const sess = s.sessions[a.sid];
      if (!sess) return s;
      const idx = sess.messages.findIndex((m) => m.id === a.mid);
      if (idx < 0) return s;
      const msgs = [...sess.messages.slice(0, idx), a.msg, ...sess.messages.slice(idx + 1)];
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...sess, messages: msgs } } };
    }
    case 'update_session':
      return { ...s, sessions: { ...s.sessions, [a.sid]: { ...s.sessions[a.sid], ...a.patch } } };
    case 'set_typing':
      return { ...s, typing: a.typing };
    case 'stop_typing':
      if (s.abortRef.current) s.abortRef.current.abort();
      return { ...s, typing: false, abortRef: { current: null } };
    case 'set_abort':
      return { ...s, abortRef: { current: a.ctrl } };
    case 'clear_unread':
      return { ...s, sessions: { ...s.sessions, [a.id]: { ...s.sessions[a.id], unread: 0 } } };
    case 'hydrate':
      return a.state;
  }
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function previewOf(m: ChatMessageEx): string {
  return m.content.slice(0, 50);
}
export function uid(prefix = ''): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

// ============ mock agent 回复生成器（基于关键词） ============

const REPLY_TEMPLATES: { match: RegExp; reply: (q: string) => ChatMessageEx }[] = [
  {
    match: /(redis|缓存|cache)/i,
    reply: (q) => ({
      id: uid('m_'),
      role: 'assistant' as const,
      agentName: '故障自愈',
      content: '已检测到 Redis 相关问题。正在按 Runbook §3.1 执行：\n1. 检查 maxmemory-policy（当前 noeviction）\n2. 临时扩容到 16GB（需双签）\n3. 切换 volatile-lru 策略\n4. 监控 OOM 频率',
      thinking: '用户提到 Redis，先查 maxmemory-policy + 最近写入速率。',
      citations: [
        { id: 'c1', source: 'Runbook', page: 12, score: 0.92, text: '当触发 OOM 时，优先检查 maxmemory-policy 与最近写入速率...' },
        { id: 'c2', source: 'CMDB', page: null, score: 0.78, text: 'prod-redis-01 资产编号 PRD-CACHE-019...' },
      ],
      toolCalls: [
        { id: uid('t_'), name: 'redis-cli INFO memory', args: { host: 'prod-redis-01' }, result: 'used_memory_human: 7.2G · maxmemory_human: 8G', status: 'success' as const, durationMs: 120 },
        { id: uid('t_'), name: 'redis-cli CONFIG GET maxmemory*', args: {}, result: 'maxmemory 8589934592 · maxmemory-policy noeviction', status: 'success' as const, durationMs: 80 },
      ],
      approvalRequest: { action: 'CONFIG SET maxmemory 16GB + volatile-lru', signed: 1, required: 2, signers: [{ name: '王昊', signed: true }, { name: '李婷', signed: false }] },
      createdAt: new Date().toISOString(),
    }),
  },
  {
    match: /(k8s|kubernetes|节点扩容)/i,
    reply: (q) => ({
      id: uid('m_'),
      role: 'assistant' as const,
      agentName: '变更辅助',
      content: '已识别 K8s 节点扩容请求。分析：\n- 当前集群节点使用率 78%\n- 预计 5 个服务受影响（网关/订单/支付/认证/库存）\n- 建议维护窗口执行（建议 7/15 02:00-04:00）\n- 已生成变更单 #CHG-2026-0156',
      thinking: 'K8s 扩容需要评估影响范围 + 维护窗口。',
      toolCalls: [
        { id: uid('t_'), name: 'kubectl get nodes', args: { selector: 'role=worker' }, result: '5 nodes · 78% utilization', status: 'success' as const, durationMs: 180 },
      ],
      createdAt: new Date().toISOString(),
    }),
  },
  {
    match: /(cve|漏洞|安全|漏洞修复)/i,
    reply: (q) => ({
      id: uid('m_'),
      role: 'assistant' as const,
      agentName: '漏洞修复',
      content: 'CVE 周报已生成。本周发现 12 个新漏洞，其中 3 个高危：\n- CVE-2026-3321（CVSS 9.8）· Log4j 远程代码执行\n- CVE-2026-3318（CVSS 8.6）· Spring Framework 权限绕过\n- CVE-2026-3315（CVSS 7.5）· OpenSSL 拒绝服务\n\n影响资产：\n- 12 台 K8s 节点（cluster-prd-01）\n- 8 个 API 网关实例\n- 4 个 CMDB 资产',
      thinking: 'CVE 报告需要按 CVSS 排序 + 关联资产。',
      citations: [
        { id: 'c1', source: 'CVE', page: null, score: 0.95, text: 'CVE-2026-3321 影响 Log4j 2.x < 2.17.0...' },
      ],
      createdAt: new Date().toISOString(),
    }),
  },
  {
    match: /(合规|审计|iso|等保)/i,
    reply: (q) => ({
      id: uid('m_'),
      role: 'assistant' as const,
      agentName: '合规审计',
      content: '本月合规自评报告已生成。94 项自评结果：\n- 通过 91 项（97%）\n- 需改善 3 项（导出审计日志/字段脱敏增强/灰度发布）\n- 等保 3 复测通过\n- ISO 27001 认证有效至 2027-03\n\n下次审计：2026-09-12',
      createdAt: new Date().toISOString(),
    }),
  },
  {
    match: /^(hi|hello|你好|嗨)/i,
    reply: () => ({
      id: uid('m_'),
      role: 'assistant' as const,
      agentName: '故障自愈',
      content: '你好！我是故障自愈 Agent v1.4.2。可以帮你：\n- 处理 Redis/K8s 等基础设施故障\n- 执行 Runbook 自动化修复\n- 监控告警 + 智能诊断\n\n试试问我："Redis OOM 怎么解决" 或 "K8s 节点扩容建议"',
      createdAt: new Date().toISOString(),
    }),
  },
];

function generateMockReply(userMsg: string): ChatMessageEx {
  for (const t of REPLY_TEMPLATES) {
    if (t.match.test(userMsg)) return t.reply(userMsg);
  }
  return {
    id: uid('m_'),
    role: 'assistant' as const,
    agentName: '故障自愈',
    content: `已收到你的问题：「${userMsg}」\n\n正在分析中，可按 / 唤起命令面板切换 Agent 或使用 @ 提及特定资源。`,
    thinking: '通用回复：识别不到具体场景，给出引导。',
    createdAt: new Date().toISOString(),
  };
}

// ============ hook ============

export function useChat(agentMeta?: { name: string }) {
  const [state, dispatch] = useReducer(reducer, initial, () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.sessions) return { ...parsed, typing: false, abortRef: { current: null } };
      }
    } catch {}
    // 创建默认会话
    const id = uid('s_');
    const sid: ChatSession = {
      id,
      title: 'Redis OOM 处理',
      preview: '已扩容到 16GB + volatile-lru',
      agent: agentMeta?.name ?? '故障自愈',
      status: 'active',
      group: 'today',
      time: '14:32',
      pinned: true,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'prod-redis-01 OOM 了，怎么处理？',
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ],
      createdAt: Date.now(),
    };
    return {
      sessions: { [id]: sid },
      activeId: id,
      draftInput: '',
      typing: false,
      abortRef: { current: null },
    };
  });

  // 持久化（typing 状态不存）
  useEffect(() => {
    try {
      const { typing, abortRef, ...rest } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch {}
  }, [state]);

  // 切换会话时清未读
  useEffect(() => {
    if (state.activeId) dispatch({ type: 'clear_unread', id: state.activeId });
  }, [state.activeId]);

  // ==================== 公开 API ====================

  const setDraft = useCallback((v: string) => dispatch({ type: 'set_draft', value: v }), []);

  const newSession = useCallback(() => {
    const id = uid('s_');
    const sess: ChatSession = {
      id,
      title: '新会话',
      preview: '',
      agent: agentMeta?.name ?? '故障自愈',
      status: 'active',
      group: 'today',
      time: nowHHMM(),
      messages: [],
      createdAt: Date.now(),
    };
    dispatch({ type: 'new_session', session: sess });
  }, [agentMeta?.name]);

  const delSession = useCallback((id: string) => dispatch({ type: 'del_session', id }), []);
  const switchSession = useCallback((id: string) => dispatch({ type: 'switch', id }), []);
  const togglePin = useCallback((id: string) => {
    const sess = state.sessions[id];
    if (sess) dispatch({ type: 'pin', id, pinned: !sess.pinned });
  }, [state.sessions]);

  // 停止生成
  const stop = useCallback(() => dispatch({ type: 'stop_typing' }), []);

  // 发送消息（核心交互）
  const send = useCallback((content: string) => {
    const text = content.trim();
    if (!text || !state.activeId) return;

    const userMsg: ChatMessageEx = {
      id: uid('m_'),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'append_msg', sid: state.activeId, msg: userMsg });
    dispatch({ type: 'set_draft', value: '' });

    // 流式响应
    const ctrl = new AbortController();
    dispatch({ type: 'set_abort', ctrl });
    dispatch({ type: 'set_typing', typing: true });

    // 先生成完整回复，再分块流式
    setTimeout(() => {
      const reply = generateMockReply(userMsg.content);
      const sid = state.activeId;
      const replyId = reply.id;
      // 空消息先占位
      const placeholder: ChatMessageEx = { ...reply, content: '', toolCalls: [], citations: [], thinking: '', approvalRequest: undefined };
      dispatch({ type: 'append_msg', sid, msg: placeholder });

      // 流式打字机：逐字拼内容
      let idx = 0;
      const text = reply.content;
      const tick = () => {
        if (ctrl.signal.aborted) {
          dispatch({ type: 'set_typing', typing: false });
          dispatch({ type: 'set_abort', ctrl: null });
          return;
        }
        idx += 2;
        dispatch({
          type: 'replace_msg',
          sid,
          mid: replyId,
          msg: { ...reply, content: text.slice(0, idx) },
        });
        if (idx < text.length) {
          setTimeout(tick, 24);
        } else {
          // 完整后：把思考/引用/tool 一次性恢复
          dispatch({
            type: 'replace_msg',
            sid,
            mid: replyId,
            msg: reply,
          });
          dispatch({ type: 'set_typing', typing: false });
          dispatch({ type: 'set_abort', ctrl: null });
        }
      };
      setTimeout(tick, 120);
    }, 500);
  }, [state.activeId]);

  // 重新生成
  const regenerate = useCallback((mid: string) => {
    const sess = state.sessions[state.activeId];
    if (!sess) return;
    const idx = sess.messages.findIndex((m) => m.id === mid);
    if (idx <= 0) return;
    const userMsg = sess.messages[idx - 1];
    if (userMsg.role !== 'user') return;
    const reply = generateMockReply(userMsg.content);
    const placeholder: ChatMessageEx = { ...reply, id: uid('m_'), content: '' };
    dispatch({ type: 'regenerate', sid: state.activeId, mid, msg: placeholder });
    // 流式
    const ctrl = new AbortController();
    dispatch({ type: 'set_abort', ctrl });
    dispatch({ type: 'set_typing', typing: true });
    setTimeout(() => {
      const replyId = placeholder.id;
      const text = reply.content;
      let i = 0;
      const tick = () => {
        if (ctrl.signal.aborted) {
          dispatch({ type: 'set_typing', typing: false });
          dispatch({ type: 'set_abort', ctrl: null });
          return;
        }
        i += 2;
        dispatch({ type: 'replace_msg', sid: state.activeId, mid: replyId, msg: { ...reply, content: text.slice(0, i) } });
        if (i < text.length) setTimeout(tick, 24);
        else {
          dispatch({ type: 'replace_msg', sid: state.activeId, mid: replyId, msg: reply });
          dispatch({ type: 'set_typing', typing: false });
          dispatch({ type: 'set_abort', ctrl: null });
        }
      };
      setTimeout(tick, 100);
    }, 400);
  }, [state.activeId, state.sessions]);

  // 删除消息
  const delMessage = useCallback((mid: string) => {
    if (state.activeId) dispatch({ type: 'del_msg', sid: state.activeId, mid });
  }, [state.activeId]);

  // 双签通过：更新 approvalRequest 进度
  const approveSign = useCallback((mid: string) => {
    const sess = state.sessions[state.activeId];
    if (!sess) return;
    const m = sess.messages.find((x) => x.id === mid);
    if (!m?.approvalRequest) return;
    const ar = m.approvalRequest;
    if (ar.signed >= ar.required) return;
    const signers = ar.signers.map((s, i) => i < ar.signed + 1 ? { ...s, signed: true } : s);
    dispatch({
      type: 'replace_msg',
      sid: state.activeId,
      mid,
      msg: { ...m, approvalRequest: { ...ar, signed: ar.signed + 1, signers } },
    });
  }, [state.activeId, state.sessions]);

  return {
    state,
    activeSession: state.sessions[state.activeId],
    setDraft,
    newSession,
    delSession,
    switchSession,
    togglePin,
    send,
    stop,
    regenerate,
    delMessage,
    approveSign,
  };
}
