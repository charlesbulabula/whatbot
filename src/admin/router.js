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
import { adminDictionaries } from './i18n.js';
import * as views from './views.js';
import { routeUrl, ordersForRoute, riderCards } from './route.js';

export const adminRouter = express.Router();

/* -------------------------------- auth --------------------------------- */

const sameSecret = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

adminRouter.use((req, res, next) => {
  if (!config.admin.password) return res.status(503).type('text/plain').send('Admin disabled: set ADMIN_PASSWORD in .env');
  const [scheme, encoded] = String(req.get('authorization') || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (sep > 0 && sameSecret(user, config.admin.user) && sameSecret(pass, config.admin.password)) return next();
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
  next();
});

adminRouter.get('/lang', (req, res) => {
  const next = res.locals.locale === 'fr' ? 'en' : 'fr';
  res.cookie('admin_lang', next, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 365 * 864e5, path: '/admin' });
  let back = '/admin';
  try {
    const referer = new URL(req.get('referer'));
    if (referer.host === req.get('host')) back = referer.pathname + referer.search;
  } catch {
    /* no or malformed referer */
  }
  res.redirect(safeBack(back, '/admin'));
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
    toCheck: orders.filter((o) => o.status === 'awaiting_payment' && o.payment_proof).length,
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
    }),
  );
});

adminRouter.get('/orders/:id', (req, res) => {
  const { L, locale } = res.locals;
  const order = db.getOrder(Number(req.params.id));
  if (!order) return res.status(404).send('Not found');
  res.send(views.orderPage(L, locale, { order, messages: db.messagesFor(order.customer.phone), flash: req.query.flash }));
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
  res.send(views.productsPage(L, locale, { products: db.listProducts({ onlyInStock: false }), flash: req.query.flash }));
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
  res.send(views.customersPage(L, locale, { customers: db.listCustomers() }));
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

/* ---------------------------- rider route sheet ------------------------ */

adminRouter.get('/route', (req, res) => {
  const { L, locale } = res.locals;
  const day = isDay(req.query.day) ? req.query.day : localDay();
  const url = routeUrl(day);
  const { pending } = ordersForRoute(day);
  const shareText = `${L.route.shareText} ${day} (${pending.length}) : ${url}`;
  const body = `<p><a href="/admin?day=${day}">${views.esc(L.back)}</a></p>
<h1>🛵 ${views.esc(L.route.title)} — ${views.esc(day)}</h1>
<div class="card"><p>${views.esc(L.route.share)}</p><p><code style="word-break:break-all">${views.esc(url)}</code></p>
<div class="actions"><a class="btn" style="background:var(--accent);color:var(--accent-ink)" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener noreferrer">${views.esc(L.route.sendWhatsApp)}</a></div></div>
<h2>${views.esc(L.route.toDeliver)} (${pending.length})</h2>${pending.length ? `<div class="grid">${riderCards(L, pending)}</div>` : `<p class="muted">${views.esc(L.route.empty)}</p>`}`;
  res.send(views.layout(L, { title: L.route.title, active: 'orders', body }));
});
