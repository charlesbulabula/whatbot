// Messenger and Instagram Direct, through the same Page endpoint.
//
// Meta sends and receives both on POST /{page-id}/messages: a Messenger
// recipient is a Page-scoped id, an Instagram one an Instagram-scoped id, and
// the payload shape is identical. So is ours -- the engine already produces
// channel-neutral messages, and this file is simply the second translator.
//
// The interactive vocabulary differs from WhatsApp's and the limits are
// tighter, so anything that does not fit degrades to numbered text rather than
// being silently truncated.
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { logMessage } from '../db/index.js';
import { summarize } from '../bot/messages.js';
import { idOf, channelOf, INSTAGRAM } from '../channels.js';

const GRAPH = `https://graph.facebook.com/${config.whatsapp.graphVersion}`;

// Messenger quick replies: 13 max, 20 characters each.
const QUICK_MAX = 13;
const QUICK_TITLE_MAX = 20;

export class MessengerError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }

  // 10 is "outside the allowed window" on the Messenger platform.
  get outsideWindow() {
    return this.code === 10;
  }
}

/** In-memory transcript of outbound payloads when the channel is off (dev and tests). */
export const sentLog = [];

export const enabled = () => Boolean(config.meta.pageId && config.meta.pageToken);

const quick = (options) => options.slice(0, QUICK_MAX).map((o) => ({
  content_type: 'text',
  title: [...o.title].slice(0, QUICK_TITLE_MAX).join(''),
  payload: o.id,
}));

/**
 * Renders one channel-neutral message for Messenger or Instagram.
 * Lists have no equivalent there, so they become quick replies when they fit
 * and a numbered list when they do not -- the same fallback the WhatsApp side
 * already uses past ten rows.
 */
export function toPayload(msg) {
  const recipient = { id: idOf(msg.to) };
  switch (msg.kind) {
    case 'text':
      return { recipient, message: { text: msg.body } };
    case 'image':
      return {
        recipient,
        message: { attachment: { type: 'image', payload: { url: msg.link, is_reusable: true } } },
      };
    case 'buttons':
      return { recipient, message: { text: msg.body, quick_replies: quick(msg.buttons) } };
    case 'list': {
      const rows = msg.rows || [];
      if (rows.length <= QUICK_MAX && rows.every((r) => [...r.title].length <= QUICK_TITLE_MAX)) {
        return { recipient, message: { text: msg.body, quick_replies: quick(rows) } };
      }
      // Section headings go into the text: dropping them would lose the aisles,
      // which are the whole reason the list is grouped.
      const lines = [];
      let n = 0;
      for (const section of msg.sections || [{ rows }]) {
        if (section.title) lines.push(`\n*${section.title}*`);
        for (const r of section.rows) {
          n += 1;
          lines.push(`*${n}.* ${r.title}${r.description ? ` — ${r.description}` : ''}`);
        }
      }
      return { recipient, message: { text: `${msg.body}\n${lines.join('\n')}` } };
    }
    default:
      // A WhatsApp-only kind (product_list) has no Messenger equivalent; the
      // body alone still tells the customer what to do.
      return { recipient, message: { text: msg.body || '' } };
  }
}

async function graph(path, body) {
  const res = await fetch(`${GRAPH}/${path}?access_token=${encodeURIComponent(config.meta.pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.error || {};
    throw new MessengerError(err.message || `Graph API ${res.status}`, { code: err.code, status: res.status });
  }
  return json;
}

/**
 * Sends one message. `humanAgent` uses Meta's human agent tag, which buys 7
 * days instead of 24 hours -- the reason a handed-over conversation is far
 * less constrained here than on WhatsApp.
 */
export async function send(msg, { humanAgent = false } = {}) {
  const payload = toPayload(msg);
  if (humanAgent) {
    payload.messaging_type = 'MESSAGE_TAG';
    payload.tag = 'HUMAN_AGENT';
  }
  logMessage(msg.to, 'out', summarize(msg));
  if (!enabled()) {
    sentLog.push(msg);
    logger.debug('Messenger disabled, not sending', payload);
    return { disabled: true };
  }
  logger.debug(`Sending on ${channelOf(msg.to) === INSTAGRAM ? 'Instagram' : 'Messenger'}`);
  return graph(`${config.meta.pageId}/messages`, payload);
}
