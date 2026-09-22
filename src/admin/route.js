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
      const actions = !actionBase || done ? '' : `<div class="actions">
${o.status !== 'on_the_way' ? `<form method="post" action="${actionBase}/orders/${o.id}" class="inline"><input type="hidden" name="status" value="on_the_way"><button>${esc(L.route.onTheWay)}</button></form>` : ''}
<form method="post" action="${actionBase}/orders/${o.id}" class="inline" onsubmit="return confirm('${esc(L.route.confirmDelivered)}')"><input type="hidden" name="status" value="delivered"><button class="primary">${esc(L.route.delivered1)}</button></form></div>`;
      return `<div class="card"${done ? ' style="opacity:.55"' : ''}>
<div class="row"><b>${esc(o.customer_name || '')}</b><span class="chip s-${esc(o.status)}">${esc(L.status[o.status])}</span></div>
<div class="muted">${esc(o.reference)}</div>
<div>📍 <b>${esc(o.neighborhood || '')}</b> — ${esc(String(o.address_note || '').replace(/📍?\s*https?:\/\/\S+/g, '').trim())}</div>
<ul>${items}</ul>
<div class="muted">✅ ${esc(L.route.prepaid)} (${esc(money(locale, o.total))})</div>
<div class="actions"><a class="btn" href="tel:+${esc(o.customer.phone)}">${esc(L.route.call)}</a>
<a class="btn" href="https://wa.me/${esc(o.customer.phone)}" target="_blank" rel="noopener noreferrer">${esc(L.route.whatsapp)}</a>
<a class="btn" href="${esc(mapsLink(o))}" target="_blank" rel="noopener noreferrer">${esc(L.route.map)}</a></div>
${actions}</div>`;
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
  const style = `:root{--bg:#f6f4ef;--card:#fff;--ink:#1f1d1a;--muted:#6b6660;--line:#e4dfd6;--accent:#b4451f;--accent-ink:#fff;--chip:#efe9df;--ok:#2f7d4a;--warn:#a86a00}
@media (prefers-color-scheme:dark){:root{--bg:#161412;--card:#201d1a;--ink:#f1ece4;--muted:#a59e94;--line:#34302b;--accent:#e0714a;--accent-ink:#1a1512;--chip:#2c2824;--ok:#6cc08a;--warn:#e2b04a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}.row{display:flex;justify-content:space-between;gap:8px}
.muted{color:var(--muted)}.chip{padding:2px 8px;border-radius:999px;background:var(--chip);font-size:.8rem;font-weight:600}.s-delivered{color:var(--ok)}.s-on_the_way{color:var(--accent)}.s-paid,.s-preparing{color:var(--warn)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.btn,button{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--chip);color:var(--ink);border-radius:10px;padding:10px 12px;text-decoration:none;cursor:pointer}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}form.inline{display:inline}ul{padding-left:18px;margin:.4rem 0}
.flash{background:var(--chip);border-left:4px solid var(--accent);padding:10px 12px;border-radius:8px;margin-bottom:12px}`;
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(L.route.title)} ${esc(day)}</title><style>${style}</style></head><body><main>
<h1>🛵 ${esc(L.route.title)} — ${esc(day)}</h1>${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<h2>${esc(L.route.toDeliver)} (${pending.length})</h2>${pending.length ? riderCards(L, pending, { actionBase: base }) : `<p class="muted">${esc(L.route.empty)}</p>`}
${delivered.length ? `<h2>${esc(L.route.delivered)} (${delivered.length})</h2>${riderCards(L, delivered)}` : ''}
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
