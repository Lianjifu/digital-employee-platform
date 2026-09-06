import { stripArtifactNoise } from '@/features/copilot/artifact-links';

export const AUTHORIZED_EXECUTE_MARKER = '—— 授权后执行结果 ——';

const PENDING_AUTH_RE = /智能体已申请|等待登录用户人工审核|批准后可手动执行/;
const STEP_LINE_RE = /^——\s*步骤\s+(.+?)\s*——\s*$/;
const DOC_SUCCESS_RE = /已生成 Word 文档「([^」]+)」|已为您生成 Word 文档「([^」]+)」/;
const PPT_SUCCESS_RE = /已生成 PPT 文档「([^」]+)」|已为您生成 PPT 文档「([^」]+)」/;
const TECH_LINE_RE =
  /^(sandbox|skillId|denyControlPlane|package|script|exit|runToken|allowedEgress|correlationId|timeoutSec)=/i;

export function splitAuthorizedExecutionContent(content: string): { intro: string; execution: string | null } {
  const text = content ?? '';
  const idx = text.indexOf(AUTHORIZED_EXECUTE_MARKER);
  if (idx < 0) {
    return { intro: text, execution: null };
  }
  return {
    intro: text.slice(0, idx).trim(),
    execution: text.slice(idx + AUTHORIZED_EXECUTE_MARKER.length).trim(),
  };
}

function extractDocSuccessSummary(execution: string): string | null {
  for (const line of execution.split('\n')) {
    const trim = line.trim();
    const ppt = trim.match(PPT_SUCCESS_RE);
    if (ppt) {
      const title = ppt[1] ?? ppt[2];
      return `已为您生成 PPT 文档「${title}」，请使用上方卡片预览或下载。`;
    }
    const m = trim.match(DOC_SUCCESS_RE);
    if (m) {
      const title = m[1] ?? m[2];
      return `已为您生成 Word 文档「${title}」，请使用上方卡片预览或下载。`;
    }
  }
  return null;
}

function summarizeExecutionSteps(execution: string): string | null {
  const steps: string[] = [];
  for (const line of execution.split('\n')) {
    const m = line.trim().match(STEP_LINE_RE);
    if (m?.[1]) steps.push(m[1].trim());
  }
  if (!steps.length) return null;
  return `已完成：${steps.join(' → ')}`;
}

/** Strip sandbox stdout / key=value noise from execution logs. */
export function stripExecutionTechnicalNoise(execution: string): string {
  const lines = execution.split('\n');
  const out: string[] = [];
  let inStdout = false;
  for (const line of lines) {
    const trim = line.trim();
    if (!trim) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (/^---\s*stdout\s*---/i.test(trim)) {
      inStdout = true;
      continue;
    }
    if (STEP_LINE_RE.test(trim)) {
      inStdout = false;
      out.push(trim);
      continue;
    }
    if (inStdout) {
      if (/^SAVED:/i.test(trim) || DOC_SUCCESS_RE.test(trim) || /已生成 Word/.test(trim)) {
        out.push(trim);
      }
      continue;
    }
    if (TECH_LINE_RE.test(trim)) continue;
    if (/^【skill\.(write|run)】/.test(trim)) continue;
    if (/^write ok:/i.test(trim) || /^next: action=run/i.test(trim)) continue;
    if (/^待续跑：/i.test(trim)) continue;
    if (trim.startsWith('——') && trim.endsWith('——')) continue;
    out.push(trim);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * User-facing bubble text: hide pending-auth boilerplate and raw execution logs when possible.
 */
const TOOL_BLOCK_RE = /<<<TOOL>>>[\s\S]*?<<<END>>>/g;
const XML_TOOL_BLOCK_RE = /<(TOOL|tool_call|invoke|skill_read|skill\.read)>([\s\S]*?)<\/\1>/gi;

function summarizeToolTag(tag: string, inner: string): string {
  const body = inner.trim();
  // try to extract a tool name and a short signature from the inner content.
  const firstLine = body.split('\n', 1)[0]?.trim() ?? '';
  // detect common tool names from inner text
  let label = tag.toLowerCase();
  if (firstLine) {
    try {
      const parsed = JSON.parse(firstLine);
      if (parsed && typeof parsed === 'object') {
        const name = (parsed as { name?: unknown }).name;
        const skill = (parsed as { skill?: unknown }).skill;
        const action = (parsed as { action?: unknown }).action;
        if (typeof name === 'string') label = name;
        else if (typeof skill === 'string') label = skill;
        else if (typeof action === 'string') label = action;
      }
    } catch {
      // not JSON — fall back to the tag
    }
  }
  const bytes = new TextEncoder().encode(body).length;
  const sizeLabel = bytes > 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${bytes}B`;
  return `【工具调用 · ${label} · ${sizeLabel}】`;
}

/**
 * Collapses raw tool markup into short human-readable summaries that are safe to
 * render in the chat bubble. Tool blocks were previously stripped silently, which
 * left users with no signal that the agent made a tool call. Now each block becomes
 * a one-line badge so users can see what the agent did without scrolling 1.7KB of args.
 */
function collapseToolMarkup(content: string): string {
  let out = content.replace(TOOL_BLOCK_RE, (match) => {
    const inner = match.replace(/^<<<TOOL>>>/, '').replace(/<<<END>>>$/, '');
    return summarizeToolTag('TOOL', inner);
  });
  out = out.replace(XML_TOOL_BLOCK_RE, (_match, tag: string, inner: string) => {
    return summarizeToolTag(tag, inner);
  });
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function stripLeakedToolMarkup(content: string): string {
  return collapseToolMarkup(content);
}

export function formatAssistantDisplayContent(content: string, hasArtifacts: boolean): string {
  const sanitized = stripLeakedToolMarkup(content);
  const { intro, execution } = splitAuthorizedExecutionContent(sanitized);
  let userIntro = intro;
  if (execution && PENDING_AUTH_RE.test(userIntro)) {
    userIntro = '';
  }

  if (!execution) {
    const base = hasArtifacts ? stripArtifactNoise(sanitized) : sanitized;
    return base.trim();
  }

  const docSummary = extractDocSuccessSummary(execution);
  const stepSummary = summarizeExecutionSteps(execution);
  const summary = docSummary ?? stepSummary ?? '授权执行已完成。';

  const parts = [userIntro, summary].filter(Boolean);
  const merged = parts.join('\n\n');
  return hasArtifacts ? stripArtifactNoise(merged) : merged;
}

/** Full execution block for expandable details (sanitized). */
export function formatExecutionDetails(content: string): string | null {
  const { execution } = splitAuthorizedExecutionContent(content);
  if (!execution) return null;
  const cleaned = stripExecutionTechnicalNoise(execution);
  return cleaned || null;
}
