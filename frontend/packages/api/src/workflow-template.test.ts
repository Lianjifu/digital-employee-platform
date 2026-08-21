import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('workflow template assets', () => {
  it('returns governed template metadata and a real workflow sequence', async () => {
    const templates = await mockHandler('/api/workflow-templates', {}) as any[];
    const template = templates.find((item) => item.id === 'wf.fin.expense') ?? templates[0];

    expect(template).toMatchObject({ version: expect.any(String), owner: expect.any(String), risk: expect.any(String), health: expect.any(String) });
    expect(template.sequence).toContain('policy');
    expect(template.sequence).toContain('audit');
    expect(template.source ?? 'platform').toBe('platform');
  });

  it('lists personal templates separately and supports create/delete', async () => {
    const listed = await mockHandler('/api/workflow-templates', { query: { origin: 'personal' } }) as any[];
    expect(listed.some((item) => item.id === 'wft-user-sample-oncall')).toBe(true);
    expect(listed.every((item) => item.source === 'personal')).toBe(true);

    const created = await mockHandler('/api/workflow-templates', {
      method: 'POST',
      body: {
        name: '临时个人模板',
        description: '测试',
        department: 'hr',
        sequence: ['event', 'task', 'notify'],
        graph: {
          nodes: [
            { id: 'n1', kind: 'event' },
            { id: 'n2', kind: 'task' },
            { id: 'n3', kind: 'notify' },
          ],
          edges: [],
        },
      },
    }) as any;
    expect(created.source).toBe('personal');
    expect(created.builtin).toBe(false);

    const deleted = await mockHandler(`/api/workflow-templates/${created.id}`, { method: 'DELETE' }) as any;
    expect(deleted).toEqual({ ok: true, id: created.id });
  });
});
