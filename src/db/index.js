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
  ['orders', 'payment_method', "TEXT NOT NULL DEFAULT 'momo'"],
  ['orders', 'coupon', 'TEXT'],
  ['orders', 'coupon_discount', 'INTEGER NOT NULL DEFAULT 0'],
  ['customers', 'tags', 'TEXT'],
  ['customers', 'blocked', 'INTEGER NOT NULL DEFAULT 0'],
  ['products', 'stock_qty', 'INTEGER'],
  ['products', 'stock_alert', 'INTEGER NOT NULL DEFAULT 0'],
  ['products', 'photo', 'TEXT'],
  ['products', 'retailer_id', 'TEXT'],
  ['customers', 'tier', "TEXT NOT NULL DEFAULT 'bronze'"],
  ['orders', 'slot_id', 'INTEGER'],
  ['orders', 'slot_label', 'TEXT'],
  ['order_items', 'variant_label', 'TEXT'],
  ['order_items', 'extras', 'TEXT'],
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

const CUSTOMER_FIELDS = [
  'name', 'neighborhood', 'address_note', 'locale', 'marketing_opt_out', 'waitlist_since', 'referred_by',
  'tags', 'blocked', 'tier',
];

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

const PRODUCT_FIELDS = [
  'name_fr', 'name_en', 'emoji', 'price_small', 'price_medium', 'price_large',
  'in_stock', 'sort_order', 'stock_qty', 'stock_alert', 'photo', 'retailer_id',
];

