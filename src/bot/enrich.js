// Asynchronous lookups done before the (synchronous) conversation engine runs:
// the engine only reads the results attached to the message.
import { config } from '../config.js';
import { locate } from '../geo/nominatim.js';
import { understandOrder } from '../ai/order-understanding.js';
import { getConversation } from '../db/index.js';
import { normalize, isKeyword, UNDERSTANDING_STATES } from './engine.js';

const usage = new Map(); // phone -> { day, count }: cost guard for free-text understanding

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
  if (msg.type === 'text' && shouldTryUnderstanding(getConversation(msg.from).state, msg.text) && withinDailyLimit(msg.from)) {
    return { ...msg, nlu: await understandOrder(msg.text) };
  }
  return msg;
}
