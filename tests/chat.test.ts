import { describe, expect, it } from 'vitest';
import { chatMessageIssue, isLowQualityChatMessage } from '../src/modules/chat/quality.js';
import { createChatMessageBody } from '../src/modules/chat/schema.js';
import { issueChatSocketToken, verifyChatSocketToken } from '../src/modules/chat/token.js';

describe('chat quality', () => {
  it('rejects blank and repeated-character messages', () => {
    expect(chatMessageIssue('   ')).toBe('empty');
    expect(isLowQualityChatMessage('xxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(chatMessageIssue("I'm not sure which opportunities fit my background.")).toBeNull();
  });
});

describe('createChatMessageBody', () => {
  it('accepts a real visitor message', () => {
    const parsed = createChatMessageBody.parse({
      visitorId: '11111111-1111-4111-8111-111111111111',
      body: "I'm not sure which opportunities fit my background.",
      topic: 'opportunities',
      pagePath: '/opportunities',
    });
    expect(parsed.topic).toBe('opportunities');
  });

  it('rejects team impersonation fields by omitting them', () => {
    const parsed = createChatMessageBody.parse({
      visitorId: '11111111-1111-4111-8111-111111111111',
      body: 'Hello from a visitor',
    });
    expect(parsed).not.toHaveProperty('senderType');
  });
});

describe('chat socket token', () => {
  it('round-trips visitor claims and rejects tampering', () => {
    const token = issueChatSocketToken({ role: 'visitor', visitorId: '11111111-1111-4111-8111-111111111111' });
    const claims = verifyChatSocketToken(token);
    expect(claims?.role).toBe('visitor');
    expect(claims?.visitorId).toBe('11111111-1111-4111-8111-111111111111');
    expect(verifyChatSocketToken(`${token}x`)).toBeNull();
  });
});
