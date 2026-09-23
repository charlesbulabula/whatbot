// Server-rendered dashboard, styled with the Jampack design system (see theme.js).
// Every page is a string: no build step, no client framework, one stylesheet.
import { config } from '../config.js';
import { money } from '../i18n/index.js';
import * as db from '../db/index.js';
import * as settings from '../shop/settings.js';
import { CSS, FONT_LINK, icon } from './theme.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);

const NEXT_STATUSES = {
  awaiting_payment: ['paid', 'preparing', 'cancelled'],
  paid: ['preparing', 'on_the_way', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'on_the_way'],
  delivered: [],
  cancelled: [],
};

/** Status colour, matching the theme's soft badge palette. */
const STATUS_TONE = {
  awaiting_payment: 'warning',
  paid: 'info',
  preparing: 'primary',
  on_the_way: 'primary',
  delivered: 'success',
  cancelled: 'danger',
};

/* ------------------------------ components ------------------------------ */

const badge = (label, tone = 'gray', { dot = false } = {}) =>
  `<span class="badge badge--${tone}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;

const statusBadge = (L, status) => badge(L.status[status] || status, STATUS_TONE[status] || 'gray', { dot: true });

const paymentBadge = (L, order) =>
  order.payment_method === 'cash' ? badge(L.payCash, 'warning') : badge(L.payMomo, 'gray');

const waLink = (phone) =>
  `<a href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener">+${esc(phone)}</a>`;

const initials = (name, phone) => {
  const source = String(name || '').trim();
  if (!source) return String(phone || '?').slice(-2);
  return source.split(/\s+/).slice(0, 2).map((w) => [...w][0]).join('');
};

function stat({ name, tone = 'primary', value, label, hint }) {
  return `<div class="stat">
<span class="stat__icon badge--${tone}">${icon(name, 22)}</span>
<span><b class="stat__value">${esc(value)}</b><span class="stat__label">${esc(label)}</span>
${hint ? `<span class="stat__hint">${esc(hint)}</span>` : ''}</span></div>`;
}

const empty = (text, name = 'box') => `<div class="empty">${icon(name, 34)}<p>${esc(text)}</p></div>`;

const card = (body, { head, className = '' } = {}) =>
  `<div class="card ${className}">${head ? `<div class="card__head">${head}</div>` : ''}<div class="card__body">${body}</div></div>`;

const section = (title, body, actions = '') =>
  `<section class="section"><div class="section__title"><h2>${esc(title)}</h2>${actions ? `<span class="spacer"></span>${actions}` : ''}</div>${body}</section>`;

/* -------------------------------- layout -------------------------------- */

const NAV = (L) => [
  { group: '', items: [
    ['orders', '/admin', L.navOrders, 'receipt'],
    ['route', '/admin/route', L.navRoute, 'scooter'],
  ] },
  { group: L.navGroupCatalogue, items: [
    ['products', '/admin/products', L.navProducts, 'basket'],
    ['zones', '/admin/zones', L.navZones, 'pin'],
    ['coupons', '/admin/coupons', L.navCoupons, 'ticket'],
  ] },
  { group: L.navGroupCustomers, items: [
    ['customers', '/admin/customers', L.navCustomers, 'users'],
    ['stats', '/admin/stats', L.navStats, 'chart'],
  ] },
  { group: L.navGroupShop, items: [
    ['settings', '/admin/settings', L.navSettings, 'settings'],
  ] },
];

/** Counts shown as sidebar badges: payments waiting for a check, customers waiting for a person. */
function navCounts() {
  try {
    return {
      orders: db.pendingProofCount(),
      customers: db.handoffConversations().length,
    };
  } catch {
    return {};
  }
}

