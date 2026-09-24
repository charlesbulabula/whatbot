import { config } from '../config.js';
import { getProduct } from '../db/index.js';
import { productName } from '../i18n/index.js';
import { variantOf, variantLabel, extrasTotal, extrasLabel } from '../shop/catalogue.js';

const MAX_QTY_PER_LINE = 50;

/** Price of one unit: the variant, plus whatever extras were picked for that line. */
export const priceOf = (product, size, extras = []) => (variantOf(product, size)?.price ?? 0) + extrasTotal(extras);

/** Two lines merge only when the product, the variant and the extras all match. */
const sameLine = (a, productId, size, extras) =>
  a.productId === productId && a.size === size && extrasKey(a.extras) === extrasKey(extras);

const extrasKey = (extras = []) => (extras || []).map((e) => e.id ?? e.label).sort().join('|');

/** Adds an item, merging with an existing identical line. */
export function addItem(cart, productId, size, qty, extras = []) {
  const line = cart.find((i) => sameLine(i, productId, size, extras));
  if (line) line.qty = Math.min(line.qty + qty, MAX_QTY_PER_LINE);
  else cart.push({ productId, size, qty, ...(extras.length ? { extras } : {}) });
  return cart;
}

export function removeItem(cart, productId, size, extras) {
  return cart.filter((i) => !(extras === undefined
    ? i.productId === productId && i.size === size
    : sameLine(i, productId, size, extras)));
}

/** Resolves a cart against the live catalogue: current prices, and items that went out of stock. */
export function priceCart(cart) {
  const lines = [];
  const unavailable = [];
  for (const item of cart) {
    const product = getProduct(item.productId);
    const variant = product && variantOf(product, item.size);
    // A variant that was deleted or switched off makes the line unorderable,
    // exactly like a product that went out of stock.
    if (!product || !product.in_stock || !variant || !variant.active) {
      unavailable.push({ ...item, product });
      continue;
    }
    const extras = item.extras || [];
    const unitPrice = variant.price + extrasTotal(extras);
    lines.push({ ...item, extras, product, variant, unitPrice, lineTotal: unitPrice * item.qty });
  }
  return { lines, unavailable, subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0) };
}

/**
 * A coupon comes off first, then loyalty credit on what is left, both capped at
 * the amount due. `deliveryFee` is the fee of the delivery area (see db.listZones);
 * without one the flat DELIVERY_FEE is used, which is what fresh installs have.
 */
export function computeTotals(subtotal, availableCredit, { deliveryFee, couponDiscount = 0 } = {}) {
  const fee = subtotal > 0 ? Math.max(0, deliveryFee ?? config.shop.deliveryFee) : 0;
  const gross = subtotal + fee;
  const coupon = Math.min(Math.max(couponDiscount || 0, 0), gross);
  const afterCoupon = gross - coupon;
  const discount = Math.min(Math.max(availableCredit || 0, 0), afterCoupon);
  return { subtotal, deliveryFee: fee, couponDiscount: coupon, discount, total: afterCoupon - discount };
}

/** Rebuilds a cart from a past order, keeping only what can still be ordered. */
export function fromOrder(order) {
  const items = [];
  const missing = [];
  for (const it of order?.items || []) {
    const product = getProduct(it.product_id);
    const variant = product && variantOf(product, it.size);
    if (product?.in_stock && variant?.active) {
      let extras = [];
      try {
        extras = it.extras ? JSON.parse(it.extras) : [];
      } catch {
        extras = [];
      }
      addItem(items, product.id, it.size, it.quantity, extras);
    } else if (product && !missing.some((p) => p.id === product.id)) {
      missing.push(product);
    }
  }
  return { items, missing };
}

/**
 * Variant name for a cart line or for a past order line.
 * An order_items row carries the label it was sold with and points at its
 * product through product_id, so it must not be treated as a product itself.
 */
function labelOf(locale, productLike, size) {
  if (productLike?.variant_label) return productLike.variant_label;
  const product = productLike?.product_id ? getProduct(productLike.product_id) : productLike;
  return variantLabel(variantOf(product, size), locale);
}

/**
 * One basket line. The quantity leads: three em-dashes in a row read like a
 * receipt, and the number is what the eye looks for first.
 */
export function describeItem(locale, product, size, qty, extras = []) {
  const add = extrasLabel(extras.map((e) => ({ label: e.label })));
  return `*${qty}×* ${productName(product, locale)} · ${labelOf(locale, product, size)}${add ? ` (${add})` : ''}`;
}

/** Compact form used in "your last order was…" lines. */
export function shortItem(locale, product, size, qty) {
  return `${productName(product, locale)} ${labelOf(locale, product, size)} ×${qty}`;
}
