import { config } from '../../config.js';
import { sendSafely, notifyCoach } from '../../lib/mailer.js';

const DELAY_MS = 2 * 60 * 1000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const recentlyNotified = new Map<string, number>();
const visitorPending = new Map<string, ReturnType<typeof setTimeout>>();
const visitorRecentlyNotified = new Map<string, number>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function scheduleChatNotification(input: {
  conversationId: string;
  preview: string;
  topic?: string | null;
  visitorLabel: string;
}): void {
  const existing = pending.get(input.conversationId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    pending.delete(input.conversationId);
    void sendChatNotification(input);
  }, DELAY_MS);
  pending.set(input.conversationId, timer);
}

export function cancelChatNotification(conversationId: string): void {
  const existing = pending.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    pending.delete(conversationId);
  }
}

async function sendChatNotification(input: {
  conversationId: string;
  preview: string;
  topic?: string | null;
  visitorLabel: string;
}): Promise<void> {
  const last = recentlyNotified.get(input.conversationId) ?? 0;
  if (Date.now() - last < 10 * 60 * 1000) {
    return;
  }
  recentlyNotified.set(input.conversationId, Date.now());
  const topic = input.topic ? input.topic.replace(/_/g, ' ') : 'General';
  const preview = input.preview.slice(0, 240);
  const inboxUrl = `${config.APP_URL.replace(/\/$/, '')}/admin/inbox?conversation=${input.conversationId}`;
  const subject = 'New message on AI Trainers';
  const text = [
    `Visitor: ${input.visitorLabel}`,
    `Topic: ${topic}`,
    '',
    `"${preview}"`,
    '',
    `Open conversation: ${inboxUrl}`,
  ].join('\n');
  const html = `<p><strong>Visitor:</strong> ${escapeHtml(input.visitorLabel)}</p>
<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>
<blockquote>${escapeHtml(preview)}</blockquote>
<p><a href="${escapeHtml(inboxUrl)}">Open Conversation</a></p>`;

  const dedicated = process.env.CHAT_NOTIFICATION_EMAIL?.trim();
  if (dedicated && dedicated.toLowerCase() !== config.COACH_EMAIL.toLowerCase()) {
    await sendSafely({ to: dedicated, subject, text, html });
    return;
  }
  await notifyCoach({ subject, text, html });
}

export function scheduleVisitorReplyNotification(input: {
  conversationId: string;
  email: string;
  preview: string;
}): void {
  const existing = visitorPending.get(input.conversationId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    visitorPending.delete(input.conversationId);
    void sendVisitorReplyNotification(input);
  }, DELAY_MS);
  visitorPending.set(input.conversationId, timer);
}

export function cancelVisitorReplyNotification(conversationId: string): void {
  const existing = visitorPending.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    visitorPending.delete(conversationId);
  }
}

async function sendVisitorReplyNotification(input: {
  conversationId: string;
  email: string;
  preview: string;
}): Promise<void> {
  const last = visitorRecentlyNotified.get(input.conversationId) ?? 0;
  if (Date.now() - last < 10 * 60 * 1000) {
    return;
  }
  visitorRecentlyNotified.set(input.conversationId, Date.now());
  const preview = input.preview.slice(0, 240);
  const siteUrl = 'https://aitrainers.coach';
  const subject = 'AI Trainers replied to your message';
  const text = [
    'The AI Trainers team replied to your conversation.',
    '',
    `"${preview}"`,
    '',
    `Open AI Trainers Assistant: ${siteUrl}`,
  ].join('\n');
  const html = `<p>The AI Trainers team replied to your conversation.</p>
<blockquote>${escapeHtml(preview)}</blockquote>
<p><a href="${escapeHtml(siteUrl)}">Open AI Trainers Assistant</a></p>`;
  await sendSafely({ to: input.email, subject, text, html });
}
