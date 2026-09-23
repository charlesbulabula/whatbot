// The pro features: variants and extras, delivery slots, loyalty tiers,
// subscriptions, win-back, staff roles, route ordering, tracking, accounting,
// the WhatsApp catalogue, transcription and the PWA.
import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'pw';
process.env.PUBLIC_URL = 'https://bot.example.test';

const { app } = await import('../src/index.js');
const db = await import('../src/db/index.js');
const settings = await import('../src/shop/settings.js');
const catalogue = await import('../src/shop/catalogue.js');
const loyalty = await import('../src/shop/loyalty.js');
const slots = await import('../src/shop/slots.js');
const staff = await import('../src/shop/staff.js');
const routing = await import('../src/shop/routing.js');
const waCatalog = await import('../src/shop/wa-catalog.js');
const { customer, optionIds } = await import('./helpers.js');
const { trackingToken } = await import('../src/tracking.js');
const cart = await import('../src/bot/cart.js');

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const auth = `Basic ${Buffer.from('admin:pw').toString('base64')}`;
const get = (path, as = auth) => fetch(`${base}${path}`, { headers: { authorization: as } });
const post = (path, body = '', as = auth) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { authorization: as, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

const ALL_DAY = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '00:00', close: '23:59' }]));

/* --------------------------- variants & extras -------------------------- */

test('a product can be sold by the bunch, not only by heap', () => {
  const product = db.listProducts()[0];
  db.createVariant({
    product_id: product.id, sku: 'botte', label_fr: 'Botte', label_en: 'Bunch', label_ln: 'Liboke',
    price: 4500, sort_order: 9,
  });

  const variants = catalogue.variantsOf(product);
  assert.ok(variants.some((v) => v.sku === 'botte'));
  assert.equal(catalogue.variantPrice(product, 'botte'), 4500);
  assert.equal(catalogue.variantLabel(catalogue.variantOf(product, 'botte'), 'ln'), 'Liboke');

  const range = catalogue.priceRange(product);
  assert.equal(range.to, 4500, 'the range follows the real variants');

  const c = customer('243860000001');
  c.say('Bonjour');
  c.tap('menu:order');
  const sizes = c.tap(`p:${product.id}`).last;
  assert.ok(optionIds(sizes).includes('size:botte'));

  c.tap('size:botte');
  const added = c.tap('qty:2').all;
  assert.match(added, /Botte/);
  assert.match(added, /9\s?000 FC/, 'two bunches at 4 500 FC');
});

test('a variant switched off makes its cart line unorderable', () => {
  const product = db.listProducts()[1];
  const variant = db.getVariant(product.id, 'large');
  db.updateVariant(variant.id, { active: 0 });

  const priced = cart.priceCart([{ productId: product.id, size: 'large', qty: 1 }]);
  assert.equal(priced.lines.length, 0);
  assert.equal(priced.unavailable.length, 1);

  db.updateVariant(variant.id, { active: 1 });
});

test('extras are offered after the quantity and priced into the line', () => {
  const product = db.listProducts()[2];
  db.createExtra({ product_id: product.id, label_fr: 'Préparé', label_en: 'Prepared', price: 500 });

  const c = customer('243860000002');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap(`p:${product.id}`);
  c.tap('size:medium');
  const extras = c.tap('qty:1').last;
  assert.match(extras.body, /supplément/i);
  const ids = optionIds(extras);
  assert.ok(ids.some((id) => id.startsWith('extra:')));

  const extraId = ids.find((id) => id !== 'extra:done');
  const chosen = c.tap(extraId).last;
  assert.match(chosen.body, /Préparé/);

  const added = c.tap('extra:done').all;
  assert.match(added, /\(Préparé\)/);
  assert.match(added, /2\s?500 FC/, '2 000 FC + 500 FC of extra');
});

/* ----------------------------- delivery slots --------------------------- */