export function layout(L, { title, active, body, flash, flashTone = '', theme = '' }) {
  const shop = settings.get();
  const open = settings.isOpen(new Date(), shop);
  const counts = navCounts();

  const nav = NAV(L)
    .map(({ group, items }) => {
      const links = items
        .map(([key, href, label, name]) => {
          const n = counts[key];
          return `<li><a class="hk-nav__link${key === active ? ' on' : ''}" href="${href}"${key === active ? ' aria-current="page"' : ''}>
${icon(name)}<span>${esc(label)}</span>${n ? `<span class="hk-nav__count">${badge(String(n), 'danger')}</span>` : ''}</a></li>`;
        })
        .join('');
      return `${group ? `<div class="hk-nav__head">${esc(group)}</div>` : ''}<ul class="hk-nav__list">${links}</ul>`;
    })
    .join('');

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return `<!doctype html><html lang="${L.lang}"${theme ? ` data-bs-theme="${theme}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark"><title>${esc(title)} · ${esc(shop.name)}</title>
${FONT_LINK}<style>${CSS}</style></head><body><div class="hk-wrapper">
<input type="checkbox" id="hk-toggle" tabindex="-1" aria-hidden="true">
<aside class="hk-nav">
  <div class="hk-nav__brand"><span class="hk-nav__logo">🌶️</span><span class="hk-nav__name">${esc(shop.name)}</span></div>
  <nav class="hk-nav__scroll" aria-label="${esc(L.navLabel)}">${nav}</nav>
  <div class="hk-nav__foot">${open ? badge(L.shopOpen, 'success', { dot: true }) : badge(L.shopClosed, 'danger', { dot: true })}</div>
</aside>
<label class="hk-scrim" for="hk-toggle" aria-hidden="true"></label>
<header class="hk-top">
  <label class="hk-burger" for="hk-toggle" title="${esc(L.navLabel)}">${icon('menu', 22)}</label>
  <span class="hk-top__title">${esc(title)}</span>
  <a class="icon-btn" id="theme-toggle" href="/admin/theme" title="${esc(L.theme[nextTheme])}">${icon(nextTheme === 'dark' ? 'moon' : 'sun')}</a>
  <a class="icon-btn" href="/admin/lang" title="${esc(L.switchLang)}">${icon('globe')}</a>
</header>
<main class="hk-page">
${flash ? `<div class="alert${flashTone ? ` alert--${flashTone}` : ''}">${icon(flashTone === 'danger' ? 'alert' : 'info')}<span>${esc(flash)}</span></div>` : ''}
${!open ? `<div class="alert alert--warning">${icon('clock')}<span>${esc(L.closedBanner)} <a href="/admin/settings">${esc(L.closedBannerLink)}</a></span></div>` : ''}
${body}</main></div>
${theme ? '' : themeToggleScript()}</body></html>`;
}

/**
 * Without a saved choice the page follows the device. The toggle then has to flip
 * whatever the viewer is actually seeing, which only the browser knows, so it
 * rewrites its own link (and icon) to the opposite of the system theme.
 */
function themeToggleScript() {
  return `<script>(function(){var a=document.getElementById('theme-toggle');if(!a)return;
var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
a.href='/admin/theme?to='+(dark?'light':'dark');
if(!dark)return;a.innerHTML=${JSON.stringify(icon('sun'))};})();</script>`;
}

/* -------------------------------- orders -------------------------------- */

const fmtSize = (L, size) => L.sizes[size] || size;

function productLabel(p, locale) {
  return `${p.emoji ? `${esc(p.emoji)} ` : ''}${esc(locale === 'en' ? p.name_en : p.name_fr)}`;
}

function statusForms(L, order, back) {
  return (NEXT_STATUSES[order.status] || [])
    .map((status) => {
      const hidden = `<input type="hidden" name="back" value="${esc(back)}">`;
      if (status === 'on_the_way') {
        return `<form method="post" action="/admin/orders/${order.id}/status" class="inline">
<input type="hidden" name="status" value="on_the_way">${hidden}
<input name="eta" placeholder="${esc(L.eta)}" value="${esc(order.eta || '')}" size="7" aria-label="${esc(L.eta)}">
<button class="btn btn--sm">${esc(L.actions.on_the_way)}</button></form>`;
      }
      const cls = status === 'cancelled' ? 'btn--danger' : status === 'paid' ? 'btn--primary' : '';
      const confirm = status === 'cancelled' ? ` onsubmit="return confirm('${esc(L.confirmCancel)}')"` : '';
      return `<form method="post" action="/admin/orders/${order.id}/status" class="inline"${confirm}>
<input type="hidden" name="status" value="${status}">${hidden}
<button class="btn btn--sm ${cls}">${esc(L.actions[status])}</button></form>`;
    })
    .join('');
}

function orderCard(L, locale, order, back) {
  const items = order.items
    .map((it) => `<li>${productLabel(it, locale)} — ${esc(fmtSize(L, it.size))} × ${it.quantity}
<span class="muted tabnum">${esc(money(locale, it.line_total))}</span></li>`)
    .join('');
  const time = new Date(`${order.created_at.replace(' ', 'T')}Z`)
    .toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
  const head = `<a href="/admin/orders/${order.id}"><b>${esc(order.reference)}</b></a>
<span class="spacer"></span>${paymentBadge(L, order)}${statusBadge(L, order.status)}`;
  const body = `<div class="muted">${esc(time)} · ${esc(order.customer_name || '')} · ${waLink(order.customer.phone)}</div>
<div>${icon('pin', 15)} <b class="strong">${esc(order.neighborhood || '')}</b>
${order.address_note ? `<span class="muted">— ${linkify(order.address_note)}</span>` : ''}</div>
<ul>${items}</ul>
<div class="actions"><span>${esc(L.total)} : <b class="strong tabnum">${esc(money(locale, order.total))}</b></span>
${order.coupon ? badge(`${order.coupon} −${money(locale, order.coupon_discount)}`, 'info') : ''}
${order.discount ? badge(`${L.discount} −${money(locale, order.discount)}`, 'success') : ''}
<span class="spacer"></span>
${order.payment_method === 'cash'
    ? `<span class="muted">${esc(L.cashToCollectOne)}</span>`
    : order.payment_proof
      ? `<a href="/admin/orders/${order.id}/proof" target="_blank">🧾 ${esc(L.proof)}</a>`
      : `<span class="muted">${esc(L.noProof)}</span>`}</div>
${order.eta ? `<div class="muted">${icon('scooter', 15)} ${esc(L.eta)} : ${esc(order.eta)}</div>` : ''}
<div class="actions">${statusForms(L, order, back)}</div>`;
  return card(body, { head });
}

function quantitiesTable(L, locale, rows, valueKey, emptyLabel) {
  if (!rows.length) return empty(emptyLabel, 'basket');
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, { label: productLabel(r, locale), small: 0, medium: 0, large: 0 });
    byProduct.get(r.product_id)[r.size] = r[valueKey];
  }
  const body = [...byProduct.values()]
    .map((p) => `<tr><td>${p.label}</td><td class="num">${p.small || '–'}</td><td class="num">${p.medium || '–'}</td><td class="num">${p.large || '–'}</td></tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>${esc(L.product)}</th><th class="num">${esc(L.sizes.small)}</th>
<th class="num">${esc(L.sizes.medium)}</th><th class="num">${esc(L.sizes.large)}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function handoffCard(L, handoffs) {
  if (!handoffs.length) return '';
  const items = handoffs
    .map((c) => `<li><a href="/admin/customers/${c.id}"><b>${esc(c.name || `+${c.phone}`)}</b></a>
${c.unanswered ? badge(`${c.unanswered} ${L.unanswered}`, 'warning') : ''}</li>`)
    .join('');
  return card(`<ul>${items}</ul>`, {
    head: `${icon('hand')}<h2>${esc(L.handoffs)}</h2>${badge(String(handoffs.length), 'danger')}`,
  });
}

export function dashboardPage(L, locale, data) {
  const { day, prevDay, nextDay, isToday, orders, kpis, shopping, forecast, handoffs = [], flash, theme } = data;
  const back = `/admin?day=${day}`;
  const byZone = new Map();
  for (const o of orders) {
    const zone = o.neighborhood || '—';
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(o);
  }
  const zones = [...byZone.entries()]
    .map(([zone, list]) =>
      section(`${zone} (${list.length})`, `<div class="grid">${list.map((o) => orderCard(L, locale, o, back)).join('')}</div>`))
    .join('');

  const toolbar = `<div class="toolbar">
<a class="btn" href="/admin?day=${prevDay}">${esc(L.prevDay)}</a>
<form method="get" action="/admin" class="inline"><input type="date" name="day" value="${esc(day)}" onchange="this.form.submit()" aria-label="${esc(L.day)}"></form>
<a class="btn" href="/admin?day=${nextDay}">${esc(L.nextDay)}</a>
${isToday ? '' : `<a class="btn" href="/admin">${esc(L.today)}</a>`}
<span class="spacer" style="margin-left:auto"></span>
<a class="btn" href="/admin/route?day=${day}">${icon('scooter', 17)} ${esc(L.route.button)}</a></div>`;

  const stats = `<div class="stats">
${stat({ name: 'receipt', tone: 'primary', value: String(kpis.orders), label: L.kpiOrders })}
${stat({ name: 'cash', tone: 'success', value: money(locale, kpis.revenueDay), label: L.kpiRevenueDay })}
${stat({ name: 'chart', tone: 'info', value: money(locale, kpis.revenueWeek), label: L.kpiRevenueWeek })}
${stat({ name: 'alert', tone: kpis.toCheck ? 'danger' : 'gray', value: String(kpis.toCheck), label: L.kpiToCheck })}
${kpis.cash.orders ? stat({ name: 'wallet', tone: 'warning', value: money(locale, kpis.cash.amount), label: L.kpiCashToCollect, hint: L.kpiCashHint(kpis.cash.orders) }) : ''}
</div>`;

  const body = `${toolbar}${handoffCard(L, handoffs)}${stats}
${section(L.shoppingList, quantitiesTable(L, locale, shopping, 'qty', L.noOrders))}
${zones || section(`${L.ordersOf} ${day}`, empty(L.noOrders, 'receipt'))}
${section(L.forecast, quantitiesTable(L, locale, forecast, 'weekly_avg', L.noData))}
${isToday ? liveUpdates(L) : ''}`;
  const pending = kpis.toCheck + handoffs.length;
  return layout(L, { title: `${pending ? `(${pending}) ` : ''}${L.title}`, active: 'orders', body, flash, theme });
}

export function orderPage(L, locale, { order, messages, flash, theme }) {
  const day = new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-CA');
  const body = `<p><a href="/admin?day=${esc(day)}">${esc(L.back)}</a></p>
${orderCard(L, locale, order, `/admin/orders/${order.id}`)}
${order.rating ? card(`${esc(L.rating)} : ${'⭐'.repeat(order.rating)}`) : ''}
${order.payment_proof
    ? section(L.proof, card(`<img src="/admin/orders/${order.id}/proof" alt="" style="max-width:100%;max-height:70vh;border-radius:var(--radius-lg)">`))
    : ''}
${section(`${L.conversation} — ${order.customer.name || order.customer.phone}`, card(chat(L, messages)),
    `<a class="btn btn--sm" href="/admin/customers/${order.customer.id}">${esc(L.openCustomer)}</a>`)}`;
  return layout(L, { title: order.reference, active: 'orders', body, flash, theme });
}

function mediaBlock(L, m) {
  if (!m.media_id) return '';
  const src = `/admin/messages/${m.id}/media`;
  const kind = String(m.body || '').match(/^\((image|audio|document)\)/)?.[1];
  if (kind === 'image') return `<a href="${src}" target="_blank"><img src="${src}" alt="" loading="lazy"></a>`;
  if (kind === 'audio') return `<div>🎤 ${esc(L.media.audio)}</div><audio controls preload="none" src="${src}" style="max-width:100%"></audio>`;
  return `<a href="${src}" target="_blank">${esc(L.media.document)}</a>`;
}

function chat(L, messages) {
  if (!messages.length) return empty(L.noMessages, 'message');
  return `<div class="chat">${messages
    .map((m) => {
      const time = new Date(`${m.created_at.replace(' ', 'T')}Z`)
        .toLocaleString(L.lang === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      return `<div class="msg ${m.direction === 'in' ? 'in' : 'out'}">${linkify(m.body)}${mediaBlock(L, m)}<time>${esc(time)}</time></div>`;
    })
    .join('')}</div>`;
}

/**
 * Live updates: the server pushes an event whenever something the page shows
 * changes (see admin/live.js). The page shows a toast and refreshes itself a
 * moment later — unless the admin is typing, in which case it waits and offers
 * the refresh as a click instead, so nothing typed is ever thrown away.
 * `fallbackSeconds` keeps the old polling as a safety net if SSE cannot connect.
 */
function liveUpdates(L, fallbackSeconds = 90) {
  const labels = JSON.stringify(L.live);
  return `<div id="live-toast" class="toast" hidden></div>
<script>(function(){
var T=${labels},toast=document.getElementById('live-toast'),dirty=false,timer=null,pending=false;
document.addEventListener('input',function(){dirty=true});
function busy(){var a=document.activeElement;return dirty||(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName));}
function show(text,clickable){toast.textContent=text;toast.hidden=false;toast.classList.toggle('toast--action',!!clickable);
if(!clickable){clearTimeout(toast._t);toast._t=setTimeout(function(){toast.hidden=true},6000);}}
toast.addEventListener('click',function(){if(pending)location.reload()});
function refresh(){if(busy()){pending=true;show(T.pending,true);return;}location.reload();}
function onUpdate(e){var d={};try{d=JSON.parse(e.data)}catch(_){}
show(T[d.type]||T.changed,false);clearTimeout(timer);timer=setTimeout(refresh,1500);}
if(window.EventSource){var es=new EventSource('/admin/events');es.addEventListener('update',onUpdate);
es.addEventListener('error',function(){/* the browser reconnects on its own */});}
else{setInterval(function(){if(!busy())location.reload()},${fallbackSeconds * 1000});}
})();</script>`;
}

/* ------------------------------- products ------------------------------- */

export function productsPage(L, locale, { products, flash, theme }) {
  // Each row's <form> lives outside the table and is wired to its inputs with the
  // form="" attribute, so the table markup stays valid and the row stays a row.
  const forms = products
    .map((p) => `<form id="prod-${p.id}" method="post" action="/admin/products/${p.id}"></form>
<form id="stock-${p.id}" method="post" action="/admin/products/${p.id}/stock">
<input type="hidden" name="in_stock" value="${p.in_stock ? 0 : 1}"></form>`)
    .join('');
  const rows = products
    .map((p) => {
      const f = `form="prod-${p.id}"`;
      return `<tr>
<td><input ${f} name="emoji" value="${esc(p.emoji)}" size="2" aria-label="${esc(L.emoji)}"></td>
<td><input ${f} name="name_fr" value="${esc(p.name_fr)}" size="12" aria-label="${esc(L.nameFr)}" required></td>
<td><input ${f} name="name_en" value="${esc(p.name_en)}" size="12" aria-label="${esc(L.nameEn)}" required></td>
<td class="num"><input ${f} type="number" name="price_small" value="${p.price_small}" min="0" aria-label="${esc(L.priceSmall)}" required></td>
<td class="num"><input ${f} type="number" name="price_medium" value="${p.price_medium}" min="0" aria-label="${esc(L.priceMedium)}" required></td>
<td class="num"><input ${f} type="number" name="price_large" value="${p.price_large}" min="0" aria-label="${esc(L.priceLarge)}" required></td>
<td class="num"><input ${f} type="number" name="sort_order" value="${p.sort_order}" style="width:4.5em" aria-label="${esc(L.order)}"></td>
<td>${p.in_stock ? badge(L.inStock, 'success') : badge(L.outOfStock, 'danger')}</td>
<td><div class="actions actions--end">
<button ${f} class="btn btn--sm btn--primary">${esc(L.save)}</button>
<button form="stock-${p.id}" class="btn btn--sm ${p.in_stock ? 'btn--danger' : ''}">${esc(p.in_stock ? L.markOut : L.markIn)}</button>
</div></td></tr>`;
    })
    .join('');

  const table = products.length
    ? `<div class="table-wrap"><table><thead><tr><th></th><th>${esc(L.nameFr)}</th><th>${esc(L.nameEn)}</th>
<th class="num">${esc(L.priceSmall)}</th><th class="num">${esc(L.priceMedium)}</th><th class="num">${esc(L.priceLarge)}</th>
<th class="num">${esc(L.order)}</th><th>${esc(L.stock)}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : card(empty(L.noProducts, 'basket'));

  const add = card(`<form method="post" action="/admin/products" class="form-grid">
<div class="field"><label for="n-emoji">${esc(L.emoji)}</label><input id="n-emoji" name="emoji" size="2"></div>
<div class="field"><label for="n-fr">${esc(L.nameFr)}</label><input id="n-fr" name="name_fr" required></div>
<div class="field"><label for="n-en">${esc(L.nameEn)}</label><input id="n-en" name="name_en" required></div>
<div class="field"><label for="n-s">${esc(L.priceSmall)}</label><input id="n-s" type="number" name="price_small" min="0" required></div>
<div class="field"><label for="n-m">${esc(L.priceMedium)}</label><input id="n-m" type="number" name="price_medium" min="0" required></div>
<div class="field"><label for="n-l">${esc(L.priceLarge)}</label><input id="n-l" type="number" name="price_large" min="0" required></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addProduct)}</button></div>
</form>`, { head: `${icon('plus')}<h2>${esc(L.addProduct)}</h2>` });

  return layout(L, { title: L.products, active: 'products', body: `<div hidden>${forms}</div>${table}${section(L.addProduct, add)}`, flash, theme });
}

/* --------------------------- delivery zones ----------------------------- */

export function zonesPage(L, locale, { zones, flash, theme }) {
  const forms = zones.map((z) => `<form id="zone-${z.id}" method="post" action="/admin/zones/${z.id}"></form>`).join('');
  const rows = zones
    .map((z) => {
      const f = `form="zone-${z.id}"`;
      return `<tr>
