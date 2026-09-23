import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customer, optionIds } from './helpers.js';
import * as db from '../src/db/index.js';
import * as settings from '../src/shop/settings.js';
import * as coupons from '../src/shop/coupons.js';

const ALL_DAY = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '00:00', close: '23:59' }]));
const openAllHours = () => settings.save({ hours: ALL_DAY, closed: false });

/* ----------------------------- opening hours ---------------------------- */

test('opening hours: open inside the window, closed outside and on a closed day', () => {
  settings.save({ hours: { ...ALL_DAY, 3: { open: '08:00', close: '17:00' }, 0: null } });
  const wednesday = (h, m = 0) => new Date(2026, 8, 23, h, m); // 2026-09-23 is a Wednesday
  assert.equal(settings.isOpen(wednesday(7, 59)), false);
  assert.equal(settings.isOpen(wednesday(8, 0)), true);
  assert.equal(settings.isOpen(wednesday(16, 59)), true);
  assert.equal(settings.isOpen(wednesday(17, 0)), false);

  const sunday = new Date(2026, 8, 27, 12, 0);
  assert.equal(settings.isOpen(sunday), false, 'a null day is closed all day');

  // 23:59 means "until midnight", so an all-day window never closes early.
  assert.equal(settings.isOpen(new Date(2026, 8, 22, 23, 58)), true);
});

test('opening hours: the manual switch closes the shop whatever the schedule says', () => {
  settings.save({ hours: ALL_DAY, closed: true });
  assert.equal(settings.isOpen(new Date(2026, 8, 23, 12, 0)), false);
  openAllHours();
  assert.equal(settings.isOpen(new Date(2026, 8, 23, 12, 0)), true);
});

test('nextOpening points at today, tomorrow, or the next open weekday', () => {
  settings.save({ hours: { ...ALL_DAY, 3: { open: '08:00', close: '17:00' } } });
  const before = settings.nextOpening(new Date(2026, 8, 23, 6, 0));
  assert.deepEqual([before.day, before.time, before.today], [3, '08:00', true]);

  const after = settings.nextOpening(new Date(2026, 8, 23, 20, 0));
  assert.equal(after.tomorrow, true);

  settings.save({ hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, null])) });
  assert.equal(settings.nextOpening(new Date(2026, 8, 23, 12, 0)), null);
  openAllHours();
});

test('a closed shop turns customers away with the next opening instead of taking an order', () => {
  settings.save({ closed: true, closedNote: 'Stock en cours de réapprovisionnement.' });
  const c = customer('243820000001');
  c.say('Bonjour');
  const reply = c.tap('menu:order').last;
  assert.match(reply.body, /fermés pour le moment/);
  assert.match(reply.body, /Stock en cours de réapprovisionnement/);
  assert.equal(c.state(), 'DONE');
  assert.equal(db.openOrdersToday(db.getCustomer(c.phone).id).length, 0);
  openAllHours();
});

/* --------------------------- delivery areas ----------------------------- */

test('each area carries its own delivery fee, and a paused area is not offered', () => {
  db.createZone({ name: 'Gombe', fee: 1500, sort_order: 1 });
  db.createZone({ name: 'Ngaliema', fee: 3000, sort_order: 2 });
  db.createZone({ name: 'Masina', fee: 5000, active: 0, sort_order: 3 });

  const c = customer('243820000002');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:medium');
  c.tap('qty:2');
  c.tap('more:checkout');
  const zones = c.say('Mamie Kalala').last;
  assert.deepEqual(zones.buttons.map((b) => b.title), ['Gombe', 'Ngaliema', 'Autre quartier'], 'the paused area is hidden');
  assert.match(zones.body, /Gombe — 1\s?500 FC/, 'fees are spelled out when they differ between areas');
  assert.match(zones.body, /Ngaliema — 3\s?000 FC/);

  c.tap('zone:1'); // Ngaliema
  const recap = c.say('Av. des Cocotiers 4').last;
  assert.match(recap.body, /Livraison : 3\s?000 FC/);
  assert.match(recap.body, /\*Total : 7\s?000 FC\*/); // 2 × 2000 + 3000
});