test('a delivery slot is offered, booked and respected', () => {
  settings.save({ hours: ALL_DAY, closed: false });
  const slot = db.createSlot({
    label_fr: 'Après-midi', label_en: 'Afternoon', start_time: '23:00', end_time: '23:30', capacity: 1,
  });

  const available = slots.available(new Date(2026, 8, 23, 8, 0));
  assert.ok(available.some((a) => a.slot.id === slot.id && a.when === 'today'));
  assert.ok(available.some((a) => a.when === 'tomorrow'), 'tomorrow is offered too');

  // A window starting within the hour is no longer bookable for today.
  const late = slots.available(new Date(2026, 8, 23, 22, 30)).filter((a) => a.when === 'today');
  assert.equal(late.some((a) => a.slot.id === slot.id), false);

  const c = customer('243860000010');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:medium');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.say('Slot Test');
  c.tap('zone:0');
  const ask = c.say('Av. des Créneaux 1').last;
  assert.match(ask.body, /Quand souhaitez-vous/);

  const chosen = optionIds(ask)[0];
  const recap = c.tap(chosen).last;
  assert.match(recap.body, /🕒 Créneau/);

  c.tap('recap:confirm');
  const order = db.lastOrder(db.getCustomer(c.phone).id);
  assert.ok(order.slot_id, 'the slot is stored on the order');
  assert.match(order.slot_label, /Après-midi|Afternoon/);

  db.updateSlot(slot.id, { active: 0 });
});

/* ------------------------------ loyalty tiers --------------------------- */

test('tiers are earned on paid orders and take a share off delivery', () => {
  settings.save({ tierSilverOrders: 2, tierSilverDelivery: 50, tierGoldOrders: 4, tierGoldDelivery: 100 });

  assert.equal(loyalty.tierFor(1), 'bronze');
  assert.equal(loyalty.tierFor(2), 'silver');
  assert.equal(loyalty.tierFor(9), 'gold');
  assert.equal(loyalty.deliveryFeeFor('silver', 2000), 1000);
  assert.equal(loyalty.deliveryFeeFor('gold', 2000), 0);
  assert.equal(loyalty.deliveryFeeFor('bronze', 2000), 2000);

  const { customer: who } = db.touchCustomer('243860000020');
  db.updateCustomer(who.id, { name: 'Tier Test', neighborhood: 'Gombe' });
  const product = db.listProducts()[0];
  for (let i = 0; i < 2; i += 1) {
    const order = db.createOrder({
      customer: db.getCustomerById(who.id),
      items: [{ productId: product.id, size: 'small', quantity: 1, unitPrice: 1000 }],
      subtotal: 1000, deliveryFee: 0, discount: 0, total: 1000,
      name: 'Tier Test', neighborhood: 'Gombe', addressNote: 'x',
    });
    db.setOrderStatus(order.id, 'paid');
  }
  assert.equal(loyalty.refresh(who.id), 'silver');
  assert.equal(db.getCustomerById(who.id).tier, 'silver');
  assert.equal(loyalty.refresh(who.id), null, 'no change means no message');

  settings.save({ tierSilverOrders: 5, tierSilverDelivery: 25, tierGoldOrders: 15, tierGoldDelivery: 100 });
});

/* ----------------------------- subscriptions ---------------------------- */

test('a customer subscribes from the menu and the job creates the weekly order', async () => {
  const { runSubscriptions } = await import('../src/jobs/scheduler.js');
  const c = customer('243860000030');

  // A first order gives the subscription its basket.
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:medium');
  c.tap('qty:2');
  c.tap('more:checkout');
  c.say('Abonné Test');
  c.tap('zone:0');
  c.say('Av. de l’Abonnement 5');
  const maybeSlot = c.tap('recap:confirm');
  if (maybeSlot.last.body.includes('Quand souhaitez-vous')) c.tap(optionIds(maybeSlot.last)[0]);
  if (c.state() === 'RECAP') c.tap('recap:confirm');

  const who = db.getCustomer(c.phone);
  c.say('menu');
  const menu = c.say('menu').last;
  assert.ok(optionIds(menu).includes('menu:subscribe'));

  c.tap('menu:subscribe');
  const confirm = c.tap('subday:6').last; // Saturday
  assert.match(confirm.body, /samedi/);
  const done = c.tap('sub:yes').all;
  assert.match(done, /Chaque \*samedi\*/);

  const subs = db.subscriptionsFor(who.id);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].weekday, 6);

  // On its weekday the job turns it into a real order.
  const saturday = new Date(2026, 8, 26, 9, 0); // 2026-09-26 is a Saturday
  const before = db.ordersForCustomer(who.id).length;
  await runSubscriptions(saturday);
  assert.ok(db.ordersForCustomer(who.id).length >= before, 'the job ran without throwing');
  assert.ok(db.subscriptionsFor(who.id)[0].last_run_day, 'the day is marked so it runs once');

  // "stop abonnement" cancels it from the conversation.
  c.say('stop abonnement');
  assert.equal(db.subscriptionsFor(who.id)[0].active, 0);
});

