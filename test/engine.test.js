import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customer, optionIds, placeOrder } from './helpers.js';
import * as db from '../src/db/index.js';
import { changeOrderStatus } from '../src/bot/orders.js';
import { config } from '../src/config.js';

test('a new customer is greeted in French, with one option per other language', () => {
  const c = customer('243810000001');
  const { last } = c.say('Bonjour');
  assert.equal(last.kind, 'buttons');
  assert.match(last.body, /bienvenue chez \*Epices Test\*/);
  assert.deepEqual(optionIds(last), ['menu:order', 'menu:lang:en', 'menu:lang:ln']);
  assert.equal(last.buttons[1].title, '🇬🇧 English');
  assert.equal(last.buttons[2].title, '🇨🇩 Lingala');
});

test('a customer can switch to Lingala and order in it', () => {
  const c = customer('243810000030');
  c.say('Bonjour');
  const menu = c.tap('menu:lang:ln').last;
  assert.match(menu.body, /nakolobaka na yo na Lingala/);
  assert.equal(menu.buttons[0].title, '🛒 Kosomba');

  c.tap('menu:order');
  // Lingala variant names are longer, so WhatsApp gets a list rather than buttons.
  const sizes = c.tap('p:1').last;
  assert.match(sizes.body, /Monene nini/);
  assert.deepEqual(optionIds(sizes), ['size:small', 'size:medium', 'size:large']);
  assert.match(sizes.rows[0].title, /Mwa moke/);

  c.tap('size:medium');
  assert.match(c.tap('qty:1').last.body, /Ebakisami/);
});

test('full order: catalogue → size → quantity → address → recap → payment → proof', () => {
  const c = customer('243810000002');
  c.say('Salut');

  const catalogue = c.tap('menu:order').last;
  assert.equal(catalogue.kind, 'list');
  assert.equal(catalogue.rows.length, 8);
  assert.equal(catalogue.rows[0].id, 'p:1');

  const sizes = c.tap('p:1').last;
  assert.deepEqual(optionIds(sizes), ['size:small', 'size:medium', 'size:large']);
  assert.equal(sizes.buttons[1].title, 'Moyen tas · 2 000 FC');

  const qty = c.tap('size:medium').last;
  assert.deepEqual(optionIds(qty), ['qty:1', 'qty:2', 'qty:3']);

  const more = c.say('2').last; // typed quantity
  assert.match(more.body, /Ajouté : 🍅 Tomate — Moyen tas × 2/);
  assert.match(more.body, /Sous-total : \*4 000 FC\*/);

  const name = c.tap('more:checkout').last;
  assert.match(name.body, /À quel nom/);

  const zones = c.say('Mama Nzinga').last;
  assert.deepEqual(optionIds(zones), ['zone:0', 'zone:1', 'zone:2', 'zone:other']);

  const address = c.say('limete').last; // typed zone name is matched
  assert.match(address.body, /Précisez l’adresse/);

  const recap = c.say('Av. Kasa-Vubu 45, en face du marché').last;
  assert.match(recap.body, /Récapitulatif/);
  assert.match(recap.body, /Livraison : 2 000 FC/);
  assert.match(recap.body, /\*Total : 6 000 FC\*/);
  assert.match(recap.body, /Mama Nzinga — Limete/);

  const pay = c.tap('recap:confirm').last;
  assert.match(pay.body, /Commande \*CMD-\d{8}-\d{3}\* enregistrée/);
  assert.match(pay.body, /Orange Money : \*0899000000\*/);
  assert.equal(c.state(), 'AWAIT_PROOF');

  assert.match(c.say('c’est fait').last.body, /J’attends la capture/);

  const done = c.image('proof-123');
  assert.match(done.last.body, /Capture reçue/);
  assert.equal(done.tasks.length, 2); // admin alert + local copy of the proof
  assert.equal(c.state(), 'DONE');

  const order = db.getOrder(db.lastOrder(db.getCustomer(c.phone).id).id);
  assert.equal(order.payment_proof, 'proof-123');
  assert.equal(order.total, 6000);
  assert.equal(order.items[0].quantity, 2);
});

