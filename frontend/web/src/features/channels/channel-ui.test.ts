import { describe, expect, it } from 'vitest';
import {
  connectionModeLabel,
  deliveryPolicyStatusLabel,
  deploymentDeletionAction,
  deploymentInboundFact,
  isWebhookInboundMode,
  normalizeConnectionMode,
} from './channel-ui';

describe('channel control-plane UI state', () => {
  it('disables deployment deletion while published policies reference it', () => {
    expect(deploymentDeletionAction(false)).toEqual({ disabled: true, label: '已被策略引用' });
  });

  it('shows a validated draft as pending publication', () => {
    expect(deliveryPolicyStatusLabel('ready')).toBe('待发布');
  });

  it('labels connection modes for deployment cards', () => {
    expect(connectionModeLabel('websocket')).toBe('WebSocket');
    expect(connectionModeLabel('long_connection')).toBe('WebSocket');
    expect(connectionModeLabel('webhook')).toBe('Webhook');
    expect(connectionModeLabel('stream')).toBe('Stream');
    expect(normalizeConnectionMode('ws')).toBe('websocket');
  });

  it('prefers connectionMode over leftover webhookPath for inbound copy', () => {
    expect(isWebhookInboundMode({
      connectionMode: 'websocket',
      webhookPath: '/api/channel/feishu/events/x',
      kind: 'feishu',
    })).toBe(false);
    expect(deploymentInboundFact({
      connectionMode: 'websocket',
      webhookPath: '/api/channel/feishu/events/x',
      kind: 'feishu',
    })).toEqual({
      label: '入站',
      value: 'WebSocket 长连接 · 无需公网',
      title: '开放平台选「使用长连接接收事件」',
      mono: false,
    });
    expect(deploymentInboundFact({
      connectionMode: 'webhook',
      webhookPath: '/api/channel/feishu/events/x',
      kind: 'feishu',
    })?.label).toBe('回调');
  });
});
