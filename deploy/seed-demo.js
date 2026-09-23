// Fills the shop with believable demo data so every screen can be judged with
// something in it — charts with a real curve, a loyalty ledger, subscriptions,
// expenses, an accounting period.
//
//   node deploy/seed-demo.js --apply    create the demo data
//   node deploy/seed-demo.js --purge    remove every trace of it
//   node deploy/seed-demo.js --status   count what is currently there
//
// Everything it writes is marked, and the purge deletes exactly what the marks
// identify: demo customers use the 243900000xxx range, demo expenses and notes
// are prefixed, demo coupons start with DEMO. Nothing else is ever touched, so
// this is safe to run on the real shop and to undo before going live.
import process from 'node:process';
import * as db from '../src/db/index.js';
import * as settings from '../src/shop/settings.js';

const PHONE_PREFIX = '243900000'; // demo customers only
const LABEL = '[démo]'; // expenses and notes
const COUPON_PREFIX = 'DEMO';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PURGE = args.includes('--purge');

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[rand(0, list.length - 1)];
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const sqlDay = (d) => d.toLocaleDateString('en-CA');
const sqlStamp = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

/** The demo cast: varied on purpose, so every filter and badge has something to show. */
const PEOPLE = [
  { n: 1, name: 'Mamie Kalala', zone: 'Gombe', tags: 'vip, fidèle', orders: 14, tier: 'gold' },
  { n: 2, name: 'Josué Mbala', zone: 'Limete', tags: 'restaurant', orders: 7, tier: 'silver' },
  { n: 3, name: 'Grâce Nsimba', zone: 'Ngaliema', tags: '', orders: 5, tier: 'silver' },
  { n: 4, name: 'Patrick Ilunga', zone: 'Bandalungwa', tags: 'paiement lent', orders: 3, tier: 'bronze' },
  { n: 5, name: 'Esther Mukendi', zone: 'Kasa-Vubu', tags: '', orders: 2, tier: 'bronze' },
  { n: 6, name: 'Didier Tshibangu', zone: 'Gombe', tags: '', orders: 1, tier: 'bronze' },
  { n: 7, name: 'Nadine Luboya', zone: 'Limete', tags: '', orders: 0, tier: 'bronze', optOut: true },
  { n: 8, name: 'Blaise Kabongo', zone: 'Kintambo', tags: 'litige', orders: 1, tier: 'bronze', blocked: true },
];

const EXPENSES = [
  { category: 'stock', label: 'Achat marché de Gambela', amount: 85_000, every: 7 },
  { category: 'transport', label: 'Carburant moto', amount: 12_000, every: 5 },
  { category: 'salaire', label: 'Livreur', amount: 40_000, every: 14 },
  { category: 'autre', label: 'Sachets et emballages', amount: 8_000, every: 10 },
];

const NOTES = [
  'Préfère être livrée le matin, avant 10 h.',
  'Toujours payer en espèces, ne fait pas confiance au mobile money.',
  'Commande pour son restaurant, veut une facture à chaque fois.',
  'Ne pas sonner, appeler en arrivant.',
];

/* --------------------------------- status -------------------------------- */

function status() {
  const customers = db.db
    .prepare(`SELECT COUNT(*) AS n FROM customers WHERE phone LIKE '${PHONE_PREFIX}%'`)
    .get().n;
  const orders = db.db
    .prepare(`SELECT COUNT(*) AS n FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone LIKE '${PHONE_PREFIX}%'`)
    .get().n;
  const expenses = db.db.prepare(`SELECT COUNT(*) AS n FROM expenses WHERE label LIKE '${LABEL}%'`).get().n;
  const coupons = db.db.prepare(`SELECT COUNT(*) AS n FROM coupons WHERE code LIKE '${COUPON_PREFIX}%'`).get().n;
  const subs = db.db
    .prepare(`SELECT COUNT(*) AS n FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE c.phone LIKE '${PHONE_PREFIX}%'`)
    .get().n;
  return { customers, orders, expenses, coupons, subs };
}

/* ---------------------------------- purge -------------------------------- */

