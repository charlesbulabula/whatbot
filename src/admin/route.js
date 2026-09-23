// Rider route sheet: a public page reachable only through a per-day secret link,
// so the rider sees that day's deliveries and marks them done without an admin login.
import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import { DEFAULT_LOCALE, money } from '../i18n/index.js';
import { changeOrderStatus } from '../bot/orders.js';
import { adminDictionaries } from './i18n.js';
import { esc } from './views.js';
import { CSS, FONT_LINK, icon } from './theme.js';

const TO_DELIVER = ['paid', 'preparing', 'on_the_way'];
const MAX_AGE_DAYS = 2; // links for older days stop working

function secret() {
  let value = db.getSetting('route_secret');
  if (!value) {
    value = crypto.randomBytes(32).toString('hex');
    db.setSetting('route_secret', value);
  }
  return value;
}

export function routeToken(day) {
  return crypto.createHmac('sha256', secret()).update(`route:${day}`).digest('hex').slice(0, 32);
}

export function routeUrl(day) {
  return `${config.publicUrl}/route/${day}/${routeToken(day)}`;
}

function validLink(day, token) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[0-9a-f]{32}$/.test(String(token))) return false;
  if (!crypto.timingSafeEqual(Buffer.from(routeToken(day)), Buffer.from(token))) return false;
  const ageDays = (Date.now() - new Date(`${day}T00:00:00`).getTime()) / 864e5;
  return ageDays <= MAX_AGE_DAYS + 1 && ageDays >= -1;
}

const mapsLink = (order) => {
  const coords = String(order.address_note || '').match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  const query = coords ? `${coords[1]},${coords[2]}` : `${order.address_note || ''}, ${order.neighborhood}, Kinshasa`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
};

export function riderCards(L, orders, { actionBase } = {}) {
  const locale = L.lang;
  return orders
    .map((o) => {
      const items = o.items
        .map((it) => `<li>${esc(it.emoji)} ${esc(locale === 'en' ? it.name_en : it.name_fr)} — ${esc(L.sizes[it.size])} × ${it.quantity}</li>`)
        .join('');
      const done = o.status === 'delivered';
      const cash = o.payment_method === 'cash' && !done;
      const actions = !actionBase || done ? '' : `<div class="actions">
${o.status !== 'on_the_way' ? `<form method="post" action="${actionBase}/orders/${o.id}" class="inline"><input type="hidden" name="status" value="on_the_way"><button class="btn">${esc(L.route.onTheWay)}</button></form>` : ''}
<form method="post" action="${actionBase}/orders/${o.id}" class="inline" onsubmit="return confirm('${esc(L.route.confirmDelivered)}')"><input type="hidden" name="status" value="delivered"><button class="btn btn--primary">${esc(L.route.delivered1)}</button></form></div>`;
      // Money line: a cash order tells the rider exactly what to collect.
      const payment = cash
        ? `<div class="badge badge--warning" style="font-size:.875rem">${esc(L.route.collect)} ${esc(money(locale, o.total))}</div>`
        : `<div class="muted">${esc(L.route.prepaid)} (${esc(money(locale, o.total))})</div>`;
      return `<div class="card"${done ? ' style="opacity:.55"' : ''}><div class="card__body">
<div class="actions"><b class="strong">${esc(o.customer_name || '')}</b><span class="spacer"></span>
<span class="badge badge--${o.status === 'delivered' ? 'success' : o.status === 'on_the_way' ? 'primary' : 'info'}">${esc(L.status[o.status])}</span></div>
<div class="muted">${esc(o.reference)}</div>
<div>${icon('pin', 15)} <b class="strong">${esc(o.neighborhood || '')}</b> — ${esc(String(o.address_note || '').replace(/📍?\s*https?:\/\/\S+/g, '').trim())}</div>
<ul>${items}</ul>
${payment}
<div class="actions"><a class="btn btn--sm" href="tel:+${esc(o.customer.phone)}">${esc(L.route.call)}</a>
<a class="btn btn--sm" href="https://wa.me/${esc(o.customer.phone)}" target="_blank" rel="noopener noreferrer">${esc(L.route.whatsapp)}</a>
<a class="btn btn--sm" href="${esc(mapsLink(o))}" target="_blank" rel="noopener noreferrer">${esc(L.route.map)}</a></div>
${actions}</div></div>`;
    })
    .join('');
}

