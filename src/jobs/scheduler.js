// Background jobs, run every minute inside the app process.
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import * as settings from '../shop/settings.js';
import { t, normalizeLocale, DEFAULT_LOCALE, money } from '../i18n/index.js';
import { text } from '../bot/messages.js';
import { notify } from '../bot/notify.js';
import { REMINDABLE_STATES, STATES, surveyMessage } from '../bot/engine.js';
import { fallbackName } from '../bot/orders.js';
import * as cart from '../bot/cart.js';
import * as loyalty from '../shop/loyalty.js';
import { notifyAdminProof } from '../bot/orders.js';
import { sendAlert } from '../mail.js';

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
  await safely('subscriptions', () => runSubscriptions(now));
  await safely('winback', () => winback(now));
  await safely('dailyReport', () => dailyReport(now));
  await safely('pruneEvents', () => db.pruneProcessedEvents());
}

/**
 * One summary email at the end of the day: what sold, what is still owed and
 * what to buy for tomorrow. Sent once per day, at the shop's closing hour.
 */
export async function dailyReport(now = new Date()) {
  const shop = settings.get();
  if (!shop.dailyReport) return false;

  const today = now.toLocaleDateString('en-CA');
  if (db.getSetting(`daily-report:${today}`)) return false;

  // Wait until the shop has closed for the day (or 20:00 if it never closes).
  const window = shop.hours[now.getDay()];
  const closeHour = window ? Number(window.close.slice(0, 2)) : 20;
  if (now.getHours() < closeHour) return false;

  const orders = db.ordersForDay(today).filter((o) => o.status !== 'cancelled');
  const paid = orders.filter((o) => o.paid_at);
  const cash = db.cashToCollect(today);
  const toCheck = orders.filter((o) => o.status === 'awaiting_payment').length;
  const shopping = db.shoppingList(today);
  const L = DEFAULT_LOCALE;

  const lines = [
    `${t(L, 'reportOrders')} : ${orders.length}`,
    `${t(L, 'reportRevenue')} : ${money(L, paid.reduce((sum, o) => sum + o.total, 0))}`,
    `${t(L, 'reportToCheck')} : ${toCheck}`,
    cash.orders ? `${t(L, 'reportCash')} : ${money(L, cash.amount)} (${cash.orders})` : null,
    '',
    t(L, 'reportShopping'),
    ...(shopping.length
      ? shopping.map((r) => `- ${r.name_fr} ${t(L, `sizes.${r.size}`)} × ${r.qty}`)
      : [`- ${t(L, 'reportNothing')}`]),
  ].filter((l) => l !== null);

  const result = await sendAlert({ subject: `${t(L, 'reportSubject')} ${today}`, text: lines.join('\n') });
  // Mark it done even when the send was skipped, so a missing SMTP server does
  // not make the job retry every minute for the rest of the evening.
  db.setSetting(`daily-report:${today}`, new Date().toISOString());
  if (result === 'sent') logger.info(`Daily report emailed for ${today}`);
  return result === 'sent';
}

/**
 * Weekly subscriptions: on its weekday, a subscription becomes a real order and
 * the customer is told, with a chance to cancel. Nothing is charged upfront —
 * the order goes through the usual payment flow.
 */
export async function runSubscriptions(now = new Date()) {
  const day = now.toLocaleDateString('en-CA');
  const shop = settings.get();
  if (!settings.isOpen(now, shop)) return 0;

  let created = 0;
  for (const sub of db.subscriptionsDue(now.getDay(), day)) {
    let items = [];
    try {
      items = JSON.parse(sub.items || '[]');
    } catch {
      items = [];
    }
    db.updateSubscription(sub.id, { last_run_day: day });
    if (!items.length) continue;

    const customer = db.getCustomerById(sub.customer_id);
    // Skip the week when they already have an order waiting: no double delivery.
    if (db.openOrdersToday(customer.id).length) continue;

    const priced = cart.priceCart(items);
    if (!priced.lines.length) continue;

    const locale = normalizeLocale(customer.locale);
    const zone = db.findZoneByName(customer.neighborhood);
    const fee = loyalty.deliveryFeeFor(customer.tier, zone ? zone.fee : shop.defaultDeliveryFee, shop);
    const totals = cart.computeTotals(priced.subtotal, customer.credit, { deliveryFee: fee });

    const order = db.createOrder({
      customer,
      items: priced.lines.map((l) => ({
        productId: l.productId,
        size: l.size,
        variantLabel: l.variant?.label_fr || null,
        extras: l.extras,
        quantity: l.qty,
        unitPrice: l.unitPrice,
      })),
      ...totals,
      name: customer.name,
      neighborhood: customer.neighborhood,
      addressNote: customer.address_note,
      slotId: sub.slot_id,
    });
    created += 1;

    const summary = priced.lines
      .map((l) => cart.shortItem(locale, l.product, l.size, l.qty))
      .join(', ');
    try {
      await notify(customer, {
        message: text(customer.phone, t(locale, 'subscriptionOrder', {
          ref: order.reference,
          items: summary,
          total: money(locale, order.total),
        })),
        templateKey: 'orderUpdate',
        templateParams: [order.reference, t(locale, 'status.awaiting_payment')],
      });
    } catch (err) {
      logger.error(`Subscription message to ${customer.phone} failed:`, err.message);
    }
    await notifyAdminProof(order, { subscription: true }).catch(() => {});
  }
  if (created) logger.info(`Subscriptions: ${created} order(s) created`);
  return created;
}

/**
 * Win-back: one message to customers who have not ordered for a while, each with
 * a personal promo code. Runs once a day, and only for customers we can reach.
 */
export async function winback(now = new Date()) {
  const shop = settings.get();
  if (!shop.winbackEnabled || shop.winbackDiscount <= 0) return 0;

  const day = now.toLocaleDateString('en-CA');
  if (db.getSetting(`winback:${day}`)) return 0;
  db.setSetting(`winback:${day}`, new Date().toISOString());

  const expires = new Date(now.getTime() + 14 * 864e5).toLocaleDateString('en-CA');
  let sent = 0;
  for (const customer of db.inactiveCustomers(shop.winbackDays, { limit: 30 })) {
    // One personal, single-use code per customer, so the offer cannot be shared.
    const code = `RETOUR${String(customer.id).padStart(3, '0')}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    if (db.getCouponByCode(code)) continue;
    db.createCoupon({
      code,
      kind: 'amount',
      value: shop.winbackDiscount,
      min_subtotal: 0,
      max_uses: 1,
      once_per_customer: 1,
      expires_on: expires,
      active: 1,
    });
    const locale = normalizeLocale(customer.locale);
    try {
      const result = await notify(customer, {
        message: text(customer.phone, t(locale, 'winback', {
          name: customer.name,
          amount: money(locale, shop.winbackDiscount),
          code,
          days: 14,
        })),
        templateKey: 'weeklyReminder',
        templateParams: [customer.name || '', code],
      });
      if (result === 'sent' || result === 'template') sent += 1;
    } catch (err) {
      logger.error(`Win-back to ${customer.phone} failed:`, err.message);
    }
    await sleep(300); // stay well inside Meta's per-second limits
  }
  if (sent) logger.info(`Win-back: ${sent} customer(s) messaged`);
  return sent;
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
