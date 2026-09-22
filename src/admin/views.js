import { config } from '../config.js';
import { money } from '../i18n/index.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);

const NEXT_STATUSES = {
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['preparing', 'on_the_way', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'on_the_way'],
  delivered: [],
  cancelled: [],
};

const STYLE = `
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f1d1a;--muted:#6b6660;--line:#e4dfd6;--accent:#b4451f;--accent-ink:#fff;
--ok:#2f7d4a;--warn:#a86a00;--bad:#b3261e;--chip:#efe9df}
@media (prefers-color-scheme:dark){:root{--bg:#161412;--card:#201d1a;--ink:#f1ece4;--muted:#a59e94;--line:#34302b;
--accent:#e0714a;--accent-ink:#1a1512;--ok:#6cc08a;--warn:#e2b04a;--bad:#f08a80;--chip:#2c2824}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}header{position:sticky;top:0;z-index:2;background:var(--card);border-bottom:1px solid var(--line)}
.bar{max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.brand{font-weight:700;margin-right:auto}.bar a{text-decoration:none;font-weight:600}.bar a.on{text-decoration:underline}
main{max-width:1100px;margin:0 auto;padding:16px}h1{font-size:1.35rem;margin:.2rem 0 1rem}h2{font-size:1.05rem;margin:1.6rem 0 .6rem}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}.kpi b{display:block;font-size:1.35rem}
.kpi span{color:var(--muted);font-size:.85rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.row{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}.muted{color:var(--muted)}
.chip{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--chip);font-size:.8rem;font-weight:600}
.s-awaiting_payment{color:var(--warn)}.s-paid,.s-preparing,.s-on_the_way{color:var(--accent)}.s-delivered{color:var(--ok)}.s-cancelled{color:var(--bad)}
ul{padding-left:18px;margin:.4rem 0}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
button,.btn{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--chip);color:var(--ink);border-radius:8px;padding:7px 10px;cursor:pointer;text-decoration:none}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}button.danger{color:var(--bad)}
input,select{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);max-width:100%}
input[type=number]{width:7em}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.8rem;color:var(--muted);font-weight:600}
.scroll{overflow-x:auto}.flash{background:var(--chip);border-left:4px solid var(--accent);padding:10px 12px;border-radius:8px;margin-bottom:12px}
.chat{display:flex;flex-direction:column;gap:6px}.msg{max-width:85%;padding:8px 10px;border-radius:10px;white-space:pre-wrap;font-size:.9rem}
.msg.in{background:var(--chip);align-self:flex-start}.msg.out{background:var(--card);border:1px solid var(--line);align-self:flex-end}
.msg small{display:block;color:var(--muted);font-size:.75rem;margin-top:3px}form.inline{display:inline}
.daynav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
`;

export function layout(L, { title, active, body, flash }) {
  const nav = [
    ['orders', '/admin', L.navOrders],
    ['products', '/admin/products', L.navProducts],
    ['customers', '/admin/customers', L.navCustomers],
  ]
    .map(([key, href, label]) => `<a href="${href}" class="${key === active ? 'on' : ''}">${esc(label)}</a>`)
    .join('');
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(config.shop.name)}</title>
<style>${STYLE}</style></head><body><header><div class="bar"><span class="brand">🌶️ ${esc(config.shop.name)}</span>${nav}
<a href="/admin/lang" title="language">${esc(L.switchLang)}</a></div></header><main>
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}${body}</main></body></html>`;
}

const fmtSize = (L, size) => L.sizes[size] || size;
const statusChip = (L, status) => `<span class="chip s-${esc(status)}">${esc(L.status[status] || status)}</span>`;
const waLink = (phone) => `<a href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener">+${esc(phone)}</a>`;

function productLabel(p, locale) {
  return `${p.emoji ? `${esc(p.emoji)} ` : ''}${esc(locale === 'en' ? p.name_en : p.name_fr)}`;
}

