// The daily working screen: what to prepare, what to deliver, what to chase,
// plus the charts that say whether the week is going well.
import { money } from '../../i18n/index.js';
import {
  esc, linkify, card, section, empty, alert, stat, trendTag, badge, statusBadge, paymentBadge,
  waLink, table, layout, liveUpdates, icon, productLabel, variantName, extrasName, utcTime,
  iconAction, iconPost,
} from '../ui.js';
import { areaChart, barChart, donutChart, rankedBars, sparkline } from '../charts.js';

const NEXT_STATUSES = {
  awaiting_payment: ['paid', 'preparing', 'cancelled'],
  paid: ['preparing', 'on_the_way', 'cancelled'],
  preparing: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'on_the_way'],
  delivered: [],
  cancelled: [],
};

const ACTION_ICON = {
  paid: 'cash',
  preparing: 'package',
  on_the_way: 'scooter',
  delivered: 'check',
  cancelled: 'ban',
};

/** The status buttons of an order card, as icons with tooltips. */
export function statusActions(L, order, back) {
  return (NEXT_STATUSES[order.status] || [])
    .map((status) => {
      if (status === 'on_the_way') {
        return `<form method="post" action="/admin/orders/${order.id}/status" class="inline">
<input type="hidden" name="status" value="on_the_way"><input type="hidden" name="back" value="${esc(back)}">
<input name="eta" placeholder="${esc(L.eta)}" value="${esc(order.eta || '')}" size="6" aria-label="${esc(L.eta)}">
<button class="icon-btn" data-tip="${esc(L.actions.on_the_way)}" aria-label="${esc(L.actions.on_the_way)}">${icon('scooter', 17)}</button></form>`;
      }
      return iconPost(`/admin/orders/${order.id}/status`, ACTION_ICON[status], L.actions[status], {
        tone: status === 'cancelled' ? 'danger' : '',
        confirm: status === 'cancelled' ? L.confirmCancel : '',
        fields: { status, back },
      });
    })
    .join('');
}

export function orderCard(L, locale, order, back) {
  const items = order.items
    .map((it) => {
      const extras = extrasName(it);
      return `<li>${productLabel(it, locale)} — ${esc(variantName(L, it))}${extras ? ` <span class="muted">(${esc(extras)})</span>` : ''}
 × ${it.quantity} <span class="muted tabnum">${esc(money(locale, it.line_total))}</span></li>`;
    })
    .join('');
  const head = `<a href="/admin/orders/${order.id}"><b>${esc(order.reference)}</b></a>
<span class="spacer"></span>${paymentBadge(L, order)}${statusBadge(L, order.status)}`;
  const body = `<div class="muted">${esc(utcTime(order.created_at, locale))} · ${esc(order.customer_name || '')} · ${waLink(order.customer.phone)}</div>
<div>${icon('pin', 15)} <b class="strong">${esc(order.neighborhood || '')}</b>
${order.address_note ? `<span class="muted">— ${linkify(order.address_note)}</span>` : ''}</div>
${order.slot_label ? `<div class="muted">${icon('clock', 15)} ${esc(order.slot_label)}</div>` : ''}
<ul>${items}</ul>
<div class="actions"><span>${esc(L.total)} : <b class="strong tabnum">${esc(money(locale, order.total))}</b></span>
${order.coupon ? badge(`${order.coupon} −${money(locale, order.coupon_discount)}`, 'info') : ''}
${order.discount ? badge(`${L.discount} −${money(locale, order.discount)}`, 'success') : ''}
<span class="spacer"></span>
${order.payment_method === 'cash'
    ? `<span class="muted">${esc(L.cashToCollectOne)}</span>`
    : order.payment_proof
      ? `<a href="/admin/orders/${order.id}/proof" target="_blank">${icon('eye', 15)} ${esc(L.proof)}</a>`
      : `<span class="muted">${esc(L.noProof)}</span>`}</div>
${order.eta ? `<div class="muted">${icon('scooter', 15)} ${esc(L.eta)} : ${esc(order.eta)}</div>` : ''}
<div class="actions" style="margin-top:.75rem">${statusActions(L, order, back)}
<span class="spacer"></span>
${iconAction(`/admin/orders/${order.id}/invoice`, 'file', L.invoice, { target: '_blank' })}
${iconAction(`/admin/orders/${order.id}/ticket`, 'print', L.ticket, { target: '_blank' })}</div>`;
  return card(body, { head });
}