test('"annuler" works at any step and cancels an unpaid order', () => {
  const c = customer('243810000003');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:2');
  assert.match(c.say('Annuler').last.body, /Commande annulée/);
  assert.equal(c.state(), 'DONE');

  const orderId = placeOrder(c);
  assert.equal(db.getOrder(orderId).status, 'awaiting_payment');
  c.say('annuler');
  assert.equal(db.getOrder(orderId).status, 'cancelled');
});

test('switching to English translates the conversation and is remembered', () => {
  const c = customer('243810000004');
  c.say('Bonjour');
  const menu = c.tap('menu:lang:en').last;
  assert.match(menu.body, /Got it, I will speak English/);
  assert.equal(menu.buttons[0].title, '🛒 Order');
  assert.ok(menu.buttons.some((b) => b.title === '🇫🇷 Français'));

  c.tap('menu:order');
  const sizes = c.tap('p:3').last;
  assert.match(sizes.body, /Ginger: which heap size\?/);
  assert.equal(sizes.buttons[0].title, 'Small · 1,000 FC');
  assert.equal(db.getCustomer(c.phone).locale, 'en');

  // Keyword switch back mid-flow re-asks the current question in French.
  assert.match(c.say('français').last.body, /Gingembre : quelle taille/);
});

test('a returning customer skips the address step and can repeat the last order', () => {
  const c = customer('243810000005');
  const first = placeOrder(c, { productId: 3, size: 'large', qty: 1 });
  c.image();
  db.setOrderStatus(first, 'delivered');

  const menu = c.say('Bonjour').last;
  assert.match(menu.body, /Re-bonjour Mama Nzinga/);
  assert.match(menu.body, /Votre dernière commande : 🫚 Gingembre Grand tas ×1/);
  assert.ok(optionIds(menu).includes('menu:reorder'));

  const confirm = c.tap('menu:reorder').last;
  assert.match(confirm.body, /Livrer à \*Mama Nzinga\*, Gombe/);

  const recap = c.tap('addr:yes').last;
  assert.match(recap.body, /Gingembre — Grand tas × 1/);
  assert.match(recap.body, /\*Total : 5 500 FC\*/);
});

test('an out-of-stock product disappears from the catalogue and from carts at recap', () => {
  const c = customer('243810000006');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:4');
  c.tap('size:small');
  c.tap('qty:1');
  c.tap('more:add');
  c.tap('p:5');
  c.tap('size:small');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.say('Jean');
  c.tap('zone:0');

  db.updateProduct(4, { in_stock: 0 });
  const recap = c.say('Av. Colonel Ebeya 3').last;
  assert.match(recap.body, /Retiré de votre panier car épuisé : 🧄 Ail/);
  assert.doesNotMatch(recap.body, /• 🧄/);

  c.say('menu');
  const catalogue = c.tap('menu:order').last;
  assert.ok(!optionIds(catalogue).includes('p:4'));
  db.updateProduct(4, { in_stock: 1 });
});

test('an unserved area is refused with the list of served areas', () => {
  const c = customer('243810000007');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:small');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.say('Paul');
  const reply = c.say('Masina').last;
  assert.match(reply.body, /nous ne livrons pas encore à \*Masina\*/);
  assert.match(reply.body, /Gombe, Limete, Ngaliema/);
  assert.equal(c.state(), 'ASK_ZONE');
});

test('a second order the same day offers to merge into the unpaid one', () => {
  const c = customer('243810000008');
  const firstId = placeOrder(c, { productId: 1, size: 'small', qty: 1 });
  c.say('menu');
  const dup = c.tap('menu:order').last;
  assert.match(dup.body, /déjà une commande aujourd’hui/);
  assert.deepEqual(optionIds(dup), ['dup:merge', 'dup:new', 'dup:back']);

  const catalogue = c.tap('dup:merge').last;
  assert.match(catalogue.body, /Votre panier reprend la commande/);
  c.tap('p:2');
  c.tap('size:large');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.tap('addr:yes');
  c.tap('recap:confirm');

  assert.equal(db.getOrder(firstId).status, 'cancelled');
  const merged = db.lastOrder(db.getCustomer(c.phone).id);
  assert.equal(merged.items.length, 2);
  assert.equal(merged.subtotal, 1000 + 2000);
});

