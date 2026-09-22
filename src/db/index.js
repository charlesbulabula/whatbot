import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

// schema.sql always describes the latest schema for new databases. Databases
// created by an older version get the missing columns added here, so a deploy
// never loses data. Append new columns to this list; never remove entries.
const ADDED_COLUMNS = [
  ['orders', 'payment_proof_file', 'TEXT'],
  ['messages', 'media_id', 'TEXT'],
];
for (const [table, column, type] of ADDED_COLUMNS) {
  const exists = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(table, column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
db.exec(fs.readFileSync(path.join(here, 'indexes.sql'), 'utf8'));

// Timestamps are stored in UTC; "today" means today in the server's local
// timezone (TZ=Africa/Kinshasa in production).
const LOCAL_DAY = "date(created_at, 'localtime')";
const TODAY = "date('now', 'localtime')";

export const PAID_STATUSES = ['paid', 'preparing', 'on_the_way', 'delivered'];
const PAID_SQL = PAID_STATUSES.map((s) => `'${s}'`).join(',');

/* ------------------------------ customers ------------------------------ */

export function getCustomer(phone) {
  return db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
}

export function getCustomerById(id) {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

export function getCustomerByReferralCode(code) {
  return db.prepare('SELECT * FROM customers WHERE referral_code = ?').get(String(code).toUpperCase());
}

/** Creates the customer on first contact and refreshes last_seen_at (24h window tracking). */
export function touchCustomer(phone) {
  const existing = getCustomer(phone);
  if (existing) {
    db.prepare("UPDATE customers SET last_seen_at = datetime('now') WHERE id = ?").run(existing.id);
    return { customer: getCustomer(phone), isNew: false };
  }
  db.prepare(
    `INSERT INTO customers (phone, locale, referral_code, last_seen_at) VALUES (?, ?, ?, datetime('now'))`,
  ).run(phone, config.i18n.defaultLocale, uniqueReferralCode());
  return { customer: getCustomer(phone), isNew: true };
}

const CUSTOMER_FIELDS = ['name', 'neighborhood', 'address_note', 'locale', 'marketing_opt_out', 'waitlist_since', 'referred_by'];

export function updateCustomer(id, fields) {
  const keys = CUSTOMER_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return getCustomerById(id);
  db.prepare(`UPDATE customers SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    id,
  );
  return getCustomerById(id);
}

export function addCredit(customerId, amount) {
  db.prepare('UPDATE customers SET credit = MAX(0, credit + ?) WHERE id = ?').run(amount, customerId);
}

function uniqueReferralCode() {
  for (;;) {
    const code = `EP${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!getCustomerByReferralCode(code)) return code;
  }
}

/** new -> regular (>=2 paid orders) -> vip (>=6 paid orders). */
function refreshSegment(customerId) {
  db.prepare(
    `UPDATE customers
        SET segment = CASE WHEN orders_count >= 6 THEN 'vip' WHEN orders_count >= 2 THEN 'regular' ELSE 'new' END
      WHERE id = ?`,
  ).run(customerId);
}

export function listCustomers() {
  return db.prepare('SELECT * FROM customers ORDER BY orders_count DESC, created_at DESC').all();
}

export function customersForWeeklyReminder() {
  return db
    .prepare(
      `SELECT c.* FROM customers c
        WHERE c.orders_count >= 1 AND c.marketing_opt_out = 0
          AND NOT EXISTS (
            SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.created_at >= datetime('now', '-3 days')
          )`,
    )
    .all();
}

export function waitlistedCustomers(limit = -1) {
  return db
    .prepare('SELECT * FROM customers WHERE waitlist_since IS NOT NULL ORDER BY waitlist_since LIMIT ?')
    .all(limit);
}

/* ------------------------------ products ------------------------------- */

export function listProducts({ onlyInStock = true } = {}) {
  const where = onlyInStock ? 'WHERE in_stock = 1' : '';
  return db.prepare(`SELECT * FROM products ${where} ORDER BY sort_order, id`).all();
}

export function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

export function countProducts() {
  return db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
}

export function createProduct(p) {
  const info = db
    .prepare(
      `INSERT INTO products (name_fr, name_en, emoji, price_small, price_medium, price_large, in_stock, sort_order)
       VALUES (@name_fr, @name_en, @emoji, @price_small, @price_medium, @price_large, @in_stock, @sort_order)`,
    )
    .run({ emoji: '', in_stock: 1, sort_order: 0, ...p });
  return getProduct(info.lastInsertRowid);
}

export function updateProduct(id, p) {
  const keys = ['name_fr', 'name_en', 'emoji', 'price_small', 'price_medium', 'price_large', 'in_stock', 'sort_order'].filter(
    (k) => p[k] !== undefined,
  );
  if (!keys.length) return getProduct(id);
  db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => p[k]),
    id,
  );
  return getProduct(id);
}

/* ---------------------------- conversations ---------------------------- */

const parseConversation = (row) => ({ ...row, context: JSON.parse(row.context || '{}') });

export function getConversation(phone) {
  db.prepare('INSERT OR IGNORE INTO conversations (phone) VALUES (?)').run(phone);
  return parseConversation(db.prepare('SELECT * FROM conversations WHERE phone = ?').get(phone));
}

/** Saving a conversation after an inbound message also re-arms the idle-cart reminder. */
export function saveConversation(phone, state, context) {
  db.prepare(
    `UPDATE conversations SET state = ?, context = ?, reminded_at = NULL, updated_at = datetime('now') WHERE phone = ?`,
  ).run(state, JSON.stringify(context), phone);
}

/** Used by background jobs: changes state without touching updated_at semantics of user activity. */
export function setConversationState(phone, state, context) {
  getConversation(phone);
  db.prepare(`UPDATE conversations SET state = ?, context = ?, updated_at = datetime('now') WHERE phone = ?`).run(
    state,
    JSON.stringify(context),
    phone,
  );
}

export function markReminded(phone) {
  db.prepare("UPDATE conversations SET reminded_at = datetime('now') WHERE phone = ?").run(phone);
}

export function idleConversations(states, olderThanMinutes, { reminded } = {}) {
  const placeholders = states.map(() => '?').join(',');
  const remindedClause =
    reminded === undefined ? '' : reminded ? 'AND reminded_at IS NOT NULL' : 'AND reminded_at IS NULL';
  return db
    .prepare(
      `SELECT * FROM conversations
        WHERE state IN (${placeholders}) ${remindedClause}
          AND updated_at <= datetime('now', ?)`,
    )
    .all(...states, `-${olderThanMinutes} minutes`)
    .map(parseConversation);
}

/* ------------------------------- orders -------------------------------- */

export function createOrder({ customer, items, subtotal, deliveryFee, discount, total, name, neighborhood, addressNote }) {
  const tx = db.transaction(() => {
    // Next number after the highest reference already issued today: unique by construction,
    // even if the server clock or timezone changes.
    const day = db.prepare(`SELECT strftime('%Y%m%d', 'now', 'localtime') AS d`).get().d;
    const prefix = `CMD-${day}-`;
    const last = db
      .prepare(`SELECT MAX(CAST(substr(reference, ?) AS INTEGER)) AS n FROM orders WHERE reference LIKE ?`)
      .get(prefix.length + 1, `${prefix}%`).n;
    const reference = `${prefix}${String((last || 0) + 1).padStart(3, '0')}`;
    const info = db
      .prepare(
        `INSERT INTO orders (reference, customer_id, subtotal, delivery_fee, discount, total, customer_name, neighborhood, address_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(reference, customer.id, subtotal, deliveryFee, discount, total, name, neighborhood, addressNote);
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, size, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const it of items) {
      insertItem.run(info.lastInsertRowid, it.productId, it.size, it.quantity, it.unitPrice, it.unitPrice * it.quantity);
    }
    if (discount > 0) addCredit(customer.id, -discount);
    return info.lastInsertRowid;
  });
  return getOrder(tx());
}

export function getOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.items = db
    .prepare(
      `SELECT oi.*, p.name_fr, p.name_en, p.emoji
         FROM order_items oi JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ? ORDER BY oi.id`,
    )
    .all(id);
  order.customer = getCustomerById(order.customer_id);
  return order;
}

/**
 * Applies a status change and the bookkeeping that goes with it:
 * the first transition into a paid status counts the order for the customer,
 * cancelling refunds spent credit and un-counts a paid order.
 * Returns { order, previous, firstPayment }.
 */
export function setOrderStatus(id, status, { eta } = {}) {
  const tx = db.transaction(() => {
    const before = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!before) return null;
    let firstPayment = false;

    if (PAID_STATUSES.includes(status) && !before.paid_at) {
      firstPayment = true;
      db.prepare("UPDATE orders SET paid_at = datetime('now') WHERE id = ?").run(id);
      db.prepare('UPDATE customers SET orders_count = orders_count + 1, total_spent = total_spent + ? WHERE id = ?').run(
        before.total,
        before.customer_id,
      );
      refreshSegment(before.customer_id);
    }

    if (status === 'cancelled' && before.status !== 'cancelled') {
      if (before.discount > 0) addCredit(before.customer_id, before.discount);
      if (before.paid_at) {
        db.prepare(
          'UPDATE customers SET orders_count = MAX(0, orders_count - 1), total_spent = MAX(0, total_spent - ?) WHERE id = ?',
        ).run(before.total, before.customer_id);
        db.prepare('UPDATE orders SET paid_at = NULL WHERE id = ?').run(id);
        refreshSegment(before.customer_id);
      }
    }

    db.prepare(
      `UPDATE orders
          SET status = ?,
              eta = COALESCE(?, eta),
              delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END
        WHERE id = ?`,
    ).run(status, eta || null, status, id);

    return { previous: before.status, firstPayment };
  });
  const result = tx();
  return result && { ...result, order: getOrder(id) };
}

export function setPaymentProof(id, mediaId) {
  db.prepare('UPDATE orders SET payment_proof = ?, payment_proof_file = NULL WHERE id = ?').run(mediaId, id);
}

export function setPaymentProofFile(id, file) {
  db.prepare('UPDATE orders SET payment_proof_file = ? WHERE id = ?').run(file, id);
}

export function ping() {
  return db.prepare('SELECT 1 AS ok').get().ok === 1;
}

export function openOrdersToday(customerId) {
  return db
    .prepare(
      `SELECT * FROM orders
        WHERE customer_id = ? AND ${LOCAL_DAY} = ${TODAY} AND status NOT IN ('cancelled', 'delivered')
        ORDER BY created_at DESC`,
    )
    .all(customerId);
}

export function latestUnpaidOrderWithoutProof(customerId) {
  return db
    .prepare(
      `SELECT * FROM orders
        WHERE customer_id = ? AND status = 'awaiting_payment' AND payment_proof IS NULL
          AND created_at >= datetime('now', '-2 days')
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(customerId);
}

export function lastOrder(customerId) {
  const row = db
    .prepare(`SELECT id FROM orders WHERE customer_id = ? AND status <> 'cancelled' ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get(customerId);
  return row ? getOrder(row.id) : null;
}

export function ordersForDay(day) {
  return db
    .prepare(`SELECT id FROM orders WHERE ${LOCAL_DAY} = ? ORDER BY neighborhood, created_at`)
    .all(day)
    .map((r) => getOrder(r.id));
}

export function ordersForCustomer(customerId, limit = 20) {
  return db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(customerId, limit);
}

export function weeklyOrderCount() {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM orders WHERE created_at >= datetime('now', '-7 days') AND status <> 'cancelled'`)
    .get().n;
}

export function revenueSince(modifier) {
  return db
    .prepare(`SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE status IN (${PAID_SQL}) AND created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')`)
    .get(modifier).total;
}

/** Quantities to buy for a given local day, per product and size. */
export function shoppingList(day) {
  return db
    .prepare(
      `SELECT p.id AS product_id, p.name_fr, p.name_en, p.emoji, oi.size, SUM(oi.quantity) AS qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE date(o.created_at, 'localtime') = ? AND o.status <> 'cancelled'
        GROUP BY p.id, oi.size
        ORDER BY p.sort_order, p.id, oi.size`,
    )
    .all(day);
}

/** Average weekly quantity per product/size over the last 4 weeks: a starting point for Saturday's purchase. */
export function demandForecast() {
  return db
    .prepare(
      `SELECT p.id AS product_id, p.name_fr, p.name_en, p.emoji, oi.size,
              ROUND(SUM(oi.quantity) / 4.0, 1) AS weekly_avg
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE o.created_at >= datetime('now', '-28 days') AND o.status IN (${PAID_SQL})
        GROUP BY p.id, oi.size
        ORDER BY p.sort_order, p.id, oi.size`,
    )
    .all();
}

export function ordersAwaitingSurvey() {
  return db
    .prepare(
      `SELECT id FROM orders
        WHERE status = 'delivered' AND survey_sent_at IS NULL AND rating IS NULL
          AND delivered_at <= datetime('now', '-24 hours')`,
    )
    .all()
    .map((r) => getOrder(r.id));
}

export function markSurveySent(id) {
  db.prepare("UPDATE orders SET survey_sent_at = datetime('now') WHERE id = ?").run(id);
}

export function setOrderRating(id, rating) {
  db.prepare('UPDATE orders SET rating = ? WHERE id = ?').run(rating, id);
}

/* ------------------------------ messages ------------------------------- */

export function logMessage(phone, direction, body, mediaId = null) {
  db.prepare('INSERT INTO messages (phone, direction, body, media_id) VALUES (?, ?, ?, ?)').run(
    phone,
    direction,
    body,
    mediaId,
  );
}

export function getMessage(id) {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

/** Conversations handed over to a person, with how many customer messages came in since. */
export function handoffConversations() {
  return db
    .prepare(
      `SELECT c.*, cv.updated_at AS handoff_at,
              (SELECT COUNT(*) FROM messages m WHERE m.phone = c.phone AND m.direction = 'in'
                 AND m.id > COALESCE((SELECT MAX(id) FROM messages o WHERE o.phone = c.phone AND o.direction = 'out'), 0)) AS unanswered
         FROM conversations cv JOIN customers c ON c.phone = cv.phone
        WHERE cv.state = 'HUMAN'
        ORDER BY cv.updated_at`,
    )
    .all();
}

export function messagesFor(phone, limit = 60) {
  return db
    .prepare('SELECT * FROM (SELECT * FROM messages WHERE phone = ? ORDER BY id DESC LIMIT ?) ORDER BY id')
    .all(phone, limit);
}

/** Returns true the first time a given inbound WhatsApp message id is seen (Meta retries deliveries). */
export function markEventProcessed(waMessageId) {
  if (!waMessageId) return true;
  return db.prepare('INSERT OR IGNORE INTO processed_events (wa_message_id) VALUES (?)').run(waMessageId).changes === 1;
}

export function pruneProcessedEvents() {
  db.prepare("DELETE FROM processed_events WHERE created_at < datetime('now', '-7 days')").run();
}

/* ------------------------------ settings ------------------------------- */

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}

/* -------------------------------- stats -------------------------------- */

const periodStart = (days) => `-${Math.max(1, days) - 1} days`; // today counts as day 1

/** Paid revenue and order count per local day over the last `days` days (days without sales included). */
export function dailyRevenue(days) {
  const rows = db
    .prepare(
      `SELECT date(created_at, 'localtime') AS day, SUM(total) AS revenue, COUNT(*) AS orders
         FROM orders
        WHERE status IN (${PAID_SQL}) AND created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')
        GROUP BY day`,
    )
    .all(periodStart(days));
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toLocaleDateString('en-CA');
    out.push({ day, revenue: byDay.get(day)?.revenue ?? 0, orders: byDay.get(day)?.orders ?? 0 });
  }
  return out;
}

export function periodStats(days) {
  const since = periodStart(days);
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue, COUNT(DISTINCT customer_id) AS buyers,
              AVG(rating) AS rating, COUNT(rating) AS ratings
         FROM orders
        WHERE status IN (${PAID_SQL}) AND created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')`,
    )
    .get(since);
  const repeat = db
    .prepare(
      `SELECT COUNT(DISTINCT o.customer_id) AS n FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.status IN (${PAID_SQL}) AND c.orders_count >= 2
          AND o.created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')`,
    )
    .get(since).n;
  const newCustomers = db
    .prepare(`SELECT COUNT(*) AS n FROM customers WHERE created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')`)
    .get(since).n;
  return { ...sales, repeatBuyers: repeat, newCustomers };
}

export function topProducts(days) {
  return db
    .prepare(
      `SELECT p.id, p.name_fr, p.name_en, p.emoji, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
        WHERE o.status IN (${PAID_SQL}) AND o.created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')
        GROUP BY p.id ORDER BY revenue DESC`,
    )
    .all(periodStart(days));
}

export function zoneStats(days) {
  return db
    .prepare(
      `SELECT COALESCE(neighborhood, '—') AS zone, COUNT(*) AS orders, SUM(total) AS revenue
         FROM orders
        WHERE status IN (${PAID_SQL}) AND created_at >= datetime('now', 'localtime', 'start of day', ?, 'utc')
        GROUP BY zone ORDER BY revenue DESC`,
    )
    .all(periodStart(days));
}

export function segmentCounts() {
  return db.prepare('SELECT segment, COUNT(*) AS n FROM customers WHERE orders_count > 0 GROUP BY segment').all();
}

/** Orders created between two local days (inclusive), with items, for the CSV export. */
export function ordersBetween(fromDay, toDay) {
  return db
    .prepare(`SELECT id FROM orders WHERE date(created_at, 'localtime') BETWEEN ? AND ? ORDER BY created_at`)
    .all(fromDay, toDay)
    .map((r) => getOrder(r.id));
}
