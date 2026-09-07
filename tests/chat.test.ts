import { describe, expect, it } from 'vitest';
import { chatMessageIssue } from '../src/modules/chat/quality.js';
import { issueChatToken, verifyChatToken } from '../src/modules/chat/token.js';
import { feedbackSummary } from '../src/modules/chat/service.js';

describe('chat quality', () => {
  it('rejects empty messages', () => {
    expect(chatMessageIssue('')).toBe('short');
  });

  it('accepts a normal visitor message', () => {
    expect(chatMessageIssue('Hello, I need help with opportunities.')).toBeNull();
  });
});

describe('chat tokens', () => {
  it('issues visitor tokens that cannot be used as admin', () => {
    const token = issueChatToken({ role: 'visitor', visitorId: '00000000-0000-4000-8000-000000000001' });
    const payload = verifyChatToken(token);
    expect(payload?.role).toBe('visitor');
    expect(payload && payload.role === 'visitor' ? payload.visitorId : null).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('rejects tampered tokens', () => {
    const token = issueChatToken({ role: 'admin' });
    expect(verifyChatToken(`${token}x`)).toBeNull();
  });
});

describe('feedback summary', () => {
  it('does not dump a raw database record', () => {
    const summary = feedbackSummary({
      category: 'confusing',
      subcategory: 'profile_match',
      message: 'I do not understand why my score is 72.',
      pagePath: '/profile',
    });
    expect(summary).toContain('Profile');
    expect(summary).not.toContain('conversation_id');
  });
});
