import crypto from 'node:crypto';
import express from 'express';
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
import { adminDictionaries } from './i18n.js';
import { mountLiveUpdates } from './live.js';
import { smtpConfigured, sendTestEmail } from '../mail.js';
import * as views from './views.js';
import { routeUrl, ordersForRoute, riderCards } from './route.js';

export const adminRouter = express.Router();

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

/* ------------------------------ language ------------------------------- */

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
  // which way that is: the header link passes it as ?to=, see views.layout().
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

/* ---------------------------- live updates ----------------------------- */

mountLiveUpdates(adminRouter);

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

/* -------------------------------- orders ------------------------------- */

adminRouter.get('/', (req, res) => {
  const { L, locale } = res.locals;
  const today = localDay();
  const day = isDay(req.query.day) ? req.query.day : today;
  const orders = db.ordersForDay(day);
  const kpis = {
    orders: orders.filter((o) => o.status !== 'cancelled').length,
    revenueDay: db.revenueSince('+0 days'),
    revenueWeek: db.revenueSince('-6 days'),
    toCheck: orders.filter((o) => o.status === 'awaiting_payment' && (o.payment_proof || o.payment_method === 'cash')).length,
    cash: db.cashToCollect(day),
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
      flash: req.query.flash,
      theme: res.locals.theme,
    }),
  );
});

