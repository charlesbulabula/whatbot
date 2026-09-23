import './setup.js';
import { handleInbound } from '../src/bot/engine.js';
import { seedIfEmpty } from '../src/db/seed.js';
import { db, seedVariantsIfMissing } from '../src/db/index.js';
import { send as sendToWhatsApp } from '../src/whatsapp/client.js';

seedIfEmpty();
seedVariantsIfMissing();

let seq = 0;

/** Simulates a customer: every call sends one inbound message and returns the bot's replies. */
export function customer(phone) {
  const send = (msg) => {
    const { messages, tasks } = handleInbound({ id: `wamid.${++seq}`, from: phone, type: 'text', ...msg });
    // Same path as production: with WA_ENABLED=false, send() only logs (synchronously).
    for (const m of messages) sendToWhatsApp(m);
    return { messages, tasks, last: messages.at(-1), all: messages.map(bodyOf).join('\n---\n') };
  };
  return {
    phone,
    say: (text) => send({ type: 'text', text }),
    // `nlu` stands for what Claude understood from the sentence (see src/bot/enrich.js).
    sayUnderstood: (text, nlu) => send({ type: 'text', text, nlu }),
    tap: (replyId, title = replyId) => send({ type: 'interactive', replyId, text: title }),
    image: (mediaId = 'media-1') => send({ type: 'image', mediaId }),
    voice: () => send({ type: 'audio', mediaId: 'voice-1' }),
    // `geo` stands for what reverse geocoding found (see src/bot/enrich.js).
    location: (latitude, longitude, geo) => send({ type: 'location', location: { latitude, longitude }, geo }),
    state: () => db.prepare('SELECT state FROM conversations WHERE phone = ?').get(phone)?.state,
  };
}

export const bodyOf = (m) => (m.kind === 'text' ? m.body : m.body);
export const optionIds = (m) => (m.kind === 'buttons' ? m.buttons.map((b) => b.id) : m.kind === 'list' ? m.rows.map((r) => r.id) : []);

/** Runs a full order for a fresh customer and returns the created order id. */
export function placeOrder(c, { productId = 1, size = 'medium', qty = 2, zone = 'zone:0' } = {}) {
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap(`p:${productId}`);
  c.tap(`size:${size}`);
  c.tap(`qty:${qty}`);
  const checkout = c.tap('more:checkout');
  if (checkout.last.kind === 'buttons' && optionIds(checkout.last).includes('addr:yes')) {
    c.tap('addr:yes');
  } else {
    c.say('Mama Nzinga');
    c.tap(zone);
    c.say('Av. de la Paix 12, près de l’église');
  }
  c.tap('recap:confirm');
  return db.prepare('SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone = ? ORDER BY o.id DESC').get(c.phone).id;
}
