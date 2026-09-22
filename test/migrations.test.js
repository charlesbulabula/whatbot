import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// The first released schema: today's schema.sql without the columns added since.
const LATER_COLUMNS = ['payment_proof_file', 'media_id'];
const firstSchema = fs
  .readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => !LATER_COLUMNS.some((c) => line.trim().startsWith(`${c} `)))
  .join('\n');

test('a database from the first release is upgraded in place without losing data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatbot-mig-'));
  const file = path.join(dir, 'v1.db');
  const v1 = new Database(file);
  v1.exec(firstSchema);
  v1.exec(`INSERT INTO customers (phone) VALUES ('243899999999');
           INSERT INTO orders (reference, customer_id) VALUES ('CMD-OLD-001', 1);`);
  assert.equal(v1.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get('orders', 'payment_proof_file'), undefined);
  v1.close();

  process.env.DB_PATH = file;
  process.env.WA_ENABLED = 'false';
  const { db } = await import('../src/db/index.js');
  const cols = ['orders', 'messages'].flatMap((t) => db.prepare('SELECT name FROM pragma_table_info(?)').all(t).map((c) => c.name));
  for (const c of LATER_COLUMNS) assert.ok(cols.includes(c), c);
  assert.equal(db.prepare('SELECT reference FROM orders').get().reference, 'CMD-OLD-001');
  db.close();
  fs.rmSync(dir, { recursive: true });
});
