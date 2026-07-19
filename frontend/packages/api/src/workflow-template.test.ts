import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('workflow template assets', () => {
  it('returns governed template metadata and a real workflow sequence', async () => {
    const templates = await mockHandler('/api/workflow-templates', {}) as any[];
    const template = templates[0];

    expect(template).toMatchObject({ version: expect.any(String), owner: expect.any(String), risk: expect.any(String), health: expect.any(String) });
    expect(template.sequence).toContain('policy');
    expect(template.sequence).toContain('audit');
  });
});
