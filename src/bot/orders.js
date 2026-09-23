// Order lifecycle side effects shared by the chat engine and the admin dashboard.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import { t, money, normalizeLocale, DEFAULT_LOCALE } from '../i18n/index.js';
import { text } from './messages.js';
import { notify } from './notify.js';
import { publish } from '../utils/events.js';
import { sendAlert } from '../mail.js';
import * as loyalty from '../shop/loyalty.js';
import { trackingUrl } from '../tracking.js';
import * as settings from '../shop/settings.js';
import { downloadMedia } from '../whatsapp/client.js';

const STATUS_MESSAGE = {
  paid: 'statusPaid',
  preparing: 'statusPreparing',
  on_the_way: 'statusOnTheWay',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

export const ORDER_STATUSES = ['awaiting_payment', ...Object.keys(STATUS_MESSAGE)];

async function safeNotify(customer, payload) {
  try {
    return await notify(customer, payload);
  } catch (err) {
    logger.error(`Could not notify ${customer.phone}:`, err.message);
    return 'failed';
  }
}

const fallbackName = (customer) => customer.name || t(normalizeLocale(customer.locale), 'customerFallbackName');

/** Changes an order's status, tells the customer, and grants rewards on first payment. */
export async function changeOrderStatus(orderId, status, { eta } = {}) {
  if (!ORDER_STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
  const result = db.setOrderStatus(orderId, status, { eta });
  if (!result) return null;
  const { order, previous, firstPayment } = result;
  const customer = order.customer;
  const locale = normalizeLocale(customer.locale);

  let notified = 'unchanged';
  if ((previous !== status || (status === 'on_the_way' && eta)) && STATUS_MESSAGE[status]) {
    const body = t(locale, STATUS_MESSAGE[status], { ref: order.reference, eta: order.eta });
    // On the way: give the customer a live link instead of "it is coming".
    const withLink = status === 'on_the_way' && config.publicUrl
      ? `${body}\n\n${t(locale, 'trackLink', { url: trackingUrl(order) })}`
      : body;
    notified = await safeNotify(customer, {
      message: text(customer.phone, withLink),
      templateKey: 'orderUpdate',
      templateParams: [order.reference, t(locale, `status.${status}`)],
    });
  }
  if (firstPayment) await rewardsAfterPayment(order);
  publish('status', { reference: order.reference, status });
  return { order, notified };
}

/** Grants a one-off reward identified by `key`; returns false if it was already granted. */
function once(key) {
  if (db.getSetting(key)) return false;
  db.setSetting(key, new Date().toISOString());
  return true;
}

/** Loyalty credit every Nth order, referral credit for the referrer, and the referral code after order #2. */
export async function rewardsAfterPayment(order) {
  const shop = settings.get();
  // Tiers first: the congratulation should mention the tier they just reached.
  const newTier = loyalty.refresh(order.customer_id);
  if (newTier && newTier !== 'bronze') {
    const c0 = db.getCustomerById(order.customer_id);
    const locale0 = normalizeLocale(c0.locale);
    const pct = loyalty.deliveryDiscountPct(newTier, shop);
    await safeNotify(c0, {
      message: text(c0.phone, t(locale0, 'tierReached', {
        tier: t(locale0, `tiers.${newTier}`),
        perk: pct >= 100 ? t(locale0, 'tierPerkFree') : t(locale0, 'tierPerkOff', { pct }),
      })),
    });
  }
  const L = { every: shop.loyaltyEvery, reward: shop.loyaltyReward, referralReward: shop.referralReward };
  const c = db.getCustomerById(order.customer_id);
  const locale = normalizeLocale(c.locale);

  if (L.every > 0 && L.reward > 0 && c.orders_count > 0 && c.orders_count % L.every === 0 && once(`loyalty:${c.id}:${c.orders_count}`)) {
    db.recordCredit(c.id, L.reward, { reason: 'loyalty', detail: `commande #${c.orders_count}` });
    await safeNotify(c, {
      message: text(c.phone, t(locale, 'loyaltyRewardEarned', { count: c.orders_count, amount: money(locale, L.reward) })),
    });
  }

  if (L.referralReward > 0 && c.referred_by && once(`referral:${c.id}`)) {
    const referrer = db.getCustomerById(c.referred_by);
    if (referrer) {
      db.recordCredit(referrer.id, L.referralReward, { reason: 'referral', detail: c.name || c.phone });
      const rLocale = normalizeLocale(referrer.locale);
      await safeNotify(referrer, {
        message: text(referrer.phone, t(rLocale, 'referralRewardEarned', { amount: money(rLocale, L.referralReward) })),
      });
    }
  }

  if (L.referralReward > 0 && c.orders_count === 2 && once(`referral-share:${c.id}`)) {
    const number = config.whatsapp.businessNumber;
    const link = number
      ? `https://wa.me/${number}?text=${encodeURIComponent(t(locale, 'referralShareText', { code: c.referral_code }))}`
      : '';
    await safeNotify(c, {
      message: text(c.phone, t(locale, 'referralShare', { code: c.referral_code, amount: money(locale, L.referralReward), link })),
    });
  }
}

/**
 * Alerts the shop on WhatsApp and, when SMTP is configured, by email too.
 * Email matters because WhatsApp refuses free-form messages outside the 24h
 * window: without a template, the owner would otherwise miss the alert.
 */
export async function notifyAdmin(body, templateParams = []) {
  const email = sendAlert({ subject: body.split('\n')[0].slice(0, 120), text: body });
  const phone = settings.get().adminNotifyNumber;
  if (!phone) {
    await email;
    return 'skipped';
  }
  const admin = db.getCustomer(phone) || { phone, locale: DEFAULT_LOCALE, last_seen_at: null };
  const [result] = await Promise.all([
    safeNotify(admin, { message: text(phone, body), templateKey: 'adminAlert', templateParams }),
    email,
  ]);
  return result;
}

export function notifyAdminProof(order, { paidByCredit = false, cash = false, subscription = false } = {}) {
  const total = money(DEFAULT_LOCALE, order.total);
  const key = subscription ? 'adminSubscriptionOrder'
    : paidByCredit ? 'adminPaidByCredit'
      : cash ? 'adminCashOrder' : 'adminProof';
  const body = t(DEFAULT_LOCALE, key, {
    ref: order.reference,
    total,
    name: order.customer_name,
    zone: order.neighborhood,
    url: `${config.publicUrl}/admin/orders/${order.id}`,
  });
  return notifyAdmin(body, [order.reference, total]);
}

export { fallbackName };

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

/**
 * Keeps a local copy of a payment screenshot: WhatsApp media links expire after
 * a few weeks, and the proof must stay available for accounting disputes.
 * Returns the file path, or null when WhatsApp is disabled (dev/tests).
 */
export async function storeProof(order) {
  if (!order?.payment_proof || !config.whatsapp.enabled || config.dbPath === ':memory:') return null;
  const { contentType, buffer } = await downloadMedia(order.payment_proof);
  const dir = path.join(path.dirname(config.dbPath), 'proofs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${order.reference}${EXTENSIONS[contentType] || '.bin'}`);
  fs.writeFileSync(file, buffer);
  db.setPaymentProofFile(order.id, file);
  return file;
}
