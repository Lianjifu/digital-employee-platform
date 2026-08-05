/** 从助手消息中提取 /api/skill-artifacts 下载链，供下载卡片渲染。 */

export type SkillArtifactLink = {
  /** 同源相对路径（已 encode），如 /api/skill-artifacts/xxx.docx */
  href: string;
  /** 磁盘/URL 存储名（可能含短 id 前缀） */
  filename: string;
  /** 浏览器保存用的规范文件名，如 招聘岗位模板.docx */
  downloadName: string;
  /** 推断的标题（去扩展名 / 清洗） */
  title: string;
  /** 文件类型标签 */
  kind: 'docx' | 'file';
};

const ARTIFACT_PATH_RE =
  /(?:https?:\/\/[^\s)\]"'`<>]+)?(\/api\/skill-artifacts\/([^\s)\]"'`<>]+))/gi;

const DOWNLOAD_LINE_RE =
  /^\s*(?:📄\s*)?(?:下载链接|下载|文件名)\s*[:：]\s*.*$/u;

const DISPLAY_NAME_LINE_RE =
  /^\s*(?:📄\s*)?文件名\s*[:：]\s*[`"'《]?([^`"'》\n]+?)[`"'》]?\s*$/u;

function decodeFilename(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 去掉 markdown 反引号、引号、标点等粘连字符。 */
export function sanitizeArtifactFilename(raw: string): string {
  let name = decodeFilename((raw.split('/').pop() ?? raw).trim());
  name = name.replace(/^[`"'<(（\[【]+/u, '');
  name = name.replace(/[`"'>)）\]】]+$/u, '');
  name = name.replace(
    /(\.(?:docx|pdf|xlsx|pptx|txt|zip|json|csv|md|png|jpe?g))[`"'>)）\]】.,;:：]+$/iu,
    '$1',
  );
  return name.trim();
}

/** 从存储名推断可读标题（去 id / skill_docx 噪声）。 */
export function inferTitle(filename: string): string {
  let name = filename.replace(/\.[^.]+$/, '');
  name = name.replace(/^[a-z0-9]{6,12}-/i, '');
  name = name.replace(/^skill[_-]?docx[_-]*/i, '');
  name = name.replace(/_docx$/i, '');
  name = name.replace(/__/g, ' ');
  name = name.replace(/_/g, ' ');
  name = name.replace(/[《》「」『』]/g, '');
  name = name.replace(/\s+/g, ' ').trim();
  return name || '生成文档';
}

function inferKind(filename: string): SkillArtifactLink['kind'] {
  return /\.docx$/i.test(filename) ? 'docx' : 'file';
}

/** 规范下载文件名：标题 + 扩展名，不含存储 id。 */
export function toDownloadName(storageName: string, explicit?: string): string {
  if (explicit) {
    const clean = sanitizeArtifactFilename(explicit);
    if (clean) {
      return /\.[a-z0-9]{1,8}$/i.test(clean) ? clean : `${clean}.docx`;
    }
  }
  const kind = inferKind(storageName);
  const title = inferTitle(storageName).replace(/\s+/g, '');
  if (kind === 'docx') return `${title || '生成文档'}.docx`;
  const ext = storageName.match(/(\.[a-z0-9]{1,8})$/i)?.[1] ?? '';
  return `${title || 'download'}${ext}`;
}

export function artifactHref(filename: string): string {
  return `/api/skill-artifacts/${encodeURIComponent(filename)}`;
}

function extractExplicitDownloadNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(DISPLAY_NAME_LINE_RE);
    if (m?.[1]) names.push(sanitizeArtifactFilename(m[1]));
  }
  return names;
}

/** 从正文提取去重后的产物链接（按出现顺序）。 */
export function extractSkillArtifacts(text: string): SkillArtifactLink[] {
  if (!text) return [];
  const explicitNames = extractExplicitDownloadNames(text);
  const seen = new Set<string>();
  const out: SkillArtifactLink[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ARTIFACT_PATH_RE.source, 'gi');
  let idx = 0;
  while ((m = re.exec(text))) {
    const filename = sanitizeArtifactFilename(m[2]);
    if (!filename) continue;
    const href = artifactHref(filename);
    if (seen.has(href)) continue;
    seen.add(href);
    const downloadName = toDownloadName(filename, explicitNames[idx]);
    idx += 1;
    out.push({
      href,
      filename,
      downloadName,
      title: inferTitle(downloadName),
      kind: inferKind(filename),
    });
  }
  return out;
}

/**
 * 去掉「下载链接：…」等冗余行，并弱化正文中的裸路径（避免与卡片重复）。
 * 保留其余 Markdown。
 */
export function stripArtifactNoise(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');
  const cleaned = lines
    .map((line) => {
      if (DOWNLOAD_LINE_RE.test(line) && (/\/api\/skill-artifacts\//i.test(line) || DISPLAY_NAME_LINE_RE.test(line))) {
        return null;
      }
      if (/^\s*[`'"]?\/api\/skill-artifacts\/\S+[`'"]?\s*$/i.test(line)) {
        return null;
      }
      return line.replace(ARTIFACT_PATH_RE, '').replace(/\s{2,}/g, ' ').trimEnd();
    })
    .filter((line): line is string => line !== null);

  const out: string[] = [];
  for (const line of cleaned) {
    if (line.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
    out.push(line);
  }
  return out.join('\n').trim();
}
