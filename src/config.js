import 'dotenv/config';
import path from 'node:path';

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : fallback);
const list = (v, fallback = []) =>
  v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : fallback;

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  dbPath: path.resolve(process.env.DB_PATH || './data/whatbot.db'),

  whatsapp: {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
    token: process.env.WA_TOKEN || '',
    verifyToken: process.env.WA_VERIFY_TOKEN || '',
    appSecret: process.env.WA_APP_SECRET || '',
    graphVersion: process.env.WA_GRAPH_VERSION || 'v21.0',
    // When false the client only logs outbound payloads (useful for local dev and tests).
    enabled: bool(process.env.WA_ENABLED, true),
  },

  shop: {
    name: process.env.SHOP_NAME || 'Epices Fraiches',
    currency: process.env.CURRENCY || 'FC',
    deliveryFee: int(process.env.DELIVERY_FEE, 0),
    zones: list(process.env.DELIVERY_ZONES, ['Gombe', 'Limete', 'Ngaliema']),
    momoOrange: process.env.MOMO_ORANGE || '',
    momoAirtel: process.env.MOMO_AIRTEL || '',
    momoHolder: process.env.MOMO_HOLDER || '',
    adminNotifyNumber: process.env.ADMIN_NOTIFY_NUMBER || '',
  },

  i18n: {
    defaultLocale: process.env.DEFAULT_LOCALE || 'fr',
    available: list(process.env.AVAILABLE_LOCALES, ['fr', 'en']),
  },

  admin: {
    user: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },

  automation: {
    cartReminderMinutes: int(process.env.CART_REMINDER_MINUTES, 10),
    weeklyReminderDay: int(process.env.WEEKLY_REMINDER_DAY, 5),
    weeklyReminderHour: int(process.env.WEEKLY_REMINDER_HOUR, 18),
    weeklyStockCapacity: int(process.env.WEEKLY_STOCK_CAPACITY, 0),
  },
};

/** Fail fast in production when something required is missing. */
export function assertConfig() {
  const missing = [];
  if (config.whatsapp.enabled) {
    if (!config.whatsapp.phoneNumberId) missing.push('WA_PHONE_NUMBER_ID');
    if (!config.whatsapp.token) missing.push('WA_TOKEN');
    if (!config.whatsapp.verifyToken) missing.push('WA_VERIFY_TOKEN');
    if (!config.whatsapp.appSecret) missing.push('WA_APP_SECRET');
  }
  if (!config.admin.password) missing.push('ADMIN_PASSWORD');
  if (missing.length && config.env === 'production') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return missing;
}
