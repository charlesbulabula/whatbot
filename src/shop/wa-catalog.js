// The Meta product catalog: WhatsApp renders the shop's products natively, with
// their pictures, and the customer fills a cart inside WhatsApp and sends it.
//
// It only switches on once a catalog id is set and products carry a retailer id;
// otherwise the bot keeps using its own list, which needs no Commerce Manager.
import * as db from '../db/index.js';
import * as settings from './settings.js';

/** True when the shop has a catalog and at least one product mapped to it. */
export function isEnabled(shop = settings.get()) {
  if (!shop.catalogEnabled || !shop.catalogId) return false;
  return db.listProducts().some((p) => p.retailer_id);
}

/** Sections for a product_list message: the in-stock products that are mapped. */
export function sections(title) {
  const items = db.listProducts().filter((p) => p.retailer_id).map((p) => p.retailer_id);
  // WhatsApp allows at most 30 products across all sections.
  return items.length ? [{ title, items: items.slice(0, 30) }] : [];
}

/**
 * Turns a cart WhatsApp sent back into our own cart lines.
 * Unknown retailer ids and products that went out of stock are reported so the
 * customer can be told rather than silently losing an item.
 */
export function cartFromOrderMessage(order) {
  const items = [];
  const unknown = [];
  for (const line of order?.product_items || []) {
    const product = db.listProducts({ onlyInStock: false }).find((p) => p.retailer_id === line.product_retailer_id);
    const qty = Math.max(1, Math.min(50, Math.round(Number(line.quantity) || 1)));
    if (!product || !product.in_stock) {
      unknown.push(line.product_retailer_id);
      continue;
    }
    // The catalog has no notion of our variants: the cheapest one is the default,
    // and the customer can still change it from the cart screen.
    const variant = db.listVariants(product.id)[0];
    items.push({ productId: product.id, size: variant?.sku || 'medium', qty });
  }
  return { items, unknown };
}
