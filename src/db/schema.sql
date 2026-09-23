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
  tier              TEXT NOT NULL DEFAULT 'bronze',  -- bronze | silver | gold
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
  photo             TEXT,                            -- file name under data/media/products
  retailer_id       TEXT,                            -- id in the Meta product catalog
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
  coupon            TEXT,                            -- code applied, upper-case
  coupon_discount   INTEGER NOT NULL DEFAULT 0,      -- discount granted by that coupon
  total             INTEGER NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL DEFAULT 'momo',    -- momo | cash (on delivery)
  customer_name     TEXT,
  neighborhood      TEXT,
  address_note      TEXT,
  payment_proof     TEXT,                            -- WhatsApp media id of the screenshot
  payment_proof_file TEXT,                           -- local copy (Meta media links expire)
  eta               TEXT,
  slot_id           INTEGER REFERENCES delivery_slots(id) ON DELETE SET NULL,
  slot_label        TEXT,                            -- copied so history survives a slot rename
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
  size              TEXT NOT NULL,                   -- the variant sku
  variant_label     TEXT,                            -- copied at order time
  extras            TEXT,                            -- JSON [{label, price}]
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_price        INTEGER NOT NULL,
  line_total        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  phone             TEXT NOT NULL,
  direction         TEXT NOT NULL,                   -- in | out
  body              TEXT,
  media_id          TEXT,                            -- inbound image / voice note / document
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

CREATE TABLE IF NOT EXISTS zones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL UNIQUE,
  fee               INTEGER NOT NULL DEFAULT 0,      -- delivery fee for this area
  active            INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coupons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT NOT NULL UNIQUE,            -- stored upper-case
  kind              TEXT NOT NULL DEFAULT 'amount',  -- amount | percent | free_delivery
  value             INTEGER NOT NULL DEFAULT 0,      -- FC, or percent points
  min_subtotal      INTEGER NOT NULL DEFAULT 0,
  max_uses          INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  used_count        INTEGER NOT NULL DEFAULT 0,
  once_per_customer INTEGER NOT NULL DEFAULT 1,
  expires_on        TEXT,                            -- YYYY-MM-DD, NULL = never
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_uses (
  coupon_id         INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  customer_id       INTEGER NOT NULL REFERENCES customers(id),
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (coupon_id, order_id)
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  author            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every movement of a customer's credit balance, so the total is always explainable.
CREATE TABLE IF NOT EXISTS credit_entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount            INTEGER NOT NULL,                -- signed: + earned, - spent
  reason            TEXT NOT NULL,                   -- loyalty | referral | manual | order | refund
  detail            TEXT,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  author            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What the dashboard changed, who did it and when.
CREATE TABLE IF NOT EXISTS audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  actor             TEXT NOT NULL,
  action            TEXT NOT NULL,
  target            TEXT,
  detail            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Purchases and running costs, to turn revenue into an actual margin.
CREATE TABLE IF NOT EXISTS expenses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  day               TEXT NOT NULL,                   -- YYYY-MM-DD
  category          TEXT NOT NULL DEFAULT 'stock',   -- stock | transport | salaire | autre
  label             TEXT,
  amount            INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_customer   ON customer_notes(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_customer  ON credit_entries(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_day     ON expenses(day);

/* ----------------------------- staff accounts ---------------------------- */
-- Named logins with a role, so the dashboard is no longer one shared password.
-- The ADMIN_USER / ADMIN_PASSWORD pair from .env stays valid as the owner.
CREATE TABLE IF NOT EXISTS staff (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT NOT NULL UNIQUE,
  name              TEXT,
  role              TEXT NOT NULL DEFAULT 'seller',  -- owner | seller | rider
  password_hash     TEXT NOT NULL,                   -- scrypt: salt:hash
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at     TEXT
);

/* ---------------------------- product variants --------------------------- */
-- Replaces the fixed small/medium/large sizes: a product can be sold by heap,
-- by bunch, by kilo... The three default variants keep the sku of the old sizes
-- so past orders and their history stay readable.
CREATE TABLE IF NOT EXISTS product_variants (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku               TEXT NOT NULL,                   -- small | medium | large | free text
  label_fr          TEXT NOT NULL,
  label_en          TEXT NOT NULL,
  label_ln          TEXT,
  price             INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, sku)
);

-- Optional add-ons offered after the quantity ("préparé", "nettoyé"...).
CREATE TABLE IF NOT EXISTS product_extras (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER REFERENCES products(id) ON DELETE CASCADE, -- NULL = offered on every product
  label_fr          TEXT NOT NULL,
  label_en          TEXT NOT NULL,
  label_ln          TEXT,
  price             INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

/* ---------------------------- delivery slots ----------------------------- */
CREATE TABLE IF NOT EXISTS delivery_slots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  label_fr          TEXT NOT NULL,
  label_en          TEXT NOT NULL,
  label_ln          TEXT,
  start_time        TEXT NOT NULL DEFAULT '08:00',
  end_time          TEXT NOT NULL DEFAULT '12:00',
  capacity          INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  active            INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

/* ----------------------------- subscriptions ----------------------------- */
-- "The same basket every Saturday": the scheduler turns these into real orders.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  weekday           INTEGER NOT NULL,                -- 0 = Sunday … 6 = Saturday
  items             TEXT NOT NULL DEFAULT '[]',      -- JSON cart
  slot_id           INTEGER REFERENCES delivery_slots(id) ON DELETE SET NULL,
  active            INTEGER NOT NULL DEFAULT 1,
  last_run_day      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ------------------------- rider tracking & route ------------------------ */
CREATE TABLE IF NOT EXISTS rider_positions (
  day               TEXT PRIMARY KEY,                -- one live position per delivery day
  latitude          REAL NOT NULL,
  longitude         REAL NOT NULL,
  accuracy          REAL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ------------------------------ web push --------------------------------- */
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint          TEXT NOT NULL UNIQUE,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  actor             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_subs_customer    ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subs_weekday     ON subscriptions(weekday, active);
