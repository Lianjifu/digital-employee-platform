import { describe, expect, it } from 'vitest';
import {
  applyProviderConnectProtocol,
  canDiscoverModels,
  canTestConnectDraft,
  canTestSavedProvider,
  catalogModelsForProtocol,
  createProviderConnectDraft,
  draftFromProvider,
  pickModelAfterDiscover,
  protocolBaseUrlHint,
  providerConnectToPayload,
  validateProviderConnectDraft,
} from './provider-connect';

describe('provider-connect', () => {
  it('creates openai-compatible defaults and validates required fields', () => {
    const draft = createProviderConnectDraft('openai_compatible');
    expect(draft.baseUrl).toContain('openai.com');
    expect(validateProviderConnectDraft({ ...draft, apiKey: '' }).some((item) => item.includes('API Key'))).toBe(true);
    expect(validateProviderConnectDraft({ ...draft, apiKey: 'sk-test' })).toEqual([]);
  });

  it('requires azure deployment and api version', () => {
    const draft = createProviderConnectDraft('azure_openai');
    draft.apiKey = 'key';
    draft.deploymentName = '';
    expect(validateProviderConnectDraft(draft).some((item) => item.includes('Deployment'))).toBe(true);
  });

  it('allows ollama without api key for discover and submit', () => {
    const draft = createProviderConnectDraft('ollama');
    expect(canDiscoverModels(draft).ok).toBe(true);
    expect(validateProviderConnectDraft(draft)).toEqual([]);
    expect(providerConnectToPayload(draft, 'w1').credential).toBe('ollama-local');
  });

  it('hydrates edit draft from existing provider without requiring api key', () => {
    const draft = draftFromProvider({
      name: 'Anthropic',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      cloudRegion: 'us-west-2',
      models: [{ name: 'Claude Sonnet-4' }],
    });
    expect(draft.modelId).toBe('Claude Sonnet-4');
    expect(validateProviderConnectDraft(draft, { requireApiKey: false })).toEqual([]);
    expect(canDiscoverModels(draft, { allowStoredCredential: true }).ok).toBe(true);
  });

  it('switches protocol and clears api key', () => {
    const draft = applyProviderConnectProtocol({
      ...createProviderConnectDraft('openai_compatible'),
      apiKey: 'sk-keep',
      note: '公司账号',
    }, 'anthropic');
    expect(draft.protocol).toBe('anthropic');
    expect(draft.apiKey).toBe('');
    expect(draft.note).toBe('公司账号');
    expect(draft.baseUrl).toContain('anthropic');
  });

  it('exposes discoverable model catalogs per protocol', () => {
    expect(catalogModelsForProtocol('dashscope').some((item) => item.id === 'qwen-max')).toBe(true);
    expect(catalogModelsForProtocol('anthropic').length).toBeGreaterThan(1);
  });

  it('warns when Claude protocol is used with DeepSeek base URL', () => {
    expect(protocolBaseUrlHint('anthropic', 'https://api.deepseek.com/anthropic')).toMatch(/OpenAI/);
  });

  it('picks first discovered model when current id is missing from list', () => {
    expect(pickModelAfterDiscover('', [{ id: 'deepseek-chat', name: 'deepseek-chat' }])).toBe('deepseek-chat');
    expect(pickModelAfterDiscover('deepseek-chat', [{ id: 'deepseek-chat', name: 'deepseek-chat' }])).toBe('deepseek-chat');
    expect(pickModelAfterDiscover('claude-x', [{ id: 'deepseek-chat', name: 'deepseek-chat' }])).toBe('deepseek-chat');
  });

  it('blocks connection test when endpoint or credential is missing', () => {
    const draft = createProviderConnectDraft('openai_compatible');
    expect(canTestConnectDraft({ ...draft, apiKey: '' }).ok).toBe(false);
    expect(canTestConnectDraft({ ...draft, apiKey: 'sk-test' }).ok).toBe(true);
    expect(canTestSavedProvider({
      protocol: 'openai_compatible',
      baseUrl: '',
      credentialRef: 'vault://x',
      credentialMasked: '****2126',
    }).ok).toBe(false);
    expect(canTestSavedProvider({
      protocol: 'openai_compatible',
      baseUrl: 'https://api.deepseek.com',
      credentialRef: 'vault://x',
      credentialMasked: '****2126',
    }).ok).toBe(true);
    expect(canTestSavedProvider({
      protocol: 'openai_compatible',
      baseUrl: 'https://api.deepseek.com',
      credentialRef: '',
      credentialMasked: '',
    }).reason).toMatch(/API Key/);
  });
});
