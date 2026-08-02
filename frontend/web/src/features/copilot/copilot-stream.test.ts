import { describe, expect, it } from 'vitest';
import { parseSSEChunk } from './copilot-stream';

describe('parseSSEChunk', () => {
  it('parses stage and delta events', () => {
    const events: Array<{ event: string; type: string }> = [];
    const rest = parseSSEChunk(
      'event: stage\ndata: {"type":"stage","stage":"policy","status":"ok"}\n\nevent: delta\ndata: {"type":"delta","text":"hi"}\n\n',
      (event, data) => events.push({ event, type: data.type }),
    );
    expect(rest).toBe('');
    expect(events).toEqual([
      { event: 'stage', type: 'stage' },
      { event: 'delta', type: 'delta' },
    ]);
  });

  it('keeps incomplete trailing buffer', () => {
    const events: unknown[] = [];
    const rest = parseSSEChunk('event: done\ndata: {"type":"do', () => events.push(1));
    expect(events).toHaveLength(0);
    expect(rest).toContain('data: {"type":"do');
  });
});
