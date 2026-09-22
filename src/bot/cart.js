import { config } from '../config.js';
import { getProduct } from '../db/index.js';
import { t, productName } from '../i18n/index.js';

export const SIZES = ['small', 'medium', 'large'];
const MAX_QTY_PER_LINE = 50;

export const priceOf = (product, size) => product[`price_${size}`];

/** Adds an item, merging with an existing line for the same product and size. */
export function addItem(cart, productId, size, qty) {
  const line = cart.find((i) => i.productId === productId && i.size === size);
  if (line) line.qty = Math.min(line.qty + qty, MAX_QTY_PER_LINE);
  else cart.push({ productId, size, qty });
  return cart;
}

export function removeItem(cart, productId, size) {
  return cart.filter((i) => !(i.productId === productId && i.size === size));
}

/** Resolves a cart against the live catalogue: current prices, and items that went out of stock. */
export function priceCart(cart) {
  const lines = [];
  const unavailable = [];
  for (const item of cart) {
    const product = getProduct(item.productId);
    if (!product || !product.in_stock) {
      unavailable.push({ ...item, product });
      continue;
    }
    const unitPrice = priceOf(product, item.size);
    lines.push({ ...item, product, unitPrice, lineTotal: unitPrice * item.qty });
  }
  return { lines, unavailable, subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0) };
}

/** Credit is spent up to the full amount due, delivery included. */
export function computeTotals(subtotal, availableCredit) {
  const deliveryFee = subtotal > 0 ? config.shop.deliveryFee : 0;
  const gross = subtotal + deliveryFee;
  const discount = Math.min(Math.max(availableCredit || 0, 0), gross);
  return { subtotal, deliveryFee, discount, total: gross - discount };
}

/** Rebuilds a cart from a past order, keeping only products that are still in stock. */
export function fromOrder(order) {
  const items = [];
  const missing = [];
  for (const it of order?.items || []) {
    const product = getProduct(it.product_id);
    if (product?.in_stock) addItem(items, product.id, it.size, it.quantity);
    else if (product && !missing.some((p) => p.id === product.id)) missing.push(product);
  }
  return { items, missing };
}

export function describeItem(locale, product, size, qty) {
  return `${productName(product, locale)} — ${t(locale, `sizes.${size}`)} × ${qty}`;
}

export function shortItem(locale, product, size, qty) {
  return `${productName(product, locale)} ${t(locale, `sizesShort.${size}`)} ×${qty}`;
}
