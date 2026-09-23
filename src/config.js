import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ quiet: true });

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : fallback);
const list = (v, fallback = []) =>
  v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : fallback;

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  dbPath:
    process.env.DB_PATH === ':memory:' ? ':memory:' : path.resolve(process.env.DB_PATH || './data/whatbot.db'),

  whatsapp: {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
    token: process.env.WA_TOKEN || '',
    verifyToken: process.env.WA_VERIFY_TOKEN || '',
    appSecret: process.env.WA_APP_SECRET || '',
    graphVersion: process.env.WA_GRAPH_VERSION || 'v21.0',
    businessNumber: (process.env.WA_BUSINESS_NUMBER || '').replace(/\D/g, ''),
    // When false the client only logs outbound payloads (useful for local dev and tests).
    enabled: bool(process.env.WA_ENABLED, true),
    // Approved message templates, used when the 24h customer-service window is closed.
    // Leave a name empty to skip that notification outside the window.
    templates: {
      orderUpdate: process.env.WA_TEMPLATE_ORDER_UPDATE || '',
      weeklyReminder: process.env.WA_TEMPLATE_WEEKLY_REMINDER || '',
      survey: process.env.WA_TEMPLATE_SURVEY || '',
      waitlistOpen: process.env.WA_TEMPLATE_WAITLIST_OPEN || '',
      winback: process.env.WA_TEMPLATE_WINBACK || '',
      adminAlert: process.env.WA_TEMPLATE_ADMIN_ALERT || '',
    },
    templateLanguages: {
      fr: process.env.WA_TEMPLATE_LANG_FR || 'fr',
      en: process.env.WA_TEMPLATE_LANG_EN || 'en',
    },
  },

  shop: {
    name: process.env.SHOP_NAME || 'Epices Fraiches',
    currency: process.env.CURRENCY || 'FC',
    deliveryFee: int(process.env.DELIVERY_FEE, 0),
    zones: list(process.env.DELIVERY_ZONES, ['Gombe', 'Limete', 'Ngaliema']),
    momoOrange: process.env.MOMO_ORANGE || '',
    momoAirtel: process.env.MOMO_AIRTEL || '',
    momoHolder: process.env.MOMO_HOLDER || '',
    adminNotifyNumber: (process.env.ADMIN_NOTIFY_NUMBER || '').replace(/\D/g, ''),
    // Default opening hours until they are set from the dashboard: "24/7", or a
    // JSON object keyed by weekday, e.g. {"0":null,"1":{"open":"08:00","close":"18:00"}}.
    hours: process.env.SHOP_HOURS || '',
  },

  loyalty: {
    referralReward: int(process.env.REFERRAL_REWARD, 1000),
    every: int(process.env.LOYALTY_EVERY, 5),
    reward: int(process.env.LOYALTY_REWARD, 2000),
  },

  i18n: {
    defaultLocale: process.env.DEFAULT_LOCALE || 'fr',
    available: list(process.env.AVAILABLE_LOCALES, ['fr', 'en']),
  },

  ai: {
    // Optional: understand free-text orders with Claude. Empty key = feature off.
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    timeoutMs: int(process.env.ANTHROPIC_TIMEOUT_MS, 15000),
    dailyLimitPerCustomer: int(process.env.AI_DAILY_LIMIT_PER_CUSTOMER, 30),
  },

  // Speech-to-text for voice notes. Empty provider or key = feature off, and
  // the bot keeps asking for buttons instead.
  stt: {
    provider: (process.env.STT_PROVIDER || '').toLowerCase(),
    apiKey: process.env.STT_API_KEY || '',
    model: process.env.STT_MODEL || '',
    baseUrl: process.env.STT_BASE_URL || '',
    language: process.env.STT_LANGUAGE || 'fr',
  },

  geo: {
    // Reverse-geocode shared locations with OpenStreetMap Nominatim to detect the delivery zone.
    enabled: bool(process.env.GEOCODING_ENABLED, true) && process.env.NODE_ENV !== 'test',
  },

  // Email alerts. The server is a deployment secret; the recipient and the
  // on/off switch are editable from the dashboard.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === undefined ? undefined : bool(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    to: process.env.ALERT_EMAIL || '',
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

/**
 * Lists missing settings. The app still starts without WhatsApp credentials so the
 * dashboard works on a fresh install; the webhook refuses traffic until they are set.
 */
export function assertConfig() {
  const missing = [];
  if (config.whatsapp.enabled) {
    if (!config.whatsapp.phoneNumberId) missing.push('WA_PHONE_NUMBER_ID');
    if (!config.whatsapp.token) missing.push('WA_TOKEN');
    if (!config.whatsapp.verifyToken) missing.push('WA_VERIFY_TOKEN');
    if (!config.whatsapp.appSecret) missing.push('WA_APP_SECRET');
  }
  if (!config.admin.password) missing.push('ADMIN_PASSWORD');
  return missing;
}
