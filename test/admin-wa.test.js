// The shop answering its own alerts from WhatsApp.
import './setup.js';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/index.js'); // seeds the starter catalogue
const db = await import('../src/db/index.js');
const settings = await import('../src/shop/settings.js');
const { handleInbound } = await import('../src/bot/engine.js');

const ADMIN = '243897000001';
let order;

before(() => {
  settings.save({ adminNotifyNumber: ADMIN });
  const { customer } = db.touchCustomer('243811000001');
  db.updateCustomer(customer.id, { name: 'Cliente' });
  const product = db.listProducts()[0];
  order = db.createOrder({
    customer: db.getCustomerById(customer.id),
    items: [{ productId: product.id, size: 'medium', quantity: 1, unitPrice: product.price_medium }],
    subtotal: product.price_medium, deliveryFee: 2000, discount: 0,
    total: product.price_medium + 2000, paymentMethod: 'momo',
    name: 'Cliente', neighborhood: 'Gombe', addressNote: '',
  });
});

const from = (fields) => handleInbound({ from: ADMIN, id: `m${Math.random()}`, ...fields });

test('the shop confirms a payment by tapping the button on its own alert', async () => {
  const res = from({ type: 'interactive', replyId: `adm:pay:${order.id}`, text: 'Valider' });
  assert.match(res.messages[0].body, /Paiement validé/);
  for (const task of res.tasks) await task();
  assert.equal(db.getOrder(order.id).status, 'paid');
});

test('a reference typed by hand works too, and a settled order says so', async () => {
  const again = from({ type: 'text', text: `ok ${order.reference}` });
  assert.match(again.messages[0].body, /n’est plus en attente/);
  assert.equal(again.tasks.length, 0, 'nothing is done twice');

  const unknown = from({ type: 'text', text: 'ok CMD-1900-999' });
  assert.match(unknown.messages[0].body, /introuvable/);
});

test('the admin number can still use the bot as a customer', () => {
  const hello = from({ type: 'text', text: 'Bonjour' });
  assert.match(hello.messages[0].body, /Que souhaitez-vous faire|bienvenue/);
  assert.equal(hello.tasks.length, 0);
});

test('nobody else can confirm a payment from WhatsApp', () => {
  const res = handleInbound({ from: '243899999999', id: 'x1', type: 'interactive', replyId: `adm:pay:${order.id}`, text: 'Valider' });
  assert.doesNotMatch(res.messages[0]?.body || '', /Paiement validé/);
});
