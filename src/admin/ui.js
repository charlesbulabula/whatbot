// Shared dashboard building blocks: escaping, the page shell (sidebar, header
// with global search and the profile menu), and the small components every page
// is assembled from. Page modules import from here, never the other way round.
import { money } from '../i18n/index.js';
import * as db from '../db/index.js';
import * as settings from '../shop/settings.js';
import { CSS, FONT_LINK, FAVICON, icon } from './theme.js';
import { vapid } from '../pwa.js';
import { can as roleCan } from '../shop/staff.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const linkify = (s) =>
  esc(s).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);

/** Status colour, matching the theme's soft badge palette. */
export const STATUS_TONE = {
  awaiting_payment: 'warning',
  paid: 'info',
  preparing: 'primary',
  on_the_way: 'primary',
  delivered: 'success',
  cancelled: 'danger',
};

/* ------------------------------ components ------------------------------ */

export const badge = (label, tone = 'gray', { dot = false } = {}) =>
  `<span class="badge badge--${tone}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;

export const statusBadge = (L, status) => badge(L.status[status] || status, STATUS_TONE[status] || 'gray', { dot: true });

export const paymentBadge = (L, order) =>
  order.payment_method === 'cash' ? badge(L.payCash, 'warning') : badge(L.payMomo, 'gray');

export const waLink = (phone) =>
  `<a href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener">+${esc(phone)}</a>`;

export const initials = (name, phone) => {
  const source = String(name || '').trim();
  if (!source) return String(phone || '?').slice(-2);
  return source.split(/\s+/).slice(0, 2).map((w) => [...w][0]).join('');
};

export const avatar = (name, phone, { size = '' } = {}) =>
  `<span class="avatar"${size ? ` style="width:${size};height:${size}"` : ''}>${esc(initials(name, phone))}</span>`;

export const card = (body, { head, className = '', bodyClass = '' } = {}) =>
  `<div class="card ${className}">${head ? `<div class="card__head">${head}</div>` : ''}
<div class="card__body ${bodyClass}">${body}</div></div>`;

export const section = (title, body, actions = '') =>
  `<section class="section"><div class="section__title"><h2>${esc(title)}</h2>${actions ? `<span class="spacer"></span>${actions}` : ''}</div>${body}</section>`;

export const empty = (text, name = 'box') => `<div class="empty">${icon(name, 34)}<p>${esc(text)}</p></div>`;

export const alert = (text, tone = '', iconName = 'info') =>
  `<div class="alert${tone ? ` alert--${tone}` : ''}">${icon(iconName)}<span>${text}</span></div>`;

/** A single figure with its icon, optional hint and optional trend against the previous period. */
export function stat({ name, tone = 'primary', value, label, hint, trend, spark }) {
  return `<div class="stat">
<span class="stat__icon badge--${tone}">${icon(name, 22)}</span>
<span><b class="stat__value">${esc(value)}</b>
${trend || ''}
<span class="stat__label">${esc(label)}</span>
${hint ? `<span class="stat__hint">${esc(hint)}</span>` : ''}
${spark || ''}</span></div>`;
}

/** "+12 %" against the previous period, or nothing when there is no basis to compare. */
export function trendTag(L, current, previous) {
  if (!previous) return current ? `<span class="trend trend--up">${icon('trending', 13)} ${esc(L.trendNew)}</span>` : '';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `<span class="trend trend--flat">${esc(L.trendFlat)}</span>`;
  const cls = pct > 0 ? 'up' : 'down';
  return `<span class="trend trend--${cls}">${icon('trending', 13)} ${pct > 0 ? '+' : ''}${pct} %</span>`;
}

/** Icon-only action, with the label shown as a tooltip and read by screen readers. */
export const iconAction = (href, name, label, { tone = '', target = '' } = {}) =>
  `<a class="icon-btn${tone ? ` icon-btn--${tone}` : ''}" href="${href}" data-tip="${esc(label)}" aria-label="${esc(label)}"${target ? ` target="${target}" rel="noopener"` : ''}>${icon(name, 17)}</a>`;

