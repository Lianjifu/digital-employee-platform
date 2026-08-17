/** 运营总览指标：与列表同源、禁止演示回填 */

export function asPercent(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

export function employeeHealthScore(active: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((active / total) * 100);
}

export function taskSuccessRate(completed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((completed / total) * 100);
}

export type TimelineBucket = { label: string; collab: number; tasks: number; alerts: number };

export function dayTimelineFromTrend(
  rows: Array<{ time: string; collab?: number; tasks?: number; alerts?: number }>,
): TimelineBucket[] {
  return rows.map((d) => ({
    label: d.time,
    collab: Number(d.collab ?? 0),
    tasks: Number(d.tasks ?? 0),
    alerts: Number(d.alerts ?? 0),
  }));
}