<td><input ${f} name="name" value="${esc(z.name)}" required aria-label="${esc(L.zone)}"></td>
<td class="num"><input ${f} type="number" name="fee" value="${z.fee}" min="0" aria-label="${esc(L.deliveryFee)}"></td>
<td class="num"><input ${f} type="number" name="sort_order" value="${z.sort_order}" style="width:4.5em" aria-label="${esc(L.order)}"></td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${z.active ? ' checked' : ''}>
<span>${esc(z.active ? L.zoneActive : L.zoneInactive)}</span></label></td>
<td><div class="actions actions--end"><button ${f} class="btn btn--sm btn--primary">${esc(L.save)}</button>
<form method="post" action="/admin/zones/${z.id}/delete" class="inline" onsubmit="return confirm('${esc(L.confirmDeleteZone)}')">
<button class="btn btn--sm btn--danger">${esc(L.delete)}</button></form></div></td></tr>`;
    })
    .join('');

  const table = zones.length
    ? `<div class="table-wrap"><table><thead><tr><th>${esc(L.zone)}</th><th class="num">${esc(L.deliveryFee)}</th>
<th class="num">${esc(L.order)}</th><th>${esc(L.zoneActive)}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : card(empty(L.noZones, 'pin'));

  const add = card(`<form method="post" action="/admin/zones" class="form-grid">
<div class="field"><label for="z-name">${esc(L.zone)}</label><input id="z-name" name="name" required></div>
<div class="field"><label for="z-fee">${esc(L.deliveryFee)}</label><input id="z-fee" type="number" name="fee" min="0" value="0"></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addZone)}</button></div>
</form>`, { head: `${icon('plus')}<h2>${esc(L.addZone)}</h2>` });

  const body = `<p class="muted">${esc(L.zonesHint)}</p>${table}${section(L.addZone, add)}`;
  return layout(L, { title: L.zones, active: 'zones', body, flash, theme });
}

