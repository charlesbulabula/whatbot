// Screens added with the pro features: delivery slots, the staff accounts, the
// weekly subscriptions, the cash book, and a product's variants, extras and photo.
import { money } from '../../i18n/index.js';
import {
  esc, card, section, empty, badge, table, layout, icon, iconPost, iconAction, tabs, alert,
  avatar, stat, utcDateTime, dayOf,
} from '../ui.js';

const CATALOGUE_TABS = (L) => [
  ['products', '/admin/products', L.navProducts, 'basket'],
  ['zones', '/admin/zones', L.navZones, 'pin'],
  ['slots', '/admin/slots', L.navSlots, 'clock'],
  ['coupons', '/admin/coupons', L.navCoupons, 'ticket'],
];

/* ---------------------------- delivery slots ---------------------------- */

export function slotsPage(L, locale, { slots, load, day, flash, theme, role = 'owner', waHealth = null }) {
  const forms = slots.map((s) => `<form id="slot-${s.id}" method="post" action="/admin/slots/${s.id}"></form>`).join('');
  const booked = new Map(load.map((l) => [l.slot_id, l.n]));

  const rows = slots
    .map((s) => {
      const f = `form="slot-${s.id}"`;
      const used = booked.get(s.id) || 0;
      return `<tr>
<td><input ${f} name="label_fr" value="${esc(s.label_fr)}" required aria-label="${esc(L.nameFr)}"></td>
<td><input ${f} name="label_en" value="${esc(s.label_en)}" required aria-label="${esc(L.nameEn)}"></td>
<td><input ${f} name="label_ln" value="${esc(s.label_ln || '')}" aria-label="${esc(L.nameLn)}"></td>
<td><input ${f} type="time" name="start_time" value="${esc(s.start_time)}" aria-label="${esc(L.hoursFrom)}"></td>
<td><input ${f} type="time" name="end_time" value="${esc(s.end_time)}" aria-label="${esc(L.hoursTo)}"></td>
<td class="num"><input ${f} type="number" name="capacity" value="${s.capacity}" min="0" style="width:5em" aria-label="${esc(L.slotCapacity)}"></td>
<td class="num">${s.capacity ? badge(`${used}/${s.capacity}`, used >= s.capacity ? 'danger' : 'gray') : badge(String(used), 'gray')}</td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${s.active ? ' checked' : ''}>
<span>${esc(L.slotActive)}</span></label></td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconPost(`/admin/slots/${s.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteSlot })}
</div></td></tr>`;
    })
    .join('');

  const list = slots.length
    ? table([L.nameFr, L.nameEn, L.nameLn, L.hoursFrom, L.hoursTo,
      { label: L.slotCapacity, num: true }, { label: L.slotBooked, num: true }, L.slotActive, ''], rows)
    : card(empty(L.noSlots, 'clock'));

  const add = card(`<form method="post" action="/admin/slots" class="form-grid">
<div class="field"><label for="s-fr">${esc(L.nameFr)}</label><input id="s-fr" name="label_fr" required placeholder="Matin"></div>
<div class="field"><label for="s-en">${esc(L.nameEn)}</label><input id="s-en" name="label_en" required placeholder="Morning"></div>
<div class="field"><label for="s-ln">${esc(L.nameLn)}</label><input id="s-ln" name="label_ln" placeholder="Ntongo"></div>
<div class="field"><label for="s-from">${esc(L.hoursFrom)}</label><input id="s-from" type="time" name="start_time" value="08:00"></div>
<div class="field"><label for="s-to">${esc(L.hoursTo)}</label><input id="s-to" type="time" name="end_time" value="12:00"></div>
<div class="field"><label for="s-cap">${esc(L.slotCapacity)}</label><input id="s-cap" type="number" name="capacity" min="0" value="0"></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addSlot)}</button></div>
</form>`, { head: `${icon('plus')}<h2>${esc(L.addSlot)}</h2>` });

  const body = `${tabs(CATALOGUE_TABS(L), 'slots')}<p class="muted">${esc(L.slotsHint)}</p>
