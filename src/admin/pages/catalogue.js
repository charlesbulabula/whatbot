// Catalogue: products (prices, stock), delivery areas and promo codes.
import { money } from '../../i18n/index.js';
import {
  esc, card, section, empty, badge, table, layout, icon, iconPost, iconAction, tabs, alert,
} from '../ui.js';

const CATALOGUE_TABS = (L) => [
  ['products', '/admin/products', L.navProducts, 'basket'],
  ['zones', '/admin/zones', L.navZones, 'pin'],
  ['slots', '/admin/slots', L.navSlots, 'clock'],
  ['coupons', '/admin/coupons', L.navCoupons, 'ticket'],
];

/* ------------------------------- products ------------------------------- */

export function productsPage(L, locale, { products, lowStock = [], flash, theme , role = 'owner', waHealth = null }) {
  // Each row's <form> lives outside the table and is wired to its inputs with the
  // form="" attribute, so the table markup stays valid and the row stays a row.
  const forms = products
    .map((p) => `<form id="prod-${p.id}" method="post" action="/admin/products/${p.id}"></form>`)
    .join('');

  const rows = products
    .map((p) => {
      const f = `form="prod-${p.id}"`;
      const low = p.stock_alert > 0 && p.stock_qty !== null && p.stock_qty <= p.stock_alert;
      return `<tr>
<td><input ${f} name="emoji" value="${esc(p.emoji)}" size="2" aria-label="${esc(L.emoji)}"></td>
<td><input ${f} name="name_fr" value="${esc(p.name_fr)}" size="11" aria-label="${esc(L.nameFr)}" required></td>
<td><input ${f} name="name_en" value="${esc(p.name_en)}" size="11" aria-label="${esc(L.nameEn)}" required></td>
<td class="num"><input ${f} type="number" name="price_small" value="${p.price_small}" min="0" aria-label="${esc(L.priceSmall)}" required></td>
<td class="num"><input ${f} type="number" name="price_medium" value="${p.price_medium}" min="0" aria-label="${esc(L.priceMedium)}" required></td>
<td class="num"><input ${f} type="number" name="price_large" value="${p.price_large}" min="0" aria-label="${esc(L.priceLarge)}" required></td>
<td class="num"><input ${f} type="number" name="stock_qty" value="${p.stock_qty ?? ''}" min="0" placeholder="∞" aria-label="${esc(L.stockQty)}"></td>
<td class="num"><input ${f} type="number" name="stock_alert" value="${p.stock_alert || 0}" min="0" aria-label="${esc(L.stockAlert)}"></td>
<td class="num"><input ${f} type="number" name="sort_order" value="${p.sort_order}" style="width:4em" aria-label="${esc(L.order)}"></td>
<td>${p.in_stock ? badge(L.inStock, low ? 'warning' : 'success') : badge(L.outOfStock, 'danger')}
${p.photo ? badge(L.photo, 'info') : ''}</td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconAction(`/admin/products/${p.id}/edit`, 'edit', L.editProduct)}
${iconPost(`/admin/products/${p.id}/stock`, p.in_stock ? 'eyeOff' : 'eye', p.in_stock ? L.markOut : L.markIn,
    { tone: p.in_stock ? 'danger' : '', fields: { in_stock: p.in_stock ? 0 : 1 } })}
${iconPost(`/admin/products/${p.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteProduct })}
</div></td></tr>`;
    })
    .join('');

  const list = products.length
    ? table([
      '', L.nameFr, L.nameEn,
      { label: L.priceSmall, num: true }, { label: L.priceMedium, num: true }, { label: L.priceLarge, num: true },
      { label: L.stockQty, num: true }, { label: L.stockAlert, num: true }, { label: L.order, num: true },
      L.stock, '',
    ], rows)
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

  const warn = lowStock.length
    ? alert(`<b>${esc(L.lowStockTitle)}</b> — ${lowStock.map((p) => esc(locale === 'en' ? p.name_en : p.name_fr)).join(', ')}`, 'warning', 'package')
    : '';

  const body = `${tabs(CATALOGUE_TABS(L), 'products')}${warn}
<p class="muted">${esc(L.stockHint)}</p>
<div hidden>${forms}</div>${list}${section(L.addProduct, add)}`;
  return layout(L, { role, waHealth, title: L.products, active: 'products', body, flash, theme });
}

/* --------------------------- delivery zones ----------------------------- */

export function zonesPage(L, locale, { zones, flash, theme , role = 'owner', waHealth = null }) {
  const forms = zones.map((z) => `<form id="zone-${z.id}" method="post" action="/admin/zones/${z.id}"></form>`).join('');
  const rows = zones
    .map((z) => {
      const f = `form="zone-${z.id}"`;
      return `<tr>
<td><input ${f} name="name" value="${esc(z.name)}" required aria-label="${esc(L.zone)}"></td>
<td class="num"><input ${f} type="number" name="fee" value="${z.fee}" min="0" aria-label="${esc(L.deliveryFee)}"></td>
<td class="num"><input ${f} type="number" name="sort_order" value="${z.sort_order}" style="width:4em" aria-label="${esc(L.order)}"></td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${z.active ? ' checked' : ''}>
<span>${esc(z.active ? L.zoneActive : L.zoneInactive)}</span></label></td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconPost(`/admin/zones/${z.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteZone })}
</div></td></tr>`;
    })
    .join('');

  const list = zones.length
    ? table([L.zone, { label: L.deliveryFee, num: true }, { label: L.order, num: true }, L.zoneActive, ''], rows)
    : card(empty(L.noZones, 'pin'));

  const add = card(`<form method="post" action="/admin/zones" class="form-grid">
<div class="field"><label for="z-name">${esc(L.zone)}</label><input id="z-name" name="name" required></div>
<div class="field"><label for="z-fee">${esc(L.deliveryFee)}</label><input id="z-fee" type="number" name="fee" min="0" value="0"></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addZone)}</button></div>
</form>`, { head: `${icon('plus')}<h2>${esc(L.addZone)}</h2>` });

  const body = `${tabs(CATALOGUE_TABS(L), 'zones')}<p class="muted">${esc(L.zonesHint)}</p>${list}${section(L.addZone, add)}`;
  return layout(L, { role, waHealth, title: L.zones, active: 'zones', body, flash, theme });
}