function statusForms(L, order, back) {
  const next = NEXT_STATUSES[order.status] || [];
  return next
    .map((status) => {
      if (status === 'on_the_way') {
        return `<form method="post" action="/admin/orders/${order.id}/status" class="inline">
<input type="hidden" name="status" value="on_the_way"><input type="hidden" name="back" value="${esc(back)}">
<input name="eta" placeholder="${esc(L.eta)} (14h30)" value="${esc(order.eta || '')}" size="10">
<button>${esc(L.actions.on_the_way)}</button></form>`;
      }
      const cls = status === 'cancelled' ? 'danger' : 'primary';
      const confirm = status === 'cancelled' ? ` onsubmit="return confirm('${esc(L.confirmCancel)}')"` : '';
      return `<form method="post" action="/admin/orders/${order.id}/status" class="inline"${confirm}>
<input type="hidden" name="status" value="${status}"><input type="hidden" name="back" value="${esc(back)}">
<button class="${cls}">${esc(L.actions[status])}</button></form>`;
    })
    .join('');
}

function orderCard(L, locale, order, back) {
  const items = order.items
    .map((it) => `<li>${productLabel(it, locale)} — ${esc(fmtSize(L, it.size))} × ${it.quantity} <span class="muted">${esc(money(locale, it.line_total))}</span></li>`)
    .join('');
  const time = new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `<div class="card">
<div class="row"><a href="/admin/orders/${order.id}"><b>${esc(order.reference)}</b></a>${statusChip(L, order.status)}</div>
<div class="muted">${esc(time)} · ${esc(order.customer_name || '')} · ${waLink(order.customer.phone)}</div>
<div>📍 <b>${esc(order.neighborhood || '')}</b> ${order.address_note ? `— ${linkify(order.address_note)}` : ''}</div>
<ul>${items}</ul>
<div class="row"><span>${esc(L.total)} : <b>${esc(money(locale, order.total))}</b>${order.discount ? ` <span class="muted">(${esc(L.discount)} −${esc(money(locale, order.discount))})</span>` : ''}</span>
${order.payment_proof ? `<a href="/admin/orders/${order.id}/proof" target="_blank">🧾 ${esc(L.proof)}</a>` : `<span class="muted">${esc(L.noProof)}</span>`}</div>
${order.eta ? `<div class="muted">🛵 ${esc(L.eta)} : ${esc(order.eta)}</div>` : ''}
<div class="actions">${statusForms(L, order, back)}</div></div>`;
}

function quantitiesTable(L, locale, rows, valueKey, emptyLabel) {
  if (!rows.length) return `<p class="muted">${esc(emptyLabel)}</p>`;
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, { label: productLabel(r, locale), small: 0, medium: 0, large: 0 });
    byProduct.get(r.product_id)[r.size] = r[valueKey];
  }
  const body = [...byProduct.values()]
    .map((p) => `<tr><td>${p.label}</td><td>${p.small || '–'}</td><td>${p.medium || '–'}</td><td>${p.large || '–'}</td></tr>`)
    .join('');
  return `<div class="scroll"><table><tr><th></th><th>${esc(L.sizes.small)}</th><th>${esc(L.sizes.medium)}</th><th>${esc(L.sizes.large)}</th></tr>${body}</table></div>`;
}

function handoffList(L, handoffs) {
  if (!handoffs.length) return '';
  const items = handoffs
    .map((c) => `<li><a href="/admin/customers/${c.id}"><b>${esc(c.name || `+${c.phone}`)}</b></a>${c.unanswered ? ` <span class="chip s-awaiting_payment">${c.unanswered} ${esc(L.unanswered)}</span>` : ''}</li>`)
    .join('');
  return `<div class="card" style="border-color:var(--accent);margin-bottom:12px"><b>🙋 ${esc(L.handoffs)} (${handoffs.length})</b><ul>${items}</ul></div>`;
}

