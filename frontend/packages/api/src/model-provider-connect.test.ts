import { describe, expect, it } from 'vitest';
import { mockHandler } from './mock';

describe('model provider discover', () => {
  it('returns protocol model catalog when endpoint and key are provided', async () => {
    const result = await mockHandler('/api/model-providers/discover-models', {
      method: 'POST',
      body: {
        workspaceId: 'w1',
        protocol: 'openai_compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-demo',
      },
      headers: { 'x-mock-permissions': 'model.write,model.read', 'x-workspace-id': 'w1' },
    }) as any;
    expect(result.models.length).toBeGreaterThan(2);
    expect(result.models.some((item: any) => item.id === 'gpt-4o')).toBe(true);
  });

  it('rejects discover without api key for cloud protocols', async () => {
    await expect(mockHandler('/api/model-providers/discover-models', {
      method: 'POST',
      body: {
        workspaceId: 'w1',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
      },
      headers: { 'x-mock-permissions': 'model.write,model.read', 'x-workspace-id': 'w1' },
    })).rejects.toThrow('E_PROVIDER_DISCOVER_AUTH');
  });

  it('persists connection metadata on create', async () => {
    const created = await mockHandler('/api/model-providers', {
      method: 'POST',
      body: {
        workspaceId: 'w1',
        name: 'DeepSeek 网关',
        note: '研发试用',
        protocol: 'openai_compatible',
        tier: 'official',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        region: 'global',
        credential: 'sk-demo',
      },
      headers: { 'x-mock-permissions': 'model.write,model.read', 'x-workspace-id': 'w1' },
    }) as any;
    expect(created.protocol).toBe('openai_compatible');
    expect(created.baseUrl).toContain('deepseek');
    expect(created.note).toBe('研发试用');
    expect(created.models[0].name).toBe('deepseek-chat');
  });

  it('allows discover with stored provider credential reference', async () => {
    const result = await mockHandler('/api/model-providers/discover-models', {
      method: 'POST',
      body: {
        workspaceId: 'w1',
        providerId: 'p1',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
      },
      headers: { 'x-mock-permissions': 'model.write,model.read', 'x-workspace-id': 'w1' },
    }) as any;
    expect(result.models.some((item: any) => String(item.id).includes('claude'))).toBe(true);
  });
});