/** Same, as a one-button POST form (status change, delete...). */
export const iconPost = (action, name, label, { tone = '', confirm = '', fields = {} } = {}) =>
  `<form method="post" action="${action}"${confirm ? ` onsubmit="return confirm('${esc(confirm)}')"` : ''}>
${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')}
<button class="icon-btn${tone ? ` icon-btn--${tone}` : ''}" data-tip="${esc(label)}" aria-label="${esc(label)}">${icon(name, 17)}</button></form>`;

/** Table wrapper with a header row; `headers` items may be strings or {label, num, sort}. */
export function table(headers, rows, { sortBy, sortDir, sortUrl } = {}) {
  const th = headers
    .map((h) => {
      const { label = h, num = false, sort = null } = typeof h === 'string' ? {} : h;
      const text = esc(label);
      if (!sort || !sortUrl) return `<th${num ? ' class="num"' : ''}>${text}</th>`;
      const active = sort === sortBy;
      const nextDir = active && sortDir === 'desc' ? 'asc' : 'desc';
      return `<th${num ? ' class="num"' : ''}><a class="${active ? 'on' : ''}" href="${sortUrl(sort, nextDir)}">${text}
<span class="sort">${icon(active && sortDir === 'asc' ? 'trending' : 'sort', 13)}</span></a></th>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Page selector under a list. `url(page)` builds the link for a page number. */
export function pager(L, { page, pageSize, total, url }) {
  if (total <= pageSize) return '';
  const pages = Math.ceil(total / pageSize);
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn = (p, label, disabled) =>
    disabled
      ? `<span class="btn btn--sm" aria-disabled="true">${label}</span>`
      : `<a class="btn btn--sm" href="${url(p)}">${label}</a>`;
  return `<nav class="pager" aria-label="${esc(L.pagination)}">
<span class="pager__info">${esc(L.pageRange(from, to, total))}</span>
${btn(page - 1, esc(L.prev), page === 0)}
<span class="badge badge--gray">${page + 1} / ${pages}</span>
${btn(page + 1, esc(L.next), page + 1 >= pages)}</nav>`;
}

/** Row of tabs; items are [key, href, label, iconName]. */
export const tabs = (items, active) =>
  `<nav class="tabs">${items
    .map(([key, href, label, name]) => `<a href="${href}" class="${key === active ? 'on' : ''}"${key === active ? ' aria-current="page"' : ''}>
${name ? icon(name, 17) : ''}${esc(label)}</a>`)
    .join('')}</nav>`;

/** Removable filter chips, so an active filter is always visible and undoable. */
export const filterChips = (chips) =>
  chips.length
    ? `<div class="chips">${chips
      .map(({ label, href }) => `<span class="chip">${esc(label)}<a href="${href}" aria-label="×">${icon('x', 13)}</a></span>`)
      .join('')}</div>`
    : '';

/* -------------------------------- layout -------------------------------- */

const NAV = (L) => [
  { area: 'orders', group: '', items: [
    ['orders', '/admin', L.navOrders, 'receipt'],
    ['route', '/admin/route', L.navRoute, 'scooter'],
  ] },
  { area: 'catalogue', group: L.navGroupCatalogue, items: [
    ['products', '/admin/products', L.navProducts, 'basket'],
    ['zones', '/admin/zones', L.navZones, 'pin'],
    ['slots', '/admin/slots', L.navSlots, 'clock'],
    ['coupons', '/admin/coupons', L.navCoupons, 'ticket'],
  ] },
  { area: 'customers', group: L.navGroupCustomers, items: [
    ['customers', '/admin/customers', L.navCustomers, 'users'],
    ['loyalty', '/admin/loyalty', L.navLoyalty, 'gift'],
    ['subscriptions', '/admin/subscriptions', L.navSubscriptions, 'refresh'],
  ] },
  { area: 'marketing', group: L.navGroupMarketing, items: [
    ['broadcast', '/admin/broadcast', L.navBroadcast, 'megaphone'],
  ] },
  { area: 'money', group: L.navGroupAnalysis, items: [
    ['stats', '/admin/stats', L.navStats, 'chart'],
    ['expenses', '/admin/expenses', L.navExpenses, 'wallet'],
    ['accounting', '/admin/accounting', L.navAccounting, 'file'],
  ] },
  { area: 'settings', group: L.navGroupShop, items: [
    ['settings', '/admin/settings', L.navSettings, 'settings'],
    ['staff', '/admin/staff', L.navStaff, 'key'],
  ] },
  { area: 'audit', group: '', items: [
    ['audit', '/admin/audit', L.navAudit, 'history'],
  ] },
];

/** Counts shown as sidebar badges: work actually waiting for the shop. */
function navCounts() {
  try {
    return {
      orders: db.pendingProofCount(),
      customers: db.handoffConversations().length,
      products: db.lowStockProducts().length,
    };
  } catch {
    return {};
  }
}

/**
 * The page shell. `active` is the sidebar key, `title` shows in the header and
 * the tab, `theme` is the saved light/dark choice ('' = follow the device).
 */
export function layout(L, {
  title, active, body, flash, flashTone = '', theme = '', search = '', role = 'owner', waHealth = null,
}) {
  const can = (area) => roleCan(role, area);
  // The push key is generated on first use and then stable, so every page can
  // offer notifications without the router threading it through.
  let vapidPublicKey = '';
  try {
    vapidPublicKey = vapid().publicKey;
  } catch {
    vapidPublicKey = '';
  }
  const shop = settings.get();
  const open = settings.isOpen(new Date(), shop);
  const counts = navCounts();

  const nav = NAV(L)
    .filter(({ area }) => can(area))
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
  const profile = `<div class="menu">
<button class="icon-btn" id="profile-btn" aria-haspopup="true" aria-expanded="false" data-tip="${esc(L.account)}">
${avatar(shop.name, '', { size: '32px' })}</button>
<div class="menu__panel" id="profile-menu" role="menu">
  <div class="menu__head">${esc(shop.name)}</div>
  <a class="menu__item" role="menuitem" href="/admin/settings">${icon('settings', 17)}${esc(L.navSettings)}</a>
  <a class="menu__item" role="menuitem" href="/admin/theme">${icon(nextTheme === 'dark' ? 'moon' : 'sun', 17)}${esc(L.theme[nextTheme])}</a>
  <a class="menu__item" role="menuitem" href="/admin/lang">${icon('globe', 17)}${esc(L.switchLang)}</a>
  <div class="menu__sep"></div>
  <a class="menu__item" role="menuitem" href="/admin/audit">${icon('history', 17)}${esc(L.navAudit)}</a>
  <a class="menu__item" role="menuitem" href="/admin/backup">${icon('download', 17)}${esc(L.downloadBackup)}</a>
  <button class="menu__item" role="menuitem" id="enable-push" type="button">${icon('bell', 17)}${esc(L.enablePush)}</button>
  <div class="menu__sep"></div>
  <a class="menu__item" role="menuitem" href="/admin/logout">${icon('logout', 17)}${esc(L.logout)}</a>
</div></div>`;

  return `<!doctype html><html lang="${L.lang}"${theme ? ` data-bs-theme="${theme}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark"><title>${esc(title)} · ${esc(shop.name)}</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon.svg">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(shop.name)}">
${FAVICON}${FONT_LINK}<style>${CSS}</style></head><body><div class="hk-wrapper">
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
  <form class="hk-search" method="get" action="/admin/search" role="search">
    <span class="hk-search__icon">${icon('search', 17)}</span>
    <input type="search" name="q" id="global-search" value="${esc(search)}" placeholder="${esc(L.searchPlaceholder)}"
      aria-label="${esc(L.searchPlaceholder)}" autocomplete="off">
    <kbd>/</kbd>
  </form>
  <a class="icon-btn" id="theme-toggle" href="/admin/theme" data-tip="${esc(L.theme[nextTheme])}">${icon(nextTheme === 'dark' ? 'moon' : 'sun')}</a>
  ${profile}
</header>
<main class="hk-page">
${flash ? alert(esc(flash), flashTone, flashTone === 'danger' ? 'alert' : 'check') : ''}
${waBanner(L, waHealth)}
${!open ? alert(`${esc(L.closedBanner)} <a href="/admin/settings">${esc(L.closedBannerLink)}</a>`, 'warning', 'clock') : ''}
${body}</main></div>
${shellScript(theme)}${pushScript(vapidPublicKey)}</body></html>`;
}

/**
 * The only always-on script: the profile dropdown, the "/" search shortcut, and
 * — when no theme is saved — pointing the toggle at the opposite of the device
 * theme, which is the one thing the server cannot know.
 */
function shellScript(theme) {
  return `<script>(function(){
var btn=document.getElementById('profile-btn'),menu=document.getElementById('profile-menu');
if(btn&&menu){var close=function(){menu.removeAttribute('data-open');btn.setAttribute('aria-expanded','false')};
btn.addEventListener('click',function(e){e.stopPropagation();var open=menu.hasAttribute('data-open');
if(open)close();else{menu.setAttribute('data-open','');btn.setAttribute('aria-expanded','true')}});
document.addEventListener('click',close);
document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});}
document.addEventListener('keydown',function(e){
 var t=e.target,typing=t&&/INPUT|TEXTAREA|SELECT/.test(t.tagName);
 if(e.key==='/'&&!typing){e.preventDefault();var s=document.getElementById('global-search');if(s){s.focus();s.select()}}});
${theme ? '' : `var a=document.getElementById('theme-toggle');
if(a){var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
a.href='/admin/theme?to='+(dark?'light':'dark');if(dark)a.innerHTML=${JSON.stringify(icon('sun'))};}`}
})();</script>`;
}

/**
 * Live updates: the server pushes an event whenever something the page shows
 * changes (see admin/live.js). The page shows a toast and refreshes itself a
 * moment later — unless the admin is typing, in which case it waits and offers
 * the refresh as a click instead, so nothing typed is ever thrown away.
 */
export function liveUpdates(L, fallbackSeconds = 90) {
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
es.addEventListener('error',function(){});}
else{setInterval(function(){if(!busy())location.reload()},${fallbackSeconds * 1000});}
})();</script>`;
}

/**
 * The one failure the shop must never miss: the bot still receives messages but
 * every answer is refused, so orders are silently lost.
 */
function waBanner(L, health) {
  if (!health || health.ok || health.disabled) return '';
  const text = health.reason === 'expired'
    ? L.waExpired(health.expiresAt || '')
    : health.reason === 'unconfigured'
      ? L.waUnconfigured
      : health.reason === 'unreachable'
        ? L.waUnreachable
        : L.waInvalid;
  // A network blip is a warning; a dead token is an emergency.
  const tone = health.reason === 'unreachable' ? 'warning' : 'danger';
  return alert(`<b>${esc(L.waBrokenTitle)}</b> — ${esc(text)}
 <a href="/admin/settings?tab=system">${esc(L.waFixLink)}</a>`, tone, 'alert');
}

/**
 * Installs the service worker, and wires the "notify me" item of the account
 * menu to the Push API. Everything degrades quietly on a browser without it.
 */
function pushScript(publicKey) {
  if (!publicKey) return '';
  return `<script>(function(){
if(!('serviceWorker' in navigator))return;
navigator.serviceWorker.register('/sw.js').catch(function(){});
var btn=document.getElementById('enable-push');if(!btn||!('PushManager' in window))return;
function b64(s){var p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(b,function(c){return c.charCodeAt(0)});}
btn.addEventListener('click',function(e){e.stopPropagation();
 Notification.requestPermission().then(function(perm){
  if(perm!=='granted')return;
  navigator.serviceWorker.ready.then(function(reg){
   return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(${JSON.stringify(publicKey)})});
  }).then(function(sub){
   return fetch('/admin/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub)});
  }).then(function(){btn.textContent='✅';}).catch(function(){});
 });});
})();</script>`;
}

/* ------------------------------ formatting ------------------------------ */

export const fmtMoney = (locale, amount) => money(locale, amount);

export const productLabel = (p, locale) =>
  `${p.emoji ? `${esc(p.emoji)} ` : ''}${esc(locale === 'en' ? p.name_en : p.name_fr)}`;

/** Variant name of an order line: what it was sold as, or the default size name. */
export const variantName = (L, item) => item.variant_label || L.sizes[item.size] || item.size;

/** "préparé, nettoyé" for an order line, or an empty string. */
export function extrasName(item) {
  if (!item.extras) return '';
  try {
    return JSON.parse(item.extras).map((e) => e.label).filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

export const utcTime = (value, locale, opts = { hour: '2-digit', minute: '2-digit' }) =>
  new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', opts);

export const utcDateTime = (value, locale) =>
  new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export const dayOf = (value) => new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleDateString('en-CA');

export { icon };
