// Statistics: the numbers that say whether the shop is growing, and where the
// money actually comes from.
import { money } from '../../i18n/index.js';
import {
  esc, card, section, empty, badge, table, layout, icon, stat, trendTag, productLabel,
} from '../ui.js';
import { areaChart, barChart, donutChart, rankedBars } from '../charts.js';
import { compact, shortDate } from './dashboard.js';

export function statsPage(L, locale, data) {
  const {
    days, series, stats, previous, products, zones, segments, payments, coupons,
    statuses = [], byHour = [], newPerDay = [], expenses = 0, theme, role = 'owner', waHealth = null
  } = data;

  const periods = [7, 30, 90]
    .map((n) => `<a class="${n === days ? 'on' : ''}" href="/admin/stats?days=${n}">${esc(L.stats.last(n))}</a>`)
    .join('');
  const from = series[0].day;
  const to = series.at(-1).day;
  const basket = stats.orders ? Math.round(stats.revenue / stats.orders) : 0;
  const repeat = stats.buyers ? Math.round((stats.repeatBuyers / stats.buyers) * 100) : 0;
  const margin = stats.revenue - expenses;
  const marginPct = stats.revenue ? Math.round((margin / stats.revenue) * 100) : 0;
  const fmt = (v, short) => (short ? compact(locale, v) : money(locale, v));

  const tiles = `<div class="stats">
${stat({ name: 'cash', tone: 'success', value: money(locale, stats.revenue), label: L.stats.revenue,
    trend: trendTag(L, stats.revenue, previous.revenue) })}
${stat({ name: 'receipt', tone: 'primary', value: String(stats.orders), label: L.stats.orders,
    trend: trendTag(L, stats.orders, previous.orders) })}
${stat({ name: 'basket', tone: 'info', value: money(locale, basket), label: L.stats.basket })}
${stat({ name: 'wallet', tone: margin >= 0 ? 'success' : 'danger', value: money(locale, margin), label: L.stats.margin,
    hint: L.stats.marginHint(marginPct) })}
${stat({ name: 'users', tone: 'warning', value: String(stats.newCustomers), label: L.stats.newCustomers })}
${stat({ name: 'check', tone: 'success', value: `${repeat} %`, label: L.stats.repeat, hint: L.stats.repeatHint })}
${stat({ name: 'star', tone: 'warning', value: stats.ratings ? `${stats.rating.toFixed(1)} / 5` : '–', label: L.stats.rating,
    hint: stats.ratings ? L.stats.ratingsCount(stats.ratings) : L.stats.noRating })}
</div>`;

  const chartSeries = series.map((d) => ({ ...d, label: shortDate(d.day, locale) }));
  const revenue = card(
    areaChart(chartSeries, { format: fmt, label: L.stats.daily, secondary: newPerDay, secondaryLabel: L.chartNewCustomers })
      || empty(L.stats.empty, 'chart'),
    { head: `${icon('chart')}<h2>${esc(L.stats.daily)}</h2><span class="muted">${esc(L.stats.dailyHint)}</span>` },
  );

  const rankList = (items, emptyIcon) => (items.length
    ? rankedBars(items, { format: (v) => money(locale, v) })
    : empty(L.stats.empty, emptyIcon));

  const productRows = products
    .map((p) => `<tr><td>${productLabel(p, locale)}</td><td class="num tabnum">${p.qty}</td>
<td class="num tabnum">${esc(money(locale, p.revenue))}</td></tr>`)
    .join('');
  const couponRows = coupons
    .map((c) => `<tr><td><code>${esc(c.code)}</code></td><td class="num tabnum">${c.uses}</td>
<td class="num tabnum">${esc(money(locale, c.granted))}</td></tr>`)
    .join('');
  const segmentLine = segments
    .map((g) => badge(`${L.segments[g.segment] || g.segment} · ${g.n}`,
      g.segment === 'vip' ? 'primary' : g.segment === 'regular' ? 'info' : 'gray'))
    .join(' ');

  const body = `<div class="toolbar"><div class="segmented">${periods}</div>
<span style="margin-left:auto"></span>
<a class="btn" href="/admin/export.csv?from=${from}&amp;to=${to}">${icon('download', 17)} ${esc(L.stats.exportCsv)}</a>
<button class="btn no-print" onclick="window.print()">${icon('print', 17)} ${esc(L.printOrPdf)}</button></div>
${tiles}
<div style="margin-top:1rem">${revenue}</div>
<div class="grid-2" style="margin-top:1rem">
${card(statuses.length
    ? donutChart(statuses.map((s) => ({ label: L.status[s.status] || s.status, value: s.n })), {
      format: (v) => String(v), label: L.chartStatuses, centerLabel: L.kpiOrders.toLowerCase(),
    })
    : empty(L.stats.empty, 'receipt'), { head: `${icon('receipt')}<h2>${esc(L.chartStatuses)}</h2>` })}
${card(byHour.length ? barChart(byHour, { format: (v) => String(Math.round(v)), label: L.chartHours })
    : empty(L.stats.empty, 'clock'), { head: `${icon('clock')}<h2>${esc(L.chartHours)}</h2>` })}
${card(rankList(products.map((p) => ({ html: productLabel(p, locale), label: p.name_fr, value: p.revenue })), 'basket'),
    { head: `${icon('basket')}<h2>${esc(L.stats.topProducts)}</h2>` })}
${card(rankList(zones.map((z) => ({ label: z.zone, value: z.revenue })), 'pin'),
    { head: `${icon('pin')}<h2>${esc(L.stats.zones)}</h2>` })}
${card(payments.length
    ? donutChart(payments.map((p) => ({ label: p.method === 'cash' ? L.payCash : L.payMomo, value: p.revenue })), {
      format: (v) => money(locale, v), label: L.stats.payments, centerLabel: '',
    })
    : empty(L.stats.empty, 'wallet'), { head: `${icon('wallet')}<h2>${esc(L.stats.payments)}</h2>` })}
${card(coupons.length
    ? table([L.couponCode, { label: L.stats.couponUses, num: true }, { label: L.stats.couponGranted, num: true }], couponRows)
    : empty(L.stats.noCoupons, 'ticket'), { head: `${icon('ticket')}<h2>${esc(L.stats.coupons)}</h2>`, bodyClass: 'p-0' })}
</div>
${section(L.stats.topProducts, products.length
    ? table([L.product, { label: L.stats.qty, num: true }, { label: L.stats.revenue, num: true }], productRows)
    : card(empty(L.stats.empty, 'basket')))}
${segments.length ? section(L.stats.segments, `<div class="actions">${segmentLine}</div>`) : ''}`;

  return layout(L, { role, waHealth, title: L.stats.title, active: 'stats', body, theme });
}
