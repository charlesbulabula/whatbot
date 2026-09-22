// Seeds a starter catalogue on first run only. Prices are placeholders (FC):
// adjust them from the admin dashboard.
import { countProducts, createProduct } from './index.js';
import { logger } from '../utils/logger.js';

const STARTER_CATALOGUE = [
  { name_fr: 'Tomate', name_en: 'Tomato', emoji: '🍅', price_small: 1000, price_medium: 2000, price_large: 3500 },
  { name_fr: 'Piment', name_en: 'Chili pepper', emoji: '🌶️', price_small: 500, price_medium: 1000, price_large: 2000 },
  { name_fr: 'Gingembre', name_en: 'Ginger', emoji: '🫚', price_small: 1000, price_medium: 2000, price_large: 3500 },
  { name_fr: 'Ail', name_en: 'Garlic', emoji: '🧄', price_small: 1000, price_medium: 2000, price_large: 3500 },
  { name_fr: 'Oignon', name_en: 'Onion', emoji: '🧅', price_small: 1000, price_medium: 2000, price_large: 3500 },
  { name_fr: 'Poivron', name_en: 'Bell pepper', emoji: '🫑', price_small: 1000, price_medium: 2000, price_large: 3500 },
  { name_fr: 'Céleri', name_en: 'Celery', emoji: '🥬', price_small: 500, price_medium: 1000, price_large: 2000 },
  { name_fr: 'Persil', name_en: 'Parsley', emoji: '🌿', price_small: 500, price_medium: 1000, price_large: 2000 },
];

export function seedIfEmpty() {
  if (countProducts() > 0) return 0;
  STARTER_CATALOGUE.forEach((p, i) => createProduct({ ...p, sort_order: i + 1 }));
  return STARTER_CATALOGUE.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = seedIfEmpty();
  logger.info(n ? `Seeded ${n} products` : 'Products already present, nothing to seed');
}