/* ------------------------------- coupons -------------------------------- */

const KINDS = ['amount', 'percent', 'free_delivery'];

function couponValue(L, locale, c) {
  if (c.kind === 'free_delivery') return L.couponKinds.free_delivery;
  if (c.kind === 'percent') return `−${c.value} %`;
  return `−${money(locale, c.value)}`;
}

export function couponsPage(L, locale, { coupons, flash, theme }) {
  const kindOptions = (selected) =>
    KINDS.map((k) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(L.couponKinds[k])}</option>`).join('');

  const forms = coupons.map((c) => `<form id="cp-${c.id}" method="post" action="/admin/coupons/${c.id}"></form>`).join('');
  const rows = coupons
    .map((c) => {
      const f = `form="cp-${c.id}"`;
      const expired = c.expires_on && c.expires_on < new Date().toLocaleDateString('en-CA');
      const exhausted = c.max_uses > 0 && c.used_count >= c.max_uses;
      const state = !c.active ? badge(L.couponOff, 'gray') : expired ? badge(L.couponExpired, 'danger')
        : exhausted ? badge(L.couponExhausted, 'warning') : badge(L.couponOn, 'success', { dot: true });
      return `<tr>
<td><div class="actions"><code class="strong">${esc(c.code)}</code>${state}</div></td>
<td><select ${f} name="kind" aria-label="${esc(L.couponKind)}">${kindOptions(c.kind)}</select></td>
<td class="num"><input ${f} type="number" name="value" value="${c.value}" min="0" aria-label="${esc(L.couponValue)}"></td>
<td class="num"><input ${f} type="number" name="min_subtotal" value="${c.min_subtotal}" min="0" aria-label="${esc(L.couponMin)}"></td>
<td class="num"><input ${f} type="number" name="max_uses" value="${c.max_uses}" min="0" style="width:5em" aria-label="${esc(L.couponMaxUses)}"></td>
<td class="num tabnum">${c.used_count}</td>
<td><input ${f} type="date" name="expires_on" value="${esc(c.expires_on || '')}" aria-label="${esc(L.couponExpires)}"></td>
<td><label class="switch"><input ${f} type="checkbox" name="once_per_customer" value="1"${c.once_per_customer ? ' checked' : ''}>
<span>${esc(L.couponOnce)}</span></label></td>
<td><div class="actions actions--end">
<label class="switch"><input ${f} type="checkbox" name="active" value="1"${c.active ? ' checked' : ''}><span>${esc(L.couponOn)}</span></label>
<button ${f} class="btn btn--sm btn--primary">${esc(L.save)}</button>
<form method="post" action="/admin/coupons/${c.id}/delete" class="inline" onsubmit="return confirm('${esc(L.confirmDeleteCoupon)}')">
<button class="btn btn--sm btn--danger">${esc(L.delete)}</button></form></div></td></tr>`;
    })
    .join('');

  const table = coupons.length
    ? `<div class="table-wrap"><table><thead><tr><th>${esc(L.couponCode)}</th><th>${esc(L.couponKind)}</th>
<th class="num">${esc(L.couponValue)}</th><th class="num">${esc(L.couponMin)}</th><th class="num">${esc(L.couponMaxUses)}</th>
<th class="num">${esc(L.couponUsed)}</th><th>${esc(L.couponExpires)}</th><th>${esc(L.couponOnce)}</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>`
    : card(empty(L.noCoupons, 'ticket'));

  const add = card(`<form method="post" action="/admin/coupons" class="form-grid">
<div class="field"><label for="c-code">${esc(L.couponCode)}</label><input id="c-code" name="code" required maxlength="24" placeholder="PROMO10"></div>
<div class="field"><label for="c-kind">${esc(L.couponKind)}</label><select id="c-kind" name="kind">${kindOptions('amount')}</select></div>
<div class="field"><label for="c-value">${esc(L.couponValue)}</label><input id="c-value" type="number" name="value" min="0" value="0"></div>
<div class="field"><label for="c-min">${esc(L.couponMin)}</label><input id="c-min" type="number" name="min_subtotal" min="0" value="0"></div>
<div class="field"><label for="c-max">${esc(L.couponMaxUses)}</label><input id="c-max" type="number" name="max_uses" min="0" value="0"></div>
<div class="field"><label for="c-exp">${esc(L.couponExpires)}</label><input id="c-exp" type="date" name="expires_on"></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addCoupon)}</button></div>
</form><p class="form-note">${esc(L.couponHint)}</p>`, { head: `${icon('plus')}<h2>${esc(L.addCoupon)}</h2>` });

  const body = `<p class="muted">${esc(L.couponsHint)}</p>${table}${section(L.addCoupon, add)}`;
  return layout(L, { title: L.coupons, active: 'coupons', body, flash, theme });
}

/* ------------------------------- settings ------------------------------- */

export function settingsPage(L, locale, { shop, smtpReady, flash, flashTone, theme }) {
  const day = (d) => {
    const w = shop.hours[d];
    return `<tr><td>${esc(L.weekdays[d])}</td>
