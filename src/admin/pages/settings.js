// Settings, split into tabs so each screen holds one decision at a time.
import { esc, card, layout, icon, tabs, badge, alert, table } from '../ui.js';

/** Live state of the WhatsApp token, the thing that silently breaks everything. */
function waRows(L, health) {
  if (!health) return '';
  const tone = health.ok ? 'success' : health.reason === 'unreachable' ? 'warning' : 'danger';
  const label = health.ok ? L.waTokenOk
    : health.reason === 'expired' ? L.waTokenExpired
      : health.reason === 'unreachable' ? L.waTokenUnknown : L.waTokenInvalid;
  return `<dt>${esc(L.waTokenState)}</dt><dd>${badge(label, tone, { dot: health.ok })}
${health.expiresAt ? `<span class="muted"> — ${esc(health.expiresAt)}</span>` : ''}</dd>
${health.number ? `<dt>${esc(L.waNumber)}</dt><dd>${esc(health.number)}${health.name ? ` — ${esc(health.name)}` : ''}</dd>` : ''}
${health.quality ? `<dt>${esc(L.waQuality)}</dt><dd>${esc(health.quality)}</dd>` : ''}`;
}

const SETTINGS_TABS = (L) => [
  ['shop', '/admin/settings', L.tabShop, 'store'],
  ['hours', '/admin/settings?tab=hours', L.openingHours, 'clock'],
  ['payment', '/admin/settings?tab=payment', L.paymentSection, 'wallet'],
  ['alerts', '/admin/settings?tab=alerts', L.alertsSection, 'bell'],
  ['loyalty', '/admin/settings?tab=loyalty', L.tabLoyaltyRules, 'gift'],
  ['tiers', '/admin/settings?tab=tiers', L.tabTiers, 'star'],
  ['catalogue', '/admin/settings?tab=catalogue', L.tabCatalogue, 'package'],
  ['accounting', '/admin/settings?tab=accounting', L.navAccounting, 'file'],
  ['system', '/admin/settings?tab=system', L.tabSystem, 'shield'],
];

/** Wraps a tab's fields in the shared save form; `tab` is posted back so only that tab is applied. */
const form = (L, tab, inner) => `<form method="post" action="/admin/settings">
<input type="hidden" name="tab" value="${tab}">${inner}
<div class="actions" style="margin-top:1.25rem"><button class="btn btn--primary">${icon('check', 17)} ${esc(L.save)}</button></div></form>`;

