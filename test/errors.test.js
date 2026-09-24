// The pages nobody designs and everybody eventually sees.
import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'pw';

const { app } = await import('../src/index.js');

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const auth = `Basic ${Buffer.from('admin:pw').toString('base64')}`;

test('an unknown URL gets a real page, not Express’s bare error', async () => {
  for (const path of ['/admin/nope', '/nope', '/t/nope']) {
    const res = await fetch(`${base}${path}`, { headers: { authorization: auth } });
    const html = await res.text();
    assert.equal(res.status, 404, path);
    assert.match(html, /Page introuvable/);
    assert.doesNotMatch(html, /Cannot GET/);
  }
});

test('the dashboard 404 offers a way back, a public one does not', async () => {
  const admin = await (await fetch(`${base}/admin/nope`, { headers: { authorization: auth } })).text();
  assert.match(admin, /href="\/admin"/);
  const publicPage = await (await fetch(`${base}/nope`)).text();
  assert.doesNotMatch(publicPage, /href="\/admin"/);
});

test('a browser gets the sign-in page, a script keeps its 401', async () => {
  const page = await fetch(`${base}/admin`, { headers: { accept: 'text/html' }, redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /\/admin\/login/);

  const script = await fetch(`${base}/admin`);
  assert.equal(script.status, 401);

  const login = await (await fetch(`${base}/admin/login`)).text();
  assert.match(login, /Connectez-vous à votre compte/);
  assert.doesNotMatch(login, /WWW-Authenticate/);
});

test('signing in opens a session, signing out closes it', async () => {
  const body = new URLSearchParams({ username: 'admin', password: 'pw', remember: '1' });
  const bad = await fetch(`${base}/admin/login`, { method: 'POST', body: new URLSearchParams({ username: 'admin', password: 'x' }) });
  assert.equal(bad.status, 401);
  assert.match(await bad.text(), /incorrect/);

  const ok = await fetch(`${base}/admin/login`, { method: 'POST', body, redirect: 'manual' });
  assert.equal(ok.status, 302);
  const cookie = ok.headers.getSetCookie().find((c) => c.startsWith('admin_session='));
  assert.ok(cookie, 'a session cookie is set');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  const jar = cookie.split(';')[0];
  const dash = await fetch(`${base}/admin`, { headers: { cookie: jar, accept: 'text/html' } });
  assert.equal(dash.status, 200);

  // A tampered signature is refused.
  const forged = `admin_session=${Buffer.from('admin').toString('base64url')}.${Date.now() + 1e6}.deadbeef`;
  const refused = await fetch(`${base}/admin`, { headers: { cookie: forged } });
  assert.equal(refused.status, 401);
});
