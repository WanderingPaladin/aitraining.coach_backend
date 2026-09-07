import { config } from '../../config.js';
import { sendSafely } from '../../lib/mailer.js';

const lastTeamMail = new Map<string, number>();
const lastVisitorMail = new Map<string, number>();
const DEBOUNCE_MS = 2 * 60 * 1000;
const SUPPRESS_MS = 10 * 60 * 1000;

function shouldSend(store: Map<string, number>, key: string) {
  const now = Date.now();
  const previous = store.get(key) ?? 0;
  if (now - previous < SUPPRESS_MS) return false;
  store.set(key, now);
  return true;
}

export async function notifyTeamNewMessage(
  conversation: { id: string; displayName: string; startedFromPage?: string | null },
  message: { body: string; messageType?: string },
) {
  const to = process.env.CHAT_NOTIFICATION_EMAIL || config.COACH_EMAIL;
  if (!to || !shouldSend(lastTeamMail, conversation.id)) return;
  const preview = message.body.slice(0, 240);
  await sendSafely({
    to,
    subject: `New chat from ${conversation.displayName}`,
    text: `${conversation.displayName} wrote:\n\n${preview}\n\nInbox: ${config.APP_URL.replace(/\/$/, '')}/admin/inbox?conversation=${conversation.id}`,
    html: `<p><strong>${conversation.displayName}</strong> wrote:</p><p>${preview.replace(/</g, '&lt;')}</p><p><a href="${config.APP_URL.replace(/\/$/, '')}/admin/inbox?conversation=${conversation.id}">Open Inbox</a></p>`,
  });
}

export async function notifyVisitorReply(
  conversation: { id: string; contactEmail?: string | null; displayName: string },
  message: { body: string },
) {
  const to = conversation.contactEmail;
  if (!to || !shouldSend(lastVisitorMail, conversation.id)) return;
  void DEBOUNCE_MS;
  const preview = message.body.slice(0, 240);
  await sendSafely({
    to,
    subject: 'AI Trainers Team replied',
    text: `Hi ${conversation.displayName},\n\nThe AI Trainers team replied:\n\n${preview}\n\nOpen the site to continue the conversation.`,
    html: `<p>The AI Trainers team replied:</p><p>${preview.replace(/</g, '&lt;')}</p><p>Open the AI Trainers Assistant to continue the conversation.</p>`,
  });
}
