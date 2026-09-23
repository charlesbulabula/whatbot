// Settings, split into tabs so each screen holds one decision at a time.
import { esc, card, layout, icon, tabs, badge, alert, table } from '../ui.js';

const SETTINGS_TABS = (L) => [
  ['shop', '/admin/settings', L.tabShop, 'store'],
  ['hours', '/admin/settings?tab=hours', L.openingHours, 'clock'],
  ['payment', '/admin/settings?tab=payment', L.paymentSection, 'wallet'],
  ['alerts', '/admin/settings?tab=alerts', L.alertsSection, 'bell'],
  ['loyalty', '/admin/settings?tab=loyalty', L.tabLoyaltyRules, 'gift'],
  ['system', '/admin/settings?tab=system', L.tabSystem, 'shield'],
];

/** Wraps a tab's fields in the shared save form; `tab` is posted back so only that tab is applied. */
const form = (L, tab, inner) => `<form method="post" action="/admin/settings">
<input type="hidden" name="tab" value="${tab}">${inner}
<div class="actions" style="margin-top:1.25rem"><button class="btn btn--primary">${icon('check', 17)} ${esc(L.save)}</button></div></form>`;

export function settingsPage(L, locale, data) {
  const { shop, smtpReady, tab = 'shop', system = {}, flash, flashTone, theme } = data;

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

    system: card(`<dl class="kv">
<dt>${esc(L.version)}</dt><dd>${esc(system.version || '—')}</dd>
<dt>Node</dt><dd>${esc(system.node || '—')}</dd>
<dt>${esc(L.uptime)}</dt><dd>${esc(system.uptime || '—')}</dd>
<dt>${esc(L.database)}</dt><dd>${esc(system.dbSize || '—')}</dd>
<dt>${esc(L.publicUrl)}</dt><dd>${esc(system.publicUrl || '—')}</dd>
<dt>${esc(L.timezone)}</dt><dd>${esc(system.tz || '—')}</dd>
<dt>${esc(L.whatsappStatus)}</dt><dd>${system.waReady ? badge(L.configured, 'success', { dot: true }) : badge(L.notConfigured, 'danger')}</dd>
<dt>${esc(L.aiStatus)}</dt><dd>${system.aiReady ? badge(L.configured, 'success', { dot: true }) : badge(L.notConfigured, 'gray')}</dd>
</dl><hr>
<div class="actions">
<a class="btn" href="/admin/backup">${icon('download', 17)} ${esc(L.downloadBackup)}</a>
<a class="btn" href="/admin/audit">${icon('history', 17)} ${esc(L.navAudit)}</a></div>
<p class="form-note">${esc(L.backupHint)}</p>`, { head: `${icon('shield')}<h2>${esc(L.tabSystem)}</h2>` }),
  };

  const body = `${tabs(SETTINGS_TABS(L), tab)}${panels[tab] || panels.shop}`;
  return layout(L, { title: L.settings, active: 'settings', body, flash, flashTone, theme });
}