export function quantitiesTable(L, locale, rows, valueKey, emptyLabel) {
  if (!rows.length) return empty(emptyLabel, 'basket');
  // Variants are free-form now, so the columns are whichever ones actually sold.
  const columns = [...new Set(rows.map((r) => r.size))];
  const label = (sku) => rows.find((r) => r.size === sku)?.variant_label || L.sizes[sku] || sku;
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, { label: productLabel(r, locale), cells: {} });
    byProduct.get(r.product_id).cells[r.size] = r[valueKey];
  }
  const body = [...byProduct.values()]
    .map((p) => `<tr><td>${p.label}</td>${columns.map((c) => `<td class="num">${p.cells[c] || '–'}</td>`).join('')}</tr>`)
    .join('');
  return table([L.product, ...columns.map((c) => ({ label: label(c), num: true }))], body);
}

export function dashboardPage(L, locale, data) {
  const {
    day, prevDay, nextDay, isToday, orders, kpis, shopping, forecast, handoffs = [], lowStock = [],
    series = [], newPerDay = [], statuses = [], byHour = [], topProducts = [], flash, theme, role = 'owner', waHealth = null
  } = data;
  const back = `/admin?day=${day}`;
  const fmt = (v, short) => (short ? compact(locale, v) : money(locale, v));

  const byZone = new Map();
  for (const o of orders) {
    const zone = o.neighborhood || '—';
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(o);
  }
  const zones = [...byZone.entries()]
    .map(([zone, list]) => section(`${zone} (${list.length})`, `<div class="grid">${list.map((o) => orderCard(L, locale, o, back)).join('')}</div>`))
    .join('');

  const toolbar = `<div class="toolbar">
<a class="btn" href="/admin?day=${prevDay}">${esc(L.prevDay)}</a>
<form method="get" action="/admin" class="inline"><input type="date" name="day" value="${esc(day)}" onchange="this.form.submit()" aria-label="${esc(L.day)}"></form>
<a class="btn" href="/admin?day=${nextDay}">${esc(L.nextDay)}</a>
${isToday ? '' : `<a class="btn" href="/admin">${esc(L.today)}</a>`}
<span style="margin-left:auto"></span>
<a class="btn" href="/admin/orders">${icon('filter', 17)} ${esc(L.allOrders)}</a>
<a class="btn" href="/admin/route?day=${day}">${icon('scooter', 17)} ${esc(L.route.button)}</a>
<a class="btn" href="/admin/picklist?day=${day}" target="_blank">${icon('print', 17)} ${esc(L.printPicklist)}</a></div>`;

  const revenueSpark = series.length > 1 ? sparkline(series.map((d) => d.revenue), { tone: 'var(--success)' }) : '';
  const stats = `<div class="stats">
${stat({ name: 'receipt', tone: 'primary', value: String(kpis.orders), label: L.kpiOrders })}
${stat({ name: 'cash', tone: 'success', value: money(locale, kpis.revenueDay), label: L.kpiRevenueDay, spark: revenueSpark })}
${stat({ name: 'chart', tone: 'info', value: money(locale, kpis.revenueWeek), label: L.kpiRevenueWeek,
    trend: trendTag(L, kpis.revenueWeek, kpis.revenuePrevWeek) })}
${stat({ name: 'alert', tone: kpis.toCheck ? 'danger' : 'gray', value: String(kpis.toCheck), label: L.kpiToCheck })}
${kpis.cash.orders ? stat({ name: 'wallet', tone: 'warning', value: money(locale, kpis.cash.amount), label: L.kpiCashToCollect, hint: L.kpiCashHint(kpis.cash.orders) }) : ''}
${stat({ name: 'users', tone: 'primary', value: String(kpis.newCustomers), label: L.kpiNewCustomers,
    trend: trendTag(L, kpis.newCustomers, kpis.newCustomersPrev) })}
</div>`;

  const chartSeries = series.map((d) => ({ ...d, label: shortDate(d.day, locale) }));
  const charts = `<div class="grid-2" style="margin-top:1rem">
${card(areaChart(chartSeries, {
    format: fmt,
    label: L.chartRevenue,
    secondary: newPerDay,
    secondaryLabel: L.chartNewCustomers,
  }) || empty(L.stats.empty, 'chart'), { head: `${icon('chart')}<h2>${esc(L.chartRevenue)}</h2><span class="muted">${esc(L.chart30d)}</span>`, className: 'span-2' })}
</div>
<div class="grid-2" style="margin-top:1rem">
${card(statuses.length
    ? donutChart(statuses.map((s) => ({ label: L.status[s.status] || s.status, value: s.n, tone: toneVar(s.status) })), {
      format: (v) => String(v),
      label: L.chartStatuses,
      centerLabel: L.kpiOrders.toLowerCase(),
    })
    : empty(L.stats.empty, 'receipt'), { head: `${icon('receipt')}<h2>${esc(L.chartStatuses)}</h2>` })}
${card(byHour.length
    ? barChart(byHour, { format: (v) => String(Math.round(v)), label: L.chartHours })
    : empty(L.stats.empty, 'clock'), { head: `${icon('clock')}<h2>${esc(L.chartHours)}</h2><span class="muted">${esc(L.chartHoursHint)}</span>` })}
</div>
${topProducts.length ? card(rankedBars(topProducts.map((p) => ({
    html: productLabel(p, locale), label: locale === 'en' ? p.name_en : p.name_fr, value: p.qty,
  })), { format: (v) => `${v}` }), { head: `${icon('basket')}<h2>${esc(L.chartTopProducts)}</h2><span class="muted">${esc(L.chart30d)}</span>`, className: 'mt-1' }) : ''}`;

  const warnings = [
    handoffs.length ? handoffCard(L, handoffs) : '',
    lowStock.length
      ? alert(`<b>${esc(L.lowStockTitle)}</b> — ${lowStock.map((p) => `${esc(locale === 'en' ? p.name_en : p.name_fr)} (${p.stock_qty})`).join(', ')}
 <a href="/admin/products">${esc(L.manageStock)}</a>`, 'warning', 'package')
      : '',
  ].join('');

  const body = `${toolbar}${warnings}${stats}${charts}
${section(L.shoppingList, quantitiesTable(L, locale, shopping, 'qty', L.noOrders),
    `<a class="btn btn--sm" href="/admin/picklist?day=${day}" target="_blank">${icon('print', 15)} ${esc(L.print)}</a>`)}
${zones || section(`${L.ordersOf} ${day}`, empty(L.noOrders, 'receipt'))}
${section(L.forecast, quantitiesTable(L, locale, forecast, 'weekly_avg', L.noData))}
${isToday ? liveUpdates(L) : ''}`;

  const pending = kpis.toCheck + handoffs.length;
  return layout(L, { role, waHealth, title: `${pending ? `(${pending}) ` : ''}${L.title}`, active: 'orders', body, flash, theme });
}

function handoffCard(L, handoffs) {
  const items = handoffs
    .map((c) => `<li><a href="/admin/customers/${c.id}"><b>${esc(c.name || `+${c.phone}`)}</b></a>
${c.unanswered ? badge(`${c.unanswered} ${L.unanswered}`, 'warning') : ''}</li>`)
    .join('');
  return card(`<ul>${items}</ul>`, {
    head: `${icon('hand')}<h2>${esc(L.handoffs)}</h2>${badge(String(handoffs.length), 'danger')}`,
  });
}

const toneVar = (status) => ({
  awaiting_payment: 'var(--warning)',
  paid: 'var(--info)',
  preparing: 'var(--primary)',
  on_the_way: 'var(--primary-light-2)',
  delivered: 'var(--success)',
  cancelled: 'var(--danger)',
}[status] || 'var(--gray)');

export const compact = (locale, n) =>
  new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const shortDate = (day, locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
