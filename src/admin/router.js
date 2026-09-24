import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import { sendError } from '../errors.js';
import { DEFAULT_LOCALE, normalizeLocale, t } from '../i18n/index.js';
import { changeOrderStatus, ORDER_STATUSES, storeProof } from '../bot/orders.js';
import { downloadMedia, send } from '../whatsapp/client.js';
import { inServiceWindow } from '../bot/notify.js';
import { winbackOne } from '../jobs/scheduler.js';
import { text } from '../bot/messages.js';
import * as settings from '../shop/settings.js';
import { COUPON_KINDS, normalizeCode } from '../shop/coupons.js';
import { smtpConfigured, sendTestEmail } from '../mail.js';
import { tokenHealth, resetTokenHealth } from '../whatsapp/health.js';
import {
  setOverrideToken, clearOverrideToken, tokenFingerprint, exchangeForLongLived,
} from '../whatsapp/token.js';
import * as staff from '../shop/staff.js';
import * as session from './session.js';
import { vapid, push } from '../pwa.js';
import * as waCatalog from '../shop/wa-catalog.js';
import multer from 'multer';
import { mediaDir, deleteMedia, TYPES } from '../media.js';
import { adminDictionaries } from './i18n.js';
import { mountLiveUpdates } from './live.js';
import { parseTags } from './pages/customers.js';
import * as views from './views.js';
import { routeUrl, ordersForRoute, riderCards } from './route.js';

export const adminRouter = express.Router();

const PAGE_SIZE = 25;

/* -------------------------------- auth --------------------------------- */

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

/* ------------------------------- sign in -------------------------------- */

const loginBody = express.urlencoded({ extended: false, limit: '4kb' });

const NEXT_COOKIE = 'admin_next';

adminRouter.get('/login', (req, res) => {
  const flash = takeFlash(req, res);
  const back = readCookie(req, NEXT_COOKIE);
  res.type('html').send(views.loginPage(res.locals.L, {
    theme: res.locals.theme,
    // res.cookie() already percent-encodes, so decode exactly once.
    next: safeBack(back && decodeURIComponent(back), ''),
    bye: !!flash.message,
    // Never redirect away from this page. The gate and this route both decide
    // who you are; the day they disagree, a redirect here becomes an endless
    // loop in the browser. A link cannot loop.
    signedIn: !!currentAccount(req),
  }));
});

adminRouter.post('/login', loginBody, (req, res) => {
  const { L } = res.locals;
  // The sign-in form is the one POST the CSRF check below cannot see, since it
  // runs after the auth gate. Same rule, applied here.
  const source = req.get('origin') || req.get('referer');
  if (source) {
    try {
      if (new URL(source).host !== req.get('host')) return res.status(403).type('text/plain').send('Cross-site request refused');
    } catch {
      return res.status(403).type('text/plain').send('Cross-site request refused');
    }
  }
  if (tooManyFailures(req.ip)) {
    return res.status(429).type('html').send(views.loginPage(L, { theme: res.locals.theme, error: L.loginThrottled }));
  }
  const account = staff.authenticate(req.body?.username, req.body?.password);
  if (!account) {
    recordFailure(req.ip);
    logger.warn(`Failed dashboard login from ${req.ip}`);
    return res.status(401).type('html').send(
      views.loginPage(L, {
        theme: res.locals.theme,
        error: L.loginFailed,
        username: req.body?.username,
        next: safeBack(req.body?.next, ''),
      }),
    );
  }
  failures.delete(req.ip);
  session.issue(res, account.username, { remember: !!req.body?.remember, secure: req.secure });
  res.clearCookie(NEXT_COOKIE, { path: '/admin' });
  res.redirect(safeBack(req.body?.next, '/admin'));
});

