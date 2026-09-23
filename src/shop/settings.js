// Shop settings the owner can change from the dashboard, without a redeploy.
//
// Values live as one JSON row in the `settings` table. The .env variables are
// only the defaults used until something is saved, so an existing install keeps
// behaving exactly as before until the owner touches the Settings page.
import { config } from '../config.js';
import * as db from '../db/index.js';

const KEY = 'shop';

/** 0 = Sunday … 6 = Saturday, matching Date#getDay(). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const ALL_DAY = Object.fromEntries(WEEKDAYS.map((d) => [d, { open: '00:00', close: '23:59' }]));
const OFFICE_HOURS = Object.fromEntries(WEEKDAYS.map((d) => [d, { open: '07:00', close: '20:00' }]));

/** SHOP_HOURS seeds the schedule on a fresh install: "24/7", or a JSON object. */
function defaultHours() {
  const raw = String(config.shop.hours || '').trim();
  if (!raw) return OFFICE_HOURS;
  if (raw === '24/7') return ALL_DAY;
  try {
    return JSON.parse(raw);
  } catch {
    return OFFICE_HOURS;
  }
}

const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
// A window ending at 23:59 means "until midnight", so 00:00–23:59 is a full open day.
const closingMinutes = (hhmm) => (minutes(hhmm) === 23 * 60 + 59 ? 24 * 60 : minutes(hhmm));
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const toInt = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : fallback);

function defaults() {
  return {
    name: config.shop.name,
    momoOrange: config.shop.momoOrange,
    momoAirtel: config.shop.momoAirtel,
    momoHolder: config.shop.momoHolder,
    adminNotifyNumber: config.shop.adminNotifyNumber,
    alertEmail: config.smtp.to,
    emailAlerts: true,
    dailyReport: false, // one summary email at the end of the day
    // Loyalty rules, seeded from .env then owned by the dashboard.
    loyaltyEvery: config.loyalty.every,
    loyaltyReward: config.loyalty.reward,
    referralReward: config.loyalty.referralReward,
    // Loyalty tiers: how many paid orders to reach a tier, and how much of the
    // delivery fee it takes off (in percent).
    tierSilverOrders: 5,
    tierSilverDelivery: 25,
    tierGoldOrders: 15,
    tierGoldDelivery: 100,
    // Win-back: message a customer who has not ordered for this many days.
    winbackEnabled: false,
    winbackDays: 30,
    winbackDiscount: 1000,
    // Meta product catalog (Commerce Manager). Empty id = the bot's own list.
    catalogEnabled: false,
    catalogId: '',
    // Accounting: the VAT rate shown on the ledger (0 = not subject to VAT).
    vatRate: 16,
    businessId: '', // tax / RCCM number printed on exports
    momoEnabled: true,
    cashEnabled: false, // opt-in: cash on delivery changes how the rider is briefed
    closed: false, // manual "closed now" switch, independent of the opening hours
    closedNote: '',
    minOrder: 0, // minimum subtotal, 0 = no minimum
    weeklyCapacity: config.automation.weeklyStockCapacity,
    defaultDeliveryFee: config.shop.deliveryFee,
    hours: defaultHours(),
  };
}

/** Keeps stored JSON usable even if it was written by an older version. */
function normalize(raw) {
  const base = defaults();
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  const hours = {};
  for (const d of WEEKDAYS) {
    const day = (raw?.hours || {})[d] ?? (raw?.hours || {})[String(d)];
    hours[d] = day && isTime(day.open) && isTime(day.close) && minutes(day.close) > minutes(day.open)
      ? { open: day.open, close: day.close }
      : day === null
        ? null
        : base.hours[d];
  }
  return {
    ...s,
    name: String(s.name || base.name).slice(0, 60),
    momoOrange: digits(s.momoOrange),
    momoAirtel: digits(s.momoAirtel),
    momoHolder: String(s.momoHolder || '').slice(0, 60),
    adminNotifyNumber: digits(s.adminNotifyNumber),
    alertEmail: String(s.alertEmail || '').trim().slice(0, 120),
    emailAlerts: Boolean(s.emailAlerts),
    dailyReport: Boolean(s.dailyReport),
    loyaltyEvery: toInt(s.loyaltyEvery),
    loyaltyReward: toInt(s.loyaltyReward),
    referralReward: toInt(s.referralReward),
    tierSilverOrders: toInt(s.tierSilverOrders),
    tierSilverDelivery: Math.min(100, toInt(s.tierSilverDelivery)),
    tierGoldOrders: toInt(s.tierGoldOrders),
    tierGoldDelivery: Math.min(100, toInt(s.tierGoldDelivery)),
    winbackEnabled: Boolean(s.winbackEnabled),
    winbackDays: Math.max(7, toInt(s.winbackDays) || 30),
    winbackDiscount: toInt(s.winbackDiscount),
    catalogEnabled: Boolean(s.catalogEnabled),
    catalogId: String(s.catalogId || '').replace(/\D/g, '').slice(0, 30),
    vatRate: Math.min(100, toInt(s.vatRate)),
    businessId: String(s.businessId || '').trim().slice(0, 40),
    momoEnabled: Boolean(s.momoEnabled),
    cashEnabled: Boolean(s.cashEnabled),
    closed: Boolean(s.closed),
    closedNote: String(s.closedNote || '').slice(0, 200),
    minOrder: toInt(s.minOrder),
    weeklyCapacity: toInt(s.weeklyCapacity),
    defaultDeliveryFee: toInt(s.defaultDeliveryFee),
    hours,
  };
}

export function get() {
  let raw = null;
  try {
    raw = JSON.parse(db.getSetting(KEY) || 'null');
  } catch {
    raw = null; // corrupted row: fall back to the defaults rather than crashing the bot
  }
  return normalize(raw);
}

/** Merges a patch into the saved settings and returns the result. */
export function save(patch) {
  const next = normalize({ ...get(), ...patch });
  db.setSetting(KEY, JSON.stringify(next));
  return next;
}

/* ----------------------------- opening hours ---------------------------- */

/**
 * Whether the shop takes orders right now: the manual switch wins, otherwise
 * the weekday's opening window (server timezone, TZ=Africa/Kinshasa in production).
 */
export function isOpen(now = new Date(), settings = get()) {
  if (settings.closed) return false;
  const today = settings.hours[now.getDay()];
  if (!today) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= minutes(today.open) && nowMin < closingMinutes(today.close);
}

/**
 * The next moment the shop opens, as { day, time } where `day` is 0-6, or null
 * when every day is closed (or the manual switch is on with no schedule left).
 */
export function nextOpening(now = new Date(), settings = get()) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let ahead = 0; ahead < 8; ahead += 1) {
    const day = (now.getDay() + ahead) % 7;
    const window = settings.hours[day];
    if (!window) continue;
    if (ahead === 0 && nowMin >= minutes(window.open)) continue; // today's window already started
    return { day, time: window.open, today: ahead === 0, tomorrow: ahead === 1 };
  }
  return null;
}

/** "07:00 – 20:00" per weekday, for the dashboard and the bot's "we're closed" reply. */
export function describeHours(settings = get()) {
  return WEEKDAYS.map((d) => ({ day: d, window: settings.hours[d] }));
}