function purge() {
  const tx = db.db.transaction(() => {
    const ids = db.db
      .prepare(`SELECT id FROM customers WHERE phone LIKE '${PHONE_PREFIX}%'`)
      .all()
      .map((r) => r.id);

    for (const id of ids) {
      const orderIds = db.db.prepare('SELECT id FROM orders WHERE customer_id = ?').all(id).map((r) => r.id);
      for (const oid of orderIds) {
        db.db.prepare('DELETE FROM order_items WHERE order_id = ?').run(oid);
        db.db.prepare('DELETE FROM coupon_uses WHERE order_id = ?').run(oid);
      }
      db.db.prepare('DELETE FROM orders WHERE customer_id = ?').run(id);
      db.db.prepare('DELETE FROM credit_entries WHERE customer_id = ?').run(id);
      db.db.prepare('DELETE FROM customer_notes WHERE customer_id = ?').run(id);
      db.db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').run(id);
      db.db.prepare('DELETE FROM coupon_uses WHERE customer_id = ?').run(id);
      // A demo customer may have been recorded as someone's referrer.
      db.db.prepare('UPDATE customers SET referred_by = NULL WHERE referred_by = ?').run(id);
    }
    const phones = db.db.prepare(`SELECT phone FROM customers WHERE phone LIKE '${PHONE_PREFIX}%'`).all();
    for (const { phone } of phones) {
      db.db.prepare('DELETE FROM messages WHERE phone = ?').run(phone);
      db.db.prepare('DELETE FROM conversations WHERE phone = ?').run(phone);
    }
    db.db.prepare(`DELETE FROM customers WHERE phone LIKE '${PHONE_PREFIX}%'`).run();
    db.db.prepare(`DELETE FROM expenses WHERE label LIKE '${LABEL}%'`).run();
    db.db.prepare(`DELETE FROM coupons WHERE code LIKE '${COUPON_PREFIX}%'`).run();
    return ids.length;
  });
  return tx();
}

/* ---------------------------------- seed --------------------------------- */

