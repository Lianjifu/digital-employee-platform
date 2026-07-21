import { describe, expect, it } from 'vitest';
import { DICTS } from './index';

const CONTROL_PLANE_KEYS = [
  'module.models.title',
  'module.models.tabs.access',
  'module.channels.title',
  'module.channels.tabs.routing',
  'module.knowledge.tabs.processing',
  'module.memory.tabs.governance',
  'module.workspace.tabs.environment',
  'module.governance.tabs.controls',
  'module.zeroTrust.tabs.events',
  'module.audit.export',
] as const;

describe('enterprise navigation translations', () => {
  it('provides a non-empty Chinese and English value for every governed navigation key', () => {
    for (const key of CONTROL_PLANE_KEYS) {
      expect(DICTS['zh-CN'][key]).toBeTruthy();
      expect(DICTS['en-US'][key]).toBeTruthy();
      expect(DICTS['zh-CN'][key]).not.toBe(DICTS['en-US'][key]);
    }
  });

  it('keeps the workspace release label explicit in both languages', () => {
    expect(DICTS['zh-CN']['module.workspace.tabs.environment']).toBe('环境与发布');
    expect(DICTS['en-US']['module.workspace.tabs.environment']).toBe('Environments & Releases');
  });
});