<td><label class="switch"><input type="checkbox" name="open_${d}" value="1"${w ? ' checked' : ''}><span>${esc(L.hoursOpen)}</span></label></td>
<td><input type="time" name="from_${d}" value="${esc(w?.open || '07:00')}" aria-label="${esc(L.hoursFrom)}"></td>
<td><input type="time" name="to_${d}" value="${esc(w?.close || '20:00')}" aria-label="${esc(L.hoursTo)}"></td></tr>`;
  };

  const hours = card(`<div class="table-wrap"><table><thead><tr><th>${esc(L.day)}</th><th>${esc(L.hoursOpen)}</th>
<th>${esc(L.hoursFrom)}</th><th>${esc(L.hoursTo)}</th></tr></thead><tbody>${[1, 2, 3, 4, 5, 6, 0].map(day).join('')}</tbody></table></div>
<p class="form-note">${esc(L.hoursHint)}</p>`, { head: `${icon('clock')}<h2>${esc(L.openingHours)}</h2>` });

  const shopCard = card(`<div class="form-grid">
<div class="field"><label for="s-name">${esc(L.shopName)}</label><input id="s-name" name="name" value="${esc(shop.name)}" maxlength="60"></div>
<div class="field"><label for="s-min">${esc(L.minOrder)}</label><input id="s-min" type="number" name="minOrder" min="0" value="${shop.minOrder}"></div>
<div class="field"><label for="s-fee">${esc(L.defaultDeliveryFee)}</label><input id="s-fee" type="number" name="defaultDeliveryFee" min="0" value="${shop.defaultDeliveryFee}"></div>
<div class="field"><label for="s-cap">${esc(L.weeklyCapacity)}</label><input id="s-cap" type="number" name="weeklyCapacity" min="0" value="${shop.weeklyCapacity}"></div>
</div><p class="form-note">${esc(L.capacityHint)}</p>
<hr>
<label class="switch"><input type="checkbox" name="closed" value="1"${shop.closed ? ' checked' : ''}><span class="strong">${esc(L.closeNow)}</span></label>
<div class="field" style="margin-top:.75rem"><label for="s-note">${esc(L.closedNote)}</label>
<input id="s-note" name="closedNote" value="${esc(shop.closedNote)}" maxlength="200" placeholder="${esc(L.closedNotePlaceholder)}"></div>`,
  { head: `${icon('store')}<h2>${esc(L.shopSection)}</h2>` });

  const payment = card(`<label class="switch"><input type="checkbox" name="momoEnabled" value="1"${shop.momoEnabled ? ' checked' : ''}>
