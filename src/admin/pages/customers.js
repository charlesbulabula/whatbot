// Customers: a filterable directory, and a full file per customer — activity,
// orders, conversation, loyalty ledger, referrals and internal notes.
import { money } from '../../i18n/index.js';
import {
  esc, linkify, card, section, empty, alert, badge, statusBadge, paymentBadge, waLink, table, pager,
  layout, liveUpdates, icon, avatar, stat, tabs, filterChips, iconAction, iconPost,
  utcDateTime, dayOf,
} from '../ui.js';
import { chat, timelineList } from './orders.js';

const SEGMENTS = ['new', 'regular', 'vip'];
const FLAGS = ['credit', 'waitlist', 'blocked', 'optout', 'referred'];

export const parseTags = (value) =>
  String(value || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12);

/* -------------------------------- listing ------------------------------- */

export function customersPage(L, locale, data) {
  const { rows, total, filters, zones, page, pageSize, stats, flash, theme } = data;
  const q = (patch = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) p.set(k, v);
    return `/admin/customers${p.toString() ? `?${p}` : ''}`;
  };
  const sortUrl = (sort, dir) => q({ sort, dir, page: 0 });
  const option = (value, label, current) =>
    `<option value="${esc(value)}"${String(current) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;

  const bar = `<form class="filters" method="get" action="/admin/customers">
<div class="field field--grow"><label for="c-q">${esc(L.search)}</label>
<input id="c-q" name="q" value="${esc(filters.q || '')}" placeholder="${esc(L.searchCustomers)}"></div>
<div class="field"><label for="c-seg">${esc(L.segment)}</label>
<select id="c-seg" name="segment">${option('', L.all, filters.segment)}
${SEGMENTS.map((s) => option(s, L.segments[s], filters.segment)).join('')}</select></div>
<div class="field"><label for="c-zone">${esc(L.zone)}</label>
<select id="c-zone" name="zone">${option('', L.all, filters.zone)}${zones.map((z) => option(z, z, filters.zone)).join('')}</select></div>
<div class="field"><label for="c-flag">${esc(L.filterLabel)}</label>
<select id="c-flag" name="flag">${option('', L.all, filters.flag)}
${FLAGS.map((f) => option(f, L.flags[f], filters.flag)).join('')}</select></div>
<input type="hidden" name="sort" value="${esc(filters.sort || '')}"><input type="hidden" name="dir" value="${esc(filters.dir || '')}">
<div class="actions"><button class="btn btn--primary">${icon('filter', 17)} ${esc(L.apply)}</button>
<a class="btn" href="/admin/customers">${esc(L.reset)}</a></div></form>`;

  const chips = [];
  if (filters.q) chips.push({ label: `${L.search}: ${filters.q}`, href: q({ q: '' }) });
  if (filters.segment) chips.push({ label: L.segments[filters.segment], href: q({ segment: '' }) });
  if (filters.zone) chips.push({ label: filters.zone, href: q({ zone: '' }) });
  if (filters.flag) chips.push({ label: L.flags[filters.flag], href: q({ flag: '' }) });

  const rowsHtml = rows
    .map((c) => `<tr${c.blocked ? ' style="opacity:.6"' : ''}>