export function updateProduct(id, p) {
  const keys = PRODUCT_FIELDS.filter((k) => p[k] !== undefined);
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

export function createOrder({
  customer, items, subtotal, deliveryFee, discount, total, name, neighborhood, addressNote,
  paymentMethod = 'momo', coupon = null, couponDiscount = 0, slotId = null, slotLabel = null,
}) {
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
        `INSERT INTO orders (reference, customer_id, subtotal, delivery_fee, discount, coupon, coupon_discount,
                             total, payment_method, customer_name, neighborhood, address_note, slot_id, slot_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(reference, customer.id, subtotal, deliveryFee, discount, coupon?.code || null, couponDiscount,
           total, paymentMethod, name, neighborhood, addressNote, slotId, slotLabel);
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, size, variant_label, extras, quantity, unit_price, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const it of items) {
      insertItem.run(
        info.lastInsertRowid, it.productId, it.size,
        it.variantLabel || null,
        it.extras?.length ? JSON.stringify(it.extras) : null,
        it.quantity, it.unitPrice, it.unitPrice * it.quantity,
      );
    }
    if (discount > 0) {
      db.prepare(`INSERT INTO credit_entries (customer_id, amount, reason, order_id) VALUES (?, ?, 'order', ?)`)
        .run(customer.id, -discount, info.lastInsertRowid);
      addCredit(customer.id, -discount);
    }
    if (coupon) {
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
      db.prepare('INSERT INTO coupon_uses (coupon_id, customer_id, order_id) VALUES (?, ?, ?)')
        .run(coupon.id, customer.id, info.lastInsertRowid);
    }
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
      if (before.discount > 0) {
        db.prepare(`INSERT INTO credit_entries (customer_id, amount, reason, order_id) VALUES (?, ?, 'refund', ?)`)
          .run(before.customer_id, before.discount, id);
        addCredit(before.customer_id, before.discount);
      }
      const use = db.prepare('SELECT coupon_id FROM coupon_uses WHERE order_id = ?').get(id);
      if (use) {
        db.prepare('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE id = ?').run(use.coupon_id);
        db.prepare('DELETE FROM coupon_uses WHERE order_id = ?').run(id);
      }
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
      `SELECT p.id AS product_id, p.name_fr, p.name_en, p.emoji, oi.size,
              MAX(oi.variant_label) AS variant_label, SUM(oi.quantity) AS qty
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
      `SELECT p.id AS product_id, p.name_fr, p.name_en, p.emoji, oi.size, MAX(oi.variant_label) AS variant_label,
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

/* ------------------------- delivery zones ------------------------------ */
// Each served area carries its own delivery fee. The DELIVERY_ZONES / DELIVERY_FEE
// env values only seed the table on a fresh install; the dashboard owns them after that.

export function listZones({ onlyActive = false } = {}) {
  const where = onlyActive ? 'WHERE active = 1' : '';
  return db.prepare(`SELECT * FROM zones ${where} ORDER BY sort_order, name`).all();
}

export function getZone(id) {
  return db.prepare('SELECT * FROM zones WHERE id = ?').get(id);
}

/** Case- and accent-insensitive lookup, so "ngaliema" finds "Ngaliema". */
export function findZoneByName(name) {
  const key = foldZone(name);
  return listZones().find((z) => foldZone(z.name) === key) || null;
}

const foldZone = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export function createZone({ name, fee = 0, active = 1, sort_order = 0 }) {
  const info = db
    .prepare('INSERT INTO zones (name, fee, active, sort_order) VALUES (?, ?, ?, ?)')
    .run(name, fee, active ? 1 : 0, sort_order);
  return getZone(info.lastInsertRowid);
}

const ZONE_FIELDS = ['name', 'fee', 'active', 'sort_order'];

export function updateZone(id, fields) {
  const keys = ZONE_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return getZone(id);
  db.prepare(`UPDATE zones SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  return getZone(id);
}

export function deleteZone(id) {
  db.prepare('DELETE FROM zones WHERE id = ?').run(id);
}

/** Seeds the areas listed in DELIVERY_ZONES on first run only. Returns how many were created. */
export function seedZonesIfEmpty(names, fee) {
  if (db.prepare('SELECT COUNT(*) AS n FROM zones').get().n > 0) return 0;
  names.forEach((name, i) => createZone({ name, fee, sort_order: i + 1 }));
  return names.length;
}

/* ----------------------------- coupons --------------------------------- */

export function listCoupons() {
  return db.prepare('SELECT * FROM coupons ORDER BY active DESC, created_at DESC').all();
}

export function getCoupon(id) {
  return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
}

export function getCouponByCode(code) {
  return db.prepare('SELECT * FROM coupons WHERE code = ?').get(String(code || '').toUpperCase()) || null;
}

export function couponUsedByCustomer(couponId, customerId) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM coupon_uses cu JOIN orders o ON o.id = cu.order_id
          WHERE cu.coupon_id = ? AND cu.customer_id = ? AND o.status != 'cancelled'`,
      )
      .get(couponId, customerId),
  );
}

const COUPON_FIELDS = ['code', 'kind', 'value', 'min_subtotal', 'max_uses', 'once_per_customer', 'expires_on', 'active'];

export function createCoupon(fields) {
  const keys = COUPON_FIELDS.filter((k) => fields[k] !== undefined);
  const info = db
    .prepare(`INSERT INTO coupons (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => fields[k]));
  return getCoupon(info.lastInsertRowid);
}

export function updateCoupon(id, fields) {
  const keys = COUPON_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return getCoupon(id);
  db.prepare(`UPDATE coupons SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  return getCoupon(id);
}

export function deleteCoupon(id) {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
}

/** Coupons used over a period, for the stats page. */
export function couponStats(days) {
  return db
    .prepare(
      `SELECT coupon AS code, COUNT(*) AS uses, SUM(coupon_discount) AS granted
         FROM orders
        WHERE coupon IS NOT NULL AND status IN (${PAID_SQL})
          AND ${LOCAL_DAY} >= date('now', 'localtime', ?)
        GROUP BY coupon ORDER BY uses DESC`,
    )
    .all(`-${days - 1} days`);
}

/** Split of paid orders by payment method over a period. */
export function paymentMethodStats(days) {
  return db
    .prepare(
      `SELECT payment_method AS method, COUNT(*) AS orders, SUM(total) AS revenue
         FROM orders
        WHERE status IN (${PAID_SQL}) AND ${LOCAL_DAY} >= date('now', 'localtime', ?)
        GROUP BY payment_method ORDER BY orders DESC`,
    )
    .all(`-${days - 1} days`);
}

/** Cash still to collect: delivered orders paid in cash are settled, the rest are not. */
export function cashToCollect(day) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS amount, COUNT(*) AS orders
         FROM orders
        WHERE payment_method = 'cash' AND status IN ('paid','preparing','on_the_way') AND ${LOCAL_DAY} = ?`,
    )
    .get(day);
}