<div hidden>${forms}</div>${list}${section(L.addSlot, add)}
${section(L.slotToday(day), load.length
    ? table([L.slotLabel, { label: L.kpiOrders, num: true }],
      load.map((l) => `<tr><td>${esc(l.slot_label || '—')}</td><td class="num tabnum">${l.n}</td></tr>`).join(''))
    : card(empty(L.noOrders, 'receipt')))}`;

  return layout(L, { role, waHealth, title: L.navSlots, active: 'slots', body, flash, theme });
}

/* -------------------------------- staff --------------------------------- */

const ROLE_TONE = { owner: 'primary', seller: 'info', rider: 'gray' };

export function staffPage(L, locale, { rows, owner, flash, flashTone, theme, role = 'owner', waHealth = null }) {
  const roleOptions = (selected) =>
    ['owner', 'seller', 'rider']
      .map((r) => `<option value="${r}"${r === selected ? ' selected' : ''}>${esc(L.roles[r])}</option>`)
      .join('');

  const forms = rows.map((a) => `<form id="st-${a.id}" method="post" action="/admin/staff/${a.id}"></form>`).join('');
  const list = rows
    .map((a) => {
      const f = `form="st-${a.id}"`;
      return `<tr>
<td><div class="actions">${avatar(a.name || a.username, '', { size: '30px' })}
<span class="stack"><b class="strong">${esc(a.username)}</b>
<span class="muted" style="font-size:.75rem">${a.last_login_at ? esc(utcDateTime(a.last_login_at, locale)) : esc(L.neverSignedIn)}</span></span></div></td>
<td><input ${f} name="name" value="${esc(a.name || '')}" aria-label="${esc(L.name)}"></td>
<td><select ${f} name="role" aria-label="${esc(L.roleLabel)}">${roleOptions(a.role)}</select></td>
<td><input ${f} type="password" name="password" placeholder="${esc(L.newPassword)}" autocomplete="new-password" aria-label="${esc(L.newPassword)}"></td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${a.active ? ' checked' : ''}>
<span>${esc(L.staffActive)}</span></label></td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconPost(`/admin/staff/${a.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteStaff })}
</div></td></tr>`;
    })
    .join('');

  const table_ = rows.length
    ? table([L.account, L.name, L.roleLabel, L.newPassword, L.staffActive, ''], list)
    : card(empty(L.noStaff, 'key'));

  const add = card(`<form method="post" action="/admin/staff" class="form-grid">
<div class="field"><label for="a-user">${esc(L.username)}</label><input id="a-user" name="username" required maxlength="32" placeholder="mamie"></div>
<div class="field"><label for="a-name">${esc(L.name)}</label><input id="a-name" name="name" maxlength="60"></div>
<div class="field"><label for="a-role">${esc(L.roleLabel)}</label><select id="a-role" name="role">${roleOptions('seller')}</select></div>
<div class="field"><label for="a-pass">${esc(L.password)}</label><input id="a-pass" type="password" name="password" required minlength="8" autocomplete="new-password"></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addStaff)}</button></div>
</form><p class="form-note">${esc(L.staffPasswordHint)}</p>`, { head: `${icon('plus')}<h2>${esc(L.addStaff)}</h2>` });

  const roles = card(`<dl class="kv">
<dt>${badge(L.roles.owner, ROLE_TONE.owner)}</dt><dd>${esc(L.roleOwnerHint)}</dd>
<dt>${badge(L.roles.seller, ROLE_TONE.seller)}</dt><dd>${esc(L.roleSellerHint)}</dd>
<dt>${badge(L.roles.rider, ROLE_TONE.rider)}</dt><dd>${esc(L.roleRiderHint)}</dd></dl>`,
  { head: `${icon('shield')}<h2>${esc(L.rolesTitle)}</h2>` });

  const body = `${alert(esc(L.ownerAccountHint(owner)), '', 'info')}
${table_}
<div class="grid-2" style="margin-top:1.75rem">${add}${roles}</div>`;
  return layout(L, { role, waHealth, title: L.navStaff, active: 'staff', body, flash, flashTone, theme });
}

/* ----------------------------- subscriptions ---------------------------- */

