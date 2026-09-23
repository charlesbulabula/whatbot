import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.WA_APP_SECRET = 'app-secret';
process.env.WA_VERIFY_TOKEN = 'verify-me';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'pw';

const { app } = await import('../src/index.js');
const db = await import('../src/db/index.js');

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const sign = (body) => `sha256=${crypto.createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
const auth = `Basic ${Buffer.from('admin:pw').toString('base64')}`;
const waitFor = async (fn) => {
  for (let i = 0; i < 50; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timeout');
};

test('Meta verification handshake echoes the challenge only with the right token', async () => {
  const ok = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '42');
  const ko = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`);
  assert.equal(ko.status, 403);
});

test('signed webhook messages are processed once; unsigned ones are rejected', async () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ id: 'wamid.http1', from: '243840000001', timestamp: '1', type: 'text', text: { body: 'Bonjour' } }] } }] }],
  });
  const post = (headers) => fetch(`${base}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

  assert.equal((await post({ 'x-hub-signature-256': 'sha256=bad' })).status, 401);
  assert.equal((await post({ 'x-hub-signature-256': sign(body) })).status, 200);
  assert.equal((await post({ 'x-hub-signature-256': sign(body) })).status, 200); // Meta retry
  await waitFor(() => db.getConversation('243840000001').state === 'MENU');
  const inbound = db.messagesFor('243840000001').filter((m) => m.direction === 'in');
  assert.equal(inbound.length, 1, 'duplicate delivery is ignored');
});

test('dashboard requires the password and refuses cross-site posts', async () => {
  assert.equal((await fetch(`${base}/admin`)).status, 401);
  const page = await fetch(`${base}/admin`, { headers: { authorization: auth } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Commandes/);

  const csrf = await fetch(`${base}/admin/products/1/stock`, {
    method: 'POST',
    redirect: 'manual',
    headers: { authorization: auth, origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    body: 'in_stock=0',
  });
  assert.equal(csrf.status, 403);
  assert.equal(db.getProduct(1).in_stock, 1);

  const same = await fetch(`${base}/admin/products/1/stock`, {
    method: 'POST',
    redirect: 'manual',
    headers: { authorization: auth, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'in_stock=0',
  });
  assert.equal(same.status, 302);
  assert.equal(db.getProduct(1).in_stock, 0);
});

test('every dashboard page renders, in both languages', async () => {
  for (const lang of ['fr', 'en']) {
    for (const path of ['/admin', '/admin/products', '/admin/customers', '/admin/customers/1', '/admin?day=2026-01-01']) {
      const res = await fetch(`${base}${path}`, { headers: { authorization: auth, cookie: `admin_lang=${lang}` } });
      assert.equal(res.status, 200, `${lang} ${path}`);
    }
  }
});

test('admin can take over a conversation, reply inside the 24h window, and hand it back', async () => {
  const phone = '243840000009';
  const { handleInbound } = await import('../src/bot/engine.js');
  handleInbound({ id: 'wamid.http-h1', from: phone, type: 'text', text: 'Bonjour' });
  const customer = db.getCustomer(phone);
  const post = (path, body = '') =>
    fetch(`${base}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { authorization: auth, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

  assert.equal((await post(`/admin/customers/${customer.id}/takeover`)).status, 302);
  assert.equal(db.getConversation(phone).state, 'HUMAN');
  const dash = await (await fetch(`${base}/admin`, { headers: { authorization: auth } })).text();
  assert.match(dash, /Clients qui attendent une personne \(1\)/);

  const reply = await post(`/admin/customers/${customer.id}/reply`, 'body=' + encodeURIComponent('Oui, nous livrons à Masina 🙂'));
  assert.match(decodeURIComponent(reply.headers.get('location')), /Message envoyé/);
  assert.ok(db.messagesFor(phone).some((m) => m.direction === 'out' && m.body === 'Oui, nous livrons à Masina 🙂'));

  const page = await (await fetch(`${base}/admin/customers/${customer.id}`, { headers: { authorization: auth } })).text();
  assert.match(page, /Rendre la main au bot/);

  assert.equal((await post(`/admin/customers/${customer.id}/release`)).status, 302);
  assert.equal(db.getConversation(phone).state, 'DONE');
});

