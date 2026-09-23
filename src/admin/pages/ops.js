// Running the shop: loyalty and referrals, expenses and margin, the audit log,
// targeted broadcasts, and the global search results.
import { money } from '../../i18n/index.js';
import {
  esc, card, section, empty, badge, table, pager, layout, icon, stat, avatar, tabs,
  iconAction, iconPost, utcDateTime, dayOf, waLink, alert,
} from '../ui.js';
import { rankedBars, donutChart } from '../charts.js';

/* --------------------------- loyalty & referrals ------------------------ */

const LOYALTY_TABS = (L) => [
  ['balances', '/admin/loyalty', L.tabBalances, 'gift'],
  ['referrals', '/admin/loyalty?tab=referrals', L.referral, 'share'],
];

export function loyaltyPage(L, locale, data) {
  const { tab = 'balances', totals, holders, entries, referral, referrers, rules, theme, flash, role = 'owner' } = data;

  const tiles = `<div class="stats">
${stat({ name: 'gift', tone: 'warning', value: money(locale, totals.outstanding), label: L.creditOutstanding, hint: L.creditOutstandingHint })}
${stat({ name: 'trending', tone: 'success', value: money(locale, totals.granted), label: L.creditGranted })}
${stat({ name: 'cash', tone: 'info', value: money(locale, totals.spent), label: L.creditSpent })}
${stat({ name: 'share', tone: 'primary', value: String(referral.invited || 0), label: L.invitedTotal,
    hint: L.convertedHint(referral.converted || 0) })}</div>`;

  const rulesCard = card(`<dl class="kv">
<dt>${esc(L.loyaltyEvery)}</dt><dd>${rules.every > 0 ? esc(L.everyNth(rules.every)) : esc(L.disabled)}</dd>
<dt>${esc(L.loyaltyReward)}</dt><dd>${esc(money(locale, rules.reward))}</dd>
<dt>${esc(L.referralReward)}</dt><dd>${esc(money(locale, rules.referralReward))}</dd></dl>
<div class="actions" style="margin-top:.75rem">
<a class="btn btn--sm" href="/admin/settings?tab=loyalty">${icon('settings', 15)} ${esc(L.editRules)}</a></div>`,
  { head: `${icon('settings')}<h2>${esc(L.tabLoyaltyRules)}</h2>` });

  const holderRows = holders
    .map((c) => `<tr><td><div class="actions">${avatar(c.name, c.phone, { size: '30px' })}
<a href="/admin/customers/${c.id}?tab=loyalty">${esc(c.name || `+${c.phone}`)}</a></div></td>
<td>${badge(L.segments[c.segment] || c.segment, c.segment === 'vip' ? 'primary' : 'gray')}</td>
<td class="num tabnum">${c.orders_count}</td>
<td class="num tabnum">${esc(money(locale, c.credit))}</td>
<td><div class="row-actions">${iconAction(`/admin/customers/${c.id}?tab=loyalty`, 'eye', L.view)}</div></td></tr>`)
    .join('');

  const entryRows = entries
    .map((e) => `<tr><td class="muted">${esc(utcDateTime(e.created_at, locale))}</td>
<td><a href="/admin/customers/${e.customer_id}?tab=loyalty">${esc(e.customer_name || `#${e.customer_id}`)}</a></td>
<td>${esc(L.creditReasons[e.reason] || e.reason)}${e.detail ? ` <span class="muted">— ${esc(e.detail)}</span>` : ''}</td>
<td class="num tabnum" style="color:${e.amount >= 0 ? 'var(--on-soft-success)' : 'var(--on-soft-danger)'}">
${e.amount >= 0 ? '+' : '−'}${esc(money(locale, Math.abs(e.amount)))}</td></tr>`)
    .join('');

  const referrerRows = referrers
    .map((c) => `<tr><td><div class="actions">${avatar(c.name, c.phone, { size: '30px' })}
<a href="/admin/customers/${c.id}">${esc(c.name || `+${c.phone}`)}</a></div></td>
<td><code>${esc(c.referral_code || '')}</code></td>
<td class="num tabnum">${c.invited}</td>
<td class="num tabnum">${esc(money(locale, c.invited_spent))}</td></tr>`)
    .join('');

  const panels = {
    balances: `<div class="grid-2" style="margin-top:1rem">
${card(holders.length
    ? rankedBars(holders.slice(0, 8).map((c) => ({ label: c.name || `+${c.phone}`, value: c.credit })),
      { format: (v) => money(locale, v) })
    : empty(L.noCreditYet, 'gift'), { head: `${icon('gift')}<h2>${esc(L.topBalances)}</h2>` })}
${rulesCard}</div>
${section(L.creditHolders, holders.length
    ? table([L.name, L.segment, { label: L.ordersCount, num: true }, { label: L.credit, num: true }, ''], holderRows)
    : card(empty(L.noCreditYet, 'gift')))}
${section(L.creditHistory, entries.length
    ? table([L.date, L.name, L.creditReasonLabel, { label: L.amount, num: true }], entryRows)
    : card(empty(L.noCreditYet, 'history')))}`,

    referrals: `${section(L.referralPerformance, card(`<dl class="kv">
<dt>${esc(L.invitedTotal)}</dt><dd>${referral.invited || 0}</dd>
<dt>${esc(L.invitedConverted)}</dt><dd>${referral.converted || 0}</dd>
<dt>${esc(L.invitedSpent)}</dt><dd>${esc(money(locale, referral.spent || 0))}</dd>
<dt>${esc(L.referralReward)}</dt><dd>${esc(money(locale, rules.referralReward))}</dd></dl>`))}
${section(L.topReferrers, referrers.length
    ? table([L.name, L.referralCode, { label: L.invitedCount, num: true }, { label: L.invitedSpent, num: true }], referrerRows)
    : card(empty(L.noReferralsYet, 'share')))}`,
  };

  const body = `${tiles}${tabs(LOYALTY_TABS(L), tab)}${panels[tab] || panels.balances}`;
  return layout(L, { role, title: L.navLoyalty, active: 'loyalty', body, flash, theme });
}

/* ------------------------------- expenses ------------------------------- */

const CATEGORIES = ['stock', 'transport', 'salaire', 'autre'];

export function expensesPage(L, locale, data) {
  const { from, to, rows, total, revenue, byCategory, days, theme, flash, role = 'owner' } = data;
  const margin = revenue - total;
  const marginPct = revenue ? Math.round((margin / revenue) * 100) : 0;

  const periods = [7, 30, 90]
    .map((n) => `<a class="${n === days ? 'on' : ''}" href="/admin/expenses?days=${n}">${esc(L.stats.last(n))}</a>`)
    .join('');

  const list = rows
    .map((e) => `<tr><td>${esc(e.day)}</td><td>${badge(L.expenseCategories[e.category] || e.category, 'gray')}</td>
<td>${esc(e.label || '')}</td><td class="num tabnum">${esc(money(locale, e.amount))}</td>
<td><div class="row-actions">${iconPost(`/admin/expenses/${e.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteExpense })}</div></td></tr>`)
    .join('');

  const body = `<div class="toolbar"><div class="segmented">${periods}</div>
<span style="margin-left:auto"></span>
<button class="btn no-print" onclick="window.print()">${icon('print', 17)} ${esc(L.printOrPdf)}</button></div>
<div class="stats">
${stat({ name: 'cash', tone: 'success', value: money(locale, revenue), label: L.stats.revenue })}
${stat({ name: 'wallet', tone: 'warning', value: money(locale, total), label: L.expensesTotal })}
${stat({ name: 'trending', tone: margin >= 0 ? 'success' : 'danger', value: money(locale, margin), label: L.stats.margin,
    hint: L.stats.marginHint(marginPct) })}</div>
<div class="grid-2" style="margin-top:1rem">
${card(byCategory.length
    ? donutChart(byCategory.map((c) => ({ label: L.expenseCategories[c.category] || c.category, value: c.total })),
      { format: (v) => money(locale, v), label: L.expensesByCategory, centerLabel: '' })
    : empty(L.noExpenses, 'wallet'), { head: `${icon('wallet')}<h2>${esc(L.expensesByCategory)}</h2>` })}
${card(`<form method="post" action="/admin/expenses" class="form-grid">
<div class="field"><label for="e-day">${esc(L.date)}</label><input id="e-day" type="date" name="day" value="${esc(to)}" required></div>
<div class="field"><label for="e-cat">${esc(L.category)}</label><select id="e-cat" name="category">
${CATEGORIES.map((c) => `<option value="${c}">${esc(L.expenseCategories[c])}</option>`).join('')}</select></div>
<div class="field field--grow"><label for="e-label">${esc(L.label)}</label><input id="e-label" name="label" maxlength="80" placeholder="${esc(L.expensePlaceholder)}"></div>
<div class="field"><label for="e-amount">${esc(L.amount)}</label><input id="e-amount" type="number" name="amount" min="0" required></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addExpense)}</button></div>
</form>`, { head: `${icon('plus')}<h2>${esc(L.addExpense)}</h2>` })}
</div>
${section(`${L.expenses} — ${from} → ${to}`, rows.length
    ? table([L.date, L.category, L.label, { label: L.amount, num: true }, ''], list)
    : card(empty(L.noExpenses, 'wallet')))}`;

  return layout(L, { role, title: L.navExpenses, active: 'expenses', body, flash, theme });
}

