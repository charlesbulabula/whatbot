import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customer, placeOrder } from './helpers.js';
import * as db from '../src/db/index.js';
import { changeOrderStatus } from '../src/bot/orders.js';
import { sentLog } from '../src/whatsapp/client.js';

test('paid status counts the order once and updates the segment', async () => {
  const c = customer('243820000001');
  const id = placeOrder(c);
  await changeOrderStatus(id, 'paid');
  await changeOrderStatus(id, 'preparing');
  await changeOrderStatus(id, 'on_the_way', { eta: '14h30' });
  await changeOrderStatus(id, 'delivered');
  const cust = db.getCustomer(c.phone);
  assert.equal(cust.orders_count, 1);
  assert.equal(cust.segment, 'new');
  assert.ok(db.getOrder(id).delivered_at);
  const texts = sentLog.filter((m) => m.to === c.phone).map((m) => m.body);
  assert.ok(texts.some((b) => /Paiement reçu pour la commande/.test(b)));
  assert.ok(texts.some((b) => /arrivée estimée à \*14h30\*/.test(b)));
  assert.ok(texts.some((b) => /livrée\. Bon appétit/.test(b)));
});

test('cancelling a paid order un-counts it and refunds spent credit', async () => {
  const c = customer('243820000002');
  c.say('Bonjour');
  db.addCredit(db.getCustomer(c.phone).id, 1000);
  const id = placeOrder(c);
  assert.equal(db.getCustomer(c.phone).credit, 0);
  await changeOrderStatus(id, 'paid');
  assert.equal(db.getCustomer(c.phone).orders_count, 1);
  await changeOrderStatus(id, 'cancelled');
  const cust = db.getCustomer(c.phone);
  assert.equal(cust.orders_count, 0);
  assert.equal(cust.credit, 1000);
});

test('loyalty credit every Nth paid order, and referral code shared after the 2nd', async () => {
  const c = customer('243820000003');
  for (let i = 0; i < 3; i++) {
    const id = placeOrder(c);
    c.image();
    await changeOrderStatus(id, 'delivered');
  }
  const cust = db.getCustomer(c.phone);
  assert.equal(cust.orders_count, 3);
  assert.equal(cust.segment, 'regular');
  assert.equal(cust.credit, 2000); // LOYALTY_EVERY=3, LOYALTY_REWARD=2000
  const texts = sentLog.filter((m) => m.to === c.phone).map((m) => m.body);
  assert.ok(texts.some((b) => b.includes(cust.referral_code)), 'referral code shared');
  assert.ok(texts.some((b) => /fidélité/.test(b)));
});

test('order references are sequential per day', () => {
  const a = db.getOrder(placeOrder(customer('243820000004')));
  const b = db.getOrder(placeOrder(customer('243820000005')));
  const n = (ref) => Number(ref.split('-').at(-1));
  assert.equal(n(b.reference), n(a.reference) + 1);
});

test('order references stay unique even when earlier orders were re-dated', () => {
  const a = db.getOrder(placeOrder(customer('243820000006')));
  db.db.prepare("UPDATE orders SET created_at = datetime('now', '-3 days') WHERE id = ?").run(a.id);
  const b = db.getOrder(placeOrder(customer('243820000007')));
  assert.ok(b, 'second order was created');
  assert.notEqual(b.reference, a.reference);
});
