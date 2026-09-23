// Asynchronous lookups done before the (synchronous) conversation engine runs:
// the engine only reads the results attached to the message.
import { config } from '../config.js';
import { locate } from '../geo/nominatim.js';
import { understandOrder } from '../ai/order-understanding.js';
import { transcribe, isEnabled as sttEnabled } from '../ai/transcribe.js';
import { downloadMedia } from '../whatsapp/client.js';
import { logger } from '../utils/logger.js';
import { getConversation } from '../db/index.js';
import { normalize, isKeyword, UNDERSTANDING_STATES } from './engine.js';

const usage = new Map(); // phone -> { day, count }: cost guard for free-text understanding

async function transcribeVoice(mediaId) {
  try {
    const { contentType, buffer } = await downloadMedia(mediaId);
    return await transcribe(buffer, contentType);
  } catch (err) {
    logger.warn('Voice note download failed:', err.message);
    return null;
  }
}

function withinDailyLimit(phone) {
  const day = new Date().toLocaleDateString('en-CA');
  const entry = usage.get(phone);
  if (!entry || entry.day !== day) {
    usage.set(phone, { day, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= config.ai.dailyLimitPerCustomer;
}

/** Only sentences that could be an order, at a step where the bot would otherwise not understand. */
export function shouldTryUnderstanding(state, text) {
  if (!config.ai.apiKey || !UNDERSTANDING_STATES.includes(state)) return false;
  const norm = normalize(text);
  if (norm.length < 6 || !/\p{L}/u.test(norm) || isKeyword(norm)) return false;
  return norm.split(' ').length >= 2;
}

export async function enrichInbound(msg) {
  if (msg.type === 'location' && msg.location) {
    return { ...msg, geo: await locate(Number(msg.location.latitude), Number(msg.location.longitude)) };
  }
  // A voice note becomes text, then follows exactly the same path a typed
  // message would: keywords, buttons by name, or free-text understanding.
  if (msg.type === 'audio' && msg.mediaId && sttEnabled()) {
    const spoken = await transcribeVoice(msg.mediaId);
    if (spoken) {
      const asText = { ...msg, type: 'text', text: spoken, transcript: spoken };
      return shouldTryUnderstanding(getConversation(msg.from).state, spoken) && withinDailyLimit(msg.from)
        ? { ...asText, nlu: await understandOrder(spoken) }
        : asText;
    }
  }
  if (msg.type === 'text' && shouldTryUnderstanding(getConversation(msg.from).state, msg.text) && withinDailyLimit(msg.from)) {
    return { ...msg, nlu: await understandOrder(msg.text) };
  }
  return msg;
}
