// Catalogue shapes: a product is sold in variants (heap sizes, a bunch, a kilo)
// and can carry optional extras ("préparé", "nettoyé"). Everything the bot and
// the dashboard need to price and name a line lives here.
import * as db from '../db/index.js';

/** Fallback used only if a product somehow has no variant row yet. */
const LEGACY = [
  { sku: 'small', column: 'price_small', label_fr: 'Petit tas', label_en: 'Small', label_ln: 'Mwa moke' },
  { sku: 'medium', column: 'price_medium', label_fr: 'Moyen tas', label_en: 'Medium', label_ln: 'Mwa ya kati' },
  { sku: 'large', column: 'price_large', label_fr: 'Grand tas', label_en: 'Large', label_ln: 'Mwa monene' },
];

/** Sellable variants of a product, cheapest first by sort order. */
export function variantsOf(product) {
  if (!product) return [];
  const rows = db.listVariants(product.id);
  if (rows.length) return rows;
  return LEGACY.map((v, i) => ({
    id: -(i + 1),
    product_id: product.id,
    sku: v.sku,
    label_fr: v.label_fr,
    label_en: v.label_en,
    label_ln: v.label_ln,
    price: product[v.column] || 0,
    active: 1,
    sort_order: i + 1,
  }));
}

export function variantOf(product, sku) {
  return variantsOf(product).find((v) => v.sku === sku) || null;
}

/** Variant name in the customer's language, e.g. "Moyen tas" / "Botte". */
export function variantLabel(variant, locale) {
  if (!variant) return '';
  if (locale === 'ln' && variant.label_ln) return variant.label_ln;
  return locale === 'en' ? variant.label_en : variant.label_fr;
}

/** Price of one unit of a variant, extras excluded. */
export function variantPrice(product, sku) {
  return variantOf(product, sku)?.price ?? 0;
}

/** Extras offered for a product: its own, plus the shop-wide ones. */
export function extrasOf(product) {
  return product ? db.listExtras(product.id) : [];
}

export function extraLabel(extra, locale) {
  if (!extra) return '';
  if (locale === 'ln' && extra.label_ln) return extra.label_ln;
  return locale === 'en' ? extra.label_en : extra.label_fr;
}

/** Price range shown next to a product in the catalogue list. */
export function priceRange(product) {
  const prices = variantsOf(product).map((v) => v.price).filter((p) => p > 0);
  if (!prices.length) return { from: 0, to: 0 };
  return { from: Math.min(...prices), to: Math.max(...prices) };
}

/** What a cart line's chosen extras add to one unit. */
export const extrasTotal = (extras = []) => extras.reduce((sum, e) => sum + (e.price || 0), 0);

/** "Préparé, Nettoyé" for the recap and the dashboard. */
export const extrasLabel = (extras = []) => extras.map((e) => e.label).filter(Boolean).join(', ');