export function dashboardPage(L, locale, { day, prevDay, nextDay, isToday, orders, kpis, shopping, forecast, handoffs = [], flash }) {
  const back = `/admin?day=${day}`;
  const byZone = new Map();
  for (const o of orders) {
    const zone = o.neighborhood || '—';
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(o);
  }
  const zones = [...byZone.entries()]
    .map(([zone, list]) => `<h2>📍 ${esc(zone)} <span class="muted">(${list.length})</span></h2><div class="grid">${list.map((o) => orderCard(L, locale, o, back)).join('')}</div>`)
    .join('');
  const body = `${handoffList(L, handoffs)}
<div class="daynav"><a class="btn" href="/admin?day=${prevDay}">${esc(L.prevDay)}</a>
<form method="get" action="/admin" class="inline"><input type="date" name="day" value="${esc(day)}" onchange="this.form.submit()"></form>
<a class="btn" href="/admin?day=${nextDay}">${esc(L.nextDay)}</a>${isToday ? '' : `<a class="btn" href="/admin">${esc(L.today)}</a>`}
<a class="btn" href="/admin/route?day=${day}">${esc(L.route.button)}</a></div>
<div class="kpis">
<div class="kpi"><b>${kpis.orders}</b><span>${esc(L.kpiOrders)}</span></div>
<div class="kpi"><b>${esc(money(locale, kpis.revenueDay))}</b><span>${esc(L.kpiRevenueDay)}</span></div>
<div class="kpi"><b>${esc(money(locale, kpis.revenueWeek))}</b><span>${esc(L.kpiRevenueWeek)}</span></div>
<div class="kpi"><b>${kpis.toCheck}</b><span>${esc(L.kpiToCheck)}</span></div></div>
<h2>🧺 ${esc(L.shoppingList)}</h2>${quantitiesTable(L, locale, shopping, 'qty', L.noOrders)}
${zones || `<h2>${esc(L.ordersOf)} ${esc(day)}</h2><p class="muted">${esc(L.noOrders)}</p>`}
<h2>📈 ${esc(L.forecast)}</h2>${quantitiesTable(L, locale, forecast, 'weekly_avg', L.noData)}${isToday ? autoRefresh(60) : ''}`;
  const pending = kpis.toCheck + handoffs.length;
  return layout(L, { title: `${pending ? `(${pending}) ` : ''}${L.title}`, active: 'orders', body, flash });
}

export function orderPage(L, locale, { order, messages, flash }) {
  const day = new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-CA');
  const body = `<p><a href="/admin?day=${esc(day)}">${esc(L.back)}</a></p>
<h1>${esc(order.reference)}</h1>${orderCard(L, locale, order, `/admin/orders/${order.id}`)}
${order.rating ? `<p>${esc(L.rating)} : ${'⭐'.repeat(order.rating)}</p>` : ''}
${order.payment_proof ? `<h2>🧾 ${esc(L.proof)}</h2><img src="/admin/orders/${order.id}/proof" alt="" style="max-width:100%;max-height:70vh;border-radius:12px;border:1px solid var(--line)">` : ''}
<h2>💬 ${esc(L.conversation)} — <a href="/admin/customers/${order.customer.id}">${esc(order.customer.name || order.customer.phone)}</a></h2>
${chat(L, messages)}`;
  return layout(L, { title: order.reference, active: 'orders', body, flash });
}

function mediaBlock(L, m) {
  if (!m.media_id) return '';
  const src = `/admin/messages/${m.id}/media`;
  const kind = String(m.body || '').match(/^\((image|audio|document)\)/)?.[1];
  if (kind === 'image') return `<a href="${src}" target="_blank"><img src="${src}" alt="" loading="lazy" style="display:block;max-width:220px;border-radius:8px;margin-top:4px"></a>`;
  if (kind === 'audio') return `<div>🎤 ${esc(L.media.audio)}</div><audio controls preload="none" src="${src}" style="max-width:100%"></audio>`;
  return `<a href="${src}" target="_blank">${esc(L.media.document)}</a>`;
}