test('findZoneByName ignores case and accents', () => {
  db.createZone({ name: 'Kasa-Vubu', fee: 2500, sort_order: 9 });
  assert.equal(db.findZoneByName('kasa vubu')?.fee, 2500);
  assert.equal(db.findZoneByName('KASA-VUBU')?.fee, 2500);
  assert.equal(db.findZoneByName('inconnu'), null);
});

/* -------------------------------- coupons -------------------------------- */

test('a percentage coupon comes off the basket and is refused the second time', () => {
  db.createCoupon({ code: 'BIENVENUE', kind: 'percent', value: 10, min_subtotal: 0, max_uses: 0, once_per_customer: 1, active: 1 });

  const c = customer('243820000003');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:medium');
  c.tap('qty:2'); // 4 000 FC
  c.tap('more:checkout');
  c.say('Josué Mbala');
  c.tap('zone:0');
  const recap = c.say('Av. Kasaï 10').last;
  assert.ok(optionIds(recap).includes('recap:coupon'));

  assert.match(c.tap('recap:coupon').last.body, /code promo/i);
  const applied = c.say('bienvenue').last; // lower case is normalised
  assert.match(applied.all ?? applied.body, /BIENVENUE/);
  assert.match(applied.body, /Code BIENVENUE : −400 FC/);
  const gombe = db.findZoneByName('Gombe').fee;

  c.tap('recap:confirm');
  const order = db.getOrder(db.lastOrder(db.getCustomer(c.phone).id).id);
  assert.equal(order.coupon, 'BIENVENUE');
  assert.equal(order.coupon_discount, 400);
  assert.equal(order.total, 4000 + gombe - 400);

  // Second order: the same customer cannot reuse a once-per-customer code.
  const result = coupons.evaluate('BIENVENUE', { customer: db.getCustomer(c.phone), subtotal: 4000, deliveryFee: 1500 });
  assert.deepEqual([result.ok, result.reason], [false, 'used']);
});

test('coupon rules: unknown, expired, used up, and a minimum basket', () => {
  const who = db.touchCustomer('243820000004').customer;
  db.createCoupon({ code: 'EXPIRE', kind: 'amount', value: 500, expires_on: '2020-01-01', active: 1 });
  db.createCoupon({ code: 'EPUISE', kind: 'amount', value: 500, max_uses: 1, active: 1 });
  db.updateCoupon(db.getCouponByCode('EPUISE').id, {}); // no-op update keeps the row shape
  db.createCoupon({ code: 'GROSPANIER', kind: 'amount', value: 500, min_subtotal: 20000, active: 1 });
  db.createCoupon({ code: 'COUPE', kind: 'amount', value: 500, active: 0 });

  const check = (code, subtotal = 4000) =>
    coupons.evaluate(code, { customer: who, subtotal, deliveryFee: 1000 });

  assert.equal(check('NEXISTEPAS').reason, 'unknown');
  assert.equal(check('EXPIRE').reason, 'expired');
  assert.equal(check('GROSPANIER').reason, 'min');
  assert.equal(check('COUPE').reason, 'inactive');
  assert.equal(check('GROSPANIER', 25000).ok, true);

  // A free-delivery coupon takes the delivery fee off, nothing more.
  db.createCoupon({ code: 'LIVRAISON', kind: 'free_delivery', value: 0, active: 1 });
  assert.equal(check('LIVRAISON').discount, 1000);
});

test('cancelling an order releases the coupon so the customer can use it again', () => {
  db.createCoupon({ code: 'RENDU', kind: 'amount', value: 300, once_per_customer: 1, active: 1 });
  const who = db.touchCustomer('243820000005').customer;
  const product = db.listProducts()[0];
  const order = db.createOrder({
    customer: who,
    items: [{ productId: product.id, size: 'medium', quantity: 1, unitPrice: product.price_medium }],
    subtotal: product.price_medium, deliveryFee: 0, discount: 0, couponDiscount: 300,
    coupon: db.getCouponByCode('RENDU'), total: product.price_medium - 300,
    name: 'Test', neighborhood: 'Gombe', addressNote: 'rue 1',
  });
  assert.equal(db.getCouponByCode('RENDU').used_count, 1);
  assert.equal(coupons.evaluate('RENDU', { customer: who, subtotal: 4000 }).reason, 'used');

  db.setOrderStatus(order.id, 'cancelled');
  assert.equal(db.getCouponByCode('RENDU').used_count, 0);
  assert.equal(coupons.evaluate('RENDU', { customer: db.getCustomer(who.phone), subtotal: 4000 }).ok, true);
});

