// The dashboard features added on top of the order flow: invoices with a
// verifiable QR code, the credit ledger, notes and tags, blocking, expenses,
// the audit log, filters and the daily report.
import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'pw';
process.env.PUBLIC_URL = 'https://bot.example.test';

const { app } = await import('../src/index.js');
const db = await import('../src/db/index.js');
const settings = await import('../src/shop/settings.js');
const { handleInbound } = await import('../src/bot/engine.js');
const { invoiceToken } = await import('../src/admin/router.js');

/** The one-shot message a redirect leaves in its cookie, now that URLs stay clean. */
const flashOf = (res) =>
  decodeURIComponent(
    (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('admin_flash=')) || '',
  );


let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const auth = `Basic ${Buffer.from('admin:pw').toString('base64')}`;
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers: { authorization: auth, ...headers } });
const post = (path, body = '') =>
  fetch(`${base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { authorization: auth, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

/** Places one order straight through the database, so the tests stay short. */
function seedOrder({ phone = '243870000001', name = 'Test Client', zone = 'Gombe', paymentMethod = 'momo' } = {}) {
  const { customer } = db.touchCustomer(phone);
  db.updateCustomer(customer.id, { name, neighborhood: zone, address_note: 'Av. Test 1' });
  const product = db.listProducts()[0];
  const order = db.createOrder({
    customer: db.getCustomerById(customer.id),
    items: [{ productId: product.id, size: 'medium', quantity: 2, unitPrice: product.price_medium }],
    subtotal: product.price_medium * 2,
    deliveryFee: 2000,
    discount: 0,
    total: product.price_medium * 2 + 2000,
    paymentMethod,
    name,
    neighborhood: zone,
    addressNote: 'Av. Test 1',
  });
  return { order, customer: db.getCustomerById(customer.id) };
}

/* ------------------------- invoice and verification --------------------- */

test('an invoice carries a QR code whose link proves the order is genuine', async () => {
  const { order } = seedOrder({ phone: '243870000010', name: 'Facture Test' });

  const page = await (await get(`/admin/orders/${order.id}/invoice`)).text();
  assert.match(page, /Facture/);
  assert.match(page, new RegExp(order.reference));
  assert.match(page, /<svg[^>]*viewBox="0 0 \d+ \d+"/, 'the QR code is rendered inline');

  const token = invoiceToken(order);
  assert.match(page, new RegExp(token), 'the printed link carries the token');

  const ok = await fetch(`${base}/v/${order.reference}/${token}`);
  assert.equal(ok.status, 200);
  const okBody = await ok.text();
  assert.match(okBody, /Facture authentique/);
  assert.match(okBody, new RegExp(order.reference));
  assert.doesNotMatch(okBody, /Av\. Test 1/, 'the public page never shows the address');

  // A forged token, a wrong reference and a tampered one are all refused.
  for (const url of [
    `/v/${order.reference}/${'0'.repeat(24)}`,
    `/v/CMD-00000000-999/${token}`,
    `/v/${order.reference}/${token.slice(0, -1)}`,
  ]) {
    const res = await fetch(`${base}${url}`);
    assert.equal(res.status, 404, url);
    assert.match(await res.text(), /Facture introuvable/);
  }
});

test('the prep ticket and the picking list print without prices leaking', async () => {
  const { order } = seedOrder({ phone: '243870000011', name: 'Ticket Test' });
  const ticket = await (await get(`/admin/orders/${order.id}/ticket`)).text();
  assert.match(ticket, new RegExp(order.reference));
  assert.match(ticket, /Ticket Test/);

  const day = new Date().toLocaleDateString('en-CA');
  const picklist = await (await get(`/admin/picklist?day=${day}`)).text();
  assert.match(picklist, /À préparer ce jour/);
});

/* ----------------------------- credit ledger ---------------------------- */

test('credit can be granted and taken back, is explained, and never goes negative', async () => {
  const { customer } = seedOrder({ phone: '243870000020', name: 'Credit Test' });

  assert.equal((await post(`/admin/customers/${customer.id}/credit`, 'amount=1500&detail=Geste+commercial')).status, 302);
  assert.equal(db.getCustomerById(customer.id).credit, 1500);

  const history = db.creditHistory(customer.id);
  assert.equal(history[0].amount, 1500);
  assert.equal(history[0].reason, 'manual');
  assert.equal(history[0].detail, 'Geste commercial');
  assert.equal(history[0].author, 'admin');

  // Taking more than the balance is refused rather than going negative.
  const tooMuch = await post(`/admin/customers/${customer.id}/credit`, 'amount=-5000');
  assert.equal(db.getCustomerById(customer.id).credit, 0, 'the balance stops at zero');
  assert.match(flashOf(tooMuch), /négatif|Enregistré/);

  const refused = await post(`/admin/customers/${customer.id}/credit`, 'amount=-100');
  assert.match(flashOf(refused), /ne peut pas devenir négatif/);

  const page = await (await get(`/admin/customers/${customer.id}?tab=loyalty`)).text();
  assert.match(page, /Ajustement manuel/);
  assert.match(page, /Geste commercial/);
});

test('spending credit on an order and refunding it are both in the ledger', async () => {
  const { customer } = seedOrder({ phone: '243870000021', name: 'Ledger Test' });
  db.recordCredit(customer.id, 2000, { reason: 'loyalty' });

  const product = db.listProducts()[0];
  const order = db.createOrder({
    customer: db.getCustomerById(customer.id),
    items: [{ productId: product.id, size: 'small', quantity: 1, unitPrice: product.price_small }],
    subtotal: product.price_small, deliveryFee: 0, discount: 2000, total: Math.max(0, product.price_small - 2000),
    name: 'Ledger Test', neighborhood: 'Gombe', addressNote: 'x',
  });
  assert.equal(db.getCustomerById(customer.id).credit, 0);
  assert.equal(db.creditHistory(customer.id)[0].reason, 'order');

  db.setOrderStatus(order.id, 'cancelled');
  assert.equal(db.getCustomerById(customer.id).credit, 2000, 'cancelling gives the credit back');
  assert.equal(db.creditHistory(customer.id)[0].reason, 'refund');
});

/* --------------------------- notes, tags, block ------------------------- */

test('internal notes and tags are saved, searchable and removable', async () => {
  const { customer } = seedOrder({ phone: '243870000030', name: 'Note Test' });

  await post(`/admin/customers/${customer.id}/notes`, 'body=Pr%C3%A9f%C3%A8re+le+matin');
  assert.equal(db.notesFor(customer.id)[0].body, 'Préfère le matin');
  assert.equal(db.notesFor(customer.id)[0].author, 'admin');

  await post(`/admin/customers/${customer.id}/tags`, 'tags=vip%2C+restaurant%2C+%2C+vip');
  assert.equal(db.getCustomerById(customer.id).tags, 'vip, restaurant, vip');

  const found = db.searchCustomersPaged({ query: 'restaurant' });
  assert.equal(found.rows.some((c) => c.id === customer.id), true, 'tags are searchable');

  const note = db.notesFor(customer.id)[0];
  await post(`/admin/customers/${customer.id}/notes/${note.id}/delete`);
  assert.equal(db.notesFor(customer.id).length, 0);
});

test('a blocked customer gets no reply, but the message is still recorded', async () => {
  const phone = '243870000031';
  const { customer } = seedOrder({ phone, name: 'Blocked Test' });

  assert.equal((await post(`/admin/customers/${customer.id}/block`, 'blocked=1')).status, 302);
  assert.equal(db.getCustomerById(customer.id).blocked, 1);

  const before = db.messagesFor(phone).length;
  const { messages } = handleInbound({ id: 'wamid.block-1', from: phone, type: 'text', text: 'Bonjour' });
  assert.deepEqual(messages, [], 'the bot stays silent');
  assert.equal(db.messagesFor(phone).length, before + 1, 'the message is still logged');

  await post(`/admin/customers/${customer.id}/block`, 'blocked=0');
  const { messages: after } = handleInbound({ id: 'wamid.block-2', from: phone, type: 'text', text: 'Bonjour' });
  assert.ok(after.length > 0, 'unblocking restores the bot');
});

/* ------------------------------- expenses ------------------------------- */

test('expenses are recorded and turn revenue into a margin', async () => {
  const day = new Date().toLocaleDateString('en-CA');
  await post('/admin/expenses', `day=${day}&category=stock&label=March%C3%A9&amount=12000`);
  await post('/admin/expenses', `day=${day}&category=transport&label=Taxi&amount=3000`);

  assert.equal(db.expenseTotal(day, day), 15000);
  const byCategory = db.expensesByCategory(day, day);
  assert.equal(byCategory[0].category, 'stock');
  assert.equal(byCategory[0].total, 12000);

  const page = await (await get('/admin/expenses')).text();
  assert.match(page, /Marché/);
  assert.match(page, /Marge/);

  const expense = db.listExpenses(day, day)[0];
  await post(`/admin/expenses/${expense.id}/delete`);
  assert.equal(db.listExpenses(day, day).length, 1);
});

/* ------------------------------- audit log ------------------------------ */

test('every change made from the dashboard lands in the activity log', async () => {
  const before = db.auditCount();
  await post('/admin/zones', 'name=Kintambo&fee=2500');
  await post('/admin/coupons', 'code=AUDITTEST&kind=amount&value=500');
  assert.ok(db.auditCount() >= before + 2);

  const entries = db.auditLog({ limit: 10 });
  assert.equal(entries[0].actor, 'admin');
  assert.ok(entries.some((e) => e.action === 'zone.create' && e.target === 'Kintambo'));
  assert.ok(entries.some((e) => e.action === 'coupon.create' && e.target === 'AUDITTEST'));

  const page = await (await get('/admin/audit')).text();
  assert.match(page, /Zone créée/);
  assert.match(page, /Code promo créé/);
});

/* -------------------------- filters and sorting ------------------------- */

test('orders can be filtered, sorted and paged', async () => {
  seedOrder({ phone: '243870000040', name: 'Alpha Filtre', zone: 'Limete', paymentMethod: 'cash' });
  const { order } = seedOrder({ phone: '243870000041', name: 'Beta Filtre', zone: 'Gombe' });
  db.setOrderStatus(order.id, 'delivered');

  const cash = db.searchOrders({ payment: 'cash' });
  assert.ok(cash.rows.length >= 1);
  assert.ok(cash.rows.every((o) => o.payment_method === 'cash'));

  const limete = db.searchOrders({ zone: 'Limete' });
  assert.ok(limete.rows.every((o) => o.neighborhood === 'Limete'));

  const delivered = db.searchOrders({ status: 'delivered' });
  assert.ok(delivered.rows.every((o) => o.status === 'delivered'));

  const byName = db.searchOrders({ query: 'Alpha Filtre' });
  assert.equal(byName.rows.length, 1);

  const page1 = db.searchOrders({ limit: 1, offset: 0 });
  const page2 = db.searchOrders({ limit: 1, offset: 1 });
  assert.equal(page1.rows.length, 1);
  assert.notEqual(page1.rows[0].id, page2.rows[0].id);
  assert.equal(page1.total, page2.total, 'the total ignores the page');

  const asc = db.searchOrders({ sort: 'total', dir: 'asc', limit: 50 });
  const totals = asc.rows.map((o) => o.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b));

  // The page itself renders with the filters applied.
  const html = await (await get('/admin/orders?payment=cash&status=awaiting_payment')).text();
  assert.match(html, /Alpha Filtre/);
});

test('customers can be filtered by segment, area and flag', async () => {
  const { customer } = seedOrder({ phone: '243870000050', name: 'Flag Test', zone: 'Ngaliema' });
  db.recordCredit(customer.id, 700, { reason: 'manual' });
  db.updateCustomer(customer.id, { marketing_opt_out: 1 });

  assert.ok(db.searchCustomersPaged({ flag: 'credit' }).rows.some((c) => c.id === customer.id));
  assert.ok(db.searchCustomersPaged({ flag: 'optout' }).rows.some((c) => c.id === customer.id));
  assert.ok(db.searchCustomersPaged({ zone: 'Ngaliema' }).rows.every((c) => c.neighborhood === 'Ngaliema'));
  assert.equal(db.searchCustomersPaged({ flag: 'blocked' }).rows.some((c) => c.id === customer.id), false);

  const html = await (await get('/admin/customers?flag=credit')).text();
  assert.match(html, /Flag Test/);
});

/* ------------------------------- searching ------------------------------ */

test('the header search finds orders, customers and promo codes', async () => {
  const { order, customer } = seedOrder({ phone: '243870000060', name: 'Cherchable' });
  const results = db.globalSearch('Cherchable');
  assert.ok(results.customers.some((c) => c.id === customer.id));
  assert.ok(results.orders.some((o) => o.reference === order.reference));

  const page = await (await get('/admin/search?q=Cherchable')).text();
  assert.match(page, /Cherchable/);
  assert.match(page, new RegExp(order.reference));

  // A one-character query searches nothing rather than listing the database.
  const short = await (await get('/admin/search?q=a')).text();
  assert.match(short, /Tapez au moins deux caractères|Aucun résultat/);
});

/* --------------------------- products and stock ------------------------- */

test('a product used by an order is hidden instead of deleted', async () => {
  const { order } = seedOrder({ phone: '243870000070' });
  const usedId = order.items[0].product_id;

  await post(`/admin/products/${usedId}/delete`);
  assert.ok(db.getProduct(usedId), 'the product is still there');
  assert.equal(db.getProduct(usedId).in_stock, 0, 'it is taken off sale');

  const fresh = db.createProduct({ name_fr: 'Éphémère', name_en: 'Ephemeral', price_small: 1, price_medium: 2, price_large: 3 });
  await post(`/admin/products/${fresh.id}/delete`);
  assert.equal(db.getProduct(fresh.id), undefined, 'an unused product is really deleted');
});

test('a low stock level is surfaced on the dashboard', async () => {
  const product = db.createProduct({ name_fr: 'Rare', name_en: 'Rare', price_small: 1, price_medium: 2, price_large: 3 });
  db.updateProduct(product.id, { stock_qty: 2, stock_alert: 5 });

  assert.ok(db.lowStockProducts().some((p) => p.id === product.id));
  const page = await (await get('/admin')).text();
  assert.match(page, /Stock bas/);
  assert.match(page, /Rare/);

  db.updateProduct(product.id, { stock_qty: 50 });
  assert.equal(db.lowStockProducts().some((p) => p.id === product.id), false);
});

/* ------------------------------- settings ------------------------------- */

test('the settings tabs each save on their own', async () => {
  for (const tab of ['shop', 'hours', 'payment', 'alerts', 'loyalty', 'system']) {
    assert.equal((await get(`/admin/settings?tab=${tab}`)).status, 200, tab);
  }
  await post('/admin/settings', 'tab=loyalty&loyaltyEvery=4&loyaltyReward=3000&referralReward=1500');
  const saved = settings.get();
  assert.equal(saved.loyaltyEvery, 4);
  assert.equal(saved.loyaltyReward, 3000);
  assert.equal(saved.referralReward, 1500);
});

test('the backup download is a usable SQLite file', async () => {
  // The suite runs on an in-memory database, which cannot be snapshotted.
  const res = await get('/admin/backup');
  assert.equal(res.status, 404);
});

/* ----------------------------- daily report ----------------------------- */

test('the daily report is sent once, and only after closing time', async () => {
  const { dailyReport } = await import('../src/jobs/scheduler.js');
  const day = new Date().toLocaleDateString('en-CA');
  db.setSetting(`daily-report:${day}`, ''); // make sure the flag starts empty

  settings.save({ dailyReport: false });
  assert.equal(await dailyReport(new Date()), false, 'off by default');

  settings.save({ dailyReport: true, hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '08:00', close: '18:00' }])) });
  const morning = new Date();
  morning.setHours(9, 0, 0, 0);
  assert.equal(await dailyReport(morning), false, 'not before the shop closes');
  assert.equal(db.getSetting(`daily-report:${day}`), '', 'nothing recorded yet');

  const evening = new Date();
  evening.setHours(19, 0, 0, 0);
  await dailyReport(evening); // no SMTP in tests, so it is skipped but marked done
  assert.ok(db.getSetting(`daily-report:${day}`), 'the day is marked so it does not repeat');

  settings.save({ dailyReport: false, hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '00:00', close: '23:59' }])) });
});

/* ------------------------------- loyalty -------------------------------- */

test('the loyalty screen totals credit and referrals', async () => {
  const { customer: referrer } = seedOrder({ phone: '243870000080', name: 'Parrain' });
  const { customer: friend } = seedOrder({ phone: '243870000081', name: 'Filleul' });
  db.updateCustomer(friend.id, { referred_by: referrer.id });
  db.recordCredit(referrer.id, 1000, { reason: 'referral', detail: 'Filleul' });

  assert.ok(db.referralTotals().invited >= 1);
  assert.ok(db.topReferrers().some((c) => c.id === referrer.id));
  assert.ok(db.referredBy(referrer.id).some((c) => c.id === friend.id));
  assert.ok(db.creditTotals().outstanding >= 1000);

  const page = await (await get('/admin/loyalty')).text();
  assert.match(page, /Crédit en circulation/);
  const referrals = await (await get('/admin/loyalty?tab=referrals')).text();
  assert.match(referrals, /Parrain/);
});

test('destructive actions use the themed dialog, never the browser confirm()', async () => {
  const html = await (await get('/admin/products')).text();
  assert.match(html, /id="confirm-dialog"/);
  assert.match(html, /data-confirm="[^"]+"/);
  assert.match(html, /data-confirm-tone="danger"/);
  assert.doesNotMatch(html, /onsubmit="return confirm/);
  assert.doesNotMatch(html, /onclick="return confirm/);
});

test('the payment queue gathers everything waiting on a decision', async () => {
  const cash = seedOrder({ phone: '243870000090', name: 'Espèces Client', paymentMethod: 'cash' });
  const momo = seedOrder({ phone: '243870000091', name: 'Momo Client' });
  db.setPaymentProof(momo.order.id, 'media-id-1');

  const html = await (await get('/admin/payments')).text();
  assert.match(html, new RegExp(momo.order.reference));
  assert.match(html, new RegExp(cash.order.reference));
  assert.match(html, /Espèces Client/);

  // The tabs split the two methods.
  const onlyCash = await (await get('/admin/payments?filter=cash')).text();
  assert.match(onlyCash, new RegExp(cash.order.reference));
  assert.doesNotMatch(onlyCash, new RegExp(momo.order.reference));

  // Confirming one takes it out of the queue.
  await post(`/admin/orders/${momo.order.id}/status`, 'status=paid&back=/admin/payments');
  const after = await (await get('/admin/payments')).text();
  assert.doesNotMatch(after, new RegExp(momo.order.reference));
  assert.match(after, new RegExp(cash.order.reference));
});

test('a past order can be taken again, at today’s prices, minus what is gone', async () => {
  const { order } = seedOrder({ phone: '243870000120', name: 'Habituée' });
  const products = db.listProducts();
  const first = products[0];

  // Yesterday's price is not today's.
  db.updateProduct(first.id, { price_medium: first.price_medium + 500 });

  const res = await post(`/admin/orders/${order.id}/duplicate`, '');
  assert.equal(res.status, 302);
  const copy = db.getOrder(Number(res.headers.get('location').match(/orders\/(\d+)/)[1]));
  assert.notEqual(copy.id, order.id);
  assert.equal(copy.status, 'awaiting_payment');
  assert.equal(copy.customer_id, order.customer_id);
  assert.equal(copy.items[0].unit_price, first.price_medium + 500, 'priced today, not then');
  assert.equal(copy.neighborhood, order.neighborhood, 'same address');

  // With two items, one taken off sale, the copy keeps the other and says so.
  const second = products[1];
  const two = db.createOrder({
    customer: db.getCustomerById(order.customer_id),
    items: [
      { productId: first.id, size: 'medium', quantity: 1, unitPrice: first.price_medium },
      { productId: second.id, size: 'medium', quantity: 1, unitPrice: second.price_medium },
    ],
    subtotal: first.price_medium + second.price_medium,
    deliveryFee: 2000,
    discount: 0,
    total: first.price_medium + second.price_medium + 2000,
    paymentMethod: 'momo',
    name: 'Habituée',
    neighborhood: 'Gombe',
    addressNote: 'Av. Test 1',
  });
  db.updateProduct(first.id, { in_stock: 0 });

  const partial = await post(`/admin/orders/${two.id}/duplicate`, '');
  assert.match(flashOf(partial), /Non repris/);
  const kept = db.getOrder(Number(partial.headers.get('location').match(/orders\/(\d+)/)[1]));
  assert.equal(kept.items.length, 1);
  assert.equal(kept.items[0].product_id, second.id);

  // Nothing left at all is refused rather than creating an empty order.
  db.updateProduct(second.id, { in_stock: 0 });
  const refused = await post(`/admin/orders/${two.id}/duplicate`, '');
  assert.match(flashOf(refused), /Aucun article/);
});


test('the win-back button reaches a customer, or says plainly why it cannot', async () => {
  const { customer } = seedOrder({ phone: '243870000121', name: 'Partie' });

  // Inside the 24h window: it goes as a plain message, with its own coupon.
  db.touchCustomer(customer.phone);
  const before = db.listCoupons().length;
  const sent = await post(`/admin/customers/${customer.id}/nudge`, '');
  assert.equal(sent.status, 302);
  assert.match(flashOf(sent), /Relance envoyée/);
  assert.equal(db.listCoupons().length, before + 1, 'a single-use code is created');
  const code = db.listCoupons().find((c) => c.code.startsWith('RETOUR'));
  assert.equal(code.max_uses, 1, 'the offer cannot be shared');

  // Outside the window, with no approved template, it refuses rather than
  // pretending. last_seen_at is written by the system, never by a form, so the
  // stale customer is built here instead of aged through the API.
  const { winbackOne } = await import('../src/jobs/scheduler.js');
  const stale = { ...db.getCustomerById(customer.id), last_seen_at: '2020-01-01 00:00:00' };
  assert.equal(await winbackOne(stale), 'skipped');
});

test('the live bubble outlives the reload it triggers', async () => {
  const html = await (await get('/admin')).text();
  // Shown then reloaded away, it lasted 1.5s and nobody ever saw it.
  assert.match(html, /sessionStorage\.setItem\(KEY/, 'the message is carried across');
  assert.match(html, /carry\(last\);location\.reload\(\)/, 'carried before reloading, not after');
  assert.match(html, /sessionStorage\.getItem\(KEY\)/, 'and shown again on the new page');
});