<span class="strong">${esc(L.momoEnabled)}</span></label>
<div class="form-grid" style="margin-top:.75rem">
<div class="field"><label for="s-or">${esc(L.momoOrange)}</label><input id="s-or" name="momoOrange" value="${esc(shop.momoOrange)}" inputmode="tel"></div>
<div class="field"><label for="s-ai">${esc(L.momoAirtel)}</label><input id="s-ai" name="momoAirtel" value="${esc(shop.momoAirtel)}" inputmode="tel"></div>
<div class="field"><label for="s-ho">${esc(L.momoHolder)}</label><input id="s-ho" name="momoHolder" value="${esc(shop.momoHolder)}" maxlength="60"></div>
</div><hr>
<label class="switch"><input type="checkbox" name="cashEnabled" value="1"${shop.cashEnabled ? ' checked' : ''}>
<span class="strong">${esc(L.cashEnabled)}</span></label>
<p class="form-note">${esc(L.cashHint)}</p>`, { head: `${icon('wallet')}<h2>${esc(L.paymentSection)}</h2>` });

  const alerts = card(`<div class="field"><label for="s-admin">${esc(L.adminNotifyNumber)}</label>
<input id="s-admin" name="adminNotifyNumber" value="${esc(shop.adminNotifyNumber)}" inputmode="tel" placeholder="243899000000"></div>
<p class="form-note">${esc(L.adminNotifyHint)}</p>
<hr>
<label class="switch"><input type="checkbox" name="emailAlerts" value="1"${shop.emailAlerts ? ' checked' : ''}>
<span class="strong">${esc(L.emailAlerts)}</span></label>
<div class="field" style="margin-top:.75rem"><label for="s-mail">${esc(L.alertEmail)}</label>
<input id="s-mail" type="email" name="alertEmail" value="${esc(shop.alertEmail)}" placeholder="vous@exemple.com"></div>
<p class="form-note">${esc(smtpReady ? L.smtpReady : L.smtpMissing)}</p>`,
  { head: `${icon('message')}<h2>${esc(L.alertsSection)}</h2>${smtpReady ? badge(L.smtpOn, 'success', { dot: true }) : badge(L.smtpOff, 'gray')}` });

  const body = `<form method="post" action="/admin/settings">
<div class="grid-2">${shopCard}${payment}</div>
<div class="grid-2" style="margin-top:1rem">${hours}${alerts}</div>
<div class="actions" style="margin-top:1.25rem"><button class="btn btn--primary">${icon('check', 17)} ${esc(L.save)}</button></div>
</form>
${smtpReady ? `<form method="post" action="/admin/settings/test-email" class="actions" style="margin-top:.75rem">
<button class="btn">${icon('message', 17)} ${esc(L.sendTestEmail)}</button>
<span class="muted">${esc(L.sendTestEmailHint)}</span></form>` : ''}`;
  return layout(L, { title: L.settings, active: 'settings', body, flash, flashTone, theme });
}

/* ------------------------------- customers ------------------------------ */

export function customersPage(L, locale, { customers, query = '', segment = '', theme }) {
  const rows = customers
    .map((c) => `<tr>
<td><div class="actions"><span class="avatar">${esc(initials(c.name, c.phone))}</span>
<a href="/admin/customers/${c.id}"><b>${esc(c.name || '—')}</b></a></div></td>
<td>${waLink(c.phone)}</td><td>${esc(c.neighborhood || '')}</td>
<td>${badge(L.segments[c.segment] || c.segment, c.segment === 'vip' ? 'primary' : c.segment === 'regular' ? 'info' : 'gray')}</td>
<td class="num tabnum">${c.orders_count}</td><td class="num tabnum">${esc(money(locale, c.total_spent))}</td>
<td class="num tabnum">${c.credit ? esc(money(locale, c.credit)) : '–'}</td>
<td><code>${esc(c.referral_code || '')}</code></td>
<td>${c.marketing_opt_out ? badge(L.optOut, 'gray') : ''} ${c.waitlist_since ? badge(L.waitlist, 'warning') : ''}</td></tr>`)
    .join('');

  const segments = ['', 'new', 'regular', 'vip']
    .map((s) => `<a class="${s === segment ? 'on' : ''}" href="/admin/customers?segment=${s}${query ? `&q=${encodeURIComponent(query)}` : ''}">${esc(s ? L.segments[s] : L.all)}</a>`)
    .join('');

  const toolbar = `<div class="toolbar">
<form method="get" action="/admin/customers" class="inline">
<input type="hidden" name="segment" value="${esc(segment)}">
<input name="q" value="${esc(query)}" placeholder="${esc(L.searchCustomers)}" aria-label="${esc(L.searchCustomers)}" size="24">
<button class="btn">${icon('search', 17)}</button></form>
<div class="segmented">${segments}</div>
<span style="margin-left:auto">${badge(`${customers.length} ${L.customers.toLowerCase()}`, 'gray')}</span></div>`;

  const table = customers.length
    ? `<div class="table-wrap"><table><thead><tr><th>${esc(L.name)}</th><th>${esc(L.phone)}</th><th>${esc(L.zone)}</th>
