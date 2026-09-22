PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  phone             TEXT NOT NULL UNIQUE,
  name              TEXT,
  neighborhood      TEXT,
  address_note      TEXT,
  locale            TEXT NOT NULL DEFAULT 'fr',
  segment           TEXT NOT NULL DEFAULT 'new',     -- new | regular | vip
  orders_count      INTEGER NOT NULL DEFAULT 0,      -- paid orders only
  total_spent       INTEGER NOT NULL DEFAULT 0,
  credit            INTEGER NOT NULL DEFAULT 0,      -- loyalty + referral balance, spent at checkout
  referral_code     TEXT UNIQUE,
  referred_by       INTEGER REFERENCES customers(id),
  marketing_opt_out INTEGER NOT NULL DEFAULT 0,
  waitlist_since    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT                             -- last inbound message (24h service window)
);

CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name_fr           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  emoji             TEXT NOT NULL DEFAULT '',
  price_small       INTEGER NOT NULL,
  price_medium      INTEGER NOT NULL,
  price_large       INTEGER NOT NULL,
  in_stock          INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversations (
  phone             TEXT PRIMARY KEY,
  state             TEXT NOT NULL DEFAULT 'WELCOME',
  context           TEXT NOT NULL DEFAULT '{}',      -- JSON: cart, pending item, offered options...
  reminded_at       TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT NOT NULL UNIQUE,
  customer_id       INTEGER NOT NULL REFERENCES customers(id),
  status            TEXT NOT NULL DEFAULT 'awaiting_payment',
                    -- awaiting_payment | paid | preparing | on_the_way | delivered | cancelled
  subtotal          INTEGER NOT NULL DEFAULT 0,
  delivery_fee      INTEGER NOT NULL DEFAULT 0,
  discount          INTEGER NOT NULL DEFAULT 0,      -- credit spent on this order
  total             INTEGER NOT NULL DEFAULT 0,
  customer_name     TEXT,
  neighborhood      TEXT,
  address_note      TEXT,
  payment_proof     TEXT,                            -- WhatsApp media id of the screenshot
  eta               TEXT,
  rating            INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at           TEXT,
  delivered_at      TEXT,
  survey_sent_at    TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  size              TEXT NOT NULL,                   -- small | medium | large
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_price        INTEGER NOT NULL,
  line_total        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  phone             TEXT NOT NULL,
  direction         TEXT NOT NULL,                   -- in | out
  body              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processed_events (
  wa_message_id     TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key               TEXT PRIMARY KEY,
  value             TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_items_order     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone  ON messages(phone, created_at);
