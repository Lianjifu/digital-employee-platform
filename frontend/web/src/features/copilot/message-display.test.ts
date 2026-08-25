import { describe, expect, it } from 'vitest';
import {
  formatAssistantDisplayContent,
  formatExecutionDetails,
  splitAuthorizedExecutionContent,
  stripExecutionTechnicalNoise,
} from './message-display';

const SAMPLE = [
  '智能体已申请 Skill Turn（写入脚本 → 执行生成），等待登录用户人工审核；批准后可手动执行至产物。',
  '',
  '—— 授权后执行结果 ——',
  '—— 步骤 写入技能工作区脚本 ——',
  '【skill.write】write ok: .copilot-ws/gen_python_recruit_doc.py (9124 bytes)',
  '—— 步骤 执行脚本生成产物 ——',
  'sandbox=gvisor-local',
  'skillId=sk-719',
  '--- stdout ---',
  'SAVED: .copilot-ws/Python开发工程师招聘模版.docx',
  '已生成 Word 文档「招聘Python开发的招聘模版word」(本地回退)',
  '文件名：招聘Python开发的招聘模版word.docx',
  '下载链接：/api/skill-artifacts/abc-招聘模板.docx',
].join('\n');

describe('formatAssistantDisplayContent', () => {
  it('shows concise summary when artifacts exist', () => {
    const got = formatAssistantDisplayContent(SAMPLE, true);
    expect(got).toContain('已为您生成 Word 文档');
    expect(got).not.toContain('sandbox=');
    expect(got).not.toContain('智能体已申请');
    expect(got).not.toContain('—— 步骤');
  });

  it('preserves intro for normal assistant replies', () => {
    const got = formatAssistantDisplayContent('一、岗位职责\n\n负责招聘', false);
    expect(got).toContain('一、岗位职责');
  });

  it('strips leaked xml tool blocks from bubble', () => {
    const raw = '<skill.read>\n{"skill":"pptx","action":"open"}\n</skill.read>';
    const got = formatAssistantDisplayContent(raw, false);
    expect(got).toBe('');
    expect(got).not.toContain('skill.read');
  });
});

describe('formatExecutionDetails', () => {
  it('keeps step titles without sandbox noise', () => {
    const details = formatExecutionDetails(SAMPLE);
    expect(details).toContain('步骤');
    expect(details).not.toContain('sandbox=');
    expect(details).not.toContain('skillId=');
  });
});

describe('splitAuthorizedExecutionContent', () => {
  it('splits marker blocks', () => {
    const { intro, execution } = splitAuthorizedExecutionContent(SAMPLE);
    expect(intro).toContain('智能体已申请');
    expect(execution).toContain('步骤');
  });
});

describe('stripExecutionTechnicalNoise', () => {
  it('filters key=value runtime lines', () => {
    const cleaned = stripExecutionTechnicalNoise('sandbox=local\nskillId=x\n已生成 Word 文档「测试」');
    expect(cleaned).toContain('已生成 Word');
    expect(cleaned).not.toContain('sandbox');
  });
});