<th>${esc(L.segment)}</th><th class="num">${esc(L.ordersCount)}</th><th class="num">${esc(L.spent)}</th>
<th class="num">${esc(L.credit)}</th><th>${esc(L.referralCode)}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : card(empty(L.noCustomers, 'users'));

  return layout(L, { title: L.customers, active: 'customers', body: `${toolbar}${table}`, theme });
}

export function customerPage(L, locale, { customer, orders, messages, state, canReply, flash, theme }) {
  const human = state === 'HUMAN';
  const reply = canReply
    ? `<form method="post" action="/admin/customers/${customer.id}/reply">
<label for="reply">${esc(L.reply)}</label>
<textarea id="reply" name="body" rows="3" required maxlength="4000" style="margin:.35rem 0"></textarea>
<div class="actions"><button class="btn btn--primary">${icon('message', 17)} ${esc(L.send)}</button></div></form>`
    : `<div class="alert alert--warning">${icon('clock')}<span>${esc(L.windowClosed)}</span></div>`;

  const controls = card(`${human ? `<div class="alert alert--warning">${icon('hand')}<span>${esc(L.botPaused)}</span></div>` : ''}
${reply}
<hr><div class="actions">${human
    ? `<form method="post" action="/admin/customers/${customer.id}/release" class="inline"><button class="btn">${icon('bot', 17)} ${esc(L.release)}</button></form>`
    : `<form method="post" action="/admin/customers/${customer.id}/takeover" class="inline"><button class="btn">${icon('hand', 17)} ${esc(L.takeOver)}</button></form>`}</div>`);

  const rows = orders
    .map((o) => `<tr><td><a href="/admin/orders/${o.id}">${esc(o.reference)}</a></td><td>${statusBadge(L, o.status)}</td>
<td>${paymentBadge(L, o)}</td><td class="num tabnum">${esc(money(locale, o.total))}</td>
<td>${o.rating ? '⭐'.repeat(o.rating) : ''}</td></tr>`)
    .join('');

  const profile = card(`<div class="actions"><span class="avatar">${esc(initials(customer.name, customer.phone))}</span>
<span><b class="strong">${esc(customer.name || customer.phone)}</b><br><span class="muted">${waLink(customer.phone)}</span></span>
<span class="spacer"></span>${badge(L.segments[customer.segment] || customer.segment, customer.segment === 'vip' ? 'primary' : 'gray')}</div>
<hr><div>${icon('pin', 15)} ${esc(customer.neighborhood || '—')}
${customer.address_note ? `<span class="muted">— ${linkify(customer.address_note)}</span>` : ''}</div>
<div class="muted" style="margin-top:.5rem">${esc(L.ordersCount)} : <b class="strong">${customer.orders_count}</b> ·
${esc(L.spent)} : <b class="strong">${esc(money(locale, customer.total_spent))}</b> ·
${esc(L.credit)} : <b class="strong">${esc(money(locale, customer.credit))}</b> ·
${esc(L.referralCode)} : <code>${esc(customer.referral_code)}</code> ·
${esc(L.lastSeen)} : ${esc(customer.last_seen_at || '—')} UTC</div>`);

  const body = `<p><a href="/admin/customers">${esc(L.back)}</a></p>${profile}
${section(L.history, orders.length
    ? `<div class="table-wrap"><table><thead><tr><th>${esc(L.reference)}</th><th>${esc(L.statusLabel)}</th><th>${esc(L.payment)}</th>
<th class="num">${esc(L.total)}</th><th>${esc(L.rating)}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : card(empty(L.noOrdersCustomer, 'receipt')))}
${section(L.conversation, card(chat(L, messages)))}
${controls}${liveUpdates(L)}`;
  return layout(L, { title: customer.name || customer.phone, active: 'customers', body, flash, theme });
}

/* --------------------------------- stats -------------------------------- */

const compact = (locale, n) =>
  new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Round axis ticks: 0, a nice step, ... covering the max. */
function ticks(max) {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out.at(-1) < max) out.push(out.at(-1) + step);
  return out;
}

/** Single-series column chart in plain HTML: responsive, crisp text, a per-column hover/focus tooltip. */
function revenueChart(L, locale, series) {
  const max = Math.max(...series.map((d) => d.revenue), 0);
  if (!max) return empty(L.stats.empty, 'chart');
  const axis = ticks(max);
  const top = axis.at(-1);
  const peak = series.reduce((a, b) => (b.revenue > a.revenue ? b : a));
  const dateFmt = (day, opts) => new Date(`${day}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', opts);
  const labelEvery = Math.ceil(series.length / 6);
  const grid = axis
    .map((v) => `<div class="gl" style="bottom:${(v / top) * 100}%"><span>${esc(compact(locale, v))}</span></div>`)
    .join('');
  const cols = series
    .map((d, i) => {
      const h = (d.revenue / top) * 100;
      const last = series.length - 1;
      const showX = i % labelEvery === 0 || i === last;
      const major = i === 0 || i === last || i === Math.round(last / 2); // the only dates kept on phones
      return `<div class="col" tabindex="0" data-day="${esc(dateFmt(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}"
data-value="${esc(money(locale, d.revenue))}" data-orders="${d.orders}">
${d === peak ? `<span class="cap" style="bottom:calc(${h}% + 3px)">${esc(compact(locale, d.revenue))}</span>` : ''}<div class="colbar" style="height:${h}%"></div>
${showX || major ? `<span class="x${major ? '' : ' minor'}">${esc(dateFmt(d.day, { day: 'numeric', month: 'short' }))}</span>` : ''}</div>`;
    })
    .join('');
  const table = series
    .filter((d) => d.revenue)
    .map((d) => `<tr><td>${esc(d.day)}</td><td class="num tabnum">${d.orders}</td><td class="num tabnum">${esc(money(locale, d.revenue))}</td></tr>`)
    .join('');
  // Tooltip text is set with textContent (values come from the database).
  const script = `<script>(function(){var chart=document.currentScript.previousElementSibling,tip=chart.querySelector('.tip');
function show(col){var b=document.createElement('b');b.textContent=col.dataset.value;tip.replaceChildren(b,document.createTextNode(col.dataset.day+' · '+col.dataset.orders+' ${esc(L.stats.orders.toLowerCase())}'));
tip.style.display='block';var r=col.getBoundingClientRect(),c=chart.getBoundingClientRect();var x=r.left-c.left+r.width/2-tip.offsetWidth/2;
tip.style.left=Math.max(-40,Math.min(x,c.width-tip.offsetWidth))+'px';tip.style.top='-8px';}
chart.querySelectorAll('.col').forEach(function(col){col.addEventListener('pointerenter',function(){show(col)});col.addEventListener('focus',function(){show(col)});
col.addEventListener('pointerleave',function(){tip.style.display='none'});col.addEventListener('blur',function(){tip.style.display='none'});});})();</script>`;
  return `<div class="chart" role="img" aria-label="${esc(L.stats.daily)}">${grid}<div class="cols">${cols}</div><div class="tip"></div></div>${script}
<details><summary class="muted">${esc(L.stats.showTable)}</summary><div class="table-wrap" style="margin-top:.5rem"><table><thead><tr><th>${esc(L.stats.day)}</th>
<th class="num">${esc(L.stats.orders)}</th><th class="num">${esc(L.stats.revenue)}</th></tr></thead><tbody>${table}</tbody></table></div></details>`;
}

