import { describe, expect, it } from 'vitest';
import { JOURNEY_CARDS, PREVIEW_NAV_GROUPS, VALUE_CARDS } from './OnboardingGuide';

describe('OnboardingGuide copy', () => {
  it('preview nav mirrors current sidebar IA', () => {
    const flat = PREVIEW_NAV_GROUPS.flatMap((group) => [...group.items]);
    expect(flat).toEqual([
      '运营总览',
      '专家协作',
      '任务中心',
      '数字员工',
      '工作流程',
      '模型服务',
      '知识中心',
      '技能中心',
      '记忆中心',
      '消息渠道',
    ]);
    expect(PREVIEW_NAV_GROUPS.map((g) => g.label)).toEqual([null, '协作', '编排', '能力']);
  });

  it('value cards cover security, capability assets, and audit trail', () => {
    expect(VALUE_CARDS.map((c) => c.title)).toEqual([
      '安全受控执行',
      '能力资产统一',
      '全过程可追溯',
    ]);
    expect(VALUE_CARDS.some((c) => /记忆|消息渠道/.test(c.description))).toBe(true);
    expect(VALUE_CARDS.some((c) => /持续验证|访问控制/.test(c.description))).toBe(true);
  });

  it('journey cards follow 能力 → 编排上岗 → 受控运营', () => {
    expect(JOURNEY_CARDS.map((c) => c.title)).toEqual(['能力接入', '编排上岗', '受控运营']);
    expect(JOURNEY_CARDS[0].description).toMatch(/记忆|消息渠道/);
    expect(JOURNEY_CARDS[1].description).toMatch(/数字员工|工作流程/);
    expect(JOURNEY_CARDS[2].description).toMatch(/持续验证|审计/);
  });
});