/** Payments waiting for a manual check today — shown as a sidebar badge. */
export function pendingProofCount() {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM orders
        WHERE status = 'awaiting_payment' AND (payment_proof IS NOT NULL OR payment_method = 'cash')
          AND ${LOCAL_DAY} = ${TODAY}`,
    )
    .get().n;
}

/** Customer list with an optional name/phone search and segment filter. */
export function searchCustomers({ query = '', segment = '' } = {}) {
  const clauses = [];
  const params = [];
  if (query) {
    clauses.push('(name LIKE ? OR phone LIKE ? OR neighborhood LIKE ? OR referral_code LIKE ?)');
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query.toUpperCase()}%`);
  }
  if (segment) {
    clauses.push('segment = ?');
    params.push(segment);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM customers ${where} ORDER BY orders_count DESC, created_at DESC LIMIT 500`).all(...params);
}

/* ---------------------------- credit ledger ----------------------------- */
// addCredit() only moves the balance; recordCredit() also explains why, so the
// customer page can show where every franc came from.

export function recordCredit(customerId, amount, { reason = 'manual', detail = null, orderId = null, author = null } = {}) {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO credit_entries (customer_id, amount, reason, detail, order_id, author) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(customerId, amount, reason, detail, orderId, author);
    addCredit(customerId, amount);
  });
  tx();
  return getCustomerById(customerId);
}

export function creditHistory(customerId, limit = 50) {
  return db
    .prepare('SELECT * FROM credit_entries WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(customerId, limit);
}

/* ---------------------------- customer notes ---------------------------- */

export function addNote(customerId, body, author) {
  db.prepare('INSERT INTO customer_notes (customer_id, body, author) VALUES (?, ?, ?)').run(customerId, body, author);
}

export function notesFor(customerId) {
  return db.prepare('SELECT * FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC, id DESC').all(customerId);
}

export function deleteNote(id) {
  db.prepare('DELETE FROM customer_notes WHERE id = ?').run(id);
}

/* ------------------------------- audit log ------------------------------ */

export function audit(actor, action, target = null, detail = null) {
  db.prepare('INSERT INTO audit_log (actor, action, target, detail) VALUES (?, ?, ?, ?)').run(actor, action, target, detail);
  // Keep the log bounded: a year of dashboard activity is plenty.
  db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-1 year')").run();
}

export function auditLog({ limit = 100, offset = 0 } = {}) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
}

export const auditCount = () => db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

/* -------------------------------- expenses ------------------------------ */

export function listExpenses(fromDay, toDay) {
  return db.prepare('SELECT * FROM expenses WHERE day BETWEEN ? AND ? ORDER BY day DESC, id DESC').all(fromDay, toDay);
}

export function createExpense({ day, category, label, amount }) {
  const info = db
    .prepare('INSERT INTO expenses (day, category, label, amount) VALUES (?, ?, ?, ?)')
    .run(day, category, label, amount);
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
}

export function deleteExpense(id) {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
}

export function expenseTotal(fromDay, toDay) {
  return db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE day BETWEEN ? AND ?').get(fromDay, toDay).total;
}

export function expensesByCategory(fromDay, toDay) {
  return db
    .prepare('SELECT category, SUM(amount) AS total FROM expenses WHERE day BETWEEN ? AND ? GROUP BY category ORDER BY total DESC')
    .all(fromDay, toDay);
}

/* -------------------------- referrals & loyalty ------------------------- */

/** Customers this one brought in, with what they have spent since. */
export function referredBy(customerId) {
  return db
    .prepare('SELECT * FROM customers WHERE referred_by = ? ORDER BY created_at DESC')
    .all(customerId);
}

/** Leaderboard of the customers who brought in the most paying friends. */
export function topReferrers(limit = 20) {
  return db
    .prepare(
      `SELECT c.*, COUNT(f.id) AS invited, COALESCE(SUM(f.total_spent), 0) AS invited_spent
         FROM customers c JOIN customers f ON f.referred_by = c.id
        GROUP BY c.id ORDER BY invited DESC, invited_spent DESC LIMIT ?`,
    )
    .all(limit);
}

export function referralTotals() {
  return db
    .prepare(
      `SELECT COUNT(*) AS invited,
              SUM(CASE WHEN orders_count > 0 THEN 1 ELSE 0 END) AS converted,
              COALESCE(SUM(total_spent), 0) AS spent
         FROM customers WHERE referred_by IS NOT NULL`,
    )
    .get();
}

export function creditTotals() {
  return db
    .prepare(
      `SELECT COALESCE(SUM(credit), 0) AS outstanding,
              (SELECT COALESCE(SUM(amount), 0) FROM credit_entries WHERE amount > 0) AS granted,
              (SELECT COALESCE(-SUM(amount), 0) FROM credit_entries WHERE amount < 0) AS spent
         FROM customers`,
    )
    .get();
}

/* ------------------------------ global search --------------------------- */

/** One search box for orders, customers and promo codes. */
export function globalSearch(query, limit = 6) {
  const like = `%${query}%`;
  const orders = db
    .prepare(
      `SELECT o.id, o.reference, o.status, o.total, o.customer_name
         FROM orders o WHERE o.reference LIKE ? OR o.customer_name LIKE ?
        ORDER BY o.id DESC LIMIT ?`,
    )
    .all(like, like, limit);
  const customers = db
    .prepare(
      `SELECT id, name, phone, neighborhood FROM customers
        WHERE name LIKE ? OR phone LIKE ? OR referral_code LIKE ?
        ORDER BY orders_count DESC LIMIT ?`,
    )
    .all(like, like, `%${query.toUpperCase()}%`, limit);
  const coupons = db.prepare('SELECT id, code, kind, value FROM coupons WHERE code LIKE ? LIMIT ?').all(`%${query.toUpperCase()}%`, limit);
  return { orders, customers, coupons };
}

/* ------------------------- orders: list with filters -------------------- */

const ORDER_SORTS = {
  date: 'o.created_at',
  total: 'o.total',
  status: 'o.status',
  customer: 'o.customer_name',
};

/**
 * Filtered, sorted, paginated order list for the Orders page.
 * Returns { rows, total } where rows carry their items and customer.
 */
export function searchOrders({
  query = '', status = '', zone = '', payment = '', from = '', to = '',
  sort = 'date', dir = 'desc', limit = 25, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  if (query) {
    where.push('(o.reference LIKE ? OR o.customer_name LIKE ? OR c.phone LIKE ?)');
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (zone) {
    where.push('o.neighborhood = ?');
    params.push(zone);
  }
  if (payment) {
    where.push('o.payment_method = ?');
    params.push(payment);
  }
  const orderDay = "date(o.created_at, 'localtime')"; // qualified: the query joins customers
  if (from) {
    where.push(`${orderDay} >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`${orderDay} <= ?`);
    params.push(to);
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = `${ORDER_SORTS[sort] || ORDER_SORTS.date} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM orders o JOIN customers c ON c.id = o.customer_id ${sql}`)
    .get(...params).n;
  const ids = db
    .prepare(`SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id ${sql} ORDER BY ${order}, o.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map((r) => r.id);
  return { rows: ids.map(getOrder), total };
}

const CUSTOMER_SORTS = {
  orders: 'orders_count',
  spent: 'total_spent',
  recent: 'last_seen_at',
  created: 'created_at',
  name: 'name',
  credit: 'credit',
};

/** Filtered, sorted, paginated customer list. */
export function searchCustomersPaged({
  query = '', segment = '', zone = '', flag = '',
  sort = 'orders', dir = 'desc', limit = 25, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  if (query) {
    where.push('(name LIKE ? OR phone LIKE ? OR neighborhood LIKE ? OR referral_code LIKE ? OR tags LIKE ?)');
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query.toUpperCase()}%`, `%${query}%`);
  }
  if (segment) {
    where.push('segment = ?');
    params.push(segment);
  }
  if (zone) {
    where.push('neighborhood = ?');
    params.push(zone);
  }
  if (flag === 'credit') where.push('credit > 0');
  if (flag === 'waitlist') where.push('waitlist_since IS NOT NULL');
  if (flag === 'blocked') where.push('blocked = 1');
  if (flag === 'optout') where.push('marketing_opt_out = 1');
  if (flag === 'referred') where.push('referred_by IS NOT NULL');
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = `${CUSTOMER_SORTS[sort] || CUSTOMER_SORTS.orders} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers ${sql}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM customers ${sql} ORDER BY ${order}, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { rows, total };
}

/** Distinct areas that actually appear on orders, for the filter dropdowns. */
export function usedZones() {
  return db
    .prepare("SELECT DISTINCT neighborhood AS zone FROM orders WHERE neighborhood IS NOT NULL AND neighborhood != '' ORDER BY neighborhood")
    .all()
    .map((r) => r.zone);
}

/* ----------------------------- stock levels ----------------------------- */

/** Products at or below their alert threshold (0 = no threshold set). */
export function lowStockProducts() {
  return db
    .prepare('SELECT * FROM products WHERE stock_alert > 0 AND stock_qty IS NOT NULL AND stock_qty <= stock_alert ORDER BY stock_qty')
    .all();
}

export function adjustStock(productId, delta) {
  db.prepare('UPDATE products SET stock_qty = MAX(0, COALESCE(stock_qty, 0) + ?) WHERE id = ?').run(delta, productId);
  return getProduct(productId);
}

/* ------------------------- dashboard comparisons ------------------------ */

/** Revenue and order count over a window ending `endOffset` days ago, for trends. */
export function periodTotals(days, endOffset = 0) {
  return db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
         FROM orders
        WHERE status IN (${PAID_SQL})
          AND ${LOCAL_DAY} <= date('now', 'localtime', ?)
          AND ${LOCAL_DAY} >  date('now', 'localtime', ?)`,
    )
    .get(`-${endOffset} days`, `-${endOffset + days} days`);
}

