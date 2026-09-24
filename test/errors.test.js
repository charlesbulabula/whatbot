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