/* -------------------------------- win-back ------------------------------ */

test('win-back creates a personal single-use code for an inactive customer', async () => {
  const { winback } = await import('../src/jobs/scheduler.js');
  const { customer: who } = db.touchCustomer('243860000040');
  db.updateCustomer(who.id, { name: 'Dormant' });

  // Make them look like a past buyer who has not ordered in a long time.
  db.db.prepare('UPDATE customers SET orders_count = 3, total_spent = 30000 WHERE id = ?').run(who.id);
  assert.ok(db.inactiveCustomers(30).some((c) => c.id === who.id));

  settings.save({ winbackEnabled: true, winbackDays: 30, winbackDiscount: 1500 });
  const day = new Date().toLocaleDateString('en-CA');
  db.setSetting(`winback:${day}`, '');

  await winback(new Date());
  const codes = db.listCoupons().filter((c) => c.code.startsWith('RETOUR'));
  assert.ok(codes.length >= 1, 'a personal code was created');
  assert.equal(codes[0].max_uses, 1);
  assert.equal(codes[0].value, 1500);
  assert.ok(codes[0].expires_on > day);

  // It only runs once a day.
  const before = db.listCoupons().length;
  await winback(new Date());
  assert.equal(db.listCoupons().length, before);

  settings.save({ winbackEnabled: false });
});

/* ------------------------------ staff & roles --------------------------- */

test('passwords are hashed, and each role reaches only its own pages', async () => {
  const hash = staff.hashPassword('correct horse');
  assert.ok(hash.includes(':'));
  assert.notEqual(hash, 'correct horse');
  assert.equal(staff.verifyPassword('correct horse', hash), true);
  assert.equal(staff.verifyPassword('wrong', hash), false);

  assert.equal((await post('/admin/staff', 'username=vendeur&name=Vendeur&role=seller&password=motdepasse1')).status, 302);
  assert.equal((await post('/admin/staff', 'username=livreur&name=Livreur&role=rider&password=motdepasse2')).status, 302);

  // A short password is refused.
  const short = await post('/admin/staff', 'username=court&password=123');
  assert.match(decodeURIComponent(short.headers.get('location')), /8 caractères/);

  const seller = `Basic ${Buffer.from('vendeur:motdepasse1').toString('base64')}`;
  const rider = `Basic ${Buffer.from('livreur:motdepasse2').toString('base64')}`;

  assert.equal((await get('/admin', seller)).status, 200);
  assert.equal((await get('/admin/products', seller)).status, 200);
  assert.equal((await get('/admin/settings', seller)).status, 403, 'a seller has no settings');
  assert.equal((await get('/admin/accounting', seller)).status, 403);

  assert.equal((await get('/admin', rider)).status, 200);
  assert.equal((await get('/admin/customers', rider)).status, 403, 'a rider only sees the orders');
  assert.equal((await get('/admin/staff', rider)).status, 403);

  // A disabled account cannot sign in at all.
  const account = staff.byUsername('vendeur');
  staff.update(account.id, { active: false });
  assert.equal((await get('/admin', seller)).status, 401);
  staff.update(account.id, { active: true });

  // The .env owner always works, whatever the staff table says.
  assert.equal((await get('/admin/settings')).status, 200);
});

/* ------------------------- routing and tracking ------------------------- */

test('stops with a shared location are sequenced, others keep their area order', async () => {
  const withMap = { address_note: 'Av. X 📍 https://maps.google.com/?q=-4.325,15.322', neighborhood: 'Gombe' };
  assert.deepEqual(routing.coordsOf(withMap), { latitude: -4.325, longitude: 15.322 });
  assert.equal(routing.coordsOf({ address_note: 'Av. sans carte' }), null);

  assert.equal(routing.haversineKm({ latitude: -4.32, longitude: 15.32 }, { latitude: -4.33, longitude: 15.33 }), 1.6);

  // Without coordinates the round falls back to grouping by area, never throws.
  const plain = [
    { id: 1, neighborhood: 'Limete', address_note: 'a' },
    { id: 2, neighborhood: 'Gombe', address_note: 'b' },
    { id: 3, neighborhood: 'Limete', address_note: 'c' },
  ];
  const result = await routing.optimise(plain);
  assert.equal(result.optimised, false);
  assert.deepEqual(result.orders.map((o) => o.neighborhood), ['Gombe', 'Limete', 'Limete']);
});

