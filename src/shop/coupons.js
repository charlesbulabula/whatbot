// Promo codes: a flat amount off, a percentage of the basket, or free delivery.
// Validation lives here so the chat engine and the dashboard agree on the rules.
import * as db from '../db/index.js';

export const COUPON_KINDS = ['amount', 'percent', 'free_delivery'];

/** Normalises what a customer typed: "  promo-10 " -> "PROMO-10". */
export const normalizeCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 24);

/**
 * Checks a code against the basket and returns either
 * { ok: true, coupon, discount } or { ok: false, reason }.
 * `reason` is one of: unknown, inactive, expired, exhausted, used, min.
 */
export function evaluate(code, { customer, subtotal, deliveryFee = 0, today = new Date() }) {
  const coupon = db.getCouponByCode(normalizeCode(code));
  if (!coupon) return { ok: false, reason: 'unknown' };
  if (!coupon.active) return { ok: false, reason: 'inactive' };
  if (coupon.expires_on && coupon.expires_on < today.toLocaleDateString('en-CA')) {
    return { ok: false, reason: 'expired' };
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) return { ok: false, reason: 'exhausted' };
  if (coupon.once_per_customer && customer && db.couponUsedByCustomer(coupon.id, customer.id)) {
    return { ok: false, reason: 'used' };
  }
  if (subtotal < coupon.min_subtotal) return { ok: false, reason: 'min', min: coupon.min_subtotal };

  const discount = discountFor(coupon, { subtotal, deliveryFee });
  if (discount <= 0) return { ok: false, reason: 'min', min: coupon.min_subtotal };
  return { ok: true, coupon, discount };
}

/** The amount a coupon takes off, capped at what is actually due. */
export function discountFor(coupon, { subtotal, deliveryFee = 0 }) {
  if (coupon.kind === 'free_delivery') return Math.min(deliveryFee, subtotal + deliveryFee);
  if (coupon.kind === 'percent') {
    return Math.min(Math.round((subtotal * Math.min(coupon.value, 100)) / 100), subtotal + deliveryFee);
  }
  return Math.min(coupon.value, subtotal + deliveryFee);
}

/** Short human label, e.g. "-10 %" or "livraison offerte". */
export function describe(coupon, { money, freeDeliveryLabel }) {
  if (coupon.kind === 'free_delivery') return freeDeliveryLabel;
  if (coupon.kind === 'percent') return `−${coupon.value} %`;
  return `−${money(coupon.value)}`;
}
