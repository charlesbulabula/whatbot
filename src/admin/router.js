import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import { DEFAULT_LOCALE, normalizeLocale, t } from '../i18n/index.js';
import { changeOrderStatus, ORDER_STATUSES, storeProof } from '../bot/orders.js';
import { downloadMedia, send } from '../whatsapp/client.js';
import { inServiceWindow } from '../bot/notify.js';
import { text } from '../bot/messages.js';
import * as settings from '../shop/settings.js';
import { COUPON_KINDS, normalizeCode } from '../shop/coupons.js';
import { smtpConfigured, sendTestEmail } from '../mail.js';
import { adminDictionaries } from './i18n.js';
import { mountLiveUpdates } from './live.js';
import { parseTags } from './pages/customers.js';
import * as views from './views.js';
import { routeUrl, ordersForRoute, riderCards } from './route.js';

export const adminRouter = express.Router();

const PAGE_SIZE = 25;

/* -------------------------------- auth --------------------------------- */

const sameSecret = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Brute-force guard: after too many wrong passwords from one IP, refuse for a while.
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, since }

function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.since > FAILURE_WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= FAILURE_LIMIT;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.since > FAILURE_WINDOW_MS) failures.set(ip, { count: 1, since: Date.now() });
  else entry.count += 1;
  if (failures.size > 10_000) failures.clear(); // bounded memory under a distributed attack
}

adminRouter.use((req, res, next) => {
  if (!config.admin.password) return res.status(503).type('text/plain').send('Admin disabled: set ADMIN_PASSWORD in .env');
  if (tooManyFailures(req.ip)) {
    return res.status(429).set('Retry-After', String(FAILURE_WINDOW_MS / 1000)).send('Too many failed attempts, try again later');
  }
  const [scheme, encoded] = String(req.get('authorization') || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (sep > 0 && sameSecret(user, config.admin.user) && sameSecret(pass, config.admin.password)) {
      failures.delete(req.ip);
      res.locals.actor = user;
      return next();
    }
    recordFailure(req.ip);
    logger.warn(`Failed dashboard login from ${req.ip}`);
  }
  res.set('WWW-Authenticate', 'Basic realm="whatbot admin", charset="UTF-8"').status(401).send('Authentication required');
});

// Basic auth credentials are sent automatically by the browser, so reject
// cross-site form posts (CSRF) by checking where the request comes from.
adminRouter.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const source = req.get('origin') || req.get('referer');
  try {
    if (source && new URL(source).host === req.get('host')) return next();
  } catch {
    /* malformed header */
  }
  res.status(403).send('Cross-site request refused');
});

adminRouter.use(express.urlencoded({ extended: false, limit: '32kb' }));

/* ---------------------------- live updates ----------------------------- */

mountLiveUpdates(adminRouter);

/* --------------------------- language & theme --------------------------- */

const readCookie = (req, name) =>
  String(req.get('cookie') || '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1];

adminRouter.use((req, res, next) => {
  const locale = normalizeLocale(readCookie(req, 'admin_lang') || DEFAULT_LOCALE);
  res.locals.locale = locale;
  res.locals.L = adminDictionaries[locale] || adminDictionaries.fr;
  // No cookie means "follow the device", which the stylesheet handles on its own.
  const theme = readCookie(req, 'admin_theme');
  res.locals.theme = theme === 'dark' || theme === 'light' ? theme : '';
  next();
});

/** Where a header toggle should send the admin back to. */
function backToPage(req) {
  try {
    const referer = new URL(req.get('referer'));
    if (referer.host === req.get('host')) return safeBack(referer.pathname + referer.search, '/admin');
  } catch {
    /* no or malformed referer */
  }
  return '/admin';
}

adminRouter.get('/theme', (req, res) => {
  // With no cookie yet the page follows the device, and only the browser knows
  // which way that is: the header link passes it as ?to=, see ui.layout().
  const asked = req.query.to;
  const next = asked === 'light' || asked === 'dark' ? asked : res.locals.theme === 'dark' ? 'light' : 'dark';
  res.cookie('admin_theme', next, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 365 * 864e5, path: '/admin' });
  res.redirect(backToPage(req));
});

adminRouter.get('/lang', (req, res) => {
  const next = res.locals.locale === 'fr' ? 'en' : 'fr';
  res.cookie('admin_lang', next, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 365 * 864e5, path: '/admin' });
  res.redirect(backToPage(req));
});

// Basic Auth has no sign-out: answering 401 once makes the browser drop the
// cached credentials, which is the closest thing to logging out.
adminRouter.get('/logout', (req, res) => {
  const { L } = res.locals;
  res
    .set('WWW-Authenticate', 'Basic realm="whatbot admin", charset="UTF-8"')
    .status(401)
    .type('text/html')
    .send(`<!doctype html><meta charset="utf-8"><title>${views.esc(L.loggedOut)}</title>
<body style="font-family:system-ui;padding:2rem"><p>${views.esc(L.loggedOut)}</p>
<p><a href="/admin">${views.esc(L.backToDashboard)}</a></p>`);
});

/* ------------------------------- helpers ------------------------------- */

