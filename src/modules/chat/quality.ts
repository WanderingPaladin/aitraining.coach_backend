export function chatMessageIssue(message: string): 'short' | 'long' | null {
  const text = message.trim();
  if (!text) return 'short';
  if (text.length > 2000) return 'long';
  return null;
}

export const CHAT_QUALITY_COPY = {
  short: 'Type a message before sending.',
  long: 'Keep the message under 2000 characters.',
} as const;
