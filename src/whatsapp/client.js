import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { logMessage } from '../db/index.js';
import { summarize } from '../bot/messages.js';

const { whatsapp: wa } = config;
const GRAPH = `https://graph.facebook.com/${wa.graphVersion}`;

// Graph API error code when a free-form message is sent outside the 24h window.
export const OUTSIDE_WINDOW_CODES = new Set([131047, 470]);

export class WhatsAppError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get outsideWindow() {
    return OUTSIDE_WINDOW_CODES.has(this.code);
  }
}

/** In-memory transcript of outbound payloads when WA_ENABLED=false (dev and tests). */
export const sentLog = [];

function toPayload(msg) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: msg.to };
  switch (msg.kind) {
    case 'text':
      return { ...base, type: 'text', text: { body: msg.body, preview_url: true } };
    case 'buttons':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: msg.body },
          ...(msg.footer && { footer: { text: msg.footer } }),
          action: { buttons: msg.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
        },
      };
    case 'list':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: msg.body },
          ...(msg.footer && { footer: { text: msg.footer } }),
          action: {
            button: msg.button,
            sections: [
              {
                title: msg.button,
                rows: msg.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description && { description: r.description }) })),
              },
            ],
          },
        },
      };
    case 'image':
      return { ...base, type: 'image', image: { link: msg.link, ...(msg.caption && { caption: msg.caption }) } };
    // A catalogue message: WhatsApp renders the products from the Meta catalog,
    // with their pictures, and the customer builds a cart inside WhatsApp.
    case 'product_list':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'product_list',
          header: { type: 'text', text: msg.header },
          body: { text: msg.body },
          ...(msg.footer && { footer: { text: msg.footer } }),
          action: {
            catalog_id: msg.catalogId,
            sections: msg.sections.map((sec) => ({
              title: sec.title,
              product_items: sec.items.map((id) => ({ product_retailer_id: id })),
            })),
          },
        },
      };
    case 'template':
      return {
        ...base,
        type: 'template',
        template: {
          name: msg.name,
          language: { code: msg.language },
          ...(msg.params.length && {
            components: [{ type: 'body', parameters: msg.params.map((p) => ({ type: 'text', text: String(p) })) }],
          }),
        },
      };
    default:
      throw new Error(`Unknown message kind: ${msg.kind}`);
  }
}

async function graph(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${wa.token}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.error || {};
    throw new WhatsAppError(err.message || `Graph API ${res.status}`, {
      code: err.code,
      status: res.status,
      details: err.error_data?.details,
    });
  }
  return json;
}

export async function send(msg) {
  const payload = toPayload(msg);
  logMessage(msg.to, 'out', summarize(msg));
  if (!wa.enabled) {
    sentLog.push(msg);
    logger.debug('WA disabled, not sending', payload);
    return { disabled: true };
  }
  return graph(`${wa.phoneNumberId}/messages`, { method: 'POST', body: payload });
}

export async function markRead(messageId) {
  if (!wa.enabled || !messageId) return;
  try {
    await graph(`${wa.phoneNumberId}/messages`, {
      method: 'POST',
      body: { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
    });
  } catch (err) {
    logger.debug('markRead failed', err.message);
  }
}

/** Downloads an inbound media file (payment screenshot) so the admin dashboard can display it. */
export async function downloadMedia(mediaId) {
  const meta = await graph(encodeURIComponent(mediaId));
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${wa.token}` } });
  if (!res.ok) throw new WhatsAppError(`Media download failed (${res.status})`, { status: res.status });
  return { contentType: meta.mime_type || res.headers.get('content-type'), buffer: Buffer.from(await res.arrayBuffer()) };
}