const localDay = (date = new Date()) => date.toLocaleDateString('en-CA'); // YYYY-MM-DD in server TZ
const shiftDay = (day, delta) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
};
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const safeBack = (back, fallback) => (typeof back === 'string' && back.startsWith('/admin') && !back.startsWith('//') ? back : fallback);
const withFlash = (url, flash) => `${url}${url.includes('?') ? '&' : '?'}flash=${encodeURIComponent(flash)}`;
const toInt = (v) => Math.max(0, Math.round(Number(v) || 0));
const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const pageOf = (v) => Math.max(0, Math.round(Number(v) || 0));

/** Records what the dashboard just changed, for /admin/audit. */
const log = (res, action, target, detail) => db.audit(res.locals.actor || 'admin', action, target, detail);

/* -------------------------------- search -------------------------------- */

adminRouter.get('/search', (req, res) => {
  const { L, locale } = res.locals;
  const query = str(req.query.q, 60);
  const results = query.length >= 2 ? db.globalSearch(query) : { orders: [], customers: [], coupons: [] };
  res.send(views.searchPage(L, locale, { query, results, theme: res.locals.theme }));
});

/* ------------------------------- dashboard ------------------------------ */

adminRouter.get('/', (req, res) => {
  const { L, locale } = res.locals;
  const today = localDay();
  const day = isDay(req.query.day) ? req.query.day : today;
  const orders = db.ordersForDay(day);
  const series = db.dailyRevenue(30);
  const newPerDayMap = db.newCustomersPerDay(30);
  const week = db.periodTotals(7, 0);
  const prevWeek = db.periodTotals(7, 7);
  const period = db.periodStats(7);
  const previousCustomers = Math.max(0, db.periodStats(14).newCustomers - period.newCustomers);

  const kpis = {
    orders: orders.filter((o) => o.status !== 'cancelled').length,
    revenueDay: db.revenueSince('+0 days'),
    revenueWeek: week.revenue,
    revenuePrevWeek: prevWeek.revenue,
    toCheck: orders.filter((o) => o.status === 'awaiting_payment' && (o.payment_proof || o.payment_method === 'cash')).length,
    cash: db.cashToCollect(day),
    newCustomers: period.newCustomers,
    newCustomersPrev: previousCustomers,
  };

  res.send(
    views.dashboardPage(L, locale, {
      day,
      prevDay: shiftDay(day, -1),
      nextDay: shiftDay(day, 1),
      isToday: day === today,
      orders,
      kpis,
      shopping: db.shoppingList(day),
      forecast: db.demandForecast(),
      handoffs: db.handoffConversations(),
      lowStock: db.lowStockProducts(),
      series,
      newPerDay: series.map((d) => newPerDayMap.get(d.day) || 0),
      statuses: db.statusBreakdown(30),
      byHour: db.ordersByHour(30).map((h) => ({ label: `${String(h.hour).padStart(2, '0')}h`, value: h.n })),
      topProducts: db.topProducts(30).slice(0, 6),
      flash: req.query.flash,
      theme: res.locals.theme,
    }),
  );
});

/* -------------------------------- orders -------------------------------- */

const orderFilters = (q) => ({
  q: str(q.q, 60),
  status: ORDER_STATUSES.includes(q.status) ? q.status : '',
  zone: str(q.zone, 40),
  payment: ['momo', 'cash'].includes(q.payment) ? q.payment : '',
  from: isDay(q.from) ? q.from : '',
  to: isDay(q.to) ? q.to : '',
  sort: ['date', 'total', 'status', 'customer'].includes(q.sort) ? q.sort : '',
  dir: q.dir === 'asc' ? 'asc' : '',
});