/** Orders per status over a period, for the dashboard donut. */
export function statusBreakdown(days) {
  return db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM orders
        WHERE ${LOCAL_DAY} >= date('now', 'localtime', ?) GROUP BY status ORDER BY n DESC`,
    )
    .all(`-${days - 1} days`);
}

/** When customers order, by hour of the day (server timezone). */
export function ordersByHour(days) {
  return db
    .prepare(
      `SELECT CAST(strftime('%H', created_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS n
         FROM orders WHERE ${LOCAL_DAY} >= date('now', 'localtime', ?)
        GROUP BY hour ORDER BY hour`,
    )
    .all(`-${days - 1} days`);
}

/** New customers per day, to pair with the revenue chart. */
export function newCustomersPerDay(days) {
  const rows = db
    .prepare(
      `SELECT date(created_at, 'localtime') AS day, COUNT(*) AS n FROM customers
        WHERE date(created_at, 'localtime') >= date('now', 'localtime', ?) GROUP BY day`,
    )
    .all(`-${days - 1} days`);
  return new Map(rows.map((r) => [r.day, r.n]));
}

/** True when the product appears on at least one order (so it must not be deleted). */
export function productIsUsed(productId) {
  return Boolean(db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(productId));
}

export function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

/** Latest credit movements across all customers, for the loyalty screen. */
export function recentCreditEntries(limit = 40) {
  return db
    .prepare(
      `SELECT e.*, c.name AS customer_name, c.phone
         FROM credit_entries e JOIN customers c ON c.id = e.customer_id
        ORDER BY e.id DESC LIMIT ?`,
    )
    .all(limit);
}

/** One order looked up by its human reference, for the public invoice check. */
export function getOrderByReference(reference) {
  const row = db.prepare('SELECT id FROM orders WHERE reference = ?').get(reference);
  return row ? getOrder(row.id) : null;
}

/* --------------------------- product variants --------------------------- */
// A product is sold in one or more variants (heap sizes, a bunch, a kilo...).
// The first three of every product keep the skus of the old fixed sizes, so
// past orders, the shopping list and the statistics all still line up.

export const DEFAULT_VARIANTS = [
  { sku: 'small', label_fr: 'Petit tas', label_en: 'Small', label_ln: 'Mwa moke', column: 'price_small' },
  { sku: 'medium', label_fr: 'Moyen tas', label_en: 'Medium', label_ln: 'Mwa ya kati', column: 'price_medium' },
  { sku: 'large', label_fr: 'Grand tas', label_en: 'Large', label_ln: 'Mwa monene', column: 'price_large' },
];

export function listVariants(productId, { onlyActive = true } = {}) {
  const where = onlyActive ? 'AND active = 1' : '';
  return db.prepare(`SELECT * FROM product_variants WHERE product_id = ? ${where} ORDER BY sort_order, id`).all(productId);
}

export function getVariant(productId, sku) {
  return db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND sku = ?').get(productId, sku);
}

export function createVariant(v) {
  const info = db
    .prepare(
      `INSERT INTO product_variants (product_id, sku, label_fr, label_en, label_ln, price, active, sort_order)
       VALUES (@product_id, @sku, @label_fr, @label_en, @label_ln, @price, @active, @sort_order)`,
    )
    .run({ label_ln: null, active: 1, sort_order: 0, price: 0, ...v });
  return db.prepare('SELECT * FROM product_variants WHERE id = ?').get(info.lastInsertRowid);
}

const VARIANT_FIELDS = ['sku', 'label_fr', 'label_en', 'label_ln', 'price', 'active', 'sort_order'];

export function updateVariant(id, fields) {
  const keys = VARIANT_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  db.prepare(`UPDATE product_variants SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
  return db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id);
}

export function deleteVariant(id) {
  db.prepare('DELETE FROM product_variants WHERE id = ?').run(id);
}

/**
 * Gives every product without variants the three heap sizes it used to have.
 * Runs on boot; a product whose variants were edited is left alone.
 */
export function seedVariantsIfMissing() {
  const products = db.prepare('SELECT * FROM products').all();
  let created = 0;
  for (const p of products) {
    if (db.prepare('SELECT 1 FROM product_variants WHERE product_id = ? LIMIT 1').get(p.id)) continue;
    DEFAULT_VARIANTS.forEach((v, i) => {
      createVariant({
        product_id: p.id,
        sku: v.sku,
        label_fr: v.label_fr,
        label_en: v.label_en,
        label_ln: v.label_ln,
        price: p[v.column] || 0,
        sort_order: i + 1,
      });
      created += 1;
    });
  }
  return created;
}

/* ---------------------------- product extras ---------------------------- */

export function listExtras(productId = null, { onlyActive = true } = {}) {
  const active = onlyActive ? 'AND active = 1' : '';
  return db
    .prepare(`SELECT * FROM product_extras WHERE (product_id IS NULL OR product_id = ?) ${active} ORDER BY sort_order, id`)
    .all(productId);
}

export function allExtras() {
  return db.prepare('SELECT * FROM product_extras ORDER BY sort_order, id').all();
}

export function createExtra(e) {
  const info = db
    .prepare(
      `INSERT INTO product_extras (product_id, label_fr, label_en, label_ln, price, active, sort_order)
       VALUES (@product_id, @label_fr, @label_en, @label_ln, @price, @active, @sort_order)`,
    )
    .run({ product_id: null, label_ln: null, active: 1, sort_order: 0, price: 0, ...e });
  return db.prepare('SELECT * FROM product_extras WHERE id = ?').get(info.lastInsertRowid);
}

const EXTRA_FIELDS = ['product_id', 'label_fr', 'label_en', 'label_ln', 'price', 'active', 'sort_order'];

export function updateExtra(id, fields) {
  const keys = EXTRA_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  db.prepare(`UPDATE product_extras SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
  return db.prepare('SELECT * FROM product_extras WHERE id = ?').get(id);
}

export function deleteExtra(id) {
  db.prepare('DELETE FROM product_extras WHERE id = ?').run(id);
}

/* ---------------------------- delivery slots ---------------------------- */
// Time windows the customer picks at checkout ("ce matin", "demain après-midi").
// A slot with a capacity stops being offered once that many orders are taken.

export function listSlots({ onlyActive = false } = {}) {
  const where = onlyActive ? 'WHERE active = 1' : '';
  return db.prepare(`SELECT * FROM delivery_slots ${where} ORDER BY sort_order, start_time`).all();
}

export function getSlot(id) {
  return db.prepare('SELECT * FROM delivery_slots WHERE id = ?').get(id);
}

export function createSlot(s) {
  const info = db
    .prepare(
      `INSERT INTO delivery_slots (label_fr, label_en, label_ln, start_time, end_time, capacity, active, sort_order)
       VALUES (@label_fr, @label_en, @label_ln, @start_time, @end_time, @capacity, @active, @sort_order)`,
    )
    .run({ label_ln: null, capacity: 0, active: 1, sort_order: 0, start_time: '08:00', end_time: '12:00', ...s });
  return getSlot(info.lastInsertRowid);
}

const SLOT_FIELDS = ['label_fr', 'label_en', 'label_ln', 'start_time', 'end_time', 'capacity', 'active', 'sort_order'];

export function updateSlot(id, fields) {
  const keys = SLOT_FIELDS.filter((k) => fields[k] !== undefined);
  if (!keys.length) return getSlot(id);
  db.prepare(`UPDATE delivery_slots SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
  return getSlot(id);
}

export function deleteSlot(id) {
  db.prepare('DELETE FROM delivery_slots WHERE id = ?').run(id);
}

/** Orders already booked into a slot on a given delivery day. */
export function slotBookings(day, slotId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM orders WHERE slot_id = ? AND ${LOCAL_DAY} = ? AND status != 'cancelled'`)
    .get(slotId, day).n;
}

/** How many orders are booked per slot on a day, for the dashboard. */
export function slotLoad(day) {
  return db
    .prepare(
      `SELECT slot_id, slot_label, COUNT(*) AS n FROM orders
        WHERE ${LOCAL_DAY} = ? AND status != 'cancelled' AND slot_id IS NOT NULL
        GROUP BY slot_id, slot_label ORDER BY slot_id`,
    )
    .all(day);
}

/* ----------------------------- subscriptions ---------------------------- */
// "The same basket every Saturday": the scheduler turns an active subscription
// into a real order on its weekday, then messages the customer.

export function listSubscriptions({ onlyActive = false } = {}) {
  const where = onlyActive ? 'WHERE s.active = 1' : '';
  return db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.phone, c.locale
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id ${where}
        ORDER BY s.weekday, s.id`,
    )
    .all();
}

export function subscriptionsFor(customerId) {
  return db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY id').all(customerId);
}

export function getSubscription(id) {
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
}

export function createSubscription({ customerId, weekday, items, slotId = null }) {
  const info = db
    .prepare('INSERT INTO subscriptions (customer_id, weekday, items, slot_id) VALUES (?, ?, ?, ?)')
    .run(customerId, weekday, JSON.stringify(items || []), slotId);
  return getSubscription(info.lastInsertRowid);
}

export function updateSubscription(id, fields) {
  const keys = ['weekday', 'items', 'slot_id', 'active', 'last_run_day'].filter((k) => fields[k] !== undefined);
  if (!keys.length) return getSubscription(id);
  db.prepare(`UPDATE subscriptions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
  return getSubscription(id);
}

export function deleteSubscription(id) {
  db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
}

/** Subscriptions due on `weekday` that have not produced an order today. */
export function subscriptionsDue(weekday, day) {
  return db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.phone, c.locale, c.blocked, c.neighborhood, c.address_note
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id
        WHERE s.active = 1 AND s.weekday = ? AND (s.last_run_day IS NULL OR s.last_run_day != ?)
          AND c.blocked = 0`,
    )
    .all(weekday, day);
}

/* ------------------------- inactive customers --------------------------- */

/** Customers who have not ordered for `days`, are reachable and still opted in. */
export function inactiveCustomers(days, { limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT c.* FROM customers c
        WHERE c.marketing_opt_out = 0 AND c.blocked = 0 AND c.orders_count > 0
          AND NOT EXISTS (
            SELECT 1 FROM orders o
             WHERE o.customer_id = c.id AND o.created_at >= datetime('now', ?)
          )
        ORDER BY c.total_spent DESC LIMIT ?`,
    )
    .all(`-${days} days`, limit);
}

/* ------------------------------- staff ---------------------------------- */

export function listStaff() {
  return db.prepare('SELECT * FROM staff ORDER BY role, username').all();
}

export function getStaff(id) {
  return db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
}

export function getStaffByUsername(username) {
  return db.prepare('SELECT * FROM staff WHERE username = ?').get(username);
}

export function createStaff(s) {
  const info = db
    .prepare('INSERT INTO staff (username, name, role, password_hash) VALUES (@username, @name, @role, @password_hash)')
    .run(s);
  return getStaff(info.lastInsertRowid);
}

export function updateStaff(id, fields) {
  const keys = ['username', 'name', 'role', 'password_hash', 'active'].filter((k) => fields[k] !== undefined);
  if (!keys.length) return getStaff(id);
  db.prepare(`UPDATE staff SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  return getStaff(id);
}

export function deleteStaff(id) {
  db.prepare('DELETE FROM staff WHERE id = ?').run(id);
}

export function touchStaffLogin(id) {
  db.prepare("UPDATE staff SET last_login_at = datetime('now') WHERE id = ?").run(id);
}

/* ---------------------------- rider position ---------------------------- */
// One live position per delivery day: the rider shares it from the route sheet,
// and the customer's tracking page reads it.

export function setRiderPosition(day, { latitude, longitude, accuracy = null }) {
  db.prepare(
    `INSERT INTO rider_positions (day, latitude, longitude, accuracy, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(day) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude,
       accuracy = excluded.accuracy, updated_at = datetime('now')`,
  ).run(day, latitude, longitude, accuracy);
}

export function getRiderPosition(day) {
  return db.prepare('SELECT * FROM rider_positions WHERE day = ?').get(day);
}

/* -------------------------- push subscriptions -------------------------- */

export function listPushSubscriptions() {
  return db.prepare('SELECT * FROM push_subscriptions').all();
}

export function savePushSubscription({ endpoint, p256dh, auth, actor }) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, actor) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, actor = excluded.actor`,
  ).run(endpoint, p256dh, auth, actor || null);
}

export function deletePushSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

/* ---------------------------- accounting -------------------------------- */
// The cash book: every money movement in one chronological list, so the figures
// can be handed to an accountant without re-keying anything.

export function cashBook(fromDay, toDay) {
  const income = db
    .prepare(
      `SELECT ${LOCAL_DAY} AS day, 'order' AS kind, reference AS ref, customer_name AS label,
              payment_method AS method, total AS amount, paid_at
         FROM orders
        WHERE status IN (${PAID_SQL}) AND ${LOCAL_DAY} BETWEEN ? AND ?`,
    )
    .all(fromDay, toDay);
  const spending = db
    .prepare(
      `SELECT day, 'expense' AS kind, CAST(id AS TEXT) AS ref, COALESCE(label, category) AS label,
              category AS method, -amount AS amount, created_at AS paid_at
         FROM expenses WHERE day BETWEEN ? AND ?`,
    )
    .all(fromDay, toDay);
  return [...income, ...spending].sort((a, b) => String(a.day).localeCompare(String(b.day)) || a.kind.localeCompare(b.kind));
}

/** Month-by-month totals, the shape an accountant actually asks for. */
export function monthlyLedger(fromDay, toDay) {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m', ${LOCAL_DAY}) AS month,
              COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN total ELSE 0 END), 0) AS momo,
              COALESCE(SUM(delivery_fee), 0) AS delivery,
              COALESCE(SUM(coupon_discount + discount), 0) AS discounts
         FROM orders WHERE status IN (${PAID_SQL}) AND ${LOCAL_DAY} BETWEEN ? AND ?
        GROUP BY month ORDER BY month`,
    )
    .all(fromDay, toDay);
  const costs = db
    .prepare("SELECT strftime('%Y-%m', day) AS month, COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE day BETWEEN ? AND ? GROUP BY month")
    .all(fromDay, toDay);
  const byMonth = new Map(costs.map((c) => [c.month, c.expenses]));
  return rows.map((r) => ({ ...r, expenses: byMonth.get(r.month) || 0, margin: r.revenue - (byMonth.get(r.month) || 0) }));
}
