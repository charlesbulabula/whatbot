// Customer-facing delivery tracking.
//
// When an order goes on its way the customer gets a link to this page. It shows
// where the rider is, how far that is, and refreshes on its own. The link is a
// per-order token, so it cannot be guessed and expires with the delivery day.
import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import * as db from './db/index.js';
import { DEFAULT_LOCALE, normalizeLocale, t } from './i18n/index.js';
import * as settings from './shop/settings.js';
import { coordsOf, haversineKm } from './shop/routing.js';
import { CSS, FONT_LINK, FAVICON, icon } from './admin/theme.js';
import { esc } from './admin/ui.js';

const LIVE_STATUSES = ['paid', 'preparing', 'on_the_way'];

function secret() {
  let value = db.getSetting('tracking_secret');
  if (!value) {
    value = crypto.randomBytes(32).toString('hex');
    db.setSetting('tracking_secret', value);
  }
  return value;
}

export const trackingToken = (order) =>
  crypto.createHmac('sha256', secret()).update(`track:${order.id}:${order.reference}`).digest('hex').slice(0, 20);

export const trackingUrl = (order) =>
  `${config.publicUrl}/t/${encodeURIComponent(order.reference)}/${trackingToken(order)}`;

export const trackingRouter = express.Router();

trackingRouter.use((_req, res, next) => {
  res.set({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  next();
});

function load(req) {
  const { reference, token } = req.params;
  const order = /^[A-Za-z0-9-]{1,40}$/.test(reference) ? db.getOrderByReference(reference) : null;
  if (!order || !/^[0-9a-f]{20}$/.test(String(token))) return null;
  const expected = Buffer.from(trackingToken(order));
  const given = Buffer.from(String(token));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return order;
}

/** The moving parts, polled by the page so the map does not reload. */
trackingRouter.get('/:reference/:token/position', (req, res) => {
  const order = load(req);
  if (!order) return res.status(404).json({ ok: false });
  const day = new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-CA');
  const rider = LIVE_STATUSES.includes(order.status) ? db.getRiderPosition(day) : null;
  const target = coordsOf(order);
  res.json({
    ok: true,
    status: order.status,
    eta: order.eta || null,
    rider: rider ? { latitude: rider.latitude, longitude: rider.longitude, updatedAt: rider.updated_at } : null,
    destination: target || null,
    distanceKm: rider && target ? haversineKm(rider, target) : null,
  });
});

trackingRouter.get('/:reference/:token', (req, res) => {
  const order = load(req);
  const shop = settings.get();
  const locale = order ? normalizeLocale(order.customer.locale) : DEFAULT_LOCALE;
  if (!order) {
    return res.status(404).type('html').send(page(locale, shop, `<div class="verify">
<div class="verify__mark badge--danger">${icon('alert', 32)}</div>
<h1>${esc(t(locale, 'trackUnknown'))}</h1></div>`));
  }

  const done = order.status === 'delivered';
  const body = `<div class="doc" style="max-width:34rem">
<div class="doc__brand">🌶️ ${esc(shop.name)}</div>
<p class="muted">${esc(t(locale, 'trackOrder', { ref: order.reference }))}</p>
<div id="state" class="alert${done ? '' : ' alert--warning'}">${icon(done ? 'check' : 'scooter')}
<span>${esc(t(locale, done ? 'trackDelivered' : `status.${order.status}`))}</span></div>
<div id="map" style="height:15rem;border-radius:var(--radius-lg);overflow:hidden;background:var(--hk-bg-secondary)"></div>
<p id="distance" class="muted" style="margin-top:.75rem"></p>
<dl class="kv" style="margin-top:1rem">
<dt>${esc(t(locale, 'trackAddress'))}</dt><dd>${esc(order.neighborhood || '')}</dd>
${order.slot_label ? `<dt>${esc(t(locale, 'trackSlot'))}</dt><dd>${esc(order.slot_label)}</dd>` : ''}
${order.eta ? `<dt>${esc(t(locale, 'trackEta'))}</dt><dd>${esc(order.eta)}</dd>` : ''}
</dl></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" defer></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css">
<script>${script(req.params.reference, req.params.token, t(locale, 'trackAway'), t(locale, 'trackNoPosition'))}</script>`;
  res.type('html').send(page(locale, shop, body));
});

/**
 * The map is progressive: without JavaScript or without a position the page
 * still shows the status, the area and the slot, which is most of the value.
 */
function script(reference, token, awayLabel, noPositionLabel) {
  const base = `/t/${encodeURIComponent(reference)}/${encodeURIComponent(token)}/position`;
  return `(function(){
var map=null,riderMark=null,destMark=null;
function draw(d){
  var el=document.getElementById('distance');
  if(!d.rider){el.textContent=${JSON.stringify(noPositionLabel)};return;}
  el.textContent=d.distanceKm!==null?${JSON.stringify(awayLabel)}.replace('{km}',d.distanceKm):'';
  if(!window.L)return;
  if(!map){map=L.map('map',{zoomControl:false,attributionControl:false}).setView([d.rider.latitude,d.rider.longitude],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);}
  if(riderMark)riderMark.setLatLng([d.rider.latitude,d.rider.longitude]);
  else riderMark=L.marker([d.rider.latitude,d.rider.longitude]).addTo(map);
  if(d.destination){
    if(destMark)destMark.setLatLng([d.destination.latitude,d.destination.longitude]);
    else destMark=L.circleMarker([d.destination.latitude,d.destination.longitude],{radius:8}).addTo(map);
    map.fitBounds([[d.rider.latitude,d.rider.longitude],[d.destination.latitude,d.destination.longitude]],{padding:[40,40]});
  }
}
function poll(){fetch(${JSON.stringify(base)}).then(function(r){return r.json()}).then(function(d){if(d.ok)draw(d)}).catch(function(){});}
poll();setInterval(poll,15000);
})();`;
}

function page(locale, shop, body) {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark"><title>${esc(t(locale, 'trackTitle'))} · ${esc(shop.name)}</title>
${FAVICON}${FONT_LINK}<style>${CSS}body{background:var(--bs-body-bg)}.hk-page{margin:0;padding:1.25rem}</style>
</head><body><main class="hk-page">${body}</main></body></html>`;
}
