import { describe, expect, it } from 'vitest';
import { deriveExpertContextOverview } from './expert-context';
import type { ChatMessageEx } from '@/hooks/types';

describe('deriveExpertContextOverview', () => {
  it('returns empty evidence when messages have no tools or citations', () => {
    const messages: ChatMessageEx[] = [
      {
        id: 'm1',
        role: 'assistant',
        content: '你好',
        createdAt: '2026-08-04T12:00:00.000Z',
        status: 'succeeded',
        metrics: { model: 'deepseek-v4-flash', provider: 'mp-11', completionTokens: 40 },
      },
    ];
    const overview = deriveExpertContextOverview(messages);
    expect(overview.citations).toEqual([]);
    expect(overview.tools.total).toBe(0);
    expect(overview.rag.attempted).toBe(false);
    expect(overview.rag.label).toBe('本回合未触发检索');
    expect(overview.modelLabel).toBe('deepseek-v4-flash');
    expect(overview.providerLabel).toBe('mp-11');
    expect(overview.tokenUsed).toBe(40);
  });

  it('aggregates real citations and knowledge.retrieve tool', () => {
    const messages: ChatMessageEx[] = [
      {
        id: 'm2',
        role: 'assistant',
        content: '材料清单…',
        createdAt: '2026-08-04T12:01:00.000Z',
        status: 'succeeded',
        toolCalls: [
          {
            id: 't1',
            name: 'knowledge.retrieve',
            args: { backend: 'published-memory' },
            status: 'success',
            durationMs: 12,
          },
        ],
        citations: [
          { id: 'c1', docId: 'kd-1', source: '入职手册', text: '需身份证', score: 0.9 },
        ],
        metrics: { model: 'mdl-12', provider: 'mp-11', completionTokens: 80 },
      },
    ];
    const overview = deriveExpertContextOverview(messages);
    expect(overview.rag.attempted).toBe(true);
    expect(overview.rag.backend).toBe('published-memory');
    expect(overview.rag.hitCount).toBe(1);
    expect(overview.rag.label).toBe('命中 1 条');
    expect(overview.tools).toEqual({ total: 1, success: 1, failed: 0, avgMs: 12 });
    expect(overview.citations[0].source).toBe('入职手册');
    expect(overview.timeline.some((item) => item.text.includes('knowledge.retrieve'))).toBe(true);
  });

  it('never invents Redis demo citations', () => {
    const overview = deriveExpertContextOverview([]);
    expect(overview.citations).toEqual([]);
    expect(overview.tools.total).toBe(0);
    expect(JSON.stringify(overview)).not.toMatch(/Redis|INC-019|bge-reranker|320ms/);
  });
});
