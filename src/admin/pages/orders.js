// Orders: the filterable list, one order's detail page, and the printable
// documents (invoice with a verifiable QR code, prep ticket, picking list).
import { money } from '../../i18n/index.js';
import {
  esc, linkify, card, section, empty, badge, statusBadge, paymentBadge, waLink, table, pager,
  layout, liveUpdates, icon, productLabel, variantName, extrasName, utcTime, utcDateTime, dayOf,
  iconAction, filterChips, avatar,
} from '../ui.js';
import { orderCard, statusActions, quantitiesTable } from './dashboard.js';
import { CSS, FONT_LINK, FAVICON } from '../theme.js';

const STATUSES = ['awaiting_payment', 'paid', 'preparing', 'on_the_way', 'delivered', 'cancelled'];

/* ------------------------------ order list ------------------------------ */

export function ordersPage(L, locale, data) {
  const { rows, total, filters, zones, page, pageSize, flash, theme, role = 'owner' } = data;
  const q = (patch = {}) => {
    const p = new URLSearchParams();
    const merged = { ...filters, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/orders${p.toString() ? `?${p}` : ''}`;
  };
  const sortUrl = (sort, dir) => q({ sort, dir, page: 0 });

  const option = (value, label, current) =>
    `<option value="${esc(value)}"${String(current) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;

  const bar = `<form class="filters" method="get" action="/admin/orders">
<div class="field field--grow"><label for="f-q">${esc(L.search)}</label>
<input id="f-q" name="q" value="${esc(filters.q || '')}" placeholder="${esc(L.searchOrders)}"></div>
<div class="field"><label for="f-status">${esc(L.statusLabel)}</label>
<select id="f-status" name="status">${option('', L.all, filters.status)}
${STATUSES.map((s) => option(s, L.status[s], filters.status)).join('')}</select></div>
<div class="field"><label for="f-zone">${esc(L.zone)}</label>
<select id="f-zone" name="zone">${option('', L.all, filters.zone)}
${zones.map((z) => option(z, z, filters.zone)).join('')}</select></div>
<div class="field"><label for="f-pay">${esc(L.payment)}</label>
<select id="f-pay" name="payment">${option('', L.all, filters.payment)}
${option('momo', L.payMomo, filters.payment)}${option('cash', L.payCash, filters.payment)}</select></div>
<div class="field"><label for="f-from">${esc(L.from)}</label><input id="f-from" type="date" name="from" value="${esc(filters.from || '')}"></div>
<div class="field"><label for="f-to">${esc(L.to)}</label><input id="f-to" type="date" name="to" value="${esc(filters.to || '')}"></div>
<input type="hidden" name="sort" value="${esc(filters.sort || '')}"><input type="hidden" name="dir" value="${esc(filters.dir || '')}">
<div class="actions"><button class="btn btn--primary">${icon('filter', 17)} ${esc(L.apply)}</button>
<a class="btn" href="/admin/orders">${esc(L.reset)}</a></div></form>`;

  const chips = [];
  if (filters.q) chips.push({ label: `${L.search}: ${filters.q}`, href: q({ q: '' }) });
  if (filters.status) chips.push({ label: L.status[filters.status], href: q({ status: '' }) });
  if (filters.zone) chips.push({ label: filters.zone, href: q({ zone: '' }) });
  if (filters.payment) chips.push({ label: filters.payment === 'cash' ? L.payCash : L.payMomo, href: q({ payment: '' }) });
  if (filters.from || filters.to) chips.push({ label: `${filters.from || '…'} → ${filters.to || '…'}`, href: q({ from: '', to: '' }) });

  const body = rows
    .map((o) => `<tr>
<td><a href="/admin/orders/${o.id}"><b>${esc(o.reference)}</b></a><br>
<span class="muted" style="font-size:.75rem">${esc(utcDateTime(o.created_at, locale))}</span></td>
<td><div class="actions">${avatar(o.customer_name, o.customer.phone, { size: '30px' })}
<span class="stack"><a href="/admin/customers/${o.customer.id}">${esc(o.customer_name || '—')}</a>
<span class="muted" style="font-size:.75rem">${waLink(o.customer.phone)}</span></span></div></td>
<td>${esc(o.neighborhood || '')}</td>
<td>${statusBadge(L, o.status)}</td>
<td>${paymentBadge(L, o)}</td>
<td class="num tabnum">${esc(money(locale, o.total))}</td>
<td><div class="row-actions">
${iconAction(`/admin/orders/${o.id}`, 'eye', L.view)}
${iconAction(`/admin/orders/${o.id}/invoice`, 'file', L.invoice, { target: '_blank' })}
${iconAction(`/admin/orders/${o.id}/ticket`, 'print', L.ticket, { target: '_blank' })}
${o.payment_proof ? iconAction(`/admin/orders/${o.id}/proof`, 'qr', L.proof, { target: '_blank' }) : ''}
</div></td></tr>`)
    .join('');

  const list = rows.length
    ? table(
      [
        { label: L.reference, sort: 'date' },
        { label: L.customers, sort: 'customer' },
        L.zone,
        { label: L.statusLabel, sort: 'status' },
        L.payment,
        { label: L.total, num: true, sort: 'total' },
        '',
      ],
      body,
      { sortBy: filters.sort || 'date', sortDir: filters.dir || 'desc', sortUrl },
    )
    : card(empty(L.noOrdersFound, 'receipt'));

  const head = `<div class="toolbar">
<span class="strong">${esc(L.ordersFound(total))}</span>
<span style="margin-left:auto"></span>
<a class="btn" href="/admin/export.csv?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()}">${icon('download', 17)} ${esc(L.stats.exportCsv)}</a>
<button class="btn no-print" onclick="window.print()">${icon('print', 17)} ${esc(L.print)}</button></div>`;

  return layout(L, {
    role,
    title: L.navOrders,
    active: 'orders',
    body: `${bar}${filterChips(chips)}${head}${list}
${pager(L, { page, pageSize, total, url: (p) => q({ page: p || '' }) })}`,
    flash,
    theme,
  });
}

/* ----------------------------- order detail ----------------------------- */

export function orderPage(L, locale, { order, messages, timeline, flash, theme , role = 'owner' }) {
  const day = dayOf(order.created_at);
  const docs = `<div class="actions">
<a class="btn" href="/admin/orders/${order.id}/invoice" target="_blank">${icon('file', 17)} ${esc(L.invoice)}</a>
<a class="btn" href="/admin/orders/${order.id}/ticket" target="_blank">${icon('print', 17)} ${esc(L.ticket)}</a>
${order.payment_proof ? `<a class="btn" href="/admin/orders/${order.id}/proof" target="_blank">${icon('eye', 17)} ${esc(L.proof)}</a>` : ''}
<span class="spacer" style="margin-left:auto"></span>
<a class="btn" href="/admin/customers/${order.customer.id}">${icon('users', 17)} ${esc(L.openCustomer)}</a></div>`;

  const body = `<p><a href="/admin/orders">${esc(L.back)}</a> · <a href="/admin?day=${esc(day)}">${esc(L.backToDay)}</a></p>
${orderCard(L, locale, order, `/admin/orders/${order.id}`)}
${card(docs)}
${order.rating ? card(`${esc(L.rating)} : ${'⭐'.repeat(order.rating)}`) : ''}
${order.payment_proof
    ? section(L.proof, card(`<img src="/admin/orders/${order.id}/proof" alt="" style="max-width:100%;max-height:70vh;border-radius:var(--radius-lg)">`))
    : ''}
${section(L.timeline, card(timelineList(L, locale, timeline)))}
${section(`${L.conversation} — ${order.customer.name || order.customer.phone}`, card(chat(L, messages)))}
${liveUpdates(L)}`;
  return layout(L, { role, title: order.reference, active: 'orders', body, flash, theme });
}

const TIMELINE_ICON = {
  created: 'receipt', paid: 'cash', preparing: 'package', on_the_way: 'scooter',
  delivered: 'check', cancelled: 'ban', proof: 'qr', rating: 'star', survey: 'message',
};

export function timelineList(L, locale, entries) {
  if (!entries?.length) return empty(L.noActivity, 'history');
  return `<ul class="timeline">${entries
    .map((e) => `<li><span class="timeline__dot badge--${e.tone || 'gray'}">${icon(TIMELINE_ICON[e.kind] || 'clock', 15)}</span>
<div class="timeline__title">${e.html || esc(e.title)}</div>
<div class="timeline__meta">${esc(utcDateTime(e.at, locale))}${e.detail ? ` · ${esc(e.detail)}` : ''}</div></li>`)
    .join('')}</ul>`;
}

export function mediaBlock(L, m) {
  if (!m.media_id) return '';
  const src = `/admin/messages/${m.id}/media`;
  const kind = String(m.body || '').match(/^\((image|audio|document)\)/)?.[1];
  if (kind === 'image') return `<a href="${src}" target="_blank"><img src="${src}" alt="" loading="lazy"></a>`;
  if (kind === 'audio') return `<div>🎤 ${esc(L.media.audio)}</div><audio controls preload="none" src="${src}" style="max-width:100%"></audio>`;
  return `<a href="${src}" target="_blank">${esc(L.media.document)}</a>`;
}

export function chat(L, messages) {
  if (!messages.length) return empty(L.noMessages, 'message');
  return `<div class="chat">${messages
    .map((m) => `<div class="msg ${m.direction === 'in' ? 'in' : 'out'}">${linkify(m.body)}${mediaBlock(L, m)}
<time>${esc(utcDateTime(m.created_at, L.lang))}</time></div>`)
    .join('')}</div>`;
}

/* --------------------------- printable documents ------------------------ */

/** Minimal standalone page used by the invoice, the ticket and the picking list. */
function printableShell(L, title, inner, { autoPrint = true } = {}) {
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark"><title>${esc(title)}</title>
${FAVICON}${FONT_LINK}<style>${CSS}
body{background:var(--bs-body-bg)}.hk-page{margin:0;padding:1.5rem}
.print-bar{max-width:48rem;margin:0 auto 1rem;display:flex;gap:.5rem;justify-content:flex-end}
</style></head><body><main class="hk-page">
<div class="print-bar no-print"><button class="btn" onclick="history.back()">${esc(L.back)}</button>
<button class="btn btn--primary" onclick="window.print()">${icon('print', 17)} ${esc(L.printOrPdf)}</button></div>
${inner}</main>${autoPrint ? '' : ''}</body></html>`;
}

/**
 * The customer invoice. The QR code points at a public page that re-reads the
 * order from the database, so anyone holding the paper can check it is genuine
 * without an account — and a forged reference simply fails to verify.
 */
export function invoicePage(L, locale, { order, shop, qrSvg, verifyUrl }) {
  const lines = order.items
    .map((it) => {
      const extras = extrasName(it);
      return `<tr><td>${productLabel(it, locale)}${extras ? `<br><span class="muted">${esc(extras)}</span>` : ''}</td>
<td>${esc(variantName(L, it))}</td>
<td class="num tabnum">${it.quantity}</td><td class="num tabnum">${esc(money(locale, it.unit_price))}</td>
<td class="num tabnum">${esc(money(locale, it.line_total))}</td></tr>`;
    })
    .join('');

  const totalRow = (label, value, cls = '') =>
    `<div class="doc__total ${cls}"><span>${esc(label)}</span><span class="tabnum">${esc(value)}</span></div>`;

  const inner = `<article class="doc">
<header class="doc__head">
  <div><div class="doc__brand">🌶️ ${esc(shop.name)}</div>
  <div class="muted">${esc(L.invoice)} · <b class="strong">${esc(order.reference)}</b></div>
  <div class="muted">${esc(utcDateTime(order.created_at, locale))}</div></div>
  <div class="doc__qr">${qrSvg}<div>${esc(L.scanToVerify)}</div></div>
</header>

<div class="doc__grid">
  <div><div class="doc__label">${esc(L.billedTo)}</div>
    <div class="strong">${esc(order.customer_name || '—')}</div>
    <div class="muted">+${esc(order.customer.phone)}</div>
    <div class="muted">${esc(order.neighborhood || '')}${order.address_note ? `<br>${esc(order.address_note)}` : ''}</div></div>
  <div><div class="doc__label">${esc(L.statusLabel)}</div>${statusBadge(L, order.status)}
    ${order.slot_label ? `<div class="doc__label" style="margin-top:.75rem">${esc(L.slotLabel)}</div>${esc(order.slot_label)}` : ''}
    <div class="doc__label" style="margin-top:.75rem">${esc(L.payment)}</div>
    ${esc(order.payment_method === 'cash' ? L.payCash : L.payMomo)}</div>
  <div><div class="doc__label">${esc(L.shopContact)}</div>
    ${shop.momoHolder ? `<div>${esc(shop.momoHolder)}</div>` : ''}
    ${shop.momoOrange ? `<div class="muted">Orange Money : ${esc(shop.momoOrange)}</div>` : ''}
    ${shop.momoAirtel ? `<div class="muted">Airtel Money : ${esc(shop.momoAirtel)}</div>` : ''}</div>
</div>

${table([L.product, L.size, { label: L.qty, num: true }, { label: L.unitPrice, num: true }, { label: L.lineTotal, num: true }], lines)}

<div style="max-width:20rem;margin-left:auto;margin-top:1.25rem">
${totalRow(L.subtotal, money(locale, order.subtotal))}
${order.delivery_fee ? totalRow(L.delivery, money(locale, order.delivery_fee)) : ''}
${order.coupon_discount ? totalRow(`${L.coupons} ${order.coupon}`, `−${money(locale, order.coupon_discount)}`) : ''}
${order.discount ? totalRow(L.discount, `−${money(locale, order.discount)}`) : ''}
${totalRow(L.total, money(locale, order.total), 'doc__total--grand')}
</div>

<footer class="doc__foot">
  <div>${esc(L.invoiceFooter)}</div>
  <div style="margin-top:.35rem;word-break:break-all">${esc(verifyUrl)}</div>
</footer></article>`;
  return printableShell(L, `${L.invoice} ${order.reference}`, inner);
}

/** Compact ticket for whoever prepares the bag. No prices, just what to pack. */
export function ticketPage(L, locale, { order, shop }) {
  const lines = order.items
    .map((it) => {
      const extras = extrasName(it);
      return `<tr><td style="font-size:1.05rem">${productLabel(it, locale)}
${extras ? `<br><span class="muted">${esc(extras)}</span>` : ''}</td>
<td>${esc(variantName(L, it))}</td><td class="num" style="font-size:1.25rem;font-weight:700">× ${it.quantity}</td></tr>`;
    })
    .join('');
  const inner = `<article class="doc" style="max-width:26rem">
<header class="doc__head" style="margin-bottom:1rem">
<div><div class="doc__brand">${esc(L.ticket)}</div>
<div class="strong" style="font-size:1.25rem">${esc(order.reference)}</div>
<div class="muted">${esc(utcDateTime(order.created_at, locale))}</div></div></header>
<div class="kv" style="margin-bottom:1rem">
<dt>${esc(L.customers)}</dt><dd>${esc(order.customer_name || '—')}</dd>
<dt>${esc(L.zone)}</dt><dd>${esc(order.neighborhood || '—')}</dd>
<dt>${esc(L.phone)}</dt><dd>+${esc(order.customer.phone)}</dd>
<dt>${esc(L.payment)}</dt><dd>${esc(order.payment_method === 'cash' ? `${L.payCash} — ${money(locale, order.total)}` : L.payMomo)}</dd>
${order.slot_label ? `<dt>${esc(L.slotLabel)}</dt><dd>${esc(order.slot_label)}</dd>` : ''}
</div>
${table([L.product, L.size, { label: L.qty, num: true }], lines)}
${order.address_note ? `<p style="margin-top:1rem"><b class="strong">${esc(L.address)} :</b> ${esc(order.address_note)}</p>` : ''}
<footer class="doc__foot">${esc(shop.name)}</footer></article>`;
  return printableShell(L, `${L.ticket} ${order.reference}`, inner);
}

/** The day's picking list: what to buy and pack, grouped by product and size. */
export function picklistPage(L, locale, { day, shopping, orders, shop , role = 'owner' }) {
  const inner = `<article class="doc">
<header class="doc__head"><div><div class="doc__brand">🌶️ ${esc(shop.name)}</div>
<div class="strong">${esc(L.shoppingList)} — ${esc(day)}</div>
<div class="muted">${esc(L.ordersFound(orders.length))}</div></div></header>
${quantitiesTable(L, locale, shopping, 'qty', L.noOrders)}
<h2 style="margin-top:1.5rem">${esc(L.byOrder)}</h2>
${orders.length
    ? table([L.reference, L.customers, L.zone, L.items],
      orders.map((o) => `<tr><td>${esc(o.reference)}</td><td>${esc(o.customer_name || '')}</td><td>${esc(o.neighborhood || '')}</td>
<td>${o.items.map((it) => `${esc(locale === 'en' ? it.name_en : it.name_fr)} ${esc(variantName(L, it))}×${it.quantity}`).join(', ')}</td></tr>`).join(''))
    : empty(L.noOrders, 'receipt')}
<footer class="doc__foot">${esc(new Date().toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR'))}</footer></article>`;
  return printableShell(L, `${L.shoppingList} ${day}`, inner);
}

/* --------------------------- public verification ------------------------ */

/** The page the invoice QR code opens. No login, no personal data beyond a first name. */
export function verifyPage(L, locale, { order, shop, valid , role = 'owner' }) {
  const body = valid
    ? `<div class="verify"><div class="verify__mark badge--success">${icon('shield', 32)}</div>
<h1>${esc(L.invoiceValid)}</h1>
<p class="muted">${esc(L.invoiceValidHint)}</p>
${card(`<dl class="kv">
<dt>${esc(L.reference)}</dt><dd>${esc(order.reference)}</dd>
<dt>${esc(L.date)}</dt><dd>${esc(utcDateTime(order.created_at, locale))}</dd>
<dt>${esc(L.customers)}</dt><dd>${esc(String(order.customer_name || '').split(' ')[0] || '—')}</dd>
<dt>${esc(L.zone)}</dt><dd>${esc(order.neighborhood || '—')}</dd>
<dt>${esc(L.total)}</dt><dd>${esc(money(locale, order.total))}</dd>
<dt>${esc(L.statusLabel)}</dt><dd>${statusBadge(L, order.status)}</dd>
</dl>`)}</div>`
    : `<div class="verify"><div class="verify__mark badge--danger">${icon('alert', 32)}</div>
<h1>${esc(L.invoiceInvalid)}</h1><p class="muted">${esc(L.invoiceInvalidHint)}</p></div>`;

  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark"><title>${esc(valid ? L.invoiceValid : L.invoiceInvalid)} · ${esc(shop.name)}</title>
${FAVICON}${FONT_LINK}<style>${CSS}body{background:var(--bs-body-bg)}.hk-page{margin:0;padding:1.5rem}</style>
</head><body><main class="hk-page">${body}
<p class="muted" style="text-align:center">${esc(shop.name)}</p></main></body></html>`;
}
