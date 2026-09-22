import { config } from '../config.js';
import fr from './fr.js';
import en from './en.js';

const dictionaries = { fr, en };

export const LOCALES = Object.keys(dictionaries).filter((l) => config.i18n.available.includes(l));
export const DEFAULT_LOCALE = LOCALES.includes(config.i18n.defaultLocale) ? config.i18n.defaultLocale : 'fr';

const lookup = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict);

/** Translate `key` for `locale`, falling back to the default locale, then to the key itself. */
export function t(locale, key, params = {}) {
  let value = lookup(dictionaries[locale], key);
  if (value === undefined) value = lookup(dictionaries[DEFAULT_LOCALE], key);
  if (typeof value === 'function') return value(params);
  return value ?? key;
}

export function normalizeLocale(locale) {
  return LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

export function money(locale, amount) {
  const formatted = Number(amount || 0).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR');
  return `${formatted} ${config.shop.currency}`;
}

export function productName(product, locale) {
  const name = locale === 'en' ? product.name_en : product.name_fr;
  return product.emoji ? `${product.emoji} ${name}` : name;
}

export const dictionariesForTest = dictionaries;