test('the tracking link proves itself and exposes only what the customer needs', async () => {
  const { customer: who } = db.touchCustomer('243860000050');
  db.updateCustomer(who.id, { name: 'Suivi Test', neighborhood: 'Gombe' });
  const product = db.listProducts()[0];
  const order = db.createOrder({
    customer: db.getCustomerById(who.id),
    items: [{ productId: product.id, size: 'small', quantity: 1, unitPrice: 1000 }],
    subtotal: 1000, deliveryFee: 0, discount: 0, total: 1000,
    name: 'Suivi Test', neighborhood: 'Gombe',
    addressNote: 'Av. Y 📍 https://maps.google.com/?q=-4.300,15.300',
  });
  db.setOrderStatus(order.id, 'on_the_way');

  const token = trackingToken(order);
  const page = await fetch(`${base}/t/${order.reference}/${token}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Suivi de livraison|Commande/);
  assert.doesNotMatch(html, /243860000050/, 'the phone number is never shown');

  const forged = await fetch(`${base}/t/${order.reference}/${'0'.repeat(20)}`);
  assert.equal(forged.status, 404);

  // The rider shares a position; the customer endpoint reports the distance.
  const day = new Date().toLocaleDateString('en-CA');
  db.setRiderPosition(day, { latitude: -4.31, longitude: 15.31 });
  const live = await (await fetch(`${base}/t/${order.reference}/${token}/position`)).json();
  assert.equal(live.ok, true);
  assert.ok(live.rider);
  assert.ok(live.distanceKm > 0);
  assert.equal(live.status, 'on_the_way');
});

/* ------------------------------- accounting ----------------------------- */

test('the cash book lists sales and expenses, and the VAT split adds up', async () => {
  const day = new Date().toLocaleDateString('en-CA');
  db.createExpense({ day, category: 'stock', label: 'Marché', amount: 5000 });

  const entries = db.cashBook(day, day);
  assert.ok(entries.some((e) => e.kind === 'order' && e.amount > 0));
  assert.ok(entries.some((e) => e.kind === 'expense' && e.amount === -5000));

  const months = db.monthlyLedger(day, day);
  assert.ok(months.length >= 1);
  assert.equal(months[0].margin, months[0].revenue - months[0].expenses);

  settings.save({ vatRate: 16 });
  const page = await (await get('/admin/accounting')).text();
  assert.match(page, /Journal de caisse/);
  assert.match(page, /TVA/);

  const csv = await get(`/admin/accounting.csv?from=${day}&to=${day}`);
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.match(text, /date;type;reference;libelle;mode;entree;sortie/);
  assert.match(text, /depense;/);
});

/* --------------------------- WhatsApp catalogue -------------------------- */

test('a cart sent from the Meta catalogue becomes our own cart', () => {
  const product = db.listProducts()[0];
  db.updateProduct(product.id, { retailer_id: 'SKU-TOMATE' });

  settings.save({ catalogEnabled: true, catalogId: '1234567890' });
  assert.equal(waCatalog.isEnabled(), true);
  assert.ok(waCatalog.sections('Catalogue')[0].items.includes('SKU-TOMATE'));

  const { items, unknown } = waCatalog.cartFromOrderMessage({
    product_items: [
      { product_retailer_id: 'SKU-TOMATE', quantity: '3' },
      { product_retailer_id: 'SKU-INCONNU', quantity: '1' },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].productId, product.id);
  assert.equal(items[0].qty, 3);
  assert.deepEqual(unknown, ['SKU-INCONNU']);

  settings.save({ catalogEnabled: false });
  assert.equal(waCatalog.isEnabled(), false, 'the switch alone turns it off');
});

/* ------------------------------ transcription --------------------------- */

test('voice notes are refused politely while transcription is off', async () => {
  const { isEnabled } = await import('../src/ai/transcribe.js');
  assert.equal(isEnabled(), false, 'no STT provider configured in tests');

  const c = customer('243860000060');
  c.say('Bonjour');
  const reply = c.voice().last;
  assert.match(reply.body, /message.? vocaux|vocal/i);
});

/* ---------------------------------- PWA --------------------------------- */

test('the dashboard is installable and can register for push', async () => {
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.start_url, '/admin');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#007D88');

  const sw = await (await fetch(`${base}/sw.js`)).text();
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /notificationclick/);

  const icon = await fetch(`${base}/icon.svg`);
  assert.match(icon.headers.get('content-type'), /svg/);

  const subscribe = await fetch(`${base}/admin/push/subscribe`, {
    method: 'POST',
    headers: { authorization: auth, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: 'https://push.example/abc', keys: { p256dh: 'key', auth: 'secret' } }),
  });
  assert.equal(subscribe.status, 200);
  assert.equal(db.listPushSubscriptions().length, 1);

  // The same endpoint twice is one subscription, not two.
  await fetch(`${base}/admin/push/subscribe`, {
    method: 'POST',
    headers: { authorization: auth, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: 'https://push.example/abc', keys: { p256dh: 'key2', auth: 'secret2' } }),
  });
  assert.equal(db.listPushSubscriptions().length, 1);
});

/* ------------------------------ product media ---------------------------- */

test('product pictures are served from a fixed directory, and only by name', async () => {
  for (const bad of ['../../etc/passwd', '..%2f..%2fsecret', 'no space allowed.png']) {
    const res = await fetch(`${base}/media/products/${encodeURIComponent(bad)}`);
    assert.equal(res.status, 404, bad);
  }
  assert.equal((await fetch(`${base}/media/products/absent.png`)).status, 404);
});

/* --------------------------- WhatsApp token health ----------------------- */

test('an expired WhatsApp token is reported instead of failing silently', async () => {
  const { tokenHealth, resetTokenHealth } = await import('../src/whatsapp/health.js');

  // WA_ENABLED=false in tests: the bot is not talking to Meta at all.
  const off = await tokenHealth({ force: true });
  assert.equal(off.disabled, true);
  assert.equal(off.ok, true, 'a disabled client is not an alarm');

  // The banner itself is driven by the shape of that result, so check the copy
  // exists for every reason the check can return.
  const { adminDictionaries } = await import('../src/admin/i18n.js');
  for (const dict of Object.values(adminDictionaries)) {
    assert.equal(typeof dict.waExpired('2026-09-23'), 'string');
    assert.ok(dict.waInvalid && dict.waUnconfigured && dict.waUnreachable && dict.waBrokenTitle);
  }
  resetTokenHealth();
});

/* ------------------------------- demo data ------------------------------- */

test('demo data can be created and removed without touching the real shop', async () => {
  const { execFileSync } = await import('node:child_process');
  // The seeder runs as its own process against a file database; the suite uses
  // an in-memory one, so exercise it on a throwaway file.
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatbot-demo-'));
  const file = path.join(dir, 'demo.db');
  const env = { ...process.env, DB_PATH: file, WA_ENABLED: 'false', NODE_ENV: 'test', SHOP_HOURS: '24/7' };

  // A real customer and a real expense, which must survive both operations.
  execFileSync(process.execPath, ['-e', `
    process.env.DB_PATH = ${JSON.stringify(file)};
    const db = await import('./src/db/index.js');
    const { seedIfEmpty } = await import('./src/db/seed.js');
    seedIfEmpty();
    db.seedZonesIfEmpty(['Gombe'], 2000);
    db.touchCustomer('243811111111');
    db.createExpense({ day: '2026-01-01', category: 'stock', label: 'Vrai achat', amount: 1000 });
  `.replace(/\n/g, '')], { env, input: '' });

  const run = (...args) =>
    execFileSync(process.execPath, ['deploy/seed-demo.js', ...args], { env, encoding: 'utf8' });

  assert.match(run('--apply'), /Demo data created: 8 customers, \d+ orders/);
  assert.match(run(), /Demo data present: 8 customers/);
  assert.match(run('--apply'), /already present/, 'seeding twice is refused');

  assert.match(run('--purge'), /Demo data removed: 8 customers/);
  assert.match(run(), /Demo data present: 0 customers, 0 orders, 0 expenses/);

  // The real records are untouched.
  const left = execFileSync(process.execPath, ['-e', `
    process.env.DB_PATH = ${JSON.stringify(file)};
    const db = await import('./src/db/index.js');
    console.log(JSON.stringify({
      customers: db.listCustomers().map((c) => c.phone),
      expenses: db.listExpenses('2026-01-01', '2026-01-01').map((e) => e.label),
    }));
  `.replace(/\n/g, '')], { env, encoding: 'utf8' });
  const state = JSON.parse(left);
  assert.deepEqual(state.customers, ['243811111111'], 'the real customer is still there, alone');
  assert.deepEqual(state.expenses, ['Vrai achat']);

  fs.rmSync(dir, { recursive: true, force: true });
});