/** The account behind this request: a session cookie, or Basic credentials. */
function currentAccount(req) {
  const named = session.read(req);
  if (named) {
    const account = staff.accountFor(named);
    if (account) return account;
  }
  const [scheme, encoded] = String(req.get('authorization') || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  return sep > 0 ? staff.authenticate(decoded.slice(0, sep), decoded.slice(sep + 1)) : null;
}

adminRouter.use((req, res, next) => {
  if (!config.admin.password) return res.status(503).type('text/plain').send('Admin disabled: set ADMIN_PASSWORD in .env');
  if (tooManyFailures(req.ip)) {
    return res.status(429).set('Retry-After', String(FAILURE_WINDOW_MS / 1000)).send('Too many failed attempts, try again later');
  }
  const account = currentAccount(req);
  if (account) {
    failures.delete(req.ip);
    res.locals.actor = account.username;
    res.locals.account = account;
    return next();
  }
  if (req.get('authorization')) {
    recordFailure(req.ip);
    logger.warn(`Failed dashboard login from ${req.ip}`);
  }
  // A person gets the sign-in page; a script keeps the 401 it knows how to handle.
  // Where they were headed rides in a cookie, so the URL stays plain.
  if (req.method === 'GET' && (req.get('accept') || '').includes('text/html')) {
    res.cookie(NEXT_COOKIE, req.originalUrl || '/admin', {
      httpOnly: true, sameSite: 'lax', secure: !!req.secure, path: '/admin',
    });
    return res.redirect('/admin/login');
  }
  res.status(401).type('text/plain').send('Authentication required');
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



/** Which area of the dashboard a path belongs to, for the role check. */
function areaOf(path) {
  if (path.startsWith('/products') || path.startsWith('/zones') || path.startsWith('/coupons')
    || path.startsWith('/variants') || path.startsWith('/extras') || path.startsWith('/slots')) return 'catalogue';
  if (path.startsWith('/customers') || path.startsWith('/loyalty') || path.startsWith('/subscriptions')) return 'customers';
  if (path.startsWith('/broadcast')) return 'marketing';
  if (path.startsWith('/expenses') || path.startsWith('/stats') || path.startsWith('/accounting')) return 'money';
  if (path.startsWith('/settings') || path.startsWith('/staff') || path.startsWith('/backup')) return 'settings';
  if (path.startsWith('/audit')) return 'audit';
  return 'orders';
}

adminRouter.use((req, res, next) => {
  const role = res.locals.account?.role || 'owner';
  res.locals.role = role;
  res.locals.can = (area) => staff.can(role, area);
  // Always allowed: the language and theme toggles, the event stream, signing out.
  if (['/lang', '/theme', '/events', '/logout'].includes(req.path)) return next();
  if (staff.can(role, areaOf(req.path))) return next();
  sendError(req, res, 403);
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

adminRouter.get('/logout', (req, res) => {
  session.clear(res);
  res.clearCookie(NEXT_COOKIE, { path: '/admin' });
  redirectWith(res, '/admin/login', res.locals.L.loggedOut);
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
const FLASH_COOKIE = 'admin_flash';

/** One-shot confirmation, carried by a cookie so it never appears in the URL. */
function redirectWith(res, url, message, tone = '') {
  if (message) {
    res.cookie(FLASH_COOKIE, JSON.stringify({ m: String(message).slice(0, 300), t: tone }), {
      httpOnly: true, sameSite: 'lax', secure: !!res.req?.secure, path: '/admin',
    });
  }
  res.redirect(url);
}

/** Reads the flash and burns it, so a refresh never shows it twice. */
function takeFlash(req, res) {
  if (res.locals.flashRead) return res.locals.flashRead;
  const raw = readCookie(req, FLASH_COOKIE);
  let value = { message: '', tone: '' };
  if (raw) {
    res.clearCookie(FLASH_COOKIE, { path: '/admin' });
    try {
      const { m, t } = JSON.parse(decodeURIComponent(raw));
      value = { message: String(m || '').slice(0, 300), tone: t === 'danger' ? 'danger' : '' };
    } catch {
      /* someone hand-edited the cookie */
    }
  }
  res.locals.flashRead = value;
  return value;
}
const toInt = (v) => Math.max(0, Math.round(Number(v) || 0));
const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const pageOf = (v) => Math.max(0, Math.round(Number(v) || 0));

// Refreshed out of band: a page render never blocks on a Graph API call.
let lastHealth = null;
adminRouter.use((req, res, next) => {
  res.locals.waHealth = lastHealth;
  tokenHealth().then((h) => {
    lastHealth = h;
  }).catch(() => {});
  next();
});

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
      flash: takeFlash(req, res).message,
      theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
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
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
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
  if (!order) return sendError(req, res, 404);
  res.send(views.orderPage(L, locale, {
    order,
    messages: db.messagesFor(order.customer.phone),
    timeline: orderTimeline(L, order),
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

/**
 * Takes the same order again, for a customer who asks for "the usual" by phone.
 * Prices are today's, not the old ones; anything no longer sold is dropped and
 * named, because a silently shorter order is worse than none.
 */
adminRouter.post('/orders/:id/duplicate', (req, res) => {
  const { L, locale } = res.locals;
  const old = db.getOrder(Number(req.params.id));
  if (!old) return sendError(req, res, 404);

  const dropped = [];
  const items = [];
  for (const line of old.items) {
    const product = db.getProduct(line.product_id);
    const price = product && product.in_stock ? product[`price_${line.size}`] : null;
    if (!price) {
      dropped.push(locale === 'en' ? line.name_en : line.name_fr);
      continue;
    }
    items.push({
      productId: line.product_id,
      size: line.size,
      variantLabel: line.variant_label,
      extras: line.extras ? JSON.parse(line.extras) : [],
      quantity: line.quantity,
      unitPrice: price,
    });
  }
  if (!items.length) return redirectWith(res, `/admin/orders/${old.id}`, L.duplicateNothingLeft, 'danger');

  const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const deliveryFee = old.delivery_fee;
  const order = db.createOrder({
    customer: old.customer,
    items,
    subtotal,
    deliveryFee,
    discount: 0,
    total: subtotal + deliveryFee,
    paymentMethod: old.payment_method,
    name: old.customer_name,
    neighborhood: old.neighborhood,
    addressNote: old.address_note,
  });
  log(res, 'order.duplicate', order.reference, old.reference);
  const note = dropped.length ? `${L.duplicated} ${L.duplicateDropped(dropped.join(', '))}` : L.duplicated;
  redirectWith(res, `/admin/orders/${order.id}`, note, dropped.length ? 'danger' : '');
});

adminRouter.post('/orders/:id/status', async (req, res) => {
  const { L } = res.locals;
  const status = String(req.body.status || '');
  const back = safeBack(req.body.back, '/admin');
  if (!ORDER_STATUSES.includes(status)) return res.status(400).send('Invalid status');
  try {
    const eta = str(req.body.eta, 40) || undefined;
    const result = await changeOrderStatus(Number(req.params.id), status, { eta });
    if (!result) return sendError(req, res, 404);
    log(res, 'order.status', result.order.reference, status);
    redirectWith(res, back, L.notified[result.notified] || L.saved);
  } catch (err) {
    logger.error('Status change failed:', err.stack || err.message);
    redirectWith(res, back, err.message);
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
  if (!order) return sendError(req, res, 404);
  const url = invoiceUrl(order);
  const qrSvg = await QRCode.toString(url, {
    type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { light: '#0000', dark: '#000000' },
  }).catch(() => '');
  res.send(views.invoicePage(L, locale, { order, shop: settings.get(), qrSvg, verifyUrl: url }));
});

adminRouter.get('/orders/:id/ticket', (req, res) => {
  const { L, locale } = res.locals;
  const order = db.getOrder(Number(req.params.id));
  if (!order) return sendError(req, res, 404);
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
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

adminRouter.post('/products', (req, res) => {
  const fields = productFields(req.body);
  if (!fields.name_fr || !fields.name_en) return res.status(400).send('Name required');
  const sortOrder = db.listProducts({ onlyInStock: false }).reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
  db.createProduct({ ...fields, sort_order: sortOrder });
  log(res, 'product.create', fields.name_fr);
  redirectWith(res, '/admin/products', res.locals.L.saved);
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
  redirectWith(res, '/admin/products', res.locals.L.saved);
});

adminRouter.post('/products/:id/stock', (req, res) => {
  const inStock = req.body.in_stock === '1' ? 1 : 0;
  db.updateProduct(Number(req.params.id), { in_stock: inStock });
  log(res, 'product.stock', String(req.params.id), inStock ? 'in' : 'out');
  redirectWith(res, '/admin/products', res.locals.L.saved);
});

adminRouter.post('/products/:id/delete', (req, res) => {
  // A product that appears on past orders is only hidden: deleting it would
  // break their history. Only an unused product is actually removed.
  const id = Number(req.params.id);
  if (db.productIsUsed(id)) {
    db.updateProduct(id, { in_stock: 0 });
    log(res, 'product.hide', String(id));
    return redirectWith(res, '/admin/products', res.locals.L.productHidden);
  }
  db.deleteProduct(id);
  log(res, 'product.delete', String(id));
  redirectWith(res, '/admin/products', res.locals.L.saved);
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
  res.send(views.zonesPage(L, locale, { zones: db.listZones(), flash: takeFlash(req, res).message, theme: res.locals.theme }));
});

adminRouter.post('/zones', (req, res) => {
  const fields = zoneFields(req.body);
  if (!fields.name) return res.status(400).send('Name required');
  if (db.findZoneByName(fields.name)) return redirectWith(res, '/admin/zones', res.locals.L.zoneExists);
  const sortOrder = db.listZones().reduce((max, z) => Math.max(max, z.sort_order), 0) + 1;
  db.createZone({ ...fields, active: 1, sort_order: sortOrder });
  log(res, 'zone.create', fields.name);
  redirectWith(res, '/admin/zones', res.locals.L.saved);
});

adminRouter.post('/zones/:id', (req, res) => {
  const fields = zoneFields(req.body);
  if (!fields.name) return res.status(400).send('Name required');
  const clash = db.findZoneByName(fields.name);
  if (clash && clash.id !== Number(req.params.id)) return redirectWith(res, '/admin/zones', res.locals.L.zoneExists);
  db.updateZone(Number(req.params.id), fields);
  log(res, 'zone.update', fields.name, String(fields.fee));
  redirectWith(res, '/admin/zones', res.locals.L.saved);
});

adminRouter.post('/zones/:id/delete', (req, res) => {
  db.deleteZone(Number(req.params.id));
  log(res, 'zone.delete', String(req.params.id));
  redirectWith(res, '/admin/zones', res.locals.L.saved);
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
  res.send(views.couponsPage(L, locale, { coupons: db.listCoupons(), flash: takeFlash(req, res).message, theme: res.locals.theme }));
});

adminRouter.post('/coupons', (req, res) => {
  const fields = couponFields(req.body);
  if (!fields.code) return res.status(400).send('Code required');
  if (db.getCouponByCode(fields.code)) return redirectWith(res, '/admin/coupons', res.locals.L.couponExists);
  db.createCoupon({ ...fields, active: 1 });
  log(res, 'coupon.create', fields.code);
  redirectWith(res, '/admin/coupons', res.locals.L.saved);
});

adminRouter.post('/coupons/:id', (req, res) => {
  const { code, ...fields } = couponFields(req.body); // the code itself is never renamed
  db.updateCoupon(Number(req.params.id), fields);
  log(res, 'coupon.update', String(req.params.id));
  redirectWith(res, '/admin/coupons', res.locals.L.saved);
});

adminRouter.post('/coupons/:id/delete', (req, res) => {
  db.deleteCoupon(Number(req.params.id));
  log(res, 'coupon.delete', String(req.params.id));
  redirectWith(res, '/admin/coupons', res.locals.L.saved);
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
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
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
  if (!customer) return sendError(req, res, 404);
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
    flash: takeFlash(req, res).message,
    flashTone: takeFlash(req, res).tone,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

/**
 * Reaches a customer the 24h window has closed on. WhatsApp only allows an
 * approved template there, so this is the one path that still works -- and it
 * says plainly when no template is approved yet, instead of failing quietly.
 */
adminRouter.post('/customers/:id/nudge', async (req, res) => {
  const { L } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  const back = `/admin/customers/${customer.id}?tab=chat`;
  try {
    const result = await winbackOne(customer);
    if (result === 'skipped') return redirectWith(res, back, L.nudgeNoTemplate, 'danger');
    log(res, 'customer.nudge', customer.phone, result);
    redirectWith(res, back, result === 'template' ? L.nudgeTemplateSent : L.nudgeSent);
  } catch (err) {
    logger.error('Admin nudge failed:', err.message);
    redirectWith(res, back, `${L.messageFailed} : ${err.message}`, 'danger');
  }
});

adminRouter.post('/customers/:id/reply', async (req, res) => {
  const { L } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  const back = `/admin/customers/${customer.id}?tab=chat`;
  const body = str(req.body.body, 4000);
  if (!body) return res.redirect(back);
  if (!inServiceWindow(customer)) return redirectWith(res, back, L.windowClosed);
  try {
    await send(text(customer.phone, body));
    log(res, 'customer.reply', customer.phone);
    redirectWith(res, back, L.messageSent);
  } catch (err) {
    logger.error('Admin reply failed:', err.message);
    redirectWith(res, back, `${L.messageFailed}: ${err.message}`);
  }
});

adminRouter.post('/customers/:id/takeover', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  db.setConversationState(customer.phone, 'HUMAN', {});
  log(res, 'customer.takeover', customer.phone);
  redirectWith(res, `/admin/customers/${customer.id}?tab=chat`, res.locals.L.tookOver);
});

adminRouter.post('/customers/:id/release', async (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  db.setConversationState(customer.phone, 'DONE', {});
  if (inServiceWindow(customer)) {
    await send(text(customer.phone, t(normalizeLocale(customer.locale), 'handoffEnded'))).catch((err) =>
      logger.error('Hand-back message failed:', err.message),
    );
  }
  log(res, 'customer.release', customer.phone);
  redirectWith(res, `/admin/customers/${customer.id}?tab=chat`, res.locals.L.released);
});

adminRouter.post('/customers/:id/credit', (req, res) => {
  const { L } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  const back = `/admin/customers/${customer.id}?tab=loyalty`;
  const amount = Math.round(Number(req.body.amount) || 0);
  if (!amount) return redirectWith(res, back, L.creditNeedsAmount);
  // A manual adjustment can never push the balance below zero.
  const applied = Math.max(amount, -customer.credit);
  if (!applied) return redirectWith(res, back, L.creditWouldGoNegative, 'danger');
  db.recordCredit(customer.id, applied, { reason: 'manual', detail: str(req.body.detail, 80), author: res.locals.actor });
  log(res, 'customer.credit', customer.phone, String(applied));
  redirectWith(res, back, L.saved);
});

adminRouter.post('/customers/:id/notes', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  const body = str(req.body.body, 1000);
  if (body) {
    db.addNote(customer.id, body, res.locals.actor);
    log(res, 'customer.note', customer.phone);
  }
  redirectWith(res, `/admin/customers/${customer.id}?tab=notes`, res.locals.L.saved);
});

adminRouter.post('/customers/:id/notes/:noteId/delete', (req, res) => {
  db.deleteNote(Number(req.params.noteId));
  redirectWith(res, `/admin/customers/${Number(req.params.id)}?tab=notes`, res.locals.L.saved);
});

adminRouter.post('/customers/:id/tags', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  const tags = parseTags(req.body.tags).join(', ');
  db.updateCustomer(customer.id, { tags });
  log(res, 'customer.tags', customer.phone, tags);
  redirectWith(res, `/admin/customers/${customer.id}?tab=notes`, res.locals.L.saved);
});

adminRouter.post('/customers/:id/block', (req, res) => {
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return sendError(req, res, 404);
  const blocked = req.body.blocked === '1' ? 1 : 0;
  db.updateCustomer(customer.id, { blocked });
  log(res, blocked ? 'customer.block' : 'customer.unblock', customer.phone);
  redirectWith(res, `/admin/customers/${customer.id}`, blocked ? res.locals.L.blocked : res.locals.L.unblocked);
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
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

/* ------------------------------- expenses ------------------------------- */

adminRouter.get('/payments', (req, res) => {
  const { L, locale } = res.locals;
  const filter = ['momo', 'cash'].includes(req.query.filter) ? req.query.filter : 'all';
  res.send(views.paymentsPage(L, locale, {
    orders: db.pendingPayments(),
    filter,
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

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
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

adminRouter.post('/expenses', (req, res) => {
  const day = isDay(req.body.day) ? req.body.day : localDay();
  const category = ['stock', 'transport', 'salaire', 'autre'].includes(req.body.category) ? req.body.category : 'autre';
  const amount = toInt(req.body.amount);
  db.createExpense({ day, category, label: str(req.body.label, 80), amount });
  log(res, 'expense.create', category, String(amount));
  redirectWith(res, '/admin/expenses', res.locals.L.saved);
});

adminRouter.post('/expenses/:id/delete', (req, res) => {
  db.deleteExpense(Number(req.params.id));
  log(res, 'expense.delete', String(req.params.id));
  redirectWith(res, '/admin/expenses', res.locals.L.saved);
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
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

/* ------------------------------- broadcast ------------------------------ */

/** Who a broadcast can go to. Opted-out and blocked customers are never included. */
function audienceGroups(L) {
  const all = db.searchCustomersPaged({ limit: 5000 }).rows.filter((c) => !c.marketing_opt_out && !c.blocked);
  const open = all.filter((c) => inServiceWindow(c));
  const pick = (fn) => open.filter(fn);
  const daysSince = (value) => (value ? (Date.now() - new Date(`${value}Z`).getTime()) / 864e5 : Infinity);
  const away = (days) => pick((c) => c.orders_count > 0 && daysSince(c.last_order_at) >= days);
  const zones = db.listZones({ onlyActive: false }).map((z) => z.name);
  return [
    { key: 'window', label: L.audienceWindow, hint: L.audienceWindowHint, list: open },
    { key: 'regulars', label: L.audienceRegulars, hint: L.audienceRegularsHint, list: pick((c) => c.orders_count >= 2) },
    { key: 'vip', label: L.audienceVip, hint: L.audienceVipHint, list: pick((c) => c.segment === 'vip') },
    { key: 'waitlist', label: L.audienceWaitlist, hint: L.audienceWaitlistHint, list: pick((c) => c.waitlist_since) },
    // Away for a while: the people a reminder is actually for.
    ...[30, 60, 90].map((days) => ({
      key: `away${days}`,
      label: L.audienceAway(days),
      hint: L.audienceAwayHint(days),
      list: away(days),
    })),
    // One per delivery area, so a round can be announced to the right street.
    ...zones.map((zone) => ({
      key: `zone:${zone}`,
      label: L.audienceZone(zone),
      hint: L.audienceZoneHint(zone),
      list: pick((c) => (c.neighborhood || '').toLowerCase() === zone.toLowerCase()),
    })),
  ].map((g) => ({ ...g, count: g.list.length }));
}

adminRouter.get('/broadcast', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.broadcastPage(L, locale, {
    audiences: audienceGroups(L).map(({ list, ...rest }) => rest),
    lastResult: req.query.sent !== undefined
      ? { sent: Number(req.query.sent) || 0, skipped: Number(req.query.skipped) || 0, failed: Number(req.query.failed) || 0 }
      : null,
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

adminRouter.post('/broadcast', async (req, res) => {
  const { L } = res.locals;
  const body = str(req.body.body, 900);
  const group = audienceGroups(L).find((a) => a.key === req.body.audience);
  if (!body || !group) return redirectWith(res, '/admin/broadcast', L.broadcastNeedsBody);

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

const SETTINGS_TABS = ['shop', 'hours', 'payment', 'alerts', 'loyalty', 'tiers', 'catalogue', 'accounting', 'system'];

function systemInfo(health = null) {
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
    waHealth: health,
    aiReady: Boolean(config.ai.apiKey),
    sttReady: Boolean(config.stt.provider && config.stt.apiKey),
    catalogReady: waCatalog.isEnabled(),
  };
}

adminRouter.get('/settings', async (req, res) => {
  const { L, locale } = res.locals;
  const tab = SETTINGS_TABS.includes(req.query.tab) ? req.query.tab : 'shop';
  res.send(views.settingsPage(L, locale, {
    shop: settings.get(),
    smtpReady: smtpConfigured(),
    tab,
    system: tab === 'system' ? systemInfo(await tokenHealth({ force: true })) : {},
    flash: takeFlash(req, res).message,
    flashTone: takeFlash(req, res).tone,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
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
  if (tab === 'tiers') {
    Object.assign(patch, {
      tierSilverOrders: toInt(b.tierSilverOrders),
      tierSilverDelivery: toInt(b.tierSilverDelivery),
      tierGoldOrders: toInt(b.tierGoldOrders),
      tierGoldDelivery: toInt(b.tierGoldDelivery),
      winbackEnabled: b.winbackEnabled === '1',
      winbackDays: toInt(b.winbackDays),
      winbackDiscount: toInt(b.winbackDiscount),
    });
  }
  if (tab === 'catalogue') {
    Object.assign(patch, { catalogEnabled: b.catalogEnabled === '1', catalogId: b.catalogId });
  }
  if (tab === 'accounting') {
    Object.assign(patch, { vatRate: toInt(b.vatRate), businessId: b.businessId });
  }

  settings.save(patch);
  resetTokenHealth();
  log(res, 'settings.save', tab);
  redirectWith(res, `/admin/settings?tab=${tab}`, res.locals.L.saved);
});

// A token pasted here wins over .env and survives deployments, which is what
// makes Meta's 24h test token bearable. It is never echoed back to the page.
adminRouter.post('/settings/wa-token', async (req, res) => {
  const { L } = res.locals;
  const back = '/admin/settings?tab=system';
  const pasted = str(req.body.token, 500);
  if (!pasted) return redirectWith(res, back, L.waTokenNeeded, 'danger');

  // The console hands out a 24-hour token; Meta will trade it for one that
  // lasts about two months. Try, and fall back to what was pasted.
  const long = await exchangeForLongLived(pasted);
  setOverrideToken(long?.token || pasted);
  resetTokenHealth();

  const health = await tokenHealth({ force: true });
  if (!health.ok) {
    clearOverrideToken();
    resetTokenHealth();
    return redirectWith(res, back, `${L.waTokenRefused} ${health.message || ''}`.trim(), 'danger');
  }
  log(res, 'settings.wa_token', `${tokenFingerprint()}${long ? ' (long-lived)' : ''}`);
  const until = long?.expiresAt ? long.expiresAt.toLocaleDateString(res.locals.locale === 'en' ? 'en-GB' : 'fr-FR') : null;
  const message = long
    ? (until ? L.waTokenExtendedUntil(until) : L.waTokenExtendedForever)
    : L.waTokenAccepted;
  redirectWith(res, back, message);
});

adminRouter.post('/settings/wa-token/clear', (req, res) => {
  clearOverrideToken();
  resetTokenHealth();
  log(res, 'settings.wa_token', 'cleared');
  redirectWith(res, '/admin/settings?tab=system', res.locals.L.saved);
});

adminRouter.post('/settings/test-email', async (req, res) => {
  const { L } = res.locals;
  const result = await sendTestEmail();
  const flash = result.ok ? L.testEmailSent(result.to) : `${L.testEmailFailed} ${result.error}`;
  redirectWith(res, '/admin/settings?tab=alerts', flash, result.ok ? '' : 'danger');
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

/* ---------------------------- push notifications ------------------------ */

adminRouter.post('/push/subscribe', express.json({ limit: '4kb' }), (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ ok: false });
  db.savePushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth, actor: res.locals.actor });
  res.json({ ok: true });
});

adminRouter.post('/push/test', async (req, res) => {
  const { L } = res.locals;
  const sent = await push({ title: settings.get().name, body: L.pushTestBody, url: '/admin' });
  redirectWith(res, '/admin/settings?tab=alerts', L.pushTestSent(sent));
});

/* -------------------------------- staff --------------------------------- */

adminRouter.get('/staff', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.staffPage(L, locale, {
    rows: staff.list(),
    owner: config.admin.user,
    flash: takeFlash(req, res).message,
    flashTone: takeFlash(req, res).tone,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

adminRouter.post('/staff', (req, res) => {
  const { L } = res.locals;
  const username = staff.normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  if (!username || password.length < 8) return redirectWith(res, '/admin/staff', L.staffNeedsPassword, 'danger');
  if (staff.byUsername(username) || username === config.admin.user) {
    return redirectWith(res, '/admin/staff', L.staffExists, 'danger');
  }
  staff.create({ username, name: req.body.name, role: req.body.role, password });
  log(res, 'staff.create', username, req.body.role);
  redirectWith(res, '/admin/staff', L.saved);
});

adminRouter.post('/staff/:id', (req, res) => {
  const { L } = res.locals;
  const account = staff.get(Number(req.params.id));
  if (!account) return sendError(req, res, 404);
  const password = String(req.body.password || '');
  if (password && password.length < 8) return redirectWith(res, '/admin/staff', L.staffNeedsPassword, 'danger');
  staff.update(account.id, {
    name: req.body.name,
    role: req.body.role,
    active: req.body.active === '1',
    password: password || undefined,
  });
  log(res, 'staff.update', account.username);
  redirectWith(res, '/admin/staff', L.saved);
});

adminRouter.post('/staff/:id/delete', (req, res) => {
  const account = staff.get(Number(req.params.id));
  if (!account) return sendError(req, res, 404);
  staff.remove(account.id);
  log(res, 'staff.delete', account.username);
  redirectWith(res, '/admin/staff', res.locals.L.saved);
});

/* ---------------------------- delivery slots ----------------------------- */

const slotFields = (b) => ({
  label_fr: str(b.label_fr, 40),
  label_en: str(b.label_en, 40),
  label_ln: str(b.label_ln, 40) || null,
  start_time: /^\d{2}:\d{2}$/.test(b.start_time) ? b.start_time : '08:00',
  end_time: /^\d{2}:\d{2}$/.test(b.end_time) ? b.end_time : '12:00',
  capacity: toInt(b.capacity),
  active: b.active === '1' ? 1 : 0,
  sort_order: Math.round(Number(b.sort_order) || 0),
});

adminRouter.get('/slots', (req, res) => {
  const { L, locale } = res.locals;
  const day = localDay();
  res.send(views.slotsPage(L, locale, {
    slots: db.listSlots(),
    load: db.slotLoad(day),
    day,
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

adminRouter.post('/slots', (req, res) => {
  const fields = slotFields(req.body);
  if (!fields.label_fr || !fields.label_en) return res.status(400).send('Label required');
  const sortOrder = db.listSlots().reduce((max, s) => Math.max(max, s.sort_order), 0) + 1;
  db.createSlot({ ...fields, active: 1, sort_order: sortOrder });
  log(res, 'slot.create', fields.label_fr);
  redirectWith(res, '/admin/slots', res.locals.L.saved);
});

adminRouter.post('/slots/:id', (req, res) => {
  db.updateSlot(Number(req.params.id), slotFields(req.body));
  log(res, 'slot.update', String(req.params.id));
  redirectWith(res, '/admin/slots', res.locals.L.saved);
});

adminRouter.post('/slots/:id/delete', (req, res) => {
  db.deleteSlot(Number(req.params.id));
  log(res, 'slot.delete', String(req.params.id));
  redirectWith(res, '/admin/slots', res.locals.L.saved);
});

/* ---------------------- one product: variants & extras ------------------- */

adminRouter.get('/products/:id/edit', (req, res) => {
  const { L, locale } = res.locals;
  const product = db.getProduct(Number(req.params.id));
  if (!product) return sendError(req, res, 404);
  res.send(views.productPage(L, locale, {
    product,
    variants: db.listVariants(product.id, { onlyActive: false }),
    extras: db.listExtras(product.id, { onlyActive: false }),
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

const variantFields = (b) => ({
  label_fr: str(b.label_fr, 40),
  label_en: str(b.label_en, 40),
  label_ln: str(b.label_ln, 40) || null,
  price: toInt(b.price),
  active: b.active === '1' ? 1 : 0,
  sort_order: Math.round(Number(b.sort_order) || 0),
});

adminRouter.post('/products/:id/variants', (req, res) => {
  const product = db.getProduct(Number(req.params.id));
  if (!product) return sendError(req, res, 404);
  const sku = str(req.body.sku, 24).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const fields = variantFields(req.body);
  if (!sku || !fields.label_fr || !fields.label_en) return res.status(400).send('Missing fields');
  if (db.getVariant(product.id, sku)) return redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.variantExists);
  const sortOrder = db.listVariants(product.id, { onlyActive: false }).reduce((m, v) => Math.max(m, v.sort_order), 0) + 1;
  db.createVariant({ product_id: product.id, sku, ...fields, active: 1, sort_order: sortOrder });
  log(res, 'variant.create', `${product.name_fr}/${sku}`);
  redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.saved);
});

adminRouter.post('/variants/:id', (req, res) => {
  const variant = db.updateVariant(Number(req.params.id), variantFields(req.body));
  log(res, 'variant.update', String(req.params.id));
  redirectWith(res, `/admin/products/${variant?.product_id || ''}/edit`, res.locals.L.saved);
});

adminRouter.post('/variants/:id/delete', (req, res) => {
  const variant = db.listProducts({ onlyInStock: false })
    .map((p) => db.listVariants(p.id, { onlyActive: false }))
    .flat()
    .find((v) => v.id === Number(req.params.id));
  db.deleteVariant(Number(req.params.id));
  log(res, 'variant.delete', String(req.params.id));
  redirectWith(res, `/admin/products/${variant?.product_id || ''}/edit`, res.locals.L.saved);
});

const extraFields = (b) => ({
  label_fr: str(b.label_fr, 40),
  label_en: str(b.label_en, 40),
  label_ln: str(b.label_ln, 40) || null,
  price: toInt(b.price),
  active: b.active === '1' ? 1 : 0,
});

adminRouter.post('/products/:id/extras', (req, res) => {
  const product = db.getProduct(Number(req.params.id));
  if (!product) return sendError(req, res, 404);
  const fields = extraFields(req.body);
  if (!fields.label_fr || !fields.label_en) return res.status(400).send('Missing fields');
  db.createExtra({ ...fields, product_id: req.body.global === '1' ? null : product.id, active: 1 });
  log(res, 'extra.create', fields.label_fr);
  redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.saved);
});

adminRouter.post('/extras/:id', (req, res) => {
  const extra = db.updateExtra(Number(req.params.id), extraFields(req.body));
  log(res, 'extra.update', String(req.params.id));
  redirectWith(res, `/admin/products/${extra?.product_id || ''}/edit`, res.locals.L.saved);
});

adminRouter.post('/extras/:id/delete', (req, res) => {
  const extra = db.allExtras().find((e) => e.id === Number(req.params.id));
  db.deleteExtra(Number(req.params.id));
  log(res, 'extra.delete', String(req.params.id));
  redirectWith(res, `/admin/products/${extra?.product_id || ''}/edit`, res.locals.L.saved);
});

adminRouter.post('/products/:id/retailer', (req, res) => {
  const product = db.getProduct(Number(req.params.id));
  if (!product) return sendError(req, res, 404);
  db.updateProduct(product.id, { retailer_id: str(req.body.retailer_id, 60) || null });
  log(res, 'product.retailer', product.name_fr);
  redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.saved);
});

/* ---------------------------- product photos ----------------------------- */

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir('products')),
    filename: (req, file, cb) => cb(null, `p${req.params.id}-${Date.now()}${TYPES[file.mimetype] || '.jpg'}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(TYPES[file.mimetype])),
});

adminRouter.post('/products/:id/photo', upload.single('photo'), (req, res) => {
  const product = db.getProduct(Number(req.params.id));
  if (!product) return sendError(req, res, 404);
  if (!req.file) return redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.photoRejected, 'danger');
  if (product.photo) deleteMedia('products', product.photo);
  db.updateProduct(product.id, { photo: req.file.filename });
  log(res, 'product.photo', product.name_fr);
  redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.saved);
});

adminRouter.post('/products/:id/photo/delete', (req, res) => {
  const product = db.getProduct(Number(req.params.id));
  if (!product) return sendError(req, res, 404);
  if (product.photo) deleteMedia('products', product.photo);
  db.updateProduct(product.id, { photo: null });
  log(res, 'product.photo.delete', product.name_fr);
  redirectWith(res, `/admin/products/${product.id}/edit`, res.locals.L.saved);
});

/* ----------------------------- subscriptions ----------------------------- */

adminRouter.get('/subscriptions', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.subscriptionsPage(L, locale, {
    rows: db.listSubscriptions(),
    flash: takeFlash(req, res).message,
    theme: res.locals.theme,
    role: res.locals.role,
    waHealth: res.locals.waHealth,
  }));
});

adminRouter.post('/subscriptions/:id/toggle', (req, res) => {
  db.updateSubscription(Number(req.params.id), { active: req.body.active === '1' ? 1 : 0 });
  log(res, 'subscription.toggle', String(req.params.id));
  redirectWith(res, '/admin/subscriptions', res.locals.L.saved);
});

adminRouter.post('/subscriptions/:id/delete', (req, res) => {
  db.deleteSubscription(Number(req.params.id));
  log(res, 'subscription.delete', String(req.params.id));
  redirectWith(res, '/admin/subscriptions', res.locals.L.saved);
});

/* ------------------------------- accounting ------------------------------ */

function ledger(query) {
  const to = isDay(query.to) ? query.to : localDay();
  const from = isDay(query.from) ? query.from : shiftDay(to, -89);
  const entries = db.cashBook(from, to);
  const income = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const spending = entries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  const shop = settings.get();
  // Prices are VAT-inclusive, so the base is the total less the tax share.
  const beforeVat = shop.vatRate ? Math.round((income * 100) / (100 + shop.vatRate)) : income;
  return {
    from, to, entries, shop,
    months: db.monthlyLedger(from, to),
    totals: { income, spending, balance: income - spending, count: entries.length, beforeVat, vat: income - beforeVat },
  };
}

adminRouter.get('/accounting', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.accountingPage(L, locale, { ...ledger(req.query), theme: res.locals.theme, role: res.locals.role }));
});

adminRouter.get('/accounting.csv', (req, res) => {
  const { L, locale } = res.locals;
  const { from, to, entries } = ledger(req.query);
  const header = ['date', 'type', 'reference', 'libelle', 'mode', 'entree', 'sortie'];
  const rows = entries.map((e) => [
    e.day,
    e.kind === 'order' ? 'vente' : 'depense',
    e.ref,
    e.label,
    e.kind === 'order' ? e.method : L.expenseCategories[e.method] || e.method,
    e.amount > 0 ? e.amount : '',
    e.amount < 0 ? -e.amount : '',
  ]);
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="journal-${from}-${to}.csv"`)
    .send(csvBody(header, rows));
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
  res.send(views.layout(L, { title: `${L.route.title} — ${day}`, active: 'route', body, theme: res.locals.theme, role: res.locals.role, waHealth: res.locals.waHealth }));
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
    role: res.locals.role,
    waHealth: res.locals.waHealth,
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
    o.items.map((it) => `${locale === 'en' ? it.name_en : it.name_fr} ${it.variant_label || L.sizes[it.size] || it.size} x${it.quantity}`).join(', '),
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
