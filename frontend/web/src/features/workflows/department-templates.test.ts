import { describe, expect, it } from 'vitest';
import {
  ALL_WORKFLOW_TEMPLATES,
  DEPARTMENT_TEMPLATES,
  FACTORY_CERTIFIED_IDS,
  IT_ADVANCED_TEMPLATES,
  OFFICE_TEMPLATES,
  compareSemver,
  diffTemplateUpgrade,
  evaluateTemplateConnectors,
  filterByIndustry,
  groupTemplatesByDepartment,
  isPersonalTemplate,
  isPlatformTemplate,
  isTemplateReusable,
  matchDepartmentKey,
  templateOrigin,
} from './department-templates';

describe('factory certified workflow templates', () => {
  it('ships the factory certified pack ids', () => {
    expect(FACTORY_CERTIFIED_IDS).toEqual(expect.arrayContaining([
      'wf.office.ask_policy',
      'wf.office.meeting_minutes',
      'wf.office.weekly_report',
      'wf.hr.onboarding',
      'wf.hr.offboarding',
      'wf.it.access_request',
      'wf.fin.expense',
      'wf.fin.purchase',
      'wf.ops.ticket_escalate',
      'wf.sales.contract_approve',
      'wf.rd.release_gate',
      'wf.compliance.export_review',
    ]));
    expect(OFFICE_TEMPLATES.every((item) => item.library === 'default' && item.department === 'office')).toBe(true);
    expect(DEPARTMENT_TEMPLATES.every((item) => item.library === 'default')).toBe(true);
    expect(DEPARTMENT_TEMPLATES.every((item) => item.certification === 'certified')).toBe(true);
  });

  it('keeps ops playbooks in the advanced library only', () => {
    expect(IT_ADVANCED_TEMPLATES.every((item) => item.library === 'advanced')).toBe(true);
    expect(IT_ADVANCED_TEMPLATES.some((item) => item.id === 'wf.it.incident_mitigate')).toBe(true);
    expect(IT_ADVANCED_TEMPLATES.some((item) => item.name.includes('cache-oom'))).toBe(true);
    expect(DEPARTMENT_TEMPLATES.some((item) => item.name.includes('cache-oom'))).toBe(false);
  });

  it('degrades expense when payment slot is unbound', () => {
    const expense = DEPARTMENT_TEMPLATES.find((item) => item.id === 'wf.fin.expense')!;
    const result = evaluateTemplateConnectors(expense, {});
    expect(result.health).toBe('健康');
    expect(result.degraded).toBe(true);
    expect(result.healthHint).toMatch(/付款/);
    expect(isTemplateReusable({ ...expense, ...result })).toBe(true);
  });

  it('blocks incident mitigate without infra slot', () => {
    const incident = IT_ADVANCED_TEMPLATES.find((item) => item.id === 'wf.it.incident_mitigate')!;
    const result = evaluateTemplateConnectors(incident, {});
    expect(result.health).toBe('需授权');
    expect(result.blockers[0]).toMatch(/infra\.execute/);
  });

  it('groups factory templates by department', () => {
    const groups = groupTemplatesByDepartment(DEPARTMENT_TEMPLATES);
    expect(groups.map((g) => g.key).sort()).toEqual(
      ['finance', 'hr', 'it', 'operations', 'rd', 'sales'].sort(),
    );
  });

  it('filters by industry tags', () => {
    const saas = filterByIndustry(DEPARTMENT_TEMPLATES, 'saas');
    expect(saas.some((t) => t.id === 'wf.sales.contract_approve')).toBe(true);
    expect(saas.every((t) => t.industryTags.includes('all') || t.industryTags.includes('saas'))).toBe(true);
  });

  it('computes upgrade diffs', () => {
    const base = DEPARTMENT_TEMPLATES.find((t) => t.id === 'wf.fin.expense')!;
    const newer = {
      ...base,
      version: '1.1.0',
      sequence: [...base.sequence, 'schedule' as const],
      connectors: [...base.connectors, { slot: 'budget.check', label: '预算校验', required: false, capability: 'budget.check' }],
      changelog: [...base.changelog, { version: '1.1.0', date: '2026-09-01', note: '预算科目多维校验' }],
    };
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1);
    const diff = diffTemplateUpgrade(base, newer);
    expect(diff.available).toBe(true);
    expect(diff.sequenceAdded).toContain('schedule');
    expect(diff.connectorAdded).toContain('budget.check');
    expect(diff.notes.some((n) => n.includes('1.1.0'))).toBe(true);
  });

  it('matches employee department labels to keys', () => {
    expect(matchDepartmentKey('人事部门')).toBe('hr');
    expect(matchDepartmentKey('财务共享')).toBe('finance');
    expect(matchDepartmentKey('SRE 平台')).toBe('it');
  });

  it('exposes advanced + certified in all templates', () => {
    expect(ALL_WORKFLOW_TEMPLATES.length).toBe(OFFICE_TEMPLATES.length + DEPARTMENT_TEMPLATES.length + IT_ADVANCED_TEMPLATES.length);
  });

  it('classifies platform vs personal template origin', () => {
    expect(templateOrigin(DEPARTMENT_TEMPLATES[0])).toBe('platform');
    expect(isPlatformTemplate(OFFICE_TEMPLATES[0])).toBe(true);
    expect(matchDepartmentKey('办公助手')).toBe('office');
    expect(isPersonalTemplate({
      id: 'wft-user-1',
      builtin: false,
      source: 'personal',
    } as any)).toBe(true);
    expect(templateOrigin({ id: 'wf.hr.onboarding', builtin: true, source: 'platform' })).toBe('platform');
  });
});