test('cart can be edited: removing the last item goes back to the catalogue', () => {
  const c = customer('243810000009');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:6');
  c.tap('size:medium');
  c.tap('qty:3');
  const edit = c.tap('more:edit').last;
  assert.deepEqual(optionIds(edit), ['rm:6:medium', 'edit:add', 'edit:done']);
  const after = c.tap('rm:6:medium').last;
  assert.match(after.body, /Votre panier est vide/);
  assert.equal(c.state(), 'PICK_PRODUCT');
});

test('voice notes and unknown input get a helpful reply without losing the step', () => {
  const c = customer('243810000010');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  const voice = c.voice().last;
  assert.match(voice.body, /Je ne peux pas encore écouter les messages vocaux/);
  assert.equal(c.state(), 'PICK_SIZE');
  const wrong = c.say('bleu').last;
  assert.match(wrong.body, /Je n’ai pas compris/);
  assert.equal(c.state(), 'PICK_SIZE');
});

test('a greeting is answered, never scolded', () => {
  const c = customer('243810000031');
  const first = c.say('Bonjour').last;
  assert.doesNotMatch(first.body, /Je n’ai pas compris/);
  assert.equal(c.state(), 'MENU');

  // Said again while the menu is already on screen, it re-offers the menu.
  const again = c.say('salut').last;
  assert.doesNotMatch(again.body, /Je n’ai pas compris/);
  assert.equal(c.state(), 'MENU');

  // Mid-order it repeats the current question instead of restarting.
  c.tap('menu:order');
  c.tap('p:1');
  const mid = c.say('mbote').last;
  assert.doesNotMatch(mid.body, /Je n’ai pas compris/);
  assert.equal(c.state(), 'PICK_SIZE');

  const thanks = c.say('merci').last;
  assert.match(thanks.body, /Avec plaisir/);
  assert.equal(c.state(), 'PICK_SIZE');
});

test('a shared location is accepted as the delivery address', () => {
  const c = customer('243810000011');
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:small');
  c.tap('qty:1');
  c.tap('more:checkout');
  c.say('Grace');
  c.tap('zone:2');
  const recap = c.location(-4.325, 15.322).last;
  assert.match(recap.body, /maps\.google\.com\/\?q=-4\.325,15\.322/);
});

test('referral: code gives credit to the newcomer, and to the referrer after the first paid order', async () => {
  const referrer = customer('243810000012');
  referrer.say('Bonjour');
  const code = db.getCustomer(referrer.phone).referral_code;

  const friend = customer('243810000013');
  const welcome = friend.say(`Bonjour, code parrain ${code}`).last;
  assert.match(welcome.body, /Code parrain accepté/);
  assert.match(welcome.body, /1 000 FC\* de crédit/);

  const orderId = placeOrder(friend, { productId: 2, size: 'small', qty: 1 });
  const order = db.getOrder(orderId);
  assert.equal(order.discount, 1000);
  assert.equal(order.total, 500 + 2000 - 1000);
  assert.equal(db.getCustomer(friend.phone).credit, 0);

  await changeOrderStatus(orderId, 'paid');
  assert.equal(db.getCustomer(referrer.phone).credit, 1000);
  await changeOrderStatus(orderId, 'preparing');
  assert.equal(db.getCustomer(referrer.phone).credit, 1000, 'reward is granted once');
});

test('an order fully covered by credit is paid immediately', () => {
  const c = customer('243810000014');
  c.say('Bonjour');
  db.addCredit(db.getCustomer(c.phone).id, 50000);
  const orderId = placeOrder(c, { productId: 1, size: 'small', qty: 1 });
  assert.equal(db.getOrder(orderId).status, 'paid');
  assert.equal(db.getOrder(orderId).total, 0);
  assert.equal(c.state(), 'DONE');
});

