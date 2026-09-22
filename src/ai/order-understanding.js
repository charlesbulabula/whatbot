// Free-text orders ("2 tas moyens de tomates et un petit gingembre") turned into
// cart items with Claude, then confirmed by the customer before anything is added.
// Optional: without ANTHROPIC_API_KEY the bot keeps working with buttons only.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { listProducts } from '../db/index.js';

const SIZES = ['small', 'medium', 'large'];
const MAX_QTY = 20;

const SCHEMA = {
  type: 'object',
  properties: {
    is_order: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_id: { type: 'integer' },
          size: { type: 'string', enum: SIZES },
          quantity: { type: 'integer' },
        },
        required: ['product_id', 'size', 'quantity'],
        additionalProperties: false,
      },
    },
    unknown_products: { type: 'array', items: { type: 'string' } },
  },
  required: ['is_order', 'items', 'unknown_products'],
  additionalProperties: false,
};

function systemPrompt(products) {
  const catalogue = products.map((p) => `${p.id}: ${p.name_fr} / ${p.name_en}`).join('\n');
  return `You read WhatsApp messages sent to a fresh spice and vegetable delivery shop in Kinshasa and extract what the customer wants to order.

Catalogue (product_id: French name / English name):
${catalogue}

Products are sold by the heap in three sizes: small ("petit tas"), medium ("moyen tas"), large ("grand tas").
- quantity is the number of heaps; use 1 when not stated.
- When the size is not stated, use medium.
- Customers write in French, English or Lingala, with typos, plurals and abbreviations (e.g. "tangawisi" is ginger, "pili pili" is chili pepper). Map each requested product to the closest catalogue entry only when you are confident.
- Requested products that are not in the catalogue go in unknown_products, in the customer's words.
- If the message is not an order (a greeting, a question, a complaint, a delivery detail), set is_order to false and leave items empty.`;
}

let client = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.ai.apiKey, timeout: config.ai.timeoutMs, maxRetries: 1 }));

/** Opus 5 family: supports effort and server-side refusal fallbacks. */
const isOpus5Family = (model) => /^claude-(opus-5|fable-5)/.test(model);

/** Checks the model's JSON against the live catalogue; keeps only what can really be ordered. */
export function toOrderItems(result, products) {
  if (!result || result.is_order !== true || !Array.isArray(result.items)) return null;
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [];
  for (const it of result.items) {
    const qty = Number(it?.quantity);
    if (!byId.has(it?.product_id) || !SIZES.includes(it?.size) || !Number.isInteger(qty) || qty < 1) continue;
    const existing = items.find((i) => i.productId === it.product_id && i.size === it.size);
    if (existing) existing.qty = Math.min(existing.qty + qty, MAX_QTY);
    else items.push({ productId: it.product_id, size: it.size, qty: Math.min(qty, MAX_QTY) });
  }
  const unknown = (result.unknown_products || []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 5);
  return items.length || unknown.length ? { items, unknown } : null;
}

/** Returns { items: [{productId, size, qty}], unknown: [string] } or null (not an order, disabled, or failed). */
export async function understandOrder(text) {
  if (!config.ai.apiKey) return null;
  const products = listProducts();
  if (!products.length) return null;
  const model = config.ai.model;
  const request = {
    model,
    max_tokens: 2048,
    system: systemPrompt(products),
    messages: [{ role: 'user', content: String(text).slice(0, 1000) }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA }, ...(isOpus5Family(model) && { effort: 'low' }) },
    ...(isOpus5Family(model) && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
  };
  try {
    const response = await getClient().beta.messages.create(request);
    if (response.stop_reason === 'refusal') {
      logger.warn('Order understanding refused:', response.stop_details?.category ?? 'unknown category');
      return null;
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    return toOrderItems(JSON.parse(textBlock?.text ?? 'null'), products);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) logger.warn('Order understanding rate limited');
    else if (err instanceof Anthropic.AuthenticationError) logger.error('Order understanding: invalid ANTHROPIC_API_KEY');
    else if (err instanceof Anthropic.APIError) logger.error(`Order understanding API error ${err.status}:`, err.message);
    else if (err instanceof SyntaxError) logger.warn('Order understanding returned invalid JSON');
    else logger.error('Order understanding failed:', err.message);
    return null;
  }
}