function seed() {
  const products = db.listProducts();
  if (!products.length) throw new Error('no product in the catalogue: seed the catalogue first');
  // Run standalone the app has not booted, so a fresh catalogue may have no
  // variants yet — and without variants nothing is orderable.
  db.seedVariantsIfMissing();
  const zones = db.listZones({ onlyActive: true });
  const slots = db.listSlots({ onlyActive: true });
  const shop = settings.get();

  const coupon = db.getCouponByCode(`${COUPON_PREFIX}10`)
    || db.createCoupon({
      code: `${COUPON_PREFIX}10`,
      kind: 'percent',
      value: 10,
      min_subtotal: 5000,
      max_uses: 0,
      once_per_customer: 0,
      active: 1,
    });

  const created = [];
  for (const person of PEOPLE) {
    const phone = `${PHONE_PREFIX}${String(person.n).padStart(3, '0')}`.slice(0, 12);
    const { customer } = db.touchCustomer(phone);
    db.updateCustomer(customer.id, {
      name: person.name,
      neighborhood: person.zone,
      address_note: `Av. ${pick(['Kasaï', 'Lumumba', 'des Aviateurs', 'du Commerce', 'Kabinda'])} n°${rand(2, 180)}`,
      tags: person.tags || null,
      blocked: person.blocked ? 1 : 0,
      marketing_opt_out: person.optOut ? 1 : 0,
      tier: person.tier,
    });
    // Backdate the sign-up so "customer since" and the new-customer curve mean something.
    db.db.prepare('UPDATE customers SET created_at = ? WHERE id = ?')
      .run(sqlStamp(dayOffset(rand(20, 80))), customer.id);
    created.push({ ...person, id: customer.id, phone });
  }

  // One referral chain, so the referral screen has a real tree.
  db.updateCustomer(created[2].id, { referred_by: created[0].id });
  db.updateCustomer(created[4].id, { referred_by: created[0].id });
  db.recordCredit(created[0].id, 2000, { reason: 'referral', detail: created[2].name });

  let orders = 0;
  for (const person of created) {
    for (let i = 0; i < person.orders; i += 1) {
      const daysAgo = rand(0, 44);
      const when = dayOffset(daysAgo);
      const zone = zones.find((z) => z.name === person.zone) || zones[0];
      const fee = zone ? zone.fee : shop.defaultDeliveryFee;

      const lines = [];
      for (let k = 0; k < rand(1, 3); k += 1) {
        const product = pick(products);
        const variants = db.listVariants(product.id);
        if (!variants.length) continue;
        const variant = pick(variants);
        const qty = rand(1, 3);
        lines.push({
          productId: product.id,
          size: variant.sku,
          variantLabel: variant.label_fr,
          quantity: qty,
          unitPrice: variant.price,
        });
      }
      if (!lines.length) continue;

      const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const useCoupon = subtotal >= 5000 && Math.random() < 0.25;
      const couponDiscount = useCoupon ? Math.round((subtotal * 10) / 100) : 0;
      const slot = slots.length ? pick(slots) : null;

      const order = db.createOrder({
        customer: db.getCustomerById(person.id),
        items: lines,
        subtotal,
        deliveryFee: fee,
        discount: 0,
        couponDiscount,
        coupon: useCoupon ? coupon : null,
        total: subtotal + fee - couponDiscount,
        paymentMethod: Math.random() < 0.4 ? 'cash' : 'momo',
        name: person.name,
        neighborhood: person.zone,
        addressNote: db.getCustomerById(person.id).address_note,
        slotId: slot?.id || null,
        slotLabel: slot ? `${daysAgo === 0 ? 'Aujourd’hui' : 'Demain'} · ${slot.label_fr}` : null,
      });
      orders += 1;

      // Older orders are finished; the last two days keep the pipeline busy.
      const status = daysAgo > 2
        ? 'delivered'
        : pick(['awaiting_payment', 'paid', 'preparing', 'on_the_way', 'delivered']);
      if (status !== 'awaiting_payment') db.setOrderStatus(order.id, status);
      if (status === 'delivered' && Math.random() < 0.6) db.setOrderRating(order.id, rand(3, 5));

      // Dates last: setOrderStatus stamps "now", which would flatten every chart.
      const stamp = sqlStamp(when);
      db.db.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(stamp, order.id);
      if (status !== 'awaiting_payment') {
        db.db.prepare('UPDATE orders SET paid_at = ? WHERE id = ? AND paid_at IS NOT NULL').run(stamp, order.id);
      }
      if (status === 'delivered') {
        db.db.prepare('UPDATE orders SET delivered_at = ? WHERE id = ?').run(stamp, order.id);
      }
    }
  }

  // A few notes and a bit of credit, so the customer file is not empty.
  for (const person of created.slice(0, 4)) {
    db.addNote(person.id, `${LABEL} ${pick(NOTES)}`, 'démo');
  }
  db.recordCredit(created[1].id, 2000, { reason: 'loyalty', detail: 'commande #5' });
  db.recordCredit(created[3].id, 1500, { reason: 'manual', detail: 'Geste commercial', author: 'démo' });

  // Two weekly subscriptions, rebuilt from each customer's last basket.
  for (const person of [created[0], created[1]]) {
    const last = db.lastOrder(person.id);
    const items = itemsFromOrder(last);
    if (items.length) db.createSubscription({ customerId: person.id, weekday: person.n === 1 ? 6 : 3, items });
  }

  // Expenses spread over the same window, so the margin is meaningful.
  let expenses = 0;
  for (const e of EXPENSES) {
    for (let d = 0; d < 45; d += e.every) {
      db.createExpense({
        day: sqlDay(dayOffset(d)),
        category: e.category,
        label: `${LABEL} ${e.label}`,
        amount: e.amount + rand(-3000, 3000),
      });
      expenses += 1;
    }
  }

  return { customers: created.length, orders, expenses };
}

/** Cart lines from a past order, without pulling in the bot's cart module. */
function itemsFromOrder(order) {
  return (order?.items || []).map((it) => ({ productId: it.product_id, size: it.size, qty: it.quantity }));
}

/* ---------------------------------- main --------------------------------- */

if (PURGE) {
  const before = status();
  const removed = purge();
  console.log(`Demo data removed: ${removed} customers, ${before.orders} orders, ${before.expenses} expenses, ${before.coupons} coupons.`);
} else if (APPLY) {
  if (status().customers) {
    console.log('Demo data is already present. Run --purge first to start from a clean slate.');
  } else {
    const made = seed();
    console.log(`Demo data created: ${made.customers} customers, ${made.orders} orders, ${made.expenses} expenses.`);
    console.log('Remove it any time with:  node deploy/seed-demo.js --purge');
  }
} else {
  const s = status();
  console.log(`Demo data present: ${s.customers} customers, ${s.orders} orders, ${s.expenses} expenses, ${s.coupons} coupons, ${s.subs} subscriptions.`);
  console.log('Use --apply to create it, --purge to remove it.');
}