adminRouter.get('/orders/:id', (req, res) => {
  const { L, locale } = res.locals;
  const order = db.getOrder(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  res.send(views.orderPage(L, locale, {
    order, messages: db.messagesFor(order.customer.phone), flash: req.query.flash, theme: res.locals.theme,
  }));
});

adminRouter.post('/orders/:id/status', async (req, res) => {
  const { L } = res.locals;
  const status = String(req.body.status || '');
  const back = safeBack(req.body.back, '/admin');
  if (!ORDER_STATUSES.includes(status)) return res.status(400).send('Invalid status');
  try {
    const eta = String(req.body.eta || '').trim().slice(0, 40) || undefined;
    const result = await changeOrderStatus(Number(req.params.id), status, { eta });
    if (!result) return res.status(404).send('Not found');
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

/* ------------------------------- products ------------------------------ */

const productFields = (b) => ({
  name_fr: String(b.name_fr || '').trim().slice(0, 40),
  name_en: String(b.name_en || '').trim().slice(0, 40),
  emoji: String(b.emoji || '').trim().slice(0, 8),
  price_small: toInt(b.price_small),
  price_medium: toInt(b.price_medium),
  price_large: toInt(b.price_large),
});

adminRouter.get('/products', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.productsPage(L, locale, {
    products: db.listProducts({ onlyInStock: false }), flash: req.query.flash, theme: res.locals.theme,
  }));
});

adminRouter.post('/products', (req, res) => {
  const fields = productFields(req.body);
  if (!fields.name_fr || !fields.name_en) return res.status(400).send('Name required');
  const sortOrder = db.listProducts({ onlyInStock: false }).reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
  db.createProduct({ ...fields, sort_order: sortOrder });
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

adminRouter.post('/products/:id', (req, res) => {
  const fields = productFields(req.body);
  if (!fields.name_fr || !fields.name_en) return res.status(400).send('Name required');
  db.updateProduct(Number(req.params.id), { ...fields, sort_order: Math.round(Number(req.body.sort_order) || 0) });
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

adminRouter.post('/products/:id/stock', (req, res) => {
  db.updateProduct(Number(req.params.id), { in_stock: req.body.in_stock === '1' ? 1 : 0 });
  res.redirect(withFlash('/admin/products', res.locals.L.saved));
});

/* ------------------------------- customers ----------------------------- */

adminRouter.get('/customers', (req, res) => {
  const { L, locale } = res.locals;
  const query = String(req.query.q || '').trim().slice(0, 60);
  const segment = ['new', 'regular', 'vip'].includes(req.query.segment) ? req.query.segment : '';
  res.send(views.customersPage(L, locale, {
    customers: db.searchCustomers({ query, segment }), query, segment, theme: res.locals.theme,
  }));
});

adminRouter.get('/customers/:id', (req, res) => {
  const { L, locale } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  res.send(
    views.customerPage(L, locale, {
      customer,
      orders: db.ordersForCustomer(customer.id),
      messages: db.messagesFor(customer.phone),
      state: db.getConversation(customer.phone).state,
      canReply: inServiceWindow(customer),
      flash: req.query.flash,
      theme: res.locals.theme,
    }),
  );
});

adminRouter.post('/customers/:id/reply', async (req, res) => {
  const { L } = res.locals;
  const customer = db.getCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).send('Not found');
  const back = `/admin/customers/${customer.id}`;
  const body = String(req.body.body || '').trim().slice(0, 4000);
  if (!body) return res.redirect(back);
  if (!inServiceWindow(customer)) return res.redirect(withFlash(back, L.windowClosed));
  try {
    await send(text(customer.phone, body));
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
  res.redirect(withFlash(`/admin/customers/${customer.id}`, res.locals.L.tookOver));
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
  res.redirect(withFlash(`/admin/customers/${customer.id}`, res.locals.L.released));
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

adminRouter.post('/settings/test-email', async (req, res) => {
  const { L } = res.locals;
  const result = await sendTestEmail();
  const flash = result.ok ? L.testEmailSent(result.to) : `${L.testEmailFailed} ${result.error}`;
  res.redirect(`${withFlash('/admin/settings', flash)}${result.ok ? '' : '&tone=danger'}`);
});

/* --------------------------- delivery zones ---------------------------- */

const zoneFields = (b) => ({
  name: String(b.name || '').trim().slice(0, 40),
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
  res.redirect(withFlash('/admin/zones', res.locals.L.saved));
});

adminRouter.post('/zones/:id', (req, res) => {
  const fields = zoneFields(req.body);
  if (!fields.name) return res.status(400).send('Name required');
  const clash = db.findZoneByName(fields.name);
  if (clash && clash.id !== Number(req.params.id)) return res.redirect(withFlash('/admin/zones', res.locals.L.zoneExists));
  db.updateZone(Number(req.params.id), fields);
  res.redirect(withFlash('/admin/zones', res.locals.L.saved));
});

adminRouter.post('/zones/:id/delete', (req, res) => {
  db.deleteZone(Number(req.params.id));
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
  res.redirect(withFlash('/admin/coupons', res.locals.L.saved));
});

adminRouter.post('/coupons/:id', (req, res) => {
  const { code, ...fields } = couponFields(req.body); // the code itself is never renamed
  db.updateCoupon(Number(req.params.id), fields);
  res.redirect(withFlash('/admin/coupons', res.locals.L.saved));
});

adminRouter.post('/coupons/:id/delete', (req, res) => {
  db.deleteCoupon(Number(req.params.id));
  res.redirect(withFlash('/admin/coupons', res.locals.L.saved));
});

/* ------------------------------- settings ------------------------------ */

adminRouter.get('/settings', (req, res) => {
  const { L, locale } = res.locals;
  res.send(views.settingsPage(L, locale, {
    shop: settings.get(),
    smtpReady: smtpConfigured(),
    flash: req.query.flash,
    flashTone: req.query.tone === 'danger' ? 'danger' : '',
    theme: res.locals.theme,
  }));
});

adminRouter.post('/settings', (req, res) => {
  const b = req.body;
  const hours = {};
  for (const d of settings.WEEKDAYS) {
    hours[d] = b[`open_${d}`] === '1' ? { open: String(b[`from_${d}`] || ''), close: String(b[`to_${d}`] || '') } : null;
  }
  settings.save({
    name: b.name,
    minOrder: toInt(b.minOrder),
    defaultDeliveryFee: toInt(b.defaultDeliveryFee),
    weeklyCapacity: toInt(b.weeklyCapacity),
    closed: b.closed === '1',
    closedNote: b.closedNote,
    momoEnabled: b.momoEnabled === '1',
    momoOrange: b.momoOrange,
    momoAirtel: b.momoAirtel,
    momoHolder: b.momoHolder,
    cashEnabled: b.cashEnabled === '1',
    adminNotifyNumber: b.adminNotifyNumber,
    alertEmail: b.alertEmail,
    emailAlerts: b.emailAlerts === '1',
    hours,
  });
  res.redirect(withFlash('/admin/settings', res.locals.L.saved));
});

/* ---------------------------- rider route sheet ------------------------ */

adminRouter.get('/route', (req, res) => {
  const { L, locale } = res.locals;
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
  res.send(
    views.statsPage(L, locale, {
      days,
      series: db.dailyRevenue(days),
      stats: db.periodStats(days),
      products: db.topProducts(days),
      zones: db.zoneStats(days),
      segments: db.segmentCounts(),
      payments: db.paymentMethodStats(days),
      coupons: db.couponStats(days),
      theme: res.locals.theme,
    }),
  );
});

// Semicolon-separated with a BOM so Excel (French locale) opens it directly.
adminRouter.get('/export.csv', (req, res) => {
  const to = isDay(req.query.to) ? req.query.to : localDay();
  const from = isDay(req.query.from) ? req.query.from : shiftDay(to, -29);
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['reference', 'date', 'status', 'customer', 'phone', 'area', 'address', 'items', 'subtotal', 'delivery_fee', 'credit_used', 'total', 'paid_at', 'delivered_at', 'rating'];
  const rows = db.ordersBetween(from, to).map((o) => [
    o.reference,
    new Date(`${o.created_at.replace(' ', 'T')}Z`).toLocaleString('sv-SE'),
    o.status,
    o.customer_name,
    `+${o.customer.phone}`,
    o.neighborhood,
    o.address_note,
    o.items.map((it) => `${res.locals.locale === 'en' ? it.name_en : it.name_fr} ${res.locals.L.sizes[it.size]} x${it.quantity}`).join(', '),
    o.subtotal,
    o.delivery_fee,
    o.discount,
    o.total,
    o.paid_at,
    o.delivered_at,
    o.rating,
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="commandes-${from}-${to}.csv"`)
    .send(`\uFEFF${csv}\r\n`);
});
