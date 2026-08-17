import { describe, expect, it } from 'vitest';
import { asPercent, dayTimelineFromTrend, employeeHealthScore, taskSuccessRate } from './home-metrics';

describe('home-metrics', () => {
  it('asPercent treats fractions and percents', () => {
    expect(asPercent(0.96)).toBe(96);
    expect(asPercent(96)).toBe(96);
    expect(asPercent(null)).toBeNull();
  });

  it('empty workforce yields null health', () => {
    expect(employeeHealthScore(0, 0)).toBeNull();
    expect(employeeHealthScore(2, 4)).toBe(50);
  });

  it('empty tasks yield null success rate', () => {
    expect(taskSuccessRate(0, 0)).toBeNull();
    expect(taskSuccessRate(1, 4)).toBe(25);
  });

  it('day timeline does not invent bars', () => {
    expect(dayTimelineFromTrend([])).toEqual([]);
    expect(dayTimelineFromTrend([{ time: '10:00', tasks: 2, collab: 0, alerts: 1 }])).toEqual([
      { label: '10:00', tasks: 2, collab: 0, alerts: 1 },
    ]);
  });
});