adminRouter.get('/orders', (req, res) => {
  const { L, locale } = res.locals;
  const filters = orderFilters(req.query);
  const page = pageOf(req.query.page);
  const { rows, total } = db.searchOrders({
    ...filters,
    sort: filters.sort || 'date',
    dir: filters.dir || 'desc',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  res.send(views.ordersPage(L, locale, {
    rows,
    total,
    filters: { ...filters, page: page || '' },
    zones: db.usedZones(),
    page,
    pageSize: PAGE_SIZE,
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

/** Order history as a timeline, built from the timestamps the order already carries. */
function orderTimeline(L, order) {
  const entries = [{ kind: 'created', title: L.timelineCreated, at: order.created_at, tone: 'primary' }];
  if (order.payment_proof) entries.push({ kind: 'proof', title: L.timelineProof, at: order.created_at, tone: 'info' });
  if (order.paid_at) entries.push({ kind: 'paid', title: L.timelinePaid, at: order.paid_at, tone: 'success' });
  if (order.eta) entries.push({ kind: 'on_the_way', title: L.timelineEta(order.eta), at: order.paid_at || order.created_at, tone: 'primary' });
  if (order.delivered_at) entries.push({ kind: 'delivered', title: L.timelineDelivered, at: order.delivered_at, tone: 'success' });
  if (order.status === 'cancelled') entries.push({ kind: 'cancelled', title: L.timelineCancelled, at: order.created_at, tone: 'danger' });
  if (order.rating) {
    entries.push({ kind: 'rating', title: `${L.rating} ${'⭐'.repeat(order.rating)}`, at: order.survey_sent_at || order.delivered_at, tone: 'warning' });
  }
  return entries.filter((e) => e.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

adminRouter.get('/orders/:id', (req, res) => {
  const { L, locale } = res.locals;
  const order = db.getOrder(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  res.send(views.orderPage(L, locale, {
    order,
    messages: db.messagesFor(order.customer.phone),
    timeline: orderTimeline(L, order),
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

adminRouter.post('/orders/:id/status', async (req, res) => {
  const { L } = res.locals;
  const status = String(req.body.status || '');
  const back = safeBack(req.body.back, '/admin');
  if (!ORDER_STATUSES.includes(status)) return res.status(400).send('Invalid status');
  try {
    const eta = str(req.body.eta, 40) || undefined;
    const result = await changeOrderStatus(Number(req.params.id), status, { eta });
    if (!result) return res.status(404).send('Not found');
    log(res, 'order.status', result.order.reference, status);
    res.redirect(withFlash(back, L.notified[result.notified] || L.saved));
  } catch (err) {
    logger.error('Status change failed:', err.stack || err.message);
    res.redirect(withFlash(back, err.message));
  }
});

// Only proofs attached to an order can be fetched, never arbitrary media ids.
adminRouter.get('/orders/:id/proof', async (req, res) => {
  const order = db.getOrder(Number(req.params.id));
  if (!order?.payment_proof) return res.status(404).send('No proof');
  try {
    const file = order.payment_proof_file || (await storeProof(order));
    if (file) return res.set('Cache-Control', 'private, max-age=86400').sendFile(file);
    const { contentType, buffer } = await downloadMedia(order.payment_proof);
    res.set('Content-Type', contentType || 'application/octet-stream').set('Cache-Control', 'private, max-age=3600').send(buffer);
  } catch (err) {
    logger.error('Proof download failed:', err.message);
    res.status(502).send(`Could not fetch the image from WhatsApp: ${err.message}`);
  }
});

/* -------------------------- printable documents ------------------------- */

/**
 * Invoice verification: the QR code carries a token derived from the order and
 * a server-side secret, so the public page can prove the paper matches the
 * database without exposing anything guessable.
 */
function invoiceSecret() {
  let value = db.getSetting('invoice_secret');
  if (!value) {
    value = crypto.randomBytes(32).toString('hex');
    db.setSetting('invoice_secret', value);
  }
  return value;
}

export function invoiceToken(order) {
  return crypto.createHmac('sha256', invoiceSecret()).update(`invoice:${order.id}:${order.reference}`).digest('hex').slice(0, 24);
}

export const invoiceUrl = (order) => `${config.publicUrl}/v/${encodeURIComponent(order.reference)}/${invoiceToken(order)}`;

adminRouter.get('/orders/:id/invoice', async (req, res) => {
  const { L, locale } = res.locals;
  const order = db.getOrder(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  const url = invoiceUrl(order);
  const qrSvg = await QRCode.toString(url, {
    type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { light: '#0000', dark: '#000000' },
  }).catch(() => '');
  res.send(views.invoicePage(L, locale, { order, shop: settings.get(), qrSvg, verifyUrl: url }));
});

adminRouter.get('/orders/:id/ticket', (req, res) => {
  const { L, locale } = res.locals;
  const order = db.getOrder(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  res.send(views.ticketPage(L, locale, { order, shop: settings.get() }));
});

adminRouter.get('/picklist', (req, res) => {
  const { L, locale } = res.locals;
  const day = isDay(req.query.day) ? req.query.day : localDay();
  res.send(views.picklistPage(L, locale, {
    day,
    shopping: db.shoppingList(day),
    orders: db.ordersForDay(day).filter((o) => o.status !== 'cancelled'),
    shop: settings.get(),
  }));
});

/* ------------------------------- products ------------------------------ */

const productFields = (b) => ({
  name_fr: str(b.name_fr, 40),
  name_en: str(b.name_en, 40),
  emoji: str(b.emoji, 8),
  price_small: toInt(b.price_small),
  price_medium: toInt(b.price_medium),
  price_large: toInt(b.price_large),
});

adminRouter.get('/products', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.productsPage(L, locale, {
    products: db.listProducts({ onlyInStock: false }),
    lowStock: db.lowStockProducts(),
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

adminRouter.post('/products', (req, res) => {
  const fields = productFields(req.body);
  if (!fields.name_fr || !fields.name_en) return res.status(400).send('Name required');
  const sortOrder = db.listProducts({ onlyInStock: false }).reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
  db.createProduct({ ...fields, sort_order: sortOrder });
  log(res, 'product.create', fields.name_fr);
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

adminRouter.post('/products/:id', (req, res) => {
  const fields = productFields(req.body);
  if (!fields.name_fr || !fields.name_en) return res.status(400).send('Name required');
  db.updateProduct(Number(req.params.id), {
    ...fields,
    sort_order: Math.round(Number(req.body.sort_order) || 0),
    stock_qty: req.body.stock_qty === '' ? null : toInt(req.body.stock_qty),
    stock_alert: toInt(req.body.stock_alert),
  });
  log(res, 'product.update', fields.name_fr);
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

adminRouter.post('/products/:id/stock', (req, res) => {
  const inStock = req.body.in_stock === '1' ? 1 : 0;
  db.updateProduct(Number(req.params.id), { in_stock: inStock });
  log(res, 'product.stock', String(req.params.id), inStock ? 'in' : 'out');
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

adminRouter.post('/products/:id/delete', (req, res) => {
  // A product that appears on past orders is only hidden: deleting it would
  // break their history. Only an unused product is actually removed.
  const id = Number(req.params.id);
  if (db.productIsUsed(id)) {
    db.updateProduct(id, { in_stock: 0 });
    log(res, 'product.hide', String(id));
    return res.redirect(withFlash('/admin/products', res.locals.L.productHidden));
  }
  db.deleteProduct(id);
  log(res, 'product.delete', String(id));
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

/* --------------------------- delivery zones ---------------------------- */

const zoneFields = (b) => ({
  name: str(b.name, 40),
  fee: toInt(b.fee),
  active: b.active === '1' ? 1 : 0,
  sort_order: Math.round(Number(b.sort_order) || 0),
});

adminRouter.get('/zones', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.zonesPage(L, locale, { zones: db.listZones(), flash: req.query.flash, theme: res.locals.theme }));
});

adminRouter.post('/zones', (req, res) => {
  const fields = zoneFields(req.body);
  if (!fields.name) return res.status(400).send('Name required');
  if (db.findZoneByName(fields.name)) return res.redirect(withFlash('/admin/zones', res.locals.L.zoneExists));
  const sortOrder = db.listZones().reduce((max, z) => Math.max(max, z.sort_order), 0) + 1;
  db.createZone({ ...fields, active: 1, sort_order: sortOrder });
  log(res, 'zone.create', fields.name);
  res.redirect(withFlash('/admin/zones', res.locals.L.saved));
});

adminRouter.post('/zones/:id', (req, res) => {
  const fields = zoneFields(req.body);
  if (!fields.name) return res.status(400).send('Name required');
  const clash = db.findZoneByName(fields.name);
  if (clash && clash.id !== Number(req.params.id)) return res.redirect(withFlash('/admin/zones', res.locals.L.zoneExists));
  db.updateZone(Number(req.params.id), fields);
  log(res, 'zone.update', fields.name, String(fields.fee));
  res.redirect(withFlash('/admin/zones', res.locals.L.saved));
});

adminRouter.post('/zones/:id/delete', (req, res) => {
  db.deleteZone(Number(req.params.id));
  log(res, 'zone.delete', String(req.params.id));
  res.redirect(withFlash('/admin/zones', res.locals.L.saved));
});

/* ------------------------------- coupons ------------------------------- */

const couponFields = (b) => ({
  code: normalizeCode(b.code),
  kind: COUPON_KINDS.includes(b.kind) ? b.kind : 'amount',
  value: toInt(b.value),
  min_subtotal: toInt(b.min_subtotal),
  max_uses: toInt(b.max_uses),
  once_per_customer: b.once_per_customer === '1' ? 1 : 0,
  expires_on: isDay(b.expires_on) ? b.expires_on : null,
  active: b.active === '1' ? 1 : 0,
});

adminRouter.get('/coupons', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.couponsPage(L, locale, { coupons: db.listCoupons(), flash: req.query.flash, theme: res.locals.theme }));
});

adminRouter.post('/coupons', (req, res) => {
  const fields = couponFields(req.body);
  if (!fields.code) return res.status(400).send('Code required');
  if (db.getCouponByCode(fields.code)) return res.redirect(withFlash('/admin/coupons', res.locals.L.couponExists));
  db.createCoupon({ ...fields, active: 1 });
  log(res, 'coupon.create', fields.code);
  res.redirect(withFlash('/admin/coupons', res.locals.L.saved));
});

adminRouter.post('/coupons/:id', (req, res) => {
  const { code, ...fields } = couponFields(req.body); // the code itself is never renamed
  db.updateCoupon(Number(req.params.id), fields);
  log(res, 'coupon.update', String(req.params.id));
  res.redirect(withFlash('/admin/coupons', res.locals.L.saved));
});

adminRouter.post('/coupons/:id/delete', (req, res) => {
  db.deleteCoupon(Number(req.params.id));
  log(res, 'coupon.delete', String(req.params.id));
  res.redirect(withFlash('/admin/coupons', res.locals.L.saved));
});

/* ------------------------------- customers ----------------------------- */

const customerFilters = (q) => ({
  q: str(q.q, 60),
  segment: ['new', 'regular', 'vip'].includes(q.segment) ? q.segment : '',
  zone: str(q.zone, 40),
  flag: ['credit', 'waitlist', 'blocked', 'optout', 'referred'].includes(q.flag) ? q.flag : '',
  sort: ['orders', 'spent', 'recent', 'created', 'name', 'credit'].includes(q.sort) ? q.sort : '',
  dir: q.dir === 'asc' ? 'asc' : '',
});

adminRouter.get('/customers', (req, res) => {
  const { L, locale } = res.locals;
  const filters = customerFilters(req.query);
  const page = pageOf(req.query.page);
  const { rows, total } = db.searchCustomersPaged({
    ...filters,
    sort: filters.sort || 'orders',
    dir: filters.dir || 'desc',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const segments = db.segmentCounts();
  res.send(views.customersPage(L, locale, {
    rows,
    total,
    filters: { ...filters, page: page || '' },
    zones: db.usedZones(),
    page,
    pageSize: PAGE_SIZE,
    stats: {
      total: segments.reduce((s, g) => s + g.n, 0),
      vip: segments.find((g) => g.segment === 'vip')?.n || 0,
      credit: db.creditTotals().outstanding,
      referred: db.referralTotals().invited || 0,
    },
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

/** Everything that happened with this customer, newest first. */
function customerTimeline(L, customer, orders, credits, notes) {
  const entries = [{ kind: 'created', title: L.timelineJoined, at: customer.created_at, tone: 'primary' }];
  for (const o of orders.slice(0, 20)) {
    entries.push({
      kind: o.status === 'delivered' ? 'delivered' : 'created',
      html: `${views.esc(L.timelineOrder)} <a href="/admin/orders/${o.id}">${views.esc(o.reference)}</a>`,
      title: `${L.timelineOrder} ${o.reference}`,
      at: o.created_at,
      detail: L.status[o.status] || o.status,
      tone: o.status === 'cancelled' ? 'danger' : o.status === 'delivered' ? 'success' : 'info',
    });
  }
  for (const c of credits.slice(0, 10)) {
    entries.push({
      kind: 'rating',
      title: `${L.creditReasons[c.reason] || c.reason} ${c.amount >= 0 ? '+' : '−'}${Math.abs(c.amount)}`,
      at: c.created_at,
      tone: c.amount >= 0 ? 'success' : 'gray',
    });
  }
  for (const n of notes.slice(0, 10)) {
    entries.push({ kind: 'survey', title: n.body.slice(0, 120), at: n.created_at, tone: 'gray' });
  }
  return entries.filter((e) => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
}

adminRouter.get('/customers/:id', (req, res) => {
  const { L, locale } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const tab = ['overview', 'orders', 'chat', 'loyalty', 'notes'].includes(req.query.tab) ? req.query.tab : 'overview';
  const orders = db.ordersForCustomer(customer.id, 100);
  const paid = orders.filter((o) => o.paid_at);
  const ratings = orders.filter((o) => o.rating);
  const credits = db.creditHistory(customer.id);
  const notes = db.notesFor(customer.id);
  res.send(views.customerPage(L, locale, {
    customer,
    tab,
    orders,
    messages: db.messagesFor(customer.phone),
    state: db.getConversation(customer.phone).state,
    canReply: inServiceWindow(customer),
    timeline: customerTimeline(L, customer, orders, credits, notes),
    credits,
    notes,
    invited: db.referredBy(customer.id),
    referrer: customer.referred_by ? db.getCustomerById(customer.referred_by) : null,
    stats: {
      basket: paid.length ? Math.round(paid.reduce((s, o) => s + o.total, 0) / paid.length) : 0,
      rating: ratings.length ? ratings.reduce((s, o) => s + o.rating, 0) / ratings.length : 0,
    },
    flash: req.query.flash,
    flashTone: req.query.tone === 'danger' ? 'danger' : '',
    theme: res.locals.theme,
  }));
});

adminRouter.post('/customers/:id/reply', async (req, res) => {
  const { L } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const back = `/admin/customers/${customer.id}?tab=chat`;
  const body = str(req.body.body, 4000);
  if (!body) return res.redirect(back);
  if (!inServiceWindow(customer)) return res.redirect(withFlash(back, L.windowClosed));
  try {
    await send(text(customer.phone, body));
    log(res, 'customer.reply', customer.phone);
    res.redirect(withFlash(back, L.messageSent));
  } catch (err) {
    logger.error('Admin reply failed:', err.message);
    res.redirect(withFlash(back, `${L.messageFailed}: ${err.message}`));
  }
});

adminRouter.post('/customers/:id/takeover', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  db.setConversationState(customer.phone, 'HUMAN', {});
  log(res, 'customer.takeover', customer.phone);
  res.redirect(withFlash(`/admin/customers/${customer.id}?tab=chat`, res.locals.L.tookOver));
});

adminRouter.post('/customers/:id/release', async (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  db.setConversationState(customer.phone, 'DONE', {});
  if (inServiceWindow(customer)) {
    await send(text(customer.phone, t(normalizeLocale(customer.locale), 'handoffEnded'))).catch((err) =>
      logger.error('Hand-back message failed:', err.message),
    );
  }
  log(res, 'customer.release', customer.phone);
  res.redirect(withFlash(`/admin/customers/${customer.id}?tab=chat`, res.locals.L.released));
});

adminRouter.post('/customers/:id/credit', (req, res) => {
  const { L } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const back = `/admin/customers/${customer.id}?tab=loyalty`;
  const amount = Math.round(Number(req.body.amount) || 0);
  if (!amount) return res.redirect(withFlash(back, L.creditNeedsAmount));
  // A manual adjustment can never push the balance below zero.
  const applied = Math.max(amount, -customer.credit);
  if (!applied) return res.redirect(`${withFlash(back, L.creditWouldGoNegative)}&tone=danger`);
  db.recordCredit(customer.id, applied, { reason: 'manual', detail: str(req.body.detail, 80), author: res.locals.actor });
  log(res, 'customer.credit', customer.phone, String(applied));
  res.redirect(withFlash(back, L.saved));
});

adminRouter.post('/customers/:id/notes', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const body = str(req.body.body, 1000);
  if (body) {
    db.addNote(customer.id, body, res.locals.actor);
    log(res, 'customer.note', customer.phone);
  }
  res.redirect(withFlash(`/admin/customers/${customer.id}?tab=notes`, res.locals.L.saved));
});

adminRouter.post('/customers/:id/notes/:noteId/delete', (req, res) => {
  db.deleteNote(Number(req.params.noteId));
  res.redirect(withFlash(`/admin/customers/${Number(req.params.id)}?tab=notes`, res.locals.L.saved));
});

adminRouter.post('/customers/:id/tags', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const tags = parseTags(req.body.tags).join(', ');
  db.updateCustomer(customer.id, { tags });
  log(res, 'customer.tags', customer.phone, tags);
  res.redirect(withFlash(`/admin/customers/${customer.id}?tab=notes`, res.locals.L.saved));
});

adminRouter.post('/customers/:id/block', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const blocked = req.body.blocked === '1' ? 1 : 0;
  db.updateCustomer(customer.id, { blocked });
  log(res, blocked ? 'customer.block' : 'customer.unblock', customer.phone);
  res.redirect(withFlash(`/admin/customers/${customer.id}`, blocked ? res.locals.L.blocked : res.locals.L.unblocked));
});

// Media a customer sent (photo, voice note, document), looked up by message id only.
adminRouter.get('/messages/:id/media', async (req, res) => {
  const message = db.getMessage(Number(req.params.id));
  if (!message?.media_id) return res.status(404).send('No media');
  try {
    const { contentType, buffer } = await downloadMedia(message.media_id);
    res.set('Content-Type', contentType || 'application/octet-stream').set('Cache-Control', 'private, max-age=3600').send(buffer);
  } catch (err) {
    logger.error('Media download failed:', err.message);
    res.status(502).send(`Could not fetch the file from WhatsApp: ${err.message}`);
  }
});

/* --------------------------- loyalty & referrals ------------------------ */

adminRouter.get('/loyalty', (req, res) => {
  const { L, locale } = res.locals;
  const tab = req.query.tab === 'referrals' ? 'referrals' : 'balances';
  const shop = settings.get();
  res.send(views.loyaltyPage(L, locale, {
    tab,
    totals: db.creditTotals(),
    holders: db.searchCustomersPaged({ flag: 'credit', sort: 'credit', dir: 'desc', limit: 50 }).rows,
    entries: db.recentCreditEntries(40),
    referral: db.referralTotals(),
    referrers: db.topReferrers(20),
    rules: { every: shop.loyaltyEvery, reward: shop.loyaltyReward, referralReward: shop.referralReward },
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

/* ------------------------------- expenses ------------------------------- */

adminRouter.get('/expenses', (req, res) => {
  const { L, locale } = res.locals;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const to = localDay();
  const from = shiftDay(to, -(days - 1));
  res.send(views.expensesPage(L, locale, {
    days,
    from,
    to,
    rows: db.listExpenses(from, to),
    total: db.expenseTotal(from, to),
    revenue: db.periodStats(days).revenue,
    byCategory: db.expensesByCategory(from, to),
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

adminRouter.post('/expenses', (req, res) => {
  const day = isDay(req.body.day) ? req.body.day : localDay();
  const category = ['stock', 'transport', 'salaire', 'autre'].includes(req.body.category) ? req.body.category : 'autre';
  const amount = toInt(req.body.amount);
  db.createExpense({ day, category, label: str(req.body.label, 80), amount });
  log(res, 'expense.create', category, String(amount));
  res.redirect(withFlash('/admin/expenses', res.locals.L.saved));
});

adminRouter.post('/expenses/:id/delete', (req, res) => {
  db.deleteExpense(Number(req.params.id));
  log(res, 'expense.delete', String(req.params.id));
  res.redirect(withFlash('/admin/expenses', res.locals.L.saved));
});

/* ------------------------------- audit log ------------------------------ */

adminRouter.get('/audit', (req, res) => {
  const { L, locale } = res.locals;
  const page = pageOf(req.query.page);
  const size = PAGE_SIZE * 2;
  res.send(views.auditPage(L, locale, {
    rows: db.auditLog({ limit: size, offset: page * size }),
    total: db.auditCount(),
    page,
    pageSize: size,
    theme: res.locals.theme,
  }));
});

/* ------------------------------- broadcast ------------------------------ */

/** Who a broadcast can go to. Opted-out and blocked customers are never included. */
function audienceGroups(L) {
  const all = db.searchCustomersPaged({ limit: 5000 }).rows.filter((c) => !c.marketing_opt_out && !c.blocked);
  const open = all.filter((c) => inServiceWindow(c));
  const pick = (fn) => open.filter(fn);
  return [
    { key: 'window', label: L.audienceWindow, hint: L.audienceWindowHint, list: open },
    { key: 'regulars', label: L.audienceRegulars, hint: L.audienceRegularsHint, list: pick((c) => c.orders_count >= 2) },
    { key: 'vip', label: L.audienceVip, hint: L.audienceVipHint, list: pick((c) => c.segment === 'vip') },
    { key: 'waitlist', label: L.audienceWaitlist, hint: L.audienceWaitlistHint, list: pick((c) => c.waitlist_since) },
  ].map((g) => ({ ...g, count: g.list.length }));
}

adminRouter.get('/broadcast', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.broadcastPage(L, locale, {
    audiences: audienceGroups(L).map(({ list, ...rest }) => rest),
    lastResult: req.query.sent !== undefined
      ? { sent: Number(req.query.sent) || 0, skipped: Number(req.query.skipped) || 0, failed: Number(req.query.failed) || 0 }
      : null,
    flash: req.query.flash,
    theme: res.locals.theme,
  }));
});

adminRouter.post('/broadcast', async (req, res) => {
  const { L } = res.locals;
  const body = str(req.body.body, 900);
  const group = audienceGroups(L).find((a) => a.key === req.body.audience);
  if (!body || !group) return res.redirect(withFlash('/admin/broadcast', L.broadcastNeedsBody));

  let sent = 0;
  let failed = 0;
  for (const customer of group.list) {
    try {
      await send(text(customer.phone, body));
      sent += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`Broadcast to ${customer.phone} failed: ${err.message}`);
    }
  }
  log(res, 'broadcast.send', group.key, `${sent}/${group.list.length}`);
  res.redirect(`/admin/broadcast?sent=${sent}&skipped=0&failed=${failed}`);
});

/* ------------------------------- settings ------------------------------- */

const SETTINGS_TABS = ['shop', 'hours', 'payment', 'alerts', 'loyalty', 'system'];

function systemInfo() {
  let dbSize = '—';
  try {
    if (config.dbPath !== ':memory:') dbSize = `${(fs.statSync(config.dbPath).size / 1e6).toFixed(1)} MB`;
  } catch {
    /* database not on disk yet */
  }
  const up = Math.round(process.uptime());
  return {
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    uptime: up > 86400 ? `${Math.floor(up / 86400)} j` : up > 3600 ? `${Math.floor(up / 3600)} h` : `${Math.floor(up / 60)} min`,
    dbSize,
    publicUrl: config.publicUrl || '—',
    tz: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    waReady: Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId),
    aiReady: Boolean(config.ai.apiKey),
  };
}

adminRouter.get('/settings', (req, res) => {
  const { L, locale } = res.locals;
  const tab = SETTINGS_TABS.includes(req.query.tab) ? req.query.tab : 'shop';
  res.send(views.settingsPage(L, locale, {
    shop: settings.get(),
    smtpReady: smtpConfigured(),
    tab,
    system: tab === 'system' ? systemInfo() : {},
    flash: req.query.flash,
    flashTone: req.query.tone === 'danger' ? 'danger' : '',
    theme: res.locals.theme,
  }));
});

adminRouter.post('/settings', (req, res) => {
  const b = req.body;
  const tab = SETTINGS_TABS.includes(b.tab) ? b.tab : 'shop';
  const patch = {};

  if (tab === 'shop') {
    Object.assign(patch, {
      name: b.name,
      minOrder: toInt(b.minOrder),
      defaultDeliveryFee: toInt(b.defaultDeliveryFee),
      weeklyCapacity: toInt(b.weeklyCapacity),
      closed: b.closed === '1',
      closedNote: b.closedNote,
    });
  }
  if (tab === 'hours') {
    const hours = {};
    for (const d of settings.WEEKDAYS) {
      hours[d] = b[`open_${d}`] === '1' ? { open: String(b[`from_${d}`] || ''), close: String(b[`to_${d}`] || '') } : null;
    }
    patch.hours = hours;
  }
  if (tab === 'payment') {
    Object.assign(patch, {
      momoEnabled: b.momoEnabled === '1',
      momoOrange: b.momoOrange,
      momoAirtel: b.momoAirtel,
      momoHolder: b.momoHolder,
      cashEnabled: b.cashEnabled === '1',
    });
  }
  if (tab === 'alerts') {
    Object.assign(patch, {
      adminNotifyNumber: b.adminNotifyNumber,
      alertEmail: b.alertEmail,
      emailAlerts: b.emailAlerts === '1',
      dailyReport: b.dailyReport === '1',
    });
  }
  if (tab === 'loyalty') {
    Object.assign(patch, {
      loyaltyEvery: toInt(b.loyaltyEvery),
      loyaltyReward: toInt(b.loyaltyReward),
      referralReward: toInt(b.referralReward),
    });
  }

  settings.save(patch);
  log(res, 'settings.save', tab);
  res.redirect(withFlash(`/admin/settings?tab=${tab}`, res.locals.L.saved));
});

adminRouter.post('/settings/test-email', async (req, res) => {
  const { L } = res.locals;
  const result = await sendTestEmail();
  const flash = result.ok ? L.testEmailSent(result.to) : `${L.testEmailFailed} ${result.error}`;
  res.redirect(`${withFlash('/admin/settings?tab=alerts', flash)}${result.ok ? '' : '&tone=danger'}`);
});

/** A copy of the database, consistent even while the bot is running. */
adminRouter.get('/backup', (req, res) => {
  if (config.dbPath === ':memory:') return res.status(404).send('No file database');
  const name = `whatbot-${localDay()}.db`;
  const tmp = path.join(path.dirname(config.dbPath), `.backup-${Date.now()}.db`);
  try {
    db.db.prepare('VACUUM INTO ?').run(tmp); // a checkpointed, self-contained snapshot
    log(res, 'backup.download', name);
    res.download(tmp, name, () => fs.rm(tmp, { force: true }, () => {}));
  } catch (err) {
    logger.error('Backup failed:', err.message);
    fs.rm(tmp, { force: true }, () => {});
    res.status(500).send('Backup failed');
  }
});

/* ---------------------------- rider route sheet ------------------------ */

adminRouter.get('/route', (req, res) => {
  const { L } = res.locals;
  const day = isDay(req.query.day) ? req.query.day : localDay();
  const url = routeUrl(day);
  const { pending } = ordersForRoute(day);
  const shareText = `${L.route.shareText} ${day} (${pending.length}) : ${url}`;
  const body = `<p><a href="/admin?day=${day}">${views.esc(L.back)}</a></p>
<div class="card"><div class="card__body">
<p>${views.esc(L.route.share)}</p>
<p><code style="word-break:break-all">${views.esc(url)}</code></p>
<div class="actions"><a class="btn btn--primary" href="https://wa.me/?text=${encodeURIComponent(shareText)}"
target="_blank" rel="noopener noreferrer">${views.esc(L.route.sendWhatsApp)}</a></div></div></div>
<section class="section"><div class="section__title"><h2>${views.esc(L.route.toDeliver)} (${pending.length})</h2></div>
${pending.length ? `<div class="grid">${riderCards(L, pending)}</div>` : `<div class="card"><div class="card__body"><p class="muted">${views.esc(L.route.empty)}</p></div></div>`}</section>`;
  res.send(views.layout(L, { title: `${L.route.title} — ${day}`, active: 'route', body, theme: res.locals.theme }));
});

/* --------------------------------- stats ------------------------------- */

adminRouter.get('/stats', (req, res) => {
  const { L, locale } = res.locals;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const series = db.dailyRevenue(days);
  const newPerDayMap = db.newCustomersPerDay(days);
  const to = localDay();
  const from = shiftDay(to, -(days - 1));
  res.send(
    views.statsPage(L, locale, {
      days,
      series,
      stats: db.periodStats(days),
      previous: db.periodTotals(days, days),
      products: db.topProducts(days),
      zones: db.zoneStats(days),
      segments: db.segmentCounts(),
      payments: db.paymentMethodStats(days),
      coupons: db.couponStats(days),
      statuses: db.statusBreakdown(days),
      byHour: db.ordersByHour(days).map((h) => ({ label: `${String(h.hour).padStart(2, '0')}h`, value: h.n })),
      newPerDay: series.map((d) => newPerDayMap.get(d.day) || 0),
      expenses: db.expenseTotal(from, to),
      theme: res.locals.theme,
    }),
  );
});

/* -------------------------------- exports ------------------------------- */

// Semicolon-separated with a BOM so Excel (French locale) opens it directly.
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvBody = (header, rows) => `﻿${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;

adminRouter.get('/export.csv', (req, res) => {
  const { L, locale } = res.locals;
  const filters = orderFilters(req.query);
  const to = filters.to || localDay();
  const from = filters.from || shiftDay(to, -29);
  const { rows } = db.searchOrders({ ...filters, from, to, limit: 5000, offset: 0 });
  const header = ['reference', 'date', 'status', 'payment', 'customer', 'phone', 'area', 'address', 'items',
    'subtotal', 'delivery_fee', 'coupon', 'coupon_discount', 'credit_used', 'total', 'paid_at', 'delivered_at', 'rating'];
  const data = rows.map((o) => [
    o.reference,
    new Date(`${o.created_at.replace(' ', 'T')}Z`).toLocaleString('sv-SE'),
    o.status,
    o.payment_method,
    o.customer_name,
    `+${o.customer.phone}`,
    o.neighborhood,
    o.address_note,
    o.items.map((it) => `${locale === 'en' ? it.name_en : it.name_fr} ${L.sizes[it.size]} x${it.quantity}`).join(', '),
    o.subtotal, o.delivery_fee, o.coupon, o.coupon_discount, o.discount, o.total,
    o.paid_at, o.delivered_at, o.rating,
  ]);
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="commandes-${from}-${to}.csv"`)
    .send(csvBody(header, data));
});

adminRouter.get('/customers.csv', (req, res) => {
  const filters = customerFilters(req.query);
  const { rows } = db.searchCustomersPaged({ ...filters, limit: 5000, offset: 0 });
  const header = ['name', 'phone', 'area', 'segment', 'orders', 'spent', 'credit', 'referral_code', 'tags',
    'opted_out', 'blocked', 'created_at', 'last_seen_at'];
  const data = rows.map((c) => [
    c.name, `+${c.phone}`, c.neighborhood, c.segment, c.orders_count, c.total_spent, c.credit,
    c.referral_code, c.tags, c.marketing_opt_out, c.blocked, c.created_at, c.last_seen_at,
  ]);
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="clients-${localDay()}.csv"`)
    .send(csvBody(header, data));
});
