// Page webhooks: Messenger and Instagram Direct.
//
// Meta delivers both under the same shape -- entry[].messaging[] -- and
// distinguishes them by the `object` field ("page" or "instagram"). Once
// flattened, an inbound message is indistinguishable from a WhatsApp one to
// the engine, which is the whole point: one conversation, three doors.
import express from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { handleInbound } from '../bot/engine.js';
import { isValidSignature } from '../whatsapp/signature.js';
import { send, enabled } from './messenger.js';
import { publish } from '../utils/events.js';
import { addressFor, MESSENGER, INSTAGRAM } from '../channels.js';

/** Flattens a Page webhook into the inbound messages the engine understands. */
export function extractMessages(body) {
  const channel = body?.object === 'instagram' ? INSTAGRAM : MESSENGER;
  const out = [];
  for (const entry of body?.entry || []) {
    for (const event of entry.messaging || []) {
      // Echoes are our own messages coming back; read receipts and deliveries
      // are not conversation. Only a real inbound message is.
      if (event.message?.is_echo || !event.message) continue;
      const from = addressFor(channel, event.sender?.id);
      const base = {
        id: event.message.mid,
        from,
        timestamp: Math.round((event.timestamp || Date.now()) / 1000),
        channel,
      };
      if (event.message.quick_reply?.payload) {
        out.push({ ...base, type: 'interactive', replyId: event.message.quick_reply.payload, text: event.message.text || '' });
        continue;
      }
      if (event.message.text) {
        out.push({ ...base, type: 'text', text: event.message.text });
        continue;
      }
      const attachment = (event.message.attachments || [])[0];
      if (attachment?.type === 'image') {
        // A payment screenshot arrives as a URL here, not as a media id: the
        // engine is told it is an image and the link is kept for the dashboard.
        out.push({ ...base, type: 'image', mediaUrl: attachment.payload?.url, text: '' });
        continue;
      }
      out.push({ ...base, type: 'unsupported', text: '' });
    }
  }
  return out;
}

async function handle(msg) {
  const { messages, tasks } = handleInbound(msg);
  for (const out of messages) {
    try {
      await send(out);
    } catch (err) {
      logger.error(`Send to ${out.to} failed:`, err.message);
    }
  }
  for (const task of tasks) {
    try {
      await task();
    } catch (err) {
      logger.error('Follow-up task failed:', err.stack || err.message);
    }
  }
  publish('message', { phone: msg.from });
}

export const metaWebhookRouter = express.Router();

// Meta's verification handshake, identical to the WhatsApp one.
metaWebhookRouter.get('/meta/webhook', (req, res) => {
  const token = config.meta.verifyToken;
  if (req.query['hub.mode'] === 'subscribe' && token && req.query['hub.verify_token'] === token) {
    logger.info('Page webhook verified by Meta');
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  return res.sendStatus(403);
});

metaWebhookRouter.post(
  '/meta/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    if (!enabled()) return res.sendStatus(404);
    if (!isValidSignature(req.body, req.get('x-hub-signature-256'), config.whatsapp.appSecret)) {
      logger.warn('Page webhook with a bad signature, ignored');
      return res.sendStatus(403);
    }
    let body = {};
    try {
      body = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.sendStatus(400);
    }
    // Answer Meta first: it retries anything slower than a few seconds.
    res.sendStatus(200);
    for (const msg of extractMessages(body)) {
      try {
        await handle(msg);
      } catch (err) {
        logger.error('Page webhook handling failed:', err.stack || err.message);
      }
    }
  },
);