test('opt-out keyword disables marketing reminders', () => {
  const c = customer('243810000015');
  c.say('Bonjour');
  assert.match(c.say('STOP').last.body, /ne recevrez plus/);
  assert.equal(db.getCustomer(c.phone).marketing_opt_out, 1);
  c.say('abonner');
  assert.equal(db.getCustomer(c.phone).marketing_opt_out, 0);
});

test('capacity reached: new orders are offered the waitlist', () => {
  const c = customer('243810000016');
  c.say('Bonjour');
  config.automation.weeklyStockCapacity = 1; // other tests already created orders this week
  try {
    const offer = c.tap('menu:order').last;
    assert.match(offer.body, /stock de la semaine est complet/);
    c.tap('wait:yes');
    assert.ok(db.getCustomer(c.phone).waitlist_since);
  } finally {
    config.automation.weeklyStockCapacity = 0;
  }
});

test('a very long recap is split so the total is never truncated', () => {
  const c = customer('243810000018');
  c.say('Bonjour');
  c.tap('menu:order');
  for (let p = 1; p <= 8; p++) {
    for (const size of ['small', 'medium', 'large']) {
      c.tap(p === 1 && size === 'small' ? 'p:1' : `p:${p}`);
      c.tap(`size:${size}`);
      c.tap('qty:1');
      c.tap('more:add');
    }
  }
  c.tap('cart:checkout');
  c.say('Test Long');
  c.tap('zone:0');
  const { messages } = c.say('Avenue du Commerce 1');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].kind, 'text');
  assert.match(messages[0].body, /\*Total : /);
  assert.equal(messages[1].kind, 'buttons');
  assert.ok([...messages[1].body].length <= 1024);
});

test('a payment screenshot sent later is attached to the pending order', () => {
  const c = customer('243810000017');
  const orderId = placeOrder(c);
  c.say('menu'); // customer leaves the payment step without sending the screenshot
  const reply = c.image('late-proof').last;
  assert.match(reply.body, /Capture reçue/);
  assert.equal(db.getOrder(orderId).payment_proof, 'late-proof');
});

test('a late screenshot during a new order is attached without losing the cart', () => {
  const c = customer('243810000019');
  const orderId = placeOrder(c);
  c.say('menu');
  c.tap('menu:order');
  c.tap('dup:new');
  c.tap('p:2');
  const { messages } = c.image('proof-mid-flow');
  assert.match(messages[0].body, /Capture reçue/);
  assert.match(messages[1].body, /Piment : quelle taille/);
  assert.equal(c.state(), 'PICK_SIZE');
  assert.equal(db.getOrder(orderId).payment_proof, 'proof-mid-flow');
});

test('"agent" pauses the bot until "menu"; the shop is alerted', () => {
  const c = customer('243810000020');
  c.say('Bonjour');
  c.tap('menu:order');
  const handoff = c.say('agent');
  assert.match(handoff.last.body, /Une personne vous répond/);
  assert.equal(handoff.tasks.length, 1);
  assert.equal(c.state(), 'HUMAN');

  assert.equal(c.say('Vous livrez à Masina ?').messages.length, 0, 'bot stays silent');
  assert.equal(c.voice().messages.length, 0, 'voice notes are left for the person');
  assert.equal(db.handoffConversations().find((h) => h.phone === c.phone).unanswered, 2);

  const back = c.say('menu').last;
  assert.deepEqual(optionIds(back).slice(0, 1), ['menu:order']);
  assert.equal(c.state(), 'MENU');
});

test('a menu button tapped while a payment is pending lets the customer move on', () => {
  const c = customer('243810000021');
  const orderId = placeOrder(c);
  assert.equal(c.state(), 'AWAIT_PROOF');
  const dup = c.tap('menu:order').last;
  assert.match(dup.body, /déjà une commande aujourd’hui/);
  assert.equal(db.getOrder(orderId).status, 'awaiting_payment');
  c.image('later-proof');
  assert.equal(db.getOrder(orderId).payment_proof, 'later-proof');
});
