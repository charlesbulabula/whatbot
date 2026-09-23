// Background jobs, run every minute inside the app process.
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import * as settings from '../shop/settings.js';
import { t, normalizeLocale } from '../i18n/index.js';
import { text } from '../bot/messages.js';
import { notify } from '../bot/notify.js';
import { REMINDABLE_STATES, STATES, surveyMessage } from '../bot/engine.js';
import { fallbackName } from '../bot/orders.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "2026-W38" for the given local date. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** One "still there?" nudge per stalled order. */
export async function cartReminders() {
  const stalled = db.idleConversations(REMINDABLE_STATES, config.automation.cartReminderMinutes, { reminded: false });
  for (const conv of stalled) {
    db.markReminded(conv.phone);
    const customer = db.getCustomer(conv.phone);
    if (!customer) continue;
    const locale = normalizeLocale(customer.locale);
    const key = conv.state === STATES.AWAIT_PROOF ? 'awaitingProof' : 'cartReminder';
    try {
      await notify(customer, { message: text(conv.phone, t(locale, key)) });
    } catch (err) {
      logger.error(`Cart reminder to ${conv.phone} failed:`, err.message);
    }
  }
}

/** Rating request 24h after delivery, unless the customer is in the middle of a new order. */
export async function surveys() {
  for (const order of db.ordersAwaitingSurvey()) {
    const customer = order.customer;
    const conv = db.getConversation(customer.phone);
    if (![STATES.WELCOME, STATES.DONE].includes(conv.state)) continue;
    const locale = normalizeLocale(customer.locale);
    db.markSurveySent(order.id); // one attempt per order, even if sending fails
    let result;
    try {
      result = await notify(customer, {
        message: surveyMessage(customer.phone, locale, order),
        templateKey: 'survey',
        templateParams: [fallbackName(customer), order.reference],
      });
    } catch (err) {
      logger.error(`Survey to ${customer.phone} failed:`, err.message);
      continue;
    }
    if (result !== 'skipped') db.setConversationState(customer.phone, STATES.RATING, { ratingOrderId: order.id });
  }
}

/** Weekly restock nudge to past customers, once per ISO week at the configured day/hour (local time). */
export async function weeklyReminder(now = new Date()) {
  const { weeklyReminderDay, weeklyReminderHour } = config.automation;
  if (now.getDay() !== weeklyReminderDay || now.getHours() < weeklyReminderHour) return;
  const week = isoWeek(now);
  if (db.getSetting('weekly_reminder_week') === week) return;
  db.setSetting('weekly_reminder_week', week); // mark first: a crash mid-run must not double-send
  const customers = db.customersForWeeklyReminder();
  logger.info(`Weekly reminder ${week}: ${customers.length} customers`);
  for (const c of customers) {
    const locale = normalizeLocale(c.locale);
    try {
      await notify(c, {
        message: text(c.phone, t(locale, 'weeklyReminder', { name: c.name })),
        templateKey: 'weeklyReminder',
        templateParams: [fallbackName(c)],
      });
    } catch (err) {
      logger.error(`Weekly reminder to ${c.phone} failed:`, err.message);
    }
    await sleep(250);
  }
}

/** Tells waitlisted customers, oldest first, when capacity frees up. */
export async function waitlistRelease() {
  const waiting = db.waitlistedCustomers();
  if (!waiting.length) return;
  const cap = settings.get().weeklyCapacity;
  const free = cap > 0 ? cap - db.weeklyOrderCount() : waiting.length;
  for (const c of waiting.slice(0, Math.max(free, 0))) {
    db.updateCustomer(c.id, { waitlist_since: null });
    const locale = normalizeLocale(c.locale);
    try {
      await notify(c, {
        message: text(c.phone, t(locale, 'waitlistOpen', { name: c.name })),
        templateKey: 'waitlistOpen',
        templateParams: [fallbackName(c)],
      });
    } catch (err) {
      logger.error(`Waitlist notice to ${c.phone} failed:`, err.message);
    }
  }
}

async function safely(name, job) {
  try {
    await job();
  } catch (err) {
    logger.error(`Job ${name} failed:`, err.stack || err.message);
  }
}

export async function runJobs(now = new Date()) {
  await safely('cartReminders', cartReminders);
  await safely('surveys', surveys);
  await safely('weeklyReminder', () => weeklyReminder(now));
  await safely('waitlistRelease', waitlistRelease);
  await safely('pruneEvents', () => db.pruneProcessedEvents());
}

export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runJobs();
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5_000).unref();
  setInterval(tick, 60_000).unref();
}
