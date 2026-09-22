import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customer, placeOrder } from './helpers.js';
import * as db from '../src/db/index.js';
import { sentLog } from '../src/whatsapp/client.js';
import { cartReminders, surveys, weeklyReminder, isoWeek } from '../src/jobs/scheduler.js';
import { changeOrderStatus } from '../src/bot/orders.js';

const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString().replace('T', ' ').slice(0, 19);

test('an idle cart gets exactly one reminder', async () => {
  const c = customer('243830000001');
  c.say('Bonjour');
  c.tap('menu:order');
  db.db.prepare('UPDATE conversations SET updated_at = ? WHERE phone = ?').run(ago(15), c.phone);
  const before = sentLog.length;
  await cartReminders();
  await cartReminders();
  const sent = sentLog.slice(before).filter((m) => m.to === c.phone);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /Toujours là/);
});

test('survey is sent 24h after delivery and the answer is recorded', async () => {
  const c = customer('243830000002');
  const id = placeOrder(c);
  c.image();
  await changeOrderStatus(id, 'delivered');
  db.db.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(ago(25 * 60), id);
  await surveys();
  assert.equal(c.state(), 'RATING');
  const reply = c.say('5').last;
  assert.match(reply.body, /Merci beaucoup pour votre note/);
  assert.equal(db.getOrder(id).rating, 5);
});

test('weekly reminder runs once per week on the configured day and hour', async () => {
  const c = customer('243830000003');
  const id = placeOrder(c);
  await changeOrderStatus(id, 'paid');
  db.db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(ago(5 * 24 * 60), id);

  const friday = new Date(2026, 8, 25, 18, 30); // Friday 18:30 local
  const before = sentLog.length;
  await weeklyReminder(friday);
  await weeklyReminder(friday);
  const sent = sentLog.slice(before).filter((m) => m.to === c.phone);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /refaire le plein d’épices/);

  await weeklyReminder(new Date(2026, 8, 24, 18, 30)); // Thursday: nothing
  assert.equal(isoWeek(friday), '2026-W39');
});
