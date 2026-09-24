// The payment queue: every order waiting on a decision, on one screen, with
// the screenshot right there. Before this, each one had to be opened in turn.
import { money } from '../../i18n/index.js';
import {
  esc, card, section, empty, badge, avatar, layout, liveUpdates, icon,
  iconPost, utcDateTime, tabs,
} from '../ui.js';

/** "il y a 2 h" -- how long this payment has been waiting. */
function waitedFor(L, createdAt) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(`${createdAt}Z`).getTime()) / 60000));
  if (minutes < 60) return L.waitedMinutes(minutes);
  const hours = Math.round(minutes / 60);
  return hours < 48 ? L.waitedHours(hours) : L.waitedDays(Math.round(hours / 24));
}

function paymentCard(L, locale, o) {
  const cash = o.payment_method === 'cash';
  // Over two hours is where a customer starts wondering whether anyone saw it.
  const stale = Date.now() - new Date(`${o.created_at}Z`).getTime() > 2 * 36e5;
  const head = `<div class="pay__head">
${avatar(o.customer_name, o.customer_phone)}
<div class="pay__who"><a href="/admin/orders/${o.id}">${esc(o.reference)}</a>
<span class="muted">${esc(o.customer_name || o.customer_phone)}</span></div>
<div class="pay__amount">${esc(money(locale, o.total))}
<span class="muted">${badge(cash ? L.payCash : L.payMomo, cash ? 'warning' : 'info')}</span></div></div>`;

  const meta = `<p class="pay__meta">${icon('clock', 14)} ${esc(waitedFor(L, o.created_at))}
${stale ? badge(L.payLate, 'danger') : ''}
<span class="muted">· ${esc(utcDateTime(o.created_at, locale))}</span></p>`;

  const proof = o.payment_proof
    ? `<a class="pay__proof" href="/admin/orders/${o.id}/proof" target="_blank" rel="noopener">
<img src="/admin/orders/${o.id}/proof" alt="${esc(L.proof)}" loading="lazy"></a>`
    : `<div class="pay__proof pay__proof--none">${icon(cash ? 'cash' : 'qr', 28)}
<span>${esc(cash ? L.payCashHint : L.payNoProof)}</span></div>`;

  const actions = `<div class="pay__actions">
${iconPost(`/admin/orders/${o.id}/status`, 'check', L.payConfirm,
    { tone: 'success', fields: { status: 'paid', back: '/admin/payments' } })}
${iconPost(`/admin/orders/${o.id}/status`, 'ban', L.payRefuse,
    { tone: 'danger', confirm: L.payRefuseConfirm, fields: { status: 'cancelled', back: '/admin/payments' } })}
<a class="icon-btn" href="https://wa.me/${esc(o.customer_phone)}" target="_blank" rel="noopener"
 data-tip="${esc(L.payAsk)}" aria-label="${esc(L.payAsk)}">${icon('message', 17)}</a>
<a class="btn btn--sm" href="/admin/orders/${o.id}">${esc(L.view)}</a></div>`;

  return card(`${head}${meta}${proof}${actions}`, { className: 'pay' });
}

export function paymentsPage(L, locale, { orders, filter = 'all', flash, theme, role = 'owner', waHealth = null }) {
  const momo = orders.filter((o) => o.payment_method !== 'cash');
  const cash = orders.filter((o) => o.payment_method === 'cash');
  const shown = filter === 'momo' ? momo : filter === 'cash' ? cash : orders;

  const head = tabs([
    ['all', '/admin/payments', `${L.payAll} (${orders.length})`, 'receipt'],
    ['momo', '/admin/payments?filter=momo', `${L.payMomo} (${momo.length})`, 'qr'],
    ['cash', '/admin/payments?filter=cash', `${L.payCash} (${cash.length})`, 'cash'],
  ], filter);

  const body = `${head}
${shown.length
    ? `<div class="pay-grid">${shown.map((o) => paymentCard(L, locale, o)).join('')}</div>`
    : section('', card(empty(L.payNone, 'check')))}
${liveUpdates(L)}`;
  return layout(L, { role, waHealth, title: L.navPayments, active: 'payments', body, flash, theme });
}
