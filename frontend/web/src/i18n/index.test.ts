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
    expect(DICTS['zh-CN']['module.workspace.tabs.environment']).toBe('环境发布');
    expect(DICTS['en-US']['module.workspace.tabs.environment']).toBe('Environments');
  });

  it('uses four-character Chinese primary nav labels', () => {
    const navKeys = [
      'nav.home', 'nav.copilot', 'nav.tasks', 'nav.agents', 'nav.workflows',
      'nav.models', 'nav.knowledge', 'nav.skills', 'nav.memory', 'nav.channels',
      'nav.accessControl', 'nav.zeroTrust', 'nav.auditCenter',
    ] as const;
    for (const key of navKeys) {
      expect([...DICTS['zh-CN'][key]].length).toBe(4);
    }
    expect(DICTS['zh-CN']['nav.group.operations']).toBe('协作');
    expect(DICTS['zh-CN']['account.platformSettings']).toBe('平台设置');
    expect(DICTS['zh-CN']['module.settings.tabs.usage']).toBe('套餐用量');
    expect(DICTS['zh-CN']['nav.workflows']).toBe('工作流程');
    expect(DICTS['zh-CN']['nav.zeroTrust']).toBe('持续验证');
    expect(DICTS['zh-CN']['module.agents.tabs.market']).not.toContain('工厂');
  });
});