<td><div class="actions">${avatar(c.name, c.phone, { size: '32px' })}
<span class="stack"><a href="/admin/customers/${c.id}"><b>${esc(c.name || '—')}</b></a>
<span class="muted" style="font-size:.75rem">${waLink(c.phone)}</span></span></div>
${parseTags(c.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</td>
<td>${esc(c.neighborhood || '')}</td>
<td>${badge(L.segments[c.segment] || c.segment, c.segment === 'vip' ? 'primary' : c.segment === 'regular' ? 'info' : 'gray')}</td>
<td class="num tabnum">${c.orders_count}</td>
<td class="num tabnum">${esc(money(locale, c.total_spent))}</td>
<td class="num tabnum">${c.credit ? esc(money(locale, c.credit)) : '–'}</td>
<td class="muted" style="font-size:.8125rem">${c.last_seen_at ? esc(utcDateTime(c.last_seen_at, locale)) : '—'}</td>
<td><div class="inline-list">${c.blocked ? badge(L.flags.blocked, 'danger') : ''}
${c.marketing_opt_out ? badge(L.optOut, 'gray') : ''}${c.waitlist_since ? badge(L.waitlist, 'warning') : ''}</div></td>
<td><div class="row-actions">
${iconAction(`/admin/customers/${c.id}`, 'eye', L.view)}
${iconAction(`https://wa.me/${c.phone}`, 'message', L.whatsapp, { target: '_blank' })}
</div></td></tr>`)
    .join('');

  const list = rows.length
    ? table(
      [
        { label: L.name, sort: 'name' }, L.zone, L.segment,
        { label: L.ordersCount, num: true, sort: 'orders' },
        { label: L.spent, num: true, sort: 'spent' },
        { label: L.credit, num: true, sort: 'credit' },
        { label: L.lastSeen, sort: 'recent' }, '', '',
      ],
      rowsHtml,
      { sortBy: filters.sort || 'orders', sortDir: filters.dir || 'desc', sortUrl },
    )
    : card(empty(L.noCustomers, 'users'));

  const tiles = `<div class="stats" style="margin-bottom:1rem">
${stat({ name: 'users', tone: 'primary', value: String(stats.total), label: L.customers })}
${stat({ name: 'star', tone: 'warning', value: String(stats.vip), label: L.segments.vip })}
${stat({ name: 'gift', tone: 'success', value: money(locale, stats.credit), label: L.creditOutstanding })}
${stat({ name: 'share', tone: 'info', value: String(stats.referred), label: L.flags.referred })}</div>`;

  const head = `<div class="toolbar"><span class="strong">${esc(L.customersFound(total))}</span>
<span style="margin-left:auto"></span>
<a class="btn" href="/admin/customers.csv?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()}">${icon('download', 17)} ${esc(L.stats.exportCsv)}</a>
<button class="btn no-print" onclick="window.print()">${icon('print', 17)} ${esc(L.print)}</button></div>`;

  return layout(L, {
    title: L.customers,
    active: 'customers',
    body: `${tiles}${bar}${filterChips(chips)}${head}${list}
${pager(L, { page, pageSize, total, url: (p) => q({ page: p || '' }) })}`,
    flash,
    theme,
  });
}

/* ------------------------------ customer file --------------------------- */

const TABS = (L, id) => [
  ['overview', `/admin/customers/${id}`, L.tabOverview, 'eye'],
  ['orders', `/admin/customers/${id}?tab=orders`, L.tabOrders, 'receipt'],
  ['chat', `/admin/customers/${id}?tab=chat`, L.tabChat, 'message'],
  ['loyalty', `/admin/customers/${id}?tab=loyalty`, L.tabLoyalty, 'gift'],
  ['notes', `/admin/customers/${id}?tab=notes`, L.tabNotes, 'note'],
];

export function customerPage(L, locale, data) {
  const {
    customer, orders, messages, state, canReply, tab = 'overview',
    timeline = [], credits = [], notes = [], invited = [], referrer = null,
    stats = {}, flash, flashTone, theme,
  } = data;
  const human = state === 'HUMAN';
  const tags = parseTags(customer.tags);

  const header = card(`<div class="actions" style="align-items:flex-start">
${avatar(customer.name, customer.phone, { size: '54px' })}
<span class="stack" style="gap:.15rem">
  <b class="strong" style="font-size:1.125rem">${esc(customer.name || `+${customer.phone}`)}</b>
  <span class="muted">${waLink(customer.phone)} · ${esc(customer.neighborhood || '—')}</span>
  <span class="inline-list" style="margin-top:.35rem">
    ${badge(L.segments[customer.segment] || customer.segment, customer.segment === 'vip' ? 'primary' : customer.segment === 'regular' ? 'info' : 'gray')}
    ${customer.blocked ? badge(L.flags.blocked, 'danger') : ''}
    ${customer.marketing_opt_out ? badge(L.optOut, 'gray') : ''}
    ${customer.waitlist_since ? badge(L.waitlist, 'warning') : ''}
    ${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
  </span>
</span>
<span class="spacer"></span>
<span class="row-actions">
  ${iconAction(`https://wa.me/${customer.phone}`, 'message', L.whatsapp, { target: '_blank' })}
  ${iconPost(`/admin/customers/${customer.id}/block`, customer.blocked ? 'shield' : 'ban',
    customer.blocked ? L.unblock : L.block,
    { tone: customer.blocked ? '' : 'danger', confirm: customer.blocked ? '' : L.confirmBlock, fields: { blocked: customer.blocked ? 0 : 1 } })}
</span></div>
${customer.address_note ? `<hr><div>${icon('pin', 15)} <span class="muted">${linkify(customer.address_note)}</span></div>` : ''}`);

  const tiles = `<div class="stats" style="margin:1rem 0">
${stat({ name: 'receipt', tone: 'primary', value: String(customer.orders_count), label: L.ordersCount })}
${stat({ name: 'cash', tone: 'success', value: money(locale, customer.total_spent), label: L.spent })}
${stat({ name: 'basket', tone: 'info', value: money(locale, stats.basket || 0), label: L.stats.basket })}
${stat({ name: 'gift', tone: 'warning', value: money(locale, customer.credit), label: L.credit })}
${stat({ name: 'star', tone: 'warning', value: stats.rating ? `${stats.rating.toFixed(1)} / 5` : '–', label: L.rating })}
${stat({ name: 'calendar', tone: 'gray', value: esc(dayOf(customer.created_at)), label: L.customerSince })}</div>`;

  const panels = {
    overview: `${section(L.timeline, card(timelineList(L, locale, timeline)))}
<div style="margin-top:1.75rem">${referralCard(L, locale, { customer, invited, referrer })}</div>`,
    orders: section(L.history, orders.length
      ? table([L.reference, L.date, L.statusLabel, L.payment, { label: L.total, num: true }, L.rating, ''],
        orders.map((o) => `<tr><td><a href="/admin/orders/${o.id}">${esc(o.reference)}</a></td>
<td class="muted">${esc(utcDateTime(o.created_at, locale))}</td><td>${statusBadge(L, o.status)}</td>
<td>${paymentBadge(L, o)}</td><td class="num tabnum">${esc(money(locale, o.total))}</td>
<td>${o.rating ? '⭐'.repeat(o.rating) : ''}</td>
<td><div class="row-actions">${iconAction(`/admin/orders/${o.id}`, 'eye', L.view)}
${iconAction(`/admin/orders/${o.id}/invoice`, 'file', L.invoice, { target: '_blank' })}</div></td></tr>`).join(''))
      : card(empty(L.noOrdersCustomer, 'receipt'))),
    chat: `${section(L.conversation, card(chat(L, messages)))}${replyBlock(L, { customer, canReply, human })}`,
    loyalty: `${creditBlock(L, locale, { customer, credits })}`,
    notes: notesBlock(L, locale, { customer, notes, tags }),
  };

  const body = `<p><a href="/admin/customers">${esc(L.back)}</a></p>${header}${tiles}
${tabs(TABS(L, customer.id), tab)}
${panels[tab] || panels.overview}
${tab === 'chat' ? liveUpdates(L) : ''}`;

  return layout(L, { title: customer.name || customer.phone, active: 'customers', body, flash, flashTone, theme });
}

function replyBlock(L, { customer, canReply, human }) {
  const reply = canReply
    ? `<form method="post" action="/admin/customers/${customer.id}/reply">
<label for="reply">${esc(L.reply)}</label>
<textarea id="reply" name="body" rows="3" required maxlength="4000" style="margin:.35rem 0"></textarea>
<div class="actions"><button class="btn btn--primary">${icon('message', 17)} ${esc(L.send)}</button></div></form>`
    : alert(esc(L.windowClosed), 'warning', 'clock');

  return card(`${human ? alert(esc(L.botPaused), 'warning', 'hand') : ''}${reply}
<hr><div class="actions">${human
    ? `<form method="post" action="/admin/customers/${customer.id}/release" class="inline"><button class="btn">${icon('bot', 17)} ${esc(L.release)}</button></form>`
    : `<form method="post" action="/admin/customers/${customer.id}/takeover" class="inline"><button class="btn">${icon('hand', 17)} ${esc(L.takeOver)}</button></form>`}</div>`);
}

const CREDIT_REASON_ICON = { loyalty: 'gift', referral: 'share', manual: 'edit', order: 'receipt', refund: 'refresh' };

function creditBlock(L, locale, { customer, credits }) {
  const rows = credits
    .map((e) => `<tr><td class="muted">${esc(utcDateTime(e.created_at, locale))}</td>
<td>${icon(CREDIT_REASON_ICON[e.reason] || 'gift', 15)} ${esc(L.creditReasons[e.reason] || e.reason)}
${e.detail ? `<span class="muted">— ${esc(e.detail)}</span>` : ''}
${e.order_id ? ` <a href="/admin/orders/${e.order_id}">#${e.order_id}</a>` : ''}</td>
<td class="num tabnum" style="color:${e.amount >= 0 ? 'var(--on-soft-success)' : 'var(--on-soft-danger)'}">
${e.amount >= 0 ? '+' : '−'}${esc(money(locale, Math.abs(e.amount)))}</td>
<td class="muted">${esc(e.author || '')}</td></tr>`)
    .join('');

  const form = card(`<form method="post" action="/admin/customers/${customer.id}/credit" class="form-grid">
<div class="field"><label for="cr-amount">${esc(L.creditAmount)}</label>
<input id="cr-amount" type="number" name="amount" required placeholder="1000" step="100"></div>
<div class="field field--grow"><label for="cr-reason">${esc(L.creditReasonLabel)}</label>
<input id="cr-reason" name="detail" maxlength="80" placeholder="${esc(L.creditReasonPlaceholder)}"></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('gift', 17)} ${esc(L.applyCredit)}</button></div>
</form><p class="form-note">${esc(L.creditHint)}</p>`, { head: `${icon('edit')}<h2>${esc(L.adjustCredit)}</h2>` });

  return `${card(`<div class="actions"><span>${esc(L.currentBalance)}</span>
<b class="strong tabnum" style="font-size:1.25rem">${esc(money(locale, customer.credit))}</b></div>`)}
${section(L.creditHistory, credits.length
    ? table([L.date, L.creditReasonLabel, { label: L.amount, num: true }, L.author], rows)
    : card(empty(L.noCreditYet, 'gift')))}
${section(L.adjustCredit, form)}`;
}

function referralCard(L, locale, { customer, invited, referrer }) {
  const rows = invited
    .map((c) => `<tr><td><a href="/admin/customers/${c.id}">${esc(c.name || `+${c.phone}`)}</a></td>
<td class="num tabnum">${c.orders_count}</td><td class="num tabnum">${esc(money(locale, c.total_spent))}</td>
<td class="muted">${esc(dayOf(c.created_at))}</td></tr>`)
    .join('');
  return card(`<dl class="kv">
<dt>${esc(L.referralCode)}</dt><dd><code class="strong">${esc(customer.referral_code || '—')}</code></dd>
<dt>${esc(L.invitedBy)}</dt><dd>${referrer ? `<a href="/admin/customers/${referrer.id}">${esc(referrer.name || `+${referrer.phone}`)}</a>` : '—'}</dd>
<dt>${esc(L.invitedCount)}</dt><dd>${invited.length}</dd></dl>
${invited.length ? `<div style="margin-top:.875rem">${table([L.name, { label: L.ordersCount, num: true }, { label: L.spent, num: true }, L.date], rows)}</div>` : ''}`,
  { head: `${icon('share')}<h2>${esc(L.referral)}</h2>` });
}

function notesBlock(L, locale, { customer, notes, tags }) {
  const list = notes.length
    ? notes
      .map((n) => `<li><span class="timeline__dot badge--gray">${icon('note', 15)}</span>
<div class="timeline__title" style="white-space:pre-wrap">${esc(n.body)}</div>
<div class="timeline__meta">${esc(utcDateTime(n.created_at, locale))}${n.author ? ` · ${esc(n.author)}` : ''}
 · <a href="/admin/customers/${customer.id}/notes/${n.id}/delete" onclick="event.preventDefault();this.closest('li').querySelector('form').submit()">${esc(L.delete)}</a>
<form method="post" action="/admin/customers/${customer.id}/notes/${n.id}/delete" hidden></form></div></li>`)
      .join('')
    : '';

  return `${card(`<form method="post" action="/admin/customers/${customer.id}/notes">
<label for="note">${esc(L.addNote)}</label>
<textarea id="note" name="body" rows="3" required maxlength="1000" placeholder="${esc(L.notePlaceholder)}" style="margin:.35rem 0"></textarea>
<div class="actions"><button class="btn btn--primary">${icon('note', 17)} ${esc(L.save)}</button></div></form>`,
  { head: `${icon('note')}<h2>${esc(L.internalNotes)}</h2>` })}
${notes.length ? `<div class="card" style="margin-top:1rem"><div class="card__body"><ul class="timeline">${list}</ul></div></div>`
    : card(empty(L.noNotes, 'note'), { className: 'mt-1' })}
${section(L.tags, card(`<form method="post" action="/admin/customers/${customer.id}/tags" class="actions">
<input name="tags" value="${esc(tags.join(', '))}" placeholder="${esc(L.tagsPlaceholder)}" style="flex:1 1 14rem">
<button class="btn btn--primary">${icon('tag', 17)} ${esc(L.save)}</button></form>
<p class="form-note">${esc(L.tagsHint)}</p>`))}`;
}