/* ------------------------------- coupons -------------------------------- */

const KINDS = ['amount', 'percent', 'free_delivery'];

export function couponsPage(L, locale, { coupons, flash, theme , role = 'owner', waHealth = null }) {
  const kindOptions = (selected) =>
    KINDS.map((k) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(L.couponKinds[k])}</option>`).join('');

  const forms = coupons.map((c) => `<form id="cp-${c.id}" method="post" action="/admin/coupons/${c.id}"></form>`).join('');
  const today = new Date().toLocaleDateString('en-CA');
  const rows = coupons
    .map((c) => {
      const f = `form="cp-${c.id}"`;
      const expired = c.expires_on && c.expires_on < today;
      const exhausted = c.max_uses > 0 && c.used_count >= c.max_uses;
      const state = !c.active ? badge(L.couponOff, 'gray')
        : expired ? badge(L.couponExpired, 'danger')
          : exhausted ? badge(L.couponExhausted, 'warning')
            : badge(L.couponOn, 'success', { dot: true });
      return `<tr>
<td><div class="actions"><code class="strong">${esc(c.code)}</code>${state}</div></td>
<td><select ${f} name="kind" aria-label="${esc(L.couponKind)}">${kindOptions(c.kind)}</select></td>
<td class="num"><input ${f} type="number" name="value" value="${c.value}" min="0" aria-label="${esc(L.couponValue)}"></td>
<td class="num"><input ${f} type="number" name="min_subtotal" value="${c.min_subtotal}" min="0" aria-label="${esc(L.couponMin)}"></td>
<td class="num"><input ${f} type="number" name="max_uses" value="${c.max_uses}" min="0" style="width:5em" aria-label="${esc(L.couponMaxUses)}"></td>
<td class="num tabnum">${c.used_count}</td>
<td><input ${f} type="date" name="expires_on" value="${esc(c.expires_on || '')}" aria-label="${esc(L.couponExpires)}"></td>
<td><label class="switch"><input ${f} type="checkbox" name="once_per_customer" value="1"${c.once_per_customer ? ' checked' : ''}>
<span>1×</span></label></td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${c.active ? ' checked' : ''}>
<span>${esc(L.couponOn)}</span></label></td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconPost(`/admin/coupons/${c.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteCoupon })}
</div></td></tr>`;
    })
    .join('');

  const list = coupons.length
    ? table([
      L.couponCode, L.couponKind, { label: L.couponValue, num: true }, { label: L.couponMin, num: true },
      { label: L.couponMaxUses, num: true }, { label: L.couponUsed, num: true }, L.couponExpires, L.couponOnce, '', '',
    ], rows)
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

  const body = `${tabs(CATALOGUE_TABS(L), 'coupons')}<p class="muted">${esc(L.couponsHint)}</p>
<div hidden>${forms}</div>${list}${section(L.addCoupon, add)}`;
  return layout(L, { role, waHealth, title: L.coupons, active: 'coupons', body, flash, theme });
}