export function ordersForRoute(day) {
  const orders = db.ordersForDay(day).filter((o) => TO_DELIVER.includes(o.status) || o.status === 'delivered');
  return {
    pending: orders.filter((o) => o.status !== 'delivered'),
    delivered: orders.filter((o) => o.status === 'delivered'),
  };
}

function riderPage(L, day, base, flash) {
  const { pending, delivered } = ordersForRoute(day);
  const toCollect = pending
    .filter((o) => o.payment_method === 'cash')
    .reduce((sum, o) => sum + o.total, 0);
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark">
<title>${esc(L.route.title)} ${esc(day)}</title>${FONT_LINK}<style>${CSS}
.hk-page{margin:0;padding:1.25rem;max-width:640px;margin-inline:auto}</style></head><body>
<main class="hk-page">
<h1>${icon('scooter', 24)} ${esc(L.route.title)} — ${esc(day)}</h1>
${flash ? `<div class="alert" style="margin-top:1rem">${icon('info')}<span>${esc(flash)}</span></div>` : ''}
${toCollect ? `<div class="alert alert--warning" style="margin-top:1rem">${icon('wallet')}<span>${esc(L.route.collectTotal)} <b>${esc(money(L.lang, toCollect))}</b></span></div>` : ''}
<section class="section"><div class="section__title"><h2>${esc(L.route.toDeliver)} (${pending.length})</h2></div>
${pending.length ? riderCards(L, pending, { actionBase: base }) : `<div class="card"><div class="card__body"><p class="muted">${esc(L.route.empty)}</p></div></div>`}</section>
${delivered.length ? `<section class="section"><div class="section__title"><h2>${esc(L.route.delivered)} (${delivered.length})</h2></div>${riderCards(L, delivered)}</section>` : ''}
</main></body></html>`;
}

export const routeRouter = express.Router();

routeRouter.use((req, res, next) => {
  // The secret is in the URL: never leak it through Referer headers, caches or search engines.
  res.set({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  next();
});
routeRouter.use(express.urlencoded({ extended: false, limit: '4kb' }));

routeRouter.get('/:day/:token', (req, res) => {
  const L = adminDictionaries[DEFAULT_LOCALE];
  const { day, token } = req.params;
  if (!validLink(day, token)) return res.status(404).send(esc(L.route.expired));
  res.send(riderPage(L, day, `/route/${day}/${token}`, req.query.flash));
});

routeRouter.post('/:day/:token/orders/:id', async (req, res) => {
  const L = adminDictionaries[DEFAULT_LOCALE];
  const { day, token } = req.params;
  if (!validLink(day, token)) return res.status(404).send(esc(L.route.expired));
  const origin = req.get('origin');
  let sameSite = true;
  try {
    sameSite = !origin || new URL(origin).host === req.get('host');
  } catch {
    sameSite = false;
  }
  if (!sameSite) return res.status(403).send('Cross-site request refused');

  const status = req.body.status;
  const order = db.getOrder(Number(req.params.id));
  const orderDay = order && new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-CA');
  if (!['on_the_way', 'delivered'].includes(status) || !order || orderDay !== day || !TO_DELIVER.includes(order.status)) {
    return res.status(400).send('Invalid request');
  }
  try {
    const result = await changeOrderStatus(order.id, status);
    res.redirect(`/route/${day}/${token}?flash=${encodeURIComponent(`${order.customer_name} : ${L.notified[result.notified] || L.saved}`)}`);
  } catch (err) {
    logger.error('Rider status change failed:', err.message);
    res.status(500).send('Error');
  }
});