const simpleTable = (headers, rows, emptyLabel, emptyIcon) =>
  rows
    ? `<div class="table-wrap"><table><thead><tr>${headers.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table></div>`
    : card(empty(emptyLabel, emptyIcon));

export function statsPage(L, locale, { days, series, stats, products, zones, segments, payments, coupons, theme }) {
  const periods = [7, 30, 90]
    .map((n) => `<a class="${n === days ? 'on' : ''}" href="/admin/stats?days=${n}">${esc(L.stats.last(n))}</a>`)
    .join('');
  const from = series[0].day;
  const to = series.at(-1).day;
  const basket = stats.orders ? Math.round(stats.revenue / stats.orders) : 0;
  const repeat = stats.buyers ? Math.round((stats.repeatBuyers / stats.buyers) * 100) : 0;

  const productRows = products
    .map((p) => `<tr><td>${esc(p.emoji)} ${esc(locale === 'en' ? p.name_en : p.name_fr)}</td>
<td class="num tabnum">${p.qty}</td><td class="num tabnum">${esc(money(locale, p.revenue))}</td></tr>`)
    .join('');
  const zoneRows = zones
    .map((z) => `<tr><td>${esc(z.zone)}</td><td class="num tabnum">${z.orders}</td><td class="num tabnum">${esc(money(locale, z.revenue))}</td></tr>`)
    .join('');
  const paymentRows = payments
    .map((p) => `<tr><td>${esc(p.method === 'cash' ? L.payCash : L.payMomo)}</td>
<td class="num tabnum">${p.orders}</td><td class="num tabnum">${esc(money(locale, p.revenue))}</td></tr>`)
    .join('');
  const couponRows = coupons
    .map((c) => `<tr><td><code>${esc(c.code)}</code></td><td class="num tabnum">${c.uses}</td>
<td class="num tabnum">${esc(money(locale, c.granted))}</td></tr>`)
    .join('');
  const segmentLine = segments
    .map((g) => badge(`${L.segments[g.segment] || g.segment} · ${g.n}`, g.segment === 'vip' ? 'primary' : g.segment === 'regular' ? 'info' : 'gray'))
    .join(' ');

  const body = `<div class="toolbar"><div class="segmented">${periods}</div>
<span style="margin-left:auto"></span>
<a class="btn" href="/admin/export.csv?from=${from}&amp;to=${to}">${icon('download', 17)} ${esc(L.stats.exportCsv)}</a></div>
<div class="stats">
${stat({ name: 'cash', tone: 'success', value: money(locale, stats.revenue), label: L.stats.revenue })}
${stat({ name: 'receipt', tone: 'primary', value: String(stats.orders), label: L.stats.orders })}
${stat({ name: 'basket', tone: 'info', value: money(locale, basket), label: L.stats.basket })}
${stat({ name: 'users', tone: 'warning', value: String(stats.newCustomers), label: L.stats.newCustomers })}
${stat({ name: 'check', tone: 'success', value: `${repeat} %`, label: L.stats.repeat, hint: L.stats.repeatHint })}
${stat({ name: 'star', tone: 'warning', value: stats.ratings ? `${stats.rating.toFixed(1)} / 5` : '–', label: L.stats.rating,
    hint: stats.ratings ? L.stats.ratingsCount(stats.ratings) : L.stats.noRating })}
</div>
${card(revenueChart(L, locale, series), { head: `${icon('chart')}<h2>${esc(L.stats.daily)}</h2><span class="muted">${esc(L.stats.dailyHint)}</span>` })}
<div class="grid-2" style="margin-top:1rem">
<div>${section(L.stats.topProducts, simpleTable([L.product, L.stats.qty, L.stats.revenue], productRows, L.stats.empty, 'basket'))}</div>
<div>${section(L.stats.zones, simpleTable([L.zone, L.stats.orders, L.stats.revenue], zoneRows, L.stats.empty, 'pin'))}</div>
<div>${section(L.stats.payments, simpleTable([L.payment, L.stats.orders, L.stats.revenue], paymentRows, L.stats.empty, 'wallet'))}</div>
<div>${section(L.stats.coupons, simpleTable([L.couponCode, L.stats.couponUses, L.stats.couponGranted], couponRows, L.stats.noCoupons, 'ticket'))}</div>
</div>
${segments.length ? section(L.stats.segments, `<div class="actions">${segmentLine}</div>`) : ''}`;
  return layout(L, { title: L.stats.title, active: 'stats', body, theme });
}
