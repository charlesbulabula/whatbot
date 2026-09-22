import express from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { enqueue } from '../utils/queue.js';
import { markEventProcessed } from '../db/index.js';
import { handleInbound } from '../bot/engine.js';
import { isValidSignature } from './signature.js';
import { send, markRead } from './client.js';

/** Flattens Meta's webhook payload into simple inbound messages. */
export function extractMessages(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const ownNumber = config.whatsapp.phoneNumberId;
      if (ownNumber && value.metadata?.phone_number_id && value.metadata.phone_number_id !== ownNumber) continue;
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages || []) out.push(normalizeInbound(m, names[m.from]));
    }
  }
  return out;
}

export function normalizeInbound(m, profileName) {
  const base = { id: m.id, from: m.from, timestamp: Number(m.timestamp), profileName, type: m.type };
  switch (m.type) {
    case 'text':
      return { ...base, text: m.text?.body || '' };
    case 'interactive': {
      const reply = m.interactive?.button_reply || m.interactive?.list_reply || {};
      return { ...base, replyId: reply.id, text: reply.title || '' };
    }
    case 'button': // quick reply on a template message
      return { ...base, type: 'text', text: m.button?.text || '' };
    case 'image':
      return { ...base, mediaId: m.image?.id, text: m.image?.caption || '' };
    case 'document':
      return { ...base, mediaId: m.document?.id, text: m.document?.caption || '' };
    case 'audio':
      return { ...base, mediaId: m.audio?.id };
    case 'location':
      return {
        ...base,
        location: {
          latitude: m.location?.latitude,
          longitude: m.location?.longitude,
          name: m.location?.name,
          address: m.location?.address,
        },
      };
    default:
      return { ...base, type: 'unsupported' };
  }
}

export async function processInbound(msg) {
  if (!markEventProcessed(msg.id)) return; // Meta redelivers events; handle each once
  markRead(msg.id);
  const { messages, tasks } = handleInbound(msg);
  for (const out of messages) {
    try {
      await send(out);
    } catch (err) {
      logger.error(`Send to ${out.to} failed:`, err.message, err.details || '');
    }
  }
  for (const task of tasks) {
    try {
      await task();
    } catch (err) {
      logger.error('Follow-up task failed:', err.stack || err.message);
    }
  }
}

export const webhookRouter = express.Router();

// Meta's one-time verification handshake when the webhook URL is registered.
webhookRouter.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && config.whatsapp.verifyToken && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verified by Meta');
    return res.status(200).type('text/plain').send(String(challenge));
  }
  res.sendStatus(403);
});

webhookRouter.post('/webhook', (req, res) => {
  const { appSecret } = config.whatsapp;
  if (appSecret) {
    if (!isValidSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) {
      logger.warn('Rejected webhook call with an invalid signature');
      return res.sendStatus(401);
    }
  } else if (config.env === 'production') {
    return res.sendStatus(401);
  }
  // Acknowledge immediately: Meta retries if the answer takes too long.
  res.sendStatus(200);
  for (const msg of extractMessages(req.body)) enqueue(msg.from, () => processInbound(msg));
});
