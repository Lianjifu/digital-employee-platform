export type VisualDiffRequest = {
  before: string;
  after: string;
  threshold?: number;
  tolerance?: number;
  highlight?: boolean;
  resizeWidth?: number;
  resizeHeight?: number;
};

export type VisualDiffResponse = {
  match: boolean;
  diffRatio: number;
  diffPixels: number;
  total: number;
  width: number;
  height: number;
  latencyMS: number;
  cacheKey: string;
  /** Optional base64-encoded PNG showing diff-highlighted pixels. */
  diffPng?: string;
};

export type VisualDiffError = {
  status: number;
  message: string;
};

export type VisualDiffOutcome =
  | { kind: 'ok'; data: VisualDiffResponse }
  | { kind: 'err'; error: VisualDiffError };

export const DEFAULT_THRESHOLD = 0.1;
export const DEFAULT_TOLERANCE = 0;
export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

export function formatDiffPercent(diffRatio: number): string {
  if (!Number.isFinite(diffRatio)) {
    return '—';
  }
  const pct = Math.round(diffRatio * 10000) / 100;
  return `${pct.toFixed(2)}%`;
}

export function formatDiffPixels(diff: number, total: number): string {
  if (!Number.isFinite(diff) || !Number.isFinite(total) || total <= 0) {
    return `${diff}/${total}`;
  }
  return `${diff.toLocaleString()} / ${total.toLocaleString()}`;
}

export function diffVerdictLabel(match: boolean, diffRatio: number): string {
  if (match) {
    return '通过';
  }
  if (diffRatio > 0.05) {
    return '差异显著';
  }
  if (diffRatio > 0.005) {
    return '差异中等';
  }
  return '差异细微';
}

export function diffVerdictTone(match: boolean, diffRatio: number): 'pass' | 'warn' | 'fail' {
  if (match) {
    return 'pass';
  }
  if (diffRatio > 0.05) {
    return 'fail';
  }
  return 'warn';
}

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_THRESHOLD;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function clampTolerance(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TOLERANCE;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return Math.round(value);
}

export async function readFileAsBase64(file: File): Promise<string> {
  if (file.size > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `文件 ${file.name} 超过 ${Math.round(MAX_PAYLOAD_BYTES / (1024 * 1024))} MB 上限`,
    );
  }
  // Use FileReader.readAsDataURL — present in every jsdom version,
  // produces "data:<mime>;base64,XXXX" we strip the prefix off. Safer
  // than File#arrayBuffer() (jsdom <24 polyfill is buggy on bytes
  // outside printable latin-1) and FileReader.readAsBinaryString
  // (deprecated; utf-8 mangling in jsdom 24+).
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    throw new Error('FileReader 返回了非 data URL 格式');
  }
  return dataUrl.slice(comma + 1);
}

export async function readFilesAsPair(
  before: File,
  after: File,
): Promise<{ before: string; after: string }> {
  const [b, a] = await Promise.all([readFileAsBase64(before), readFileAsBase64(after)]);
  return { before: b, after: a };
}