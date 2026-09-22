// Imported first by every test file: isolated in-memory database, no real WhatsApp calls.
process.env.DB_PATH = ':memory:';
process.env.WA_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.DEFAULT_LOCALE = 'fr';
process.env.AVAILABLE_LOCALES = 'fr,en';
process.env.SHOP_NAME = 'Epices Test';
process.env.DELIVERY_FEE = '2000';
process.env.DELIVERY_ZONES = 'Gombe,Limete,Ngaliema';
process.env.MOMO_ORANGE = '0899000000';
process.env.MOMO_AIRTEL = '0999000000';
process.env.ADMIN_NOTIFY_NUMBER = '243800000001';
process.env.REFERRAL_REWARD = '1000';
process.env.LOYALTY_EVERY = '3';
process.env.LOYALTY_REWARD = '2000';
process.env.WEEKLY_STOCK_CAPACITY = '0';
process.env.TZ = 'Africa/Kinshasa';
