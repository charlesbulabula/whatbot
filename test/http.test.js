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
