import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { normalizeLocale } from '../i18n/index.js';
import { send, WhatsAppError } from '../whatsapp/client.js';
import { template } from './messages.js';

// Meta allows free-form messages for 24h after the customer's last message.
// Keep a margin so a message queued near the limit is not rejected.
const SERVICE_WINDOW_MS = 23.5 * 60 * 60 * 1000;

const parseUtc = (sqliteDate) => Date.parse(`${String(sqliteDate).replace(' ', 'T')}Z`);

export function inServiceWindow(customer, now = Date.now()) {
  if (!customer?.last_seen_at) return false;
  return now - parseUtc(customer.last_seen_at) < SERVICE_WINDOW_MS;
}

/**
 * Sends a message outside the conversation flow (status updates, reminders...).
 * Free-form while the 24h window is open; otherwise the approved template named
 * by `templateKey`, if one is configured. Returns 'sent' | 'template' | 'skipped'.
 */
export async function notify(customer, { message, templateKey, templateParams = [] }) {
  if (inServiceWindow(customer)) {
    try {
      await send(message);
      return 'sent';
    } catch (err) {
      if (!(err instanceof WhatsAppError && err.outsideWindow)) throw err;
    }
  }
  const name = templateKey && config.whatsapp.templates[templateKey];
  if (!name) {
    logger.info(`24h window closed and no template for "${templateKey || 'none'}": not messaging ${customer.phone}`);
    return 'skipped';
  }
  const language = config.whatsapp.templateLanguages[normalizeLocale(customer.locale)];
  await send(template(customer.phone, name, language, templateParams));
  return 'template';
}