export function subscriptionsPage(L, locale, { rows, flash, theme, role = 'owner', waHealth = null }) {
  const list = rows
    .map((s) => {
      let items = [];
      try {
        items = JSON.parse(s.items || '[]');
      } catch {
        items = [];
      }
      return `<tr>
<td><div class="actions">${avatar(s.customer_name, s.phone, { size: '30px' })}
<a href="/admin/customers/${s.customer_id}">${esc(s.customer_name || `+${s.phone}`)}</a></div></td>
<td>${esc(L.weekdays[s.weekday])}</td>
<td class="num tabnum">${items.length}</td>
<td>${s.active ? badge(L.subActive, 'success', { dot: true }) : badge(L.subPaused, 'gray')}</td>
<td class="muted">${s.last_run_day || '—'}</td>
<td><div class="row-actions">
${iconAction(`/admin/customers/${s.customer_id}`, 'eye', L.view)}
${iconPost(`/admin/subscriptions/${s.id}/toggle`, s.active ? 'eyeOff' : 'refresh', s.active ? L.subPause : L.subResume,
    { fields: { active: s.active ? 0 : 1 } })}
${iconPost(`/admin/subscriptions/${s.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteSub })}
</div></td></tr>`;
    })
    .join('');

  const body = `<p class="muted">${esc(L.subscriptionsHint)}</p>
${rows.length
    ? table([L.customers, L.day, { label: L.items, num: true }, L.statusLabel, L.subLastRun, ''], list)
    : card(empty(L.noSubscriptions, 'refresh'))}`;
  return layout(L, { role, waHealth, title: L.navSubscriptions, active: 'subscriptions', body, flash, theme });
}

/* ------------------------------ accounting ------------------------------ */

export function accountingPage(L, locale, data) {
  const { from, to, entries, months, totals, shop, theme, flash, role = 'owner', waHealth = null } = data;

  const rows = entries
    .map((e) => `<tr><td class="nowrap">${esc(e.day)}</td>
<td>${e.kind === 'order' ? badge(L.ledgerIn, 'success') : badge(L.ledgerOut, 'warning')}</td>
<td>${esc(e.ref)}</td><td>${esc(e.label || '')}</td>
<td>${esc(e.kind === 'order' ? (e.method === 'cash' ? L.payCash : L.payMomo) : L.expenseCategories[e.method] || e.method)}</td>
<td class="num tabnum" style="color:${e.amount >= 0 ? 'var(--on-soft-success)' : 'var(--on-soft-danger)'}">
${e.amount >= 0 ? '+' : '−'}${esc(money(locale, Math.abs(e.amount)))}</td></tr>`)
    .join('');

  const monthRows = months
    .map((m) => `<tr><td>${esc(m.month)}</td><td class="num tabnum">${m.orders}</td>
<td class="num tabnum">${esc(money(locale, m.revenue))}</td>
<td class="num tabnum">${esc(money(locale, m.cash))}</td>
<td class="num tabnum">${esc(money(locale, m.momo))}</td>
<td class="num tabnum">${esc(money(locale, m.discounts))}</td>
<td class="num tabnum">${esc(money(locale, m.expenses))}</td>
<td class="num tabnum"><b class="strong">${esc(money(locale, m.margin))}</b></td></tr>`)
    .join('');

  const vat = shop.vatRate
    ? card(`<dl class="kv">
<dt>${esc(L.vatBase)}</dt><dd>${esc(money(locale, totals.beforeVat))}</dd>
<dt>${esc(L.vatAmount)} (${shop.vatRate} %)</dt><dd>${esc(money(locale, totals.vat))}</dd>
<dt>${esc(L.vatTotal)}</dt><dd><b class="strong">${esc(money(locale, totals.income))}</b></dd>
${shop.businessId ? `<dt>${esc(L.businessId)}</dt><dd>${esc(shop.businessId)}</dd>` : ''}</dl>
<p class="form-note">${esc(L.vatHint)}</p>`, { head: `${icon('file')}<h2>${esc(L.vatTitle)}</h2>` })
    : '';

  const body = `<form class="filters" method="get" action="/admin/accounting">
<div class="field"><label for="a-from">${esc(L.from)}</label><input id="a-from" type="date" name="from" value="${esc(from)}"></div>
<div class="field"><label for="a-to">${esc(L.to)}</label><input id="a-to" type="date" name="to" value="${esc(to)}"></div>
<div class="actions"><button class="btn btn--primary">${icon('filter', 17)} ${esc(L.apply)}</button>
<a class="btn" href="/admin/accounting.csv?from=${esc(from)}&amp;to=${esc(to)}">${icon('download', 17)} ${esc(L.exportLedger)}</a>
<button type="button" class="btn no-print" onclick="window.print()">${icon('print', 17)} ${esc(L.printOrPdf)}</button></div></form>

<div class="stats">
${stat({ name: 'cash', tone: 'success', value: money(locale, totals.income), label: L.ledgerIncome })}
${stat({ name: 'wallet', tone: 'warning', value: money(locale, totals.spending), label: L.ledgerSpending })}
${stat({ name: 'trending', tone: totals.balance >= 0 ? 'success' : 'danger', value: money(locale, totals.balance), label: L.ledgerBalance })}
${stat({ name: 'receipt', tone: 'info', value: String(totals.count), label: L.ledgerEntries })}</div>

${vat ? `<div style="margin-top:1rem">${vat}</div>` : ''}

${section(L.ledgerMonthly, months.length
    ? table([L.month, { label: L.kpiOrders, num: true }, { label: L.stats.revenue, num: true },
      { label: L.payCash, num: true }, { label: L.payMomo, num: true }, { label: L.discounts, num: true },
      { label: L.expenses, num: true }, { label: L.stats.margin, num: true }], monthRows)
    : card(empty(L.stats.empty, 'chart')))}

${section(`${L.ledgerTitle} — ${from} → ${to}`, entries.length
    ? table([L.date, L.ledgerKind, L.reference, L.label, L.payment, { label: L.amount, num: true }], rows)
    : card(empty(L.stats.empty, 'file')))}`;

  return layout(L, { role, waHealth, title: L.navAccounting, active: 'accounting', body, flash, theme });
}

/* --------------------- one product: variants & extras ------------------- */

export function productPage(L, locale, data) {
  const { product, variants, extras, globalExtras, flash, theme, role = 'owner', waHealth = null } = data;

  const photo = card(`<form method="post" action="/admin/products/${product.id}/photo" enctype="multipart/form-data">
${product.photo
    ? `<img src="/media/products/${esc(product.photo)}" alt="" style="max-width:14rem;border-radius:var(--radius-lg);display:block;margin-bottom:.75rem">`
    : empty(L.noPhoto, 'basket')}
<div class="actions"><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>
<button class="btn btn--primary">${icon('check', 17)} ${esc(L.uploadPhoto)}</button>
${product.photo ? `</div></form><form method="post" action="/admin/products/${product.id}/photo/delete" class="actions" style="margin-top:.5rem">
<button class="btn btn--danger">${icon('trash', 17)} ${esc(L.removePhoto)}</button></form>` : '</div></form>'}
<p class="form-note">${esc(L.photoHint)}</p>`, { head: `${icon('basket')}<h2>${esc(L.photo)}</h2>` });

  const variantForms = variants.map((v) => `<form id="v-${v.id}" method="post" action="/admin/variants/${v.id}"></form>`).join('');
  const variantRows = variants
    .map((v) => {
      const f = `form="v-${v.id}"`;
      return `<tr>
<td><code>${esc(v.sku)}</code></td>
<td><input ${f} name="label_fr" value="${esc(v.label_fr)}" required aria-label="${esc(L.nameFr)}"></td>
<td><input ${f} name="label_en" value="${esc(v.label_en)}" required aria-label="${esc(L.nameEn)}"></td>
<td><input ${f} name="label_ln" value="${esc(v.label_ln || '')}" aria-label="${esc(L.nameLn)}"></td>
<td class="num"><input ${f} type="number" name="price" value="${v.price}" min="0" aria-label="${esc(L.price)}"></td>
<td class="num"><input ${f} type="number" name="sort_order" value="${v.sort_order}" style="width:4em" aria-label="${esc(L.order)}"></td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${v.active ? ' checked' : ''}><span>${esc(L.couponOn)}</span></label></td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconPost(`/admin/variants/${v.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteVariant })}
</div></td></tr>`;
    })
    .join('');

  const addVariant = card(`<form method="post" action="/admin/products/${product.id}/variants" class="form-grid">
<div class="field"><label for="v-sku">${esc(L.variantSku)}</label><input id="v-sku" name="sku" required maxlength="24" placeholder="botte"></div>
<div class="field"><label for="v-fr">${esc(L.nameFr)}</label><input id="v-fr" name="label_fr" required placeholder="Botte"></div>
<div class="field"><label for="v-en">${esc(L.nameEn)}</label><input id="v-en" name="label_en" required placeholder="Bunch"></div>
<div class="field"><label for="v-ln">${esc(L.nameLn)}</label><input id="v-ln" name="label_ln"></div>
<div class="field"><label for="v-price">${esc(L.price)}</label><input id="v-price" type="number" name="price" min="0" required></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addVariant)}</button></div>
</form>`, { head: `${icon('plus')}<h2>${esc(L.addVariant)}</h2>` });

  const extraForms = extras.map((e) => `<form id="e-${e.id}" method="post" action="/admin/extras/${e.id}"></form>`).join('');
  const extraRows = extras
    .map((e) => {
      const f = `form="e-${e.id}"`;
      return `<tr>
<td><input ${f} name="label_fr" value="${esc(e.label_fr)}" required aria-label="${esc(L.nameFr)}"></td>
<td><input ${f} name="label_en" value="${esc(e.label_en)}" required aria-label="${esc(L.nameEn)}"></td>
<td><input ${f} name="label_ln" value="${esc(e.label_ln || '')}" aria-label="${esc(L.nameLn)}"></td>
<td class="num"><input ${f} type="number" name="price" value="${e.price}" min="0" aria-label="${esc(L.price)}"></td>
<td>${e.product_id ? badge(L.extraThisProduct, 'info') : badge(L.extraAllProducts, 'gray')}</td>
<td><label class="switch"><input ${f} type="checkbox" name="active" value="1"${e.active ? ' checked' : ''}><span>${esc(L.couponOn)}</span></label></td>
<td><div class="row-actions">
<button ${f} class="icon-btn" data-tip="${esc(L.save)}" aria-label="${esc(L.save)}">${icon('check', 17)}</button>
${iconPost(`/admin/extras/${e.id}/delete`, 'trash', L.delete, { tone: 'danger', confirm: L.confirmDeleteExtra })}
</div></td></tr>`;
    })
    .join('');

  const addExtra = card(`<form method="post" action="/admin/products/${product.id}/extras" class="form-grid">
<div class="field"><label for="x-fr">${esc(L.nameFr)}</label><input id="x-fr" name="label_fr" required placeholder="Préparé"></div>
<div class="field"><label for="x-en">${esc(L.nameEn)}</label><input id="x-en" name="label_en" required placeholder="Prepared"></div>
<div class="field"><label for="x-ln">${esc(L.nameLn)}</label><input id="x-ln" name="label_ln"></div>
<div class="field"><label for="x-price">${esc(L.price)}</label><input id="x-price" type="number" name="price" min="0" value="500"></div>
<div class="field"><label class="switch" style="margin-top:1.2rem"><input type="checkbox" name="global" value="1">
<span>${esc(L.extraAllProducts)}</span></label></div>
<div class="field" style="justify-content:flex-end"><button class="btn btn--primary">${icon('plus', 17)} ${esc(L.addExtra)}</button></div>
</form><p class="form-note">${esc(L.extrasHint)}</p>`, { head: `${icon('plus')}<h2>${esc(L.addExtra)}</h2>` });

  const head = card(`<div class="actions">
<span style="font-size:1.75rem">${esc(product.emoji || '📦')}</span>
<span class="stack"><b class="strong" style="font-size:1.125rem">${esc(locale === 'en' ? product.name_en : product.name_fr)}</b>
<span class="muted">${product.in_stock ? esc(L.inStock) : esc(L.outOfStock)}
${product.retailer_id ? ` · ${esc(L.catalogMapped)}: ${esc(product.retailer_id)}` : ''}</span></span>
<span class="spacer"></span>
<form method="post" action="/admin/products/${product.id}/retailer" class="actions">
<input name="retailer_id" value="${esc(product.retailer_id || '')}" placeholder="${esc(L.retailerId)}" size="16">
<button class="btn btn--sm">${icon('check', 15)}</button></form></div>
<p class="form-note">${esc(L.retailerHint)}</p>`);

  const body = `<p><a href="/admin/products">${esc(L.back)}</a></p>${head}
<div class="grid-2" style="margin-top:1rem">${photo}${addVariant}</div>
${section(L.variants, variants.length
    ? `<div hidden>${variantForms}</div>${table([L.variantSku, L.nameFr, L.nameEn, L.nameLn,
      { label: L.price, num: true }, { label: L.order, num: true }, L.couponOn, ''], variantRows)}`
    : card(empty(L.noVariants, 'basket')))}
${section(L.extras, extras.length
    ? `<div hidden>${extraForms}</div>${table([L.nameFr, L.nameEn, L.nameLn, { label: L.price, num: true },
      L.scope, L.couponOn, ''], extraRows)}`
    : card(empty(L.noExtras, 'plus')))}
${section(L.addExtra, addExtra)}`;

  return layout(L, {
    role,
    waHealth,
    title: locale === 'en' ? product.name_en : product.name_fr,
    active: 'products',
    body,
    flash,
    theme,
  });
}