function chat(L, messages) {
  return `<div class="chat">${messages
    .map((m) => {
      const time = new Date(`${m.created_at.replace(' ', 'T')}Z`).toLocaleString(L.lang === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      return `<div class="msg ${m.direction === 'in' ? 'in' : 'out'}">${linkify(m.body)}${mediaBlock(L, m)}<small>${esc(time)}</small></div>`;
    })
    .join('')}</div>`;
}

/** Reloads the page every `seconds` unless the admin is typing or a form field was edited. */
function autoRefresh(seconds) {
  return `<script>(function(){var dirty=false;document.addEventListener('input',function(){dirty=true});
setInterval(function(){var a=document.activeElement;if(dirty||(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))return;location.reload()},${seconds * 1000});})();</script>`;
}

export function productsPage(L, locale, { products, flash }) {
  const rows = products
    .map(
      (p) => `<tr><td colspan="8"><form method="post" action="/admin/products/${p.id}" class="row" style="justify-content:flex-start;gap:6px">
<input name="emoji" value="${esc(p.emoji)}" size="2" aria-label="${esc(L.emoji)}">
<input name="name_fr" value="${esc(p.name_fr)}" size="12" aria-label="${esc(L.nameFr)}" required>
<input name="name_en" value="${esc(p.name_en)}" size="12" aria-label="${esc(L.nameEn)}" required>
<input type="number" name="price_small" value="${p.price_small}" min="0" aria-label="${esc(L.priceSmall)}" required>
<input type="number" name="price_medium" value="${p.price_medium}" min="0" aria-label="${esc(L.priceMedium)}" required>
<input type="number" name="price_large" value="${p.price_large}" min="0" aria-label="${esc(L.priceLarge)}" required>
<input type="number" name="sort_order" value="${p.sort_order}" style="width:4.5em" aria-label="${esc(L.order)}">
<button>${esc(L.save)}</button></form>
<form method="post" action="/admin/products/${p.id}/stock" class="actions">
<span class="chip ${p.in_stock ? 's-delivered' : 's-cancelled'}">${esc(p.in_stock ? L.inStock : L.outOfStock)}</span>
<input type="hidden" name="in_stock" value="${p.in_stock ? 0 : 1}"><button class="${p.in_stock ? 'danger' : 'primary'}">${esc(p.in_stock ? L.markOut : L.markIn)}</button></form></td></tr>`,
    )
    .join('');
  const body = `<h1>${esc(L.products)}</h1>
<p class="muted">${esc(L.emoji)} · ${esc(L.nameFr)} · ${esc(L.nameEn)} · ${esc(L.priceSmall)} · ${esc(L.priceMedium)} · ${esc(L.priceLarge)} · ${esc(L.order)}</p>
<div class="scroll"><table>${rows}</table></div>
<h2>${esc(L.addProduct)}</h2><form method="post" action="/admin/products" class="card row" style="justify-content:flex-start;gap:6px">
<input name="emoji" placeholder="${esc(L.emoji)}" size="2"><input name="name_fr" placeholder="${esc(L.nameFr)}" required>
<input name="name_en" placeholder="${esc(L.nameEn)}" required>
<input type="number" name="price_small" placeholder="${esc(L.priceSmall)}" min="0" required>
<input type="number" name="price_medium" placeholder="${esc(L.priceMedium)}" min="0" required>
<input type="number" name="price_large" placeholder="${esc(L.priceLarge)}" min="0" required>
<button class="primary">${esc(L.addProduct)}</button></form>`;
  return layout(L, { title: L.products, active: 'products', body, flash });
}