/* ------------------------------- audit log ------------------------------ */

export function auditPage(L, locale, { rows, total, page, pageSize, theme , role = 'owner' }) {
  const list = rows
    .map((e) => `<tr><td class="muted nowrap">${esc(utcDateTime(e.created_at, locale))}</td>
<td>${esc(e.actor)}</td><td><b class="strong">${esc(L.auditActions[e.action] || e.action)}</b></td>
<td>${esc(e.target || '')}</td><td class="muted">${esc(e.detail || '')}</td></tr>`)
    .join('');
  const body = `<p class="muted">${esc(L.auditHint)}</p>
${rows.length ? table([L.date, L.author, L.action, L.target, L.detail], list) : card(empty(L.noActivity, 'history'))}
${pager(L, { page, pageSize, total, url: (p) => `/admin/audit?page=${p}` })}`;
  return layout(L, { role, title: L.navAudit, active: 'audit', body, theme });
}

/* ------------------------------- broadcast ------------------------------ */

export function broadcastPage(L, locale, { audiences, lastResult, theme, flash, flashTone , role = 'owner' }) {
  const options = audiences
    .map((a) => `<option value="${esc(a.key)}">${esc(a.label)} (${a.count})</option>`)
    .join('');

  const result = lastResult
    ? alert(esc(L.broadcastResult(lastResult.sent, lastResult.skipped, lastResult.failed)),
      lastResult.failed ? 'warning' : '', 'megaphone')
    : '';

  const body = `${result}
${alert(esc(L.broadcastWindowHint), 'warning', 'info')}
${card(`<form method="post" action="/admin/broadcast">
<div class="field"><label for="b-aud">${esc(L.audience)}</label><select id="b-aud" name="audience">${options}</select></div>
<div class="field" style="margin-top:.75rem"><label for="b-body">${esc(L.message)}</label>
<textarea id="b-body" name="body" rows="4" required maxlength="900" placeholder="${esc(L.broadcastPlaceholder)}"></textarea></div>
<p class="form-note">${esc(L.broadcastHint)}</p>
<div class="actions" style="margin-top:.75rem">
<button class="btn btn--primary" onclick="return confirm('${esc(L.confirmBroadcast)}')">${icon('megaphone', 17)} ${esc(L.sendBroadcast)}</button></div>
</form>`, { head: `${icon('megaphone')}<h2>${esc(L.navBroadcast)}</h2>` })}
${section(L.audiences, table([L.audience, { label: L.customers, num: true }],
    audiences.map((a) => `<tr><td>${esc(a.label)}<br><span class="muted" style="font-size:.8125rem">${esc(a.hint)}</span></td>
<td class="num tabnum">${a.count}</td></tr>`).join('')))}`;

  return layout(L, { role, title: L.navBroadcast, active: 'broadcast', body, flash, flashTone, theme });
}