export function settingsPage(L, locale, data) {
  const { shop, smtpReady, tab = 'shop', system = {}, flash, flashTone, theme, role = 'owner', waHealth = null } = data;

  const panels = {
    shop: form(L, 'shop', card(`<div class="form-grid">
<div class="field"><label for="s-name">${esc(L.shopName)}</label><input id="s-name" name="name" value="${esc(shop.name)}" maxlength="60"></div>
<div class="field"><label for="s-min">${esc(L.minOrder)}</label><input id="s-min" type="number" name="minOrder" min="0" value="${shop.minOrder}"></div>
<div class="field"><label for="s-fee">${esc(L.defaultDeliveryFee)}</label><input id="s-fee" type="number" name="defaultDeliveryFee" min="0" value="${shop.defaultDeliveryFee}"></div>
<div class="field"><label for="s-cap">${esc(L.weeklyCapacity)}</label><input id="s-cap" type="number" name="weeklyCapacity" min="0" value="${shop.weeklyCapacity}"></div>
</div><p class="form-note">${esc(L.capacityHint)}</p>
<hr>
<label class="switch"><input type="checkbox" name="closed" value="1"${shop.closed ? ' checked' : ''}>
<span class="strong">${esc(L.closeNow)}</span></label>
<div class="field" style="margin-top:.75rem"><label for="s-note">${esc(L.closedNote)}</label>
<input id="s-note" name="closedNote" value="${esc(shop.closedNote)}" maxlength="200" placeholder="${esc(L.closedNotePlaceholder)}"></div>`,
    { head: `${icon('store')}<h2>${esc(L.shopSection)}</h2>` })),

    hours: form(L, 'hours', card(`${table(
      [L.day, L.hoursOpen, L.hoursFrom, L.hoursTo],
      [1, 2, 3, 4, 5, 6, 0].map((d) => {
        const w = shop.hours[d];
        return `<tr><td>${esc(L.weekdays[d])}</td>
<td><label class="switch"><input type="checkbox" name="open_${d}" value="1"${w ? ' checked' : ''}><span>${esc(L.hoursOpen)}</span></label></td>
<td><input type="time" name="from_${d}" value="${esc(w?.open || '07:00')}" aria-label="${esc(L.hoursFrom)}"></td>
<td><input type="time" name="to_${d}" value="${esc(w?.close || '20:00')}" aria-label="${esc(L.hoursTo)}"></td></tr>`;
      }).join(''),
    )}<p class="form-note">${esc(L.hoursHint)}</p>`, { head: `${icon('clock')}<h2>${esc(L.openingHours)}</h2>` })),

    payment: form(L, 'payment', card(`<label class="switch"><input type="checkbox" name="momoEnabled" value="1"${shop.momoEnabled ? ' checked' : ''}>
<span class="strong">${esc(L.momoEnabled)}</span></label>
<div class="form-grid" style="margin-top:.75rem">
<div class="field"><label for="s-or">${esc(L.momoOrange)}</label><input id="s-or" name="momoOrange" value="${esc(shop.momoOrange)}" inputmode="tel"></div>
<div class="field"><label for="s-ai">${esc(L.momoAirtel)}</label><input id="s-ai" name="momoAirtel" value="${esc(shop.momoAirtel)}" inputmode="tel"></div>
<div class="field"><label for="s-ho">${esc(L.momoHolder)}</label><input id="s-ho" name="momoHolder" value="${esc(shop.momoHolder)}" maxlength="60"></div>
</div><hr>
<label class="switch"><input type="checkbox" name="cashEnabled" value="1"${shop.cashEnabled ? ' checked' : ''}>
<span class="strong">${esc(L.cashEnabled)}</span></label>
<p class="form-note">${esc(L.cashHint)}</p>`, { head: `${icon('wallet')}<h2>${esc(L.paymentSection)}</h2>` })),

    alerts: `${form(L, 'alerts', card(`<div class="field"><label for="s-admin">${esc(L.adminNotifyNumber)}</label>
<input id="s-admin" name="adminNotifyNumber" value="${esc(shop.adminNotifyNumber)}" inputmode="tel" placeholder="243899000000"></div>
<p class="form-note">${esc(L.adminNotifyHint)}</p>
<hr>
<label class="switch"><input type="checkbox" name="emailAlerts" value="1"${shop.emailAlerts ? ' checked' : ''}>
<span class="strong">${esc(L.emailAlerts)}</span></label>
<div class="field" style="margin-top:.75rem"><label for="s-mail">${esc(L.alertEmail)}</label>
<input id="s-mail" type="email" name="alertEmail" value="${esc(shop.alertEmail)}" placeholder="vous@exemple.com"></div>
<hr>
<label class="switch"><input type="checkbox" name="dailyReport" value="1"${shop.dailyReport ? ' checked' : ''}>
<span class="strong">${esc(L.dailyReport)}</span></label>
<p class="form-note">${esc(L.dailyReportHint)}</p>`,
    { head: `${icon('bell')}<h2>${esc(L.alertsSection)}</h2>${smtpReady ? badge(L.smtpOn, 'success', { dot: true }) : badge(L.smtpOff, 'gray')}` }))}
${smtpReady
    ? `<form method="post" action="/admin/settings/test-email" class="actions" style="margin-top:.75rem">
<button class="btn">${icon('message', 17)} ${esc(L.sendTestEmail)}</button>
<span class="muted">${esc(L.sendTestEmailHint)}</span></form>`
    : alert(esc(L.smtpMissing), 'warning', 'info')}`,

    loyalty: form(L, 'loyalty', card(`<div class="form-grid">
<div class="field"><label for="s-lev">${esc(L.loyaltyEvery)}</label><input id="s-lev" type="number" name="loyaltyEvery" min="0" value="${shop.loyaltyEvery}"></div>
<div class="field"><label for="s-lrw">${esc(L.loyaltyReward)}</label><input id="s-lrw" type="number" name="loyaltyReward" min="0" value="${shop.loyaltyReward}"></div>
<div class="field"><label for="s-ref">${esc(L.referralReward)}</label><input id="s-ref" type="number" name="referralReward" min="0" value="${shop.referralReward}"></div>
</div><p class="form-note">${esc(L.loyaltyHint)}</p>`, { head: `${icon('gift')}<h2>${esc(L.tabLoyaltyRules)}</h2>` })),

    tiers: form(L, 'tiers', card(`<div class="form-grid">
<div class="field"><label for="t-so">${esc(L.tierSilverOrders)}</label><input id="t-so" type="number" name="tierSilverOrders" min="0" value="${shop.tierSilverOrders}"></div>
<div class="field"><label for="t-sd">${esc(L.tierSilverDelivery)}</label><input id="t-sd" type="number" name="tierSilverDelivery" min="0" max="100" value="${shop.tierSilverDelivery}"></div>
<div class="field"><label for="t-go">${esc(L.tierGoldOrders)}</label><input id="t-go" type="number" name="tierGoldOrders" min="0" value="${shop.tierGoldOrders}"></div>
<div class="field"><label for="t-gd">${esc(L.tierGoldDelivery)}</label><input id="t-gd" type="number" name="tierGoldDelivery" min="0" max="100" value="${shop.tierGoldDelivery}"></div>
</div><p class="form-note">${esc(L.tiersHint)}</p>
<hr>
<label class="switch"><input type="checkbox" name="winbackEnabled" value="1"${shop.winbackEnabled ? ' checked' : ''}>
<span class="strong">${esc(L.winbackEnabled)}</span></label>
<div class="form-grid" style="margin-top:.75rem">
<div class="field"><label for="w-days">${esc(L.winbackDays)}</label><input id="w-days" type="number" name="winbackDays" min="7" value="${shop.winbackDays}"></div>
<div class="field"><label for="w-amount">${esc(L.winbackDiscount)}</label><input id="w-amount" type="number" name="winbackDiscount" min="0" value="${shop.winbackDiscount}"></div>
</div><p class="form-note">${esc(L.winbackHint)}</p>`, { head: `${icon('star')}<h2>${esc(L.tabTiers)}</h2>` })),

    catalogue: form(L, 'catalogue', card(`<label class="switch">
<input type="checkbox" name="catalogEnabled" value="1"${shop.catalogEnabled ? ' checked' : ''}>
<span class="strong">${esc(L.catalogEnabled)}</span></label>
<div class="field" style="margin-top:.75rem"><label for="c-id">${esc(L.catalogId)}</label>
<input id="c-id" name="catalogId" value="${esc(shop.catalogId)}" inputmode="numeric" placeholder="1234567890"></div>
<p class="form-note">${esc(L.catalogHint)}</p>`, { head: `${icon('package')}<h2>${esc(L.tabCatalogue)}</h2>` })),

    accounting: form(L, 'accounting', card(`<div class="form-grid">
<div class="field"><label for="ac-vat">${esc(L.vatRate)}</label><input id="ac-vat" type="number" name="vatRate" min="0" max="100" value="${shop.vatRate}"></div>
<div class="field"><label for="ac-id">${esc(L.businessId)}</label><input id="ac-id" name="businessId" value="${esc(shop.businessId)}" maxlength="40"></div>
</div><p class="form-note">${esc(L.vatHint)}</p>
<div class="actions" style="margin-top:.75rem"><a class="btn" href="/admin/accounting">${icon('file', 17)} ${esc(L.ledgerTitle)}</a></div>`,
    { head: `${icon('file')}<h2>${esc(L.navAccounting)}</h2>` })),

    system: card(`<dl class="kv">
<dt>${esc(L.version)}</dt><dd>${esc(system.version || '—')}</dd>
<dt>Node</dt><dd>${esc(system.node || '—')}</dd>
<dt>${esc(L.uptime)}</dt><dd>${esc(system.uptime || '—')}</dd>
<dt>${esc(L.database)}</dt><dd>${esc(system.dbSize || '—')}</dd>
<dt>${esc(L.publicUrl)}</dt><dd>${esc(system.publicUrl || '—')}</dd>
<dt>${esc(L.timezone)}</dt><dd>${esc(system.tz || '—')}</dd>
<dt>${esc(L.whatsappStatus)}</dt><dd>${system.waReady ? badge(L.configured, 'success', { dot: true }) : badge(L.notConfigured, 'danger')}</dd>
${waRows(L, system.waHealth)}
<dt>${esc(L.aiStatus)}</dt><dd>${system.aiReady ? badge(L.configured, 'success', { dot: true }) : badge(L.notConfigured, 'gray')}</dd>
<dt>${esc(L.sttStatus)}</dt><dd>${system.sttReady ? badge(L.configured, 'success', { dot: true }) : badge(L.notConfigured, 'gray')}</dd>
<dt>${esc(L.tabCatalogue)}</dt><dd>${system.catalogReady ? badge(L.configured, 'success', { dot: true }) : badge(L.notConfigured, 'gray')}</dd>
</dl><hr>
<div class="actions">
<a class="btn" href="/admin/backup">${icon('download', 17)} ${esc(L.downloadBackup)}</a>
<a class="btn" href="/admin/audit">${icon('history', 17)} ${esc(L.navAudit)}</a></div>
<p class="form-note">${esc(L.backupHint)}</p>`, { head: `${icon('shield')}<h2>${esc(L.tabSystem)}</h2>` }),
  };

  const body = `${tabs(SETTINGS_TABS(L), tab)}${panels[tab] || panels.shop}`;
  return layout(L, { role, waHealth, title: L.settings, active: 'settings', body, flash, flashTone, theme });
}