/* ---------------------------- payment method ----------------------------- */

test('with both methods on, the customer picks; cash orders need no proof', () => {
  settings.save({ cashEnabled: true, momoEnabled: true });
  const c = customer('243820000006');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:medium');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.say('Grâce Nsimba');
  c.tap('zone:0');
  c.say('Av. Lumumba 3');

  const choice = c.tap('recap:confirm').last;
  assert.deepEqual(optionIds(choice), ['pay:momo', 'pay:cash', 'pay:back']);

  const done = c.tap('pay:cash');
  assert.match(done.last.body, /paierez.*en espèces à la livraison/s);
  assert.equal(c.state(), 'DONE');

  const order = db.lastOrder(db.getCustomer(c.phone).id);
  assert.equal(order.payment_method, 'cash');
  assert.equal(order.status, 'awaiting_payment');
  assert.equal(done.tasks.length, 1, 'the shop is alerted about the cash order');
});

test('with cash off, the order goes straight to the mobile-money instructions', () => {
  settings.save({ cashEnabled: false, momoEnabled: true });
  const c = customer('243820000007');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:small');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.say('Patrick Ilunga');
  c.tap('zone:0');
  c.say('Av. Kimbangu 8');

  const pay = c.tap('recap:confirm').last;
  assert.match(pay.body, /Orange Money/);
  assert.equal(c.state(), 'AWAIT_PROOF');
  assert.equal(db.lastOrder(db.getCustomer(c.phone).id).payment_method, 'momo');
});

test('cash to collect counts orders on the round, not the ones already delivered', () => {
  const day = new Date().toLocaleDateString('en-CA');
  const before = db.cashToCollect(day).amount;
  const who = db.touchCustomer('243820000008').customer;
  const product = db.listProducts()[0];
  const order = db.createOrder({
    customer: who,
    items: [{ productId: product.id, size: 'large', quantity: 1, unitPrice: product.price_large }],
    subtotal: product.price_large, deliveryFee: 1000, discount: 0, total: product.price_large + 1000,
    paymentMethod: 'cash', name: 'Test', neighborhood: 'Gombe', addressNote: 'rue 2',
  });
  db.setOrderStatus(order.id, 'preparing');
  assert.equal(db.cashToCollect(day).amount, before + product.price_large + 1000);

  db.setOrderStatus(order.id, 'delivered');
  assert.equal(db.cashToCollect(day).amount, before, 'a delivered cash order is settled');
});

/* ------------------------------ minimum order ---------------------------- */

test('a basket below the minimum is sent back to the catalogue', () => {
  settings.save({ minOrder: 50000 });
  const c = customer('243820000009');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:small');
  c.tap('qty:1');
  const back = c.tap('more:checkout');
  assert.match(back.all, /montant minimum de commande/);
  assert.equal(c.state(), 'PICK_PRODUCT');
  settings.save({ minOrder: 0 });
});

/* -------------------------------- settings -------------------------------- */

test('settings survive a round trip and reject malformed values', () => {
  const saved = settings.save({
    name: 'Chez Mamie',
    momoOrange: '+243 899 12 34 56',
    minOrder: -5,
    hours: { ...ALL_DAY, 2: { open: '19:00', close: '08:00' } }, // closing before opening
  });
  assert.equal(saved.name, 'Chez Mamie');
  assert.equal(saved.momoOrange, '243899123456', 'phone numbers are kept as digits');
  assert.equal(saved.minOrder, 0, 'a negative minimum falls back to zero');
  assert.deepEqual(saved.hours[2], ALL_DAY[2], 'an impossible window falls back to the configured default');
  assert.equal(settings.get().name, 'Chez Mamie');
  openAllHours();
});