/* ----------------------------- global search ---------------------------- */

export function searchPage(L, locale, { query, results, theme , role = 'owner' }) {
  const { orders, customers, coupons } = results;
  const nothing = !orders.length && !customers.length && !coupons.length;

  const orderRows = orders
    .map((o) => `<tr><td><a href="/admin/orders/${o.id}"><b>${esc(o.reference)}</b></a></td>
<td>${esc(o.customer_name || '')}</td><td>${badge(L.status[o.status] || o.status, 'gray')}</td>
<td class="num tabnum">${esc(money(locale, o.total))}</td></tr>`)
    .join('');
  const customerRows = customers
    .map((c) => `<tr><td><div class="actions">${avatar(c.name, c.phone, { size: '30px' })}
<a href="/admin/customers/${c.id}">${esc(c.name || '—')}</a></div></td>
<td>${waLink(c.phone)}</td><td>${esc(c.neighborhood || '')}</td></tr>`)
    .join('');
  const couponRows = coupons
    .map((c) => `<tr><td><a href="/admin/coupons"><code class="strong">${esc(c.code)}</code></a></td>
<td>${esc(L.couponKinds[c.kind] || c.kind)}</td><td class="num tabnum">${c.value}</td></tr>`)
    .join('');

  const body = `<p class="muted">${esc(L.searchResultsFor(query))}</p>
${nothing ? card(empty(L.searchNothing, 'search')) : ''}
${orders.length ? section(L.navOrders, table([L.reference, L.customers, L.statusLabel, { label: L.total, num: true }], orderRows)) : ''}
${customers.length ? section(L.customers, table([L.name, L.phone, L.zone], customerRows)) : ''}
${coupons.length ? section(L.coupons, table([L.couponCode, L.couponKind, { label: L.couponValue, num: true }], couponRows)) : ''}`;

  return layout(L, { role, title: L.searchTitle, active: '', body, theme, search: query });
}
