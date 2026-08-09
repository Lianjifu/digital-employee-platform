import { describe, expect, it } from 'vitest';
import {
  approvalToolKeys,
  buildExpertTools,
  defaultEnabledToolKeys,
  isWriteExecutionIntent,
  toolsForExecuteMode,
} from './expert-tools';

describe('buildExpertTools', () => {
  it('always includes platform builtins and employee assembly', () => {
    const tools = buildExpertTools({
      capabilities: {
        tools: ['HRIS', '企业微信', '知识库'],
        skills: ['政策问答'],
        workflows: ['人事服务协同流'],
      },
    });
    expect(tools.map((t) => t.key).slice(0, 2)).toEqual([
      'builtin:knowledge.retrieve',
      'builtin:memory.recall',
    ]);
    expect(tools.map((t) => t.name)).toEqual([
      'knowledge.retrieve',
      'memory.recall',
      'HRIS',
      '企业微信',
      '知识库',
      '政策问答',
      '人事服务协同流',
    ]);
    expect(tools.some((t) => /hr-policy|kubectl|offer-approve/i.test(t.name) || /hr-policy|offer-approve/.test(t.key))).toBe(false);
    // 未接入工具/流程默认不勾选；builtins + 知识库 + 已装配技能
    expect(defaultEnabledToolKeys(tools)).toEqual([
      'builtin:knowledge.retrieve',
      'builtin:memory.recall',
      'tool:知识库',
      'skill:政策问答',
    ]);
    expect(tools.find((t) => t.name === 'HRIS')?.unavailable).toBe(true);
    expect(tools.find((t) => t.name === '人事服务协同流')?.unavailable).toBe(true);
  });

  it('marks approval_required from boundaryPolicy and skips prohibited', () => {
    const tools = buildExpertTools({
      capabilities: {
        tools: ['CMDB', 'kubectl'],
        skills: [],
        workflows: [],
      },
      boundaryPolicy: {
        capabilityModes: [
          { capabilityType: 'tool', capabilityName: 'kubectl', mode: 'approval_required' },
          { capabilityType: 'tool', capabilityName: 'CMDB', mode: 'execute' },
        ],
      },
    });
    expect(tools.find((t) => t.name === 'kubectl')?.requiresApproval).toBe(true);
    expect(tools.find((t) => t.name === 'CMDB')?.requiresApproval).toBe(false);
    expect(defaultEnabledToolKeys(tools).some((k) => k.includes('cmdb'))).toBe(true);
    expect(defaultEnabledToolKeys(tools).some((k) => k.includes('kubectl'))).toBe(false);
  });

  it('still returns builtins when no employee assembly', () => {
    expect(buildExpertTools(null).map((t) => t.key)).toEqual([
      'builtin:knowledge.retrieve',
      'builtin:memory.recall',
    ]);
    expect(buildExpertTools({ capabilities: { tools: [], skills: [], workflows: [] } }).map((t) => t.key)).toEqual([
      'builtin:knowledge.retrieve',
      'builtin:memory.recall',
    ]);
  });

  it('toolsForExecuteMode includes approval and office document skills', () => {
    const available = buildExpertTools({
      capabilities: {
        tools: [],
        skills: ['pptx', '政策问答'],
        workflows: [],
      },
      boundaryPolicy: {
        capabilityModes: [
          { capabilityType: 'skill', capabilityName: 'pptx', mode: 'approval_required' },
        ],
      },
    });
    const base = defaultEnabledToolKeys(available);
    expect(base.some((k) => k.includes('pptx'))).toBe(false);
    const forExec = toolsForExecuteMode(base, available);
    expect(forExec.some((k) => k.includes('pptx'))).toBe(true);
    expect(approvalToolKeys(available).some((k) => k.includes('pptx'))).toBe(true);
  });

  it('detects document / PPT write intents', () => {
    expect(isWriteExecutionIntent('请直接生成PPT')).toBe(true);
    expect(isWriteExecutionIntent('帮我做一份演示文稿')).toBe(true);
    expect(isWriteExecutionIntent('当前进度如何')).toBe(false);
  });
});