export function customersPage(L, locale, { customers }) {
  const rows = customers
    .map(
      (c) => `<tr><td><a href="/admin/customers/${c.id}">${esc(c.name || '—')}</a></td><td>${waLink(c.phone)}</td>
<td>${esc(c.neighborhood || '')}</td><td><span class="chip">${esc(L.segments[c.segment] || c.segment)}</span></td>
<td>${c.orders_count}</td><td>${esc(money(locale, c.total_spent))}</td><td>${c.credit ? esc(money(locale, c.credit)) : '–'}</td>
<td>${esc(c.referral_code || '')}</td><td>${c.marketing_opt_out ? esc(L.optOut) : ''} ${c.waitlist_since ? esc(L.waitlist) : ''}</td></tr>`,
    )
    .join('');
  const body = `<h1>${esc(L.customers)} <span class="muted">(${customers.length})</span></h1><div class="scroll"><table>
<tr><th></th><th>${esc(L.phone)}</th><th>${esc(L.zone)}</th><th>${esc(L.segment)}</th><th>${esc(L.ordersCount)}</th>
<th>${esc(L.spent)}</th><th>${esc(L.credit)}</th><th>${esc(L.referralCode)}</th><th></th></tr>${rows}</table></div>`;
  return layout(L, { title: L.customers, active: 'customers', body });
}

export function customerPage(L, locale, { customer, orders, messages, state, canReply, flash }) {
  const human = state === 'HUMAN';
  const controls = `<div class="card" style="margin-top:12px">
${human ? `<p><b>${esc(L.botPaused)}</b></p>` : ''}
${canReply
    ? `<form method="post" action="/admin/customers/${customer.id}/reply"><label for="reply"><b>${esc(L.reply)}</b></label>
<textarea id="reply" name="body" rows="3" required maxlength="4000" style="display:block;width:100%;margin:6px 0;font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)"></textarea>
<button class="primary">${esc(L.send)}</button></form>`
    : `<p class="muted">${esc(L.windowClosed)}</p>`}
<div class="actions">${human
    ? `<form method="post" action="/admin/customers/${customer.id}/release" class="inline"><button>${esc(L.release)}</button></form>`
    : `<form method="post" action="/admin/customers/${customer.id}/takeover" class="inline"><button>${esc(L.takeOver)}</button></form>`}</div></div>`;
  return customerDetail(L, locale, { customer, orders, messages, controls, flash, refresh: human });
}

function customerDetail(L, locale, { customer, orders, messages, controls, flash, refresh }) {
  const rows = orders
    .map((o) => `<tr><td><a href="/admin/orders/${o.id}">${esc(o.reference)}</a></td><td>${statusChip(L, o.status)}</td><td>${esc(money(locale, o.total))}</td><td>${o.rating ? '⭐'.repeat(o.rating) : ''}</td></tr>`)
    .join('');
  const body = `<p><a href="/admin/customers">${esc(L.back)}</a></p>
<h1>${esc(customer.name || customer.phone)}</h1><div class="card">
<div>${waLink(customer.phone)} · ${esc(customer.neighborhood || '')} ${customer.address_note ? `— ${linkify(customer.address_note)}` : ''}</div>
<div class="muted">${esc(L.segment)} : ${esc(L.segments[customer.segment] || customer.segment)} · ${esc(L.ordersCount)} : ${customer.orders_count} ·
${esc(L.spent)} : ${esc(money(locale, customer.total_spent))} · ${esc(L.credit)} : ${esc(money(locale, customer.credit))} ·
${esc(L.referralCode)} : ${esc(customer.referral_code)} · ${esc(L.lastSeen)} : ${esc(customer.last_seen_at || '')} UTC</div></div>
<h2>${esc(L.history)}</h2><div class="scroll"><table>${rows}</table></div>
<h2>💬 ${esc(L.conversation)}</h2>${chat(L, messages)}${controls}${refresh ? autoRefresh(15) : ''}`;
  return layout(L, { title: customer.name || customer.phone, active: 'customers', body, flash });
}
