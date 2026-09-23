// Loyalty tiers. A customer moves up on paid orders and keeps the benefit for
// as long as they stay there; the thresholds and the benefit are settings, so
// the shop can tune them without a deploy.
import * as db from '../db/index.js';
import * as settings from './settings.js';

export const TIERS = ['bronze', 'silver', 'gold'];

/** The tier a customer's order count earns them. */
export function tierFor(ordersCount, shop = settings.get()) {
  if (ordersCount >= shop.tierGoldOrders && shop.tierGoldOrders > 0) return 'gold';
  if (ordersCount >= shop.tierSilverOrders && shop.tierSilverOrders > 0) return 'silver';
  return 'bronze';
}

/** Percentage taken off the delivery fee at this tier (0-100). */
export function deliveryDiscountPct(tier, shop = settings.get()) {
  if (tier === 'gold') return Math.min(100, Math.max(0, shop.tierGoldDelivery));
  if (tier === 'silver') return Math.min(100, Math.max(0, shop.tierSilverDelivery));
  return 0;
}

/** Applies the tier benefit to an area's delivery fee. */
export function deliveryFeeFor(tier, fee, shop = settings.get()) {
  const pct = deliveryDiscountPct(tier, shop);
  return pct ? Math.round((fee * (100 - pct)) / 100) : fee;
}

/**
 * Recomputes a customer's tier after a payment.
 * Returns the new tier when it changed, so the bot can congratulate them.
 */
export function refresh(customerId) {
  const customer = db.getCustomerById(customerId);
  if (!customer) return null;
  const next = tierFor(customer.orders_count);
  if (next === customer.tier) return null;
  db.updateCustomer(customerId, { tier: next });
  return next;
}
