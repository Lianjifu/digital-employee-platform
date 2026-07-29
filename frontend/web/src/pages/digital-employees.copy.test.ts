import { describe, expect, it } from 'vitest';

/** Mirrors gateLabel / terminology rules from DigitalEmployees for regression. */
function gateLabel(employee: {
  lifecycle: string;
  release: { status: string };
  evaluation: { status: string; score?: number };
  runtime: { anomalies: number };
}) {
  if (employee.lifecycle === 'quarantined' || (employee.lifecycle === 'active' && employee.runtime.anomalies > 0)) return '需关注';
  if (employee.lifecycle === 'active') return '可协作';
  if (employee.release.status === 'pending_approval') return '待双重审批上岗';
  if (employee.evaluation.status === 'passed') return `评测 ${employee.evaluation.score ?? '—'} · 可申请上岗`;
  if (employee.evaluation.status === 'failed') return '评测未通过';
  if (employee.lifecycle === 'paused') return '已暂停';
  if (employee.runtime.anomalies > 0) return '需关注';
  return '配置与评测中';
}

const forbidden = [/Agent\s+a\d/i, /双签/, /员工工厂/, /Workforce/i, /纳管员工/, /打开 Copilot/];

describe('digital employees catalog copy', () => {
  it('surfaces collaboration and dual-approval gates', () => {
    expect(gateLabel({ lifecycle: 'active', release: { status: 'released' }, evaluation: { status: 'passed', score: 94 }, runtime: { anomalies: 0 } })).toBe('可协作');
    expect(gateLabel({ lifecycle: 'active', release: { status: 'released' }, evaluation: { status: 'passed', score: 94 }, runtime: { anomalies: 2 } })).toBe('需关注');
    expect(gateLabel({ lifecycle: 'draft', release: { status: 'pending_approval' }, evaluation: { status: 'passed', score: 90 }, runtime: { anomalies: 0 } })).toBe('待双重审批上岗');
  });

  it('keeps brand-safe catalog phrases', () => {
    const phrases = [
      '专家团队协同的数字员工：岗位边界清晰，双重审批与人工接管可追溯。',
      '在册专家',
      '待上岗审批',
      '新建数字员工',
      '发起协作',
      '执行运行时已绑定（内部）',
      '企业可信数字员工平台',
      '专家团队协同 · 岗位边界清晰',
    ];
    for (const phrase of phrases) {
      for (const pattern of forbidden) {
        expect(phrase).not.toMatch(pattern);
      }
    }
  });
});