test('rider route sheet: secret per-day link, rider marks an order delivered, forged links refused', async () => {
  const { handleInbound } = await import('../src/bot/engine.js');
  const { setOrderStatus } = db;
  const phone = '243840000010';
  let n = 0;
  const say = (msg) => handleInbound({ id: `wamid.route${++n}`, from: phone, type: 'text', ...msg });
  const tap = (id) => say({ type: 'interactive', replyId: id, text: id });
  say({ text: 'Bonjour' });
  tap('menu:order'); tap('p:2'); tap('size:small'); tap('qty:1'); tap('more:checkout'); // p:1 was marked sold out above
  say({ text: 'Rider Test' }); tap('zone:0'); say({ text: 'Av. du Livreur 7' }); tap('recap:confirm');
  const order = db.lastOrder(db.getCustomer(phone).id);
  setOrderStatus(order.id, 'paid');

  const adminPage = await (await fetch(`${base}/admin/route`, { headers: { authorization: auth } })).text();
  const link = adminPage.match(/\/route\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{32}/)[0];
  assert.match(adminPage, /Envoyer au livreur par WhatsApp/);

  const rider = await fetch(`${base}${link}`);
  assert.equal(rider.status, 200);
  assert.equal(rider.headers.get('referrer-policy'), 'no-referrer');
  const html = await rider.text();
  assert.match(html, /Rider Test/);
  assert.match(html, /Av\. du Livreur 7/);

  const forged = link.replace(/[0-9a-f]{4}$/, '0000');
  assert.equal((await fetch(`${base}${forged}`)).status, 404);
  assert.equal((await fetch(`${base}/route/2020-01-01/${'a'.repeat(32)}`)).status, 404);
  assert.equal((await fetch(`${base}${link.slice(0, -2)}é`)).status, 404, 'non-hex characters are a 404, not a crash');

  const done = await fetch(`${base}${link}/orders/${order.id}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'status=delivered',
  });
  assert.equal(done.status, 302);
  assert.equal(db.getOrder(order.id).status, 'delivered');

  const again = await fetch(`${base}${link}/orders/${order.id}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'status=cancelled',
  });
  assert.equal(again.status, 400, 'a rider can only mark on the way / delivered');
});

test('privacy policy and terms are public (required by Meta to publish the app)', async () => {
  for (const path of ['/privacy', '/terms']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200);
  }
  assert.match(await (await fetch(`${base}/privacy`)).text(), /Politique de confidentialité/);
});

test('stats page renders every period, and the CSV export opens in Excel', async () => {
  for (const days of [7, 30, 90]) {
    const res = await fetch(`${base}/admin/stats?days=${days}`, { headers: { authorization: auth } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Chiffre d’affaires par jour/);
    assert.equal((html.match(/class="col"/g) || []).length, days, 'one column per day');
  }
  const csv = await fetch(`${base}/admin/export.csv`, { headers: { authorization: auth } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /commandes-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv/);
  const bytes = Buffer.from(await csv.arrayBuffer()); // fetch().text() would strip the BOM
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM so Excel reads accents');
  const text = bytes.toString('utf8');
  assert.match(text, /^\uFEFFreference;date;status;customer/);
  assert.match(text, /Rider Test/);
});

// Keep last: it locks 127.0.0.1 out of the dashboard for the rest of this file.
test('health check reports the database, and repeated wrong passwords are throttled', async () => {
  const health = await (await fetch(`${base}/healthz`)).json();
  assert.equal(health.ok, true);

  const wrong = `Basic ${Buffer.from('admin:wrong').toString('base64')}`;
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push((await fetch(`${base}/admin`, { headers: { authorization: wrong } })).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
  // Even the right password waits until the window passes, from that IP.
  assert.equal((await fetch(`${base}/admin`, { headers: { authorization: auth } })).status, 429);
});
