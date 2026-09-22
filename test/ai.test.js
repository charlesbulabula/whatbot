import { customer, optionIds } from './helpers.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { config } from '../src/config.js';
import { toOrderItems, understandOrder } from '../src/ai/order-understanding.js';
import { shouldTryUnderstanding } from '../src/bot/enrich.js';
import * as db from '../src/db/index.js';

const products = db.listProducts();

test('model output is checked against the catalogue before use', () => {
  const r = toOrderItems(
    {
      is_order: true,
      items: [
        { product_id: 1, size: 'medium', quantity: 2 },
        { product_id: 1, size: 'medium', quantity: 1 }, // merged
        { product_id: 999, size: 'small', quantity: 1 }, // unknown id
        { product_id: 3, size: 'huge', quantity: 1 }, // invalid size
        { product_id: 3, size: 'small', quantity: 0 }, // invalid quantity
        { product_id: 3, size: 'small', quantity: 500 }, // capped
      ],
      unknown_products: ['safran'],
    },
    products,
  );
  assert.deepEqual(r.items, [
    { productId: 1, size: 'medium', qty: 3 },
    { productId: 3, size: 'small', qty: 20 },
  ]);
  assert.deepEqual(r.unknown, ['safran']);
  assert.equal(toOrderItems({ is_order: false, items: [], unknown_products: [] }, products), null);
  assert.equal(toOrderItems(null, products), null);
});

test('only order-like sentences at the right steps are sent to Claude, and only with a key', () => {
  const saved = config.ai.apiKey;
  try {
    config.ai.apiKey = '';
    assert.equal(shouldTryUnderstanding('MENU', '2 tas de tomates'), false, 'feature off without key');
    config.ai.apiKey = 'test-key';
    assert.equal(shouldTryUnderstanding('MENU', '2 tas de tomates'), true);
    assert.equal(shouldTryUnderstanding('DONE', 'je veux du gingembre'), true);
    assert.equal(shouldTryUnderstanding('ASK_NAME', 'Mama Nzinga Kabeya'), false, 'free-text steps are excluded');
    assert.equal(shouldTryUnderstanding('MENU', 'ok'), false);
    assert.equal(shouldTryUnderstanding('MENU', 'annuler'), false);
    assert.equal(shouldTryUnderstanding('MENU', '12 34'), false);
  } finally {
    config.ai.apiKey = saved;
  }
});

test('an understood order is confirmed before anything goes into the cart', () => {
  const c = customer('243860000001');
  const nlu = { items: [{ productId: 1, size: 'medium', qty: 2 }, { productId: 3, size: 'small', qty: 1 }], unknown: ['safran'] };
  const confirm = c.sayUnderstood('Bonjour, 2 tas moyens de tomates et un petit gingembre, et du safran', nlu).last;
  assert.equal(c.state(), 'NLU_CONFIRM');
  assert.match(confirm.body, /J’ai compris :/);
  assert.match(confirm.body, /🍅 Tomate — Moyen tas × 2 — 4 000 FC/);
  assert.match(confirm.body, /🫚 Gingembre — Petit tas × 1/);
  assert.match(confirm.body, /pas trouvé dans notre catalogue : safran/);
  assert.deepEqual(optionIds(confirm), ['nlu:yes', 'nlu:no']);

  const added = c.tap('nlu:yes').last;
  assert.equal(c.state(), 'ADD_MORE');
  assert.match(added.body, /Sous-total : \*5 000 FC\*/);
});

test('"no" falls back to the catalogue; a typed correction replaces the proposal', () => {
  const c = customer('243860000002');
  c.sayUnderstood('je veux des tomates', { items: [{ productId: 1, size: 'medium', qty: 1 }], unknown: [] });
  c.sayUnderstood('non plutôt 3 grands tas de tomates', { items: [{ productId: 1, size: 'large', qty: 3 }], unknown: [] });
  assert.match(c.state() === 'NLU_CONFIRM' && c.say('oui').last.body, /Tomate — Grand tas × 3/);

  const d = customer('243860000003');
  d.sayUnderstood('du piment svp', { items: [{ productId: 2, size: 'medium', qty: 1 }], unknown: [] });
  d.tap('nlu:no');
  assert.equal(d.state(), 'PICK_PRODUCT');
});

test('Claude request shape and response parsing (fake API server)', async () => {
  let captured;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      captured = { path: req.url, headers: req.headers, body: JSON.parse(body) };
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          stop_reason: 'end_turn',
          stop_details: null,
          content: [{ type: 'text', text: JSON.stringify({ is_order: true, items: [{ product_id: 2, size: 'large', quantity: 1 }], unknown_products: [] }) }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      );
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  after(() => server.close());
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const saved = config.ai.apiKey;
  config.ai.apiKey = 'test-key';
  try {
    const result = await understandOrder('un grand tas de pili pili');
    assert.deepEqual(result, { items: [{ productId: 2, size: 'large', qty: 1 }], unknown: [] });
    assert.match(captured.path, /^\/v1\/messages/);
    assert.equal(captured.headers['x-api-key'], 'test-key');
    assert.match(captured.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(captured.body.model, 'claude-opus-5');
    assert.equal(captured.body.fallbacks, 'default');
    assert.equal(captured.body.output_config.effort, 'low');
    assert.equal(captured.body.output_config.format.type, 'json_schema');
    assert.match(captured.body.system, /1: Tomate \/ Tomato/);
    assert.equal(captured.body.betas, undefined, 'betas travel as a header, not in the body');
  } finally {
    config.ai.apiKey = saved;
  }
});
