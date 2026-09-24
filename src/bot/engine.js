// Conversation state machine. Each customer has a state and a JSON context in
// the `conversations` table; every inbound message is routed to the handler of
// the current state, which replies and moves to the next state.
//
// The engine is synchronous and side-effect free towards WhatsApp: it returns
// the messages to send plus follow-up tasks (admin alerts, rewards), which the
// webhook runs after replying.
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';
import { t, money, productName, normalizeLocale, LOCALES, DEFAULT_LOCALE } from '../i18n/index.js';
import * as M from './messages.js';
import * as cart from './cart.js';
import * as settings from '../shop/settings.js';
import * as coupons from '../shop/coupons.js';
import * as catalogue from '../shop/catalogue.js';
import * as slots from '../shop/slots.js';
import * as loyalty from '../shop/loyalty.js';
import * as waCatalog from '../shop/wa-catalog.js';
import { rewardsAfterPayment, notifyAdmin, notifyAdminProof, storeProof } from './orders.js';
import { publish } from '../utils/events.js';

export const STATES = Object.freeze({
  WELCOME: 'WELCOME',
  MENU: 'MENU',
  DUPLICATE_CHECK: 'DUPLICATE_CHECK',
  WAITLIST_OFFER: 'WAITLIST_OFFER',
  PICK_AISLE: 'PICK_AISLE',
  PICK_PRODUCT: 'PICK_PRODUCT',
  PICK_SIZE: 'PICK_SIZE',
  PICK_QTY: 'PICK_QTY',
  PICK_EXTRAS: 'PICK_EXTRAS',
  ADD_MORE: 'ADD_MORE',
  EDIT_CART: 'EDIT_CART',
  CONFIRM_ADDRESS: 'CONFIRM_ADDRESS',
  ASK_NAME: 'ASK_NAME',
  ASK_ZONE: 'ASK_ZONE',
  ASK_ADDRESS: 'ASK_ADDRESS',
  PICK_SLOT: 'PICK_SLOT',
  SUBSCRIBE_DAY: 'SUBSCRIBE_DAY',
  SUBSCRIBE_CONFIRM: 'SUBSCRIBE_CONFIRM',
  ASK_COUPON: 'ASK_COUPON',
  RECAP: 'RECAP',
  PICK_PAYMENT: 'PICK_PAYMENT',
  AWAIT_PROOF: 'AWAIT_PROOF',
  RATING: 'RATING',
  NLU_CONFIRM: 'NLU_CONFIRM',
  HUMAN: 'HUMAN',
  DONE: 'DONE',
});

const IDLE = new Set([STATES.WELCOME, STATES.DONE]);
// Marks "the products the shop filed under no aisle", which is a real choice
// and must not read as "no aisle chosen yet".
const NO_AISLE = '\u0000none';
// A thin rule: WhatsApp has no tables, and a blank line is not enough to
// separate what you bought from what you owe.
const RULE = '──────────';

/** States in which a customer who goes quiet gets one "still there?" nudge. */
export const REMINDABLE_STATES = [
  STATES.PICK_PRODUCT,
  STATES.PICK_SIZE,
  STATES.PICK_QTY,
  STATES.PICK_EXTRAS,
  STATES.ADD_MORE,
  STATES.EDIT_CART,
  STATES.CONFIRM_ADDRESS,
  STATES.ASK_NAME,
  STATES.ASK_ZONE,
  STATES.ASK_ADDRESS,
  STATES.PICK_SLOT,
  STATES.ASK_COUPON,
  STATES.RECAP,
  STATES.PICK_PAYMENT,
  STATES.AWAIT_PROOF,
];

/** Steps where a free-text order ("2 tas de tomates...") is worth sending to Claude, see enrich.js. */
export const UNDERSTANDING_STATES = [
  STATES.WELCOME,
  STATES.DONE,
  STATES.MENU,
  STATES.PICK_PRODUCT,
  STATES.ADD_MORE,
  STATES.NLU_CONFIRM,
];

const STALE_AFTER_HOURS = 24;
const MAX_QTY = 20;

/* ------------------------------ keywords ------------------------------- */

const words = (...list) => new Set(list);
/** Referral codes look like EP3F9A21; shared by the greeting guard and applyReferral. */
const REFERRAL_CODE = /\bEP[0-9A-F]{6}\b/i;
const KEYWORDS = {
  cancel: words('annuler', 'annule', 'annulation', 'cancel'),
  menu: words('menu', 'accueil', 'home', 'start', 'restart', 'recommencer'),
  help: words('aide', 'help', '?', 'info', 'infos'),
  toEn: words('english', 'anglais', 'en'),
  toFr: words('francais', 'french', 'fr'),
  language: words('langue', 'language', 'lang'),
  optOut: words('stop', 'desabonner', 'desinscrire', 'unsubscribe'),
  optIn: words('abonner', 'subscribe'),
  human: words('agent', 'humain', 'human', 'conseiller', 'operateur', 'support', 'parler a quelqu un', 'talk to someone'),
  subscribe: words('abonnement', 'abonner moi', 'subscription', 'subscribe me'),
  unsubscribe: words('stop abonnement', 'arreter abonnement', 'annuler abonnement', 'stop subscription', 'cancel subscription'),
  yes: words('oui', 'yes', 'o', 'y', 'ok', 'd accord', 'daccord'),
  no: words('non', 'no', 'n'),
  // A bare hello is the most common first message of all. Without this it
  // falls through to "I did not understand", which is a terrible welcome.
  greeting: words(
    'bonjour', 'bonsoir', 'bjr', 'salut', 'slt', 'coucou', 'cc',
    'hello', 'hi', 'hey', 'yo', 'good morning', 'good evening',
    'mbote', 'sango', 'losako',
    'allo', 'alo', 'ola', 'svp', 'stp', 's il vous plait', 'please',
  ),
  thanks: words('merci', 'merci beaucoup', 'mercii', 'thanks', 'thank you', 'thx', 'matondo'),
};

/**
 * Intents recognised in free text at the menu, where the customer has no
 * running order to disturb. Deliberately NOT global: mid-order, "livraison"
 * or "quartier" is far more likely to be part of an address than a question.
 */
const INTENTS = [
  ['order', /(^|\s)(commander|commande|acheter|achat|je veux|je voudrais|j aimerais|panier)(\s|$)/],
  ['prices', /(^|\s)(prix|tarif|tarifs|combien|cout|couts|coute|coutent|price|prices|how much)(\s|$)/],
  ['catalogue', /(^|\s)(catalogue|produit|produits|liste|epice|epices|legume|legumes|stock|dispo|disponible|disponibles|products|catalog)(\s|$)/],
  ['delivery', /(^|\s)(livraison|livrez|livrer|livre|zone|zones|quartier|quartiers|delivery|deliver)(\s|$)/],
  ['hours', /(^|\s)(horaire|horaires|ouvert|ouverte|ouverts|ferme|fermes|fermee|heure|heures|open|hours|closed)(\s|$)/],
  // Delivery-only shop: "where are you" is really "where do you deliver".
  ['delivery', /(^|\s)(adresse|localisation|situes|situee|boutique|magasin|address|location|shop)(\s|$)|ou etes vous|ou est ce que vous etes|where are you/],
];

/** The intent a free-text message carries at the menu, or null. */
function menuIntent(norm) {
  for (const [name, rx] of INTENTS) if (rx.test(norm)) return name;
  return null;
}

/** True for the words that act as commands at any step (menu, annuler, aide...). */
export function isKeyword(norm) {
  return Object.values(KEYWORDS).some((set) => set.has(norm));
}

/** Lowercase, strip accents, emoji and punctuation: "Épicés !" -> "epices". */
export function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}?]+/gu, ' ')
    .trim();
}

/* ------------------------------- session ------------------------------- */

const parseUtc = (d) => Date.parse(`${String(d).replace(' ', 'T')}Z`);

function loadSession(msg) {
  const { customer, isNew } = db.touchCustomer(msg.from);
  if (customer.blocked) return null; // blocked from the dashboard: the bot stays silent
  const conv = db.getConversation(msg.from);
  let state = HANDLERS[conv.state] ? conv.state : STATES.WELCOME;
  let ctx = conv.context || {};
  if (!IDLE.has(state) && (Date.now() - parseUtc(conv.updated_at)) / 3.6e6 > STALE_AFTER_HOURS) {
    state = STATES.WELCOME;
    ctx = {};
  }
  if (msg.profileName) ctx.profileName = msg.profileName;
  return { phone: msg.from, customer, isNew, state, ctx, locale: normalizeLocale(customer.locale), out: [], tasks: [] };
}

function toInput(msg) {
  return {
    type: msg.type,
    cart: msg.order || null,
    replyId: msg.replyId || null,
    raw: String(msg.text || '').trim(),
    // Keywords and free-text matching only apply to typed text, never to button titles.
    norm: msg.type === 'text' ? normalize(msg.text) : '',
    mediaId: msg.mediaId || null,
    location: msg.location || null,
    geo: msg.geo || null, // { zone, place } from reverse geocoding, see enrich.js
    nlu: msg.nlu?.items ? msg.nlu : null, // { items, unknown } understood by Claude, see enrich.js
  };
}

function describeInbound(msg) {
  // A transcribed voice note is logged as what was said, marked as voice so the
  // dashboard shows where the words came from.
  if (msg.transcript) return `🎤 ${msg.transcript}`;
  if (msg.type === 'interactive') return `[${msg.text}]`;
  if (msg.type === 'location') return `📍 ${msg.location?.latitude},${msg.location?.longitude}`;
  if (msg.mediaId) return `(${msg.type}) ${msg.text || ''}`.trim();
  return msg.text || `(${msg.type})`;
}

/**
 * Processes one inbound message. Returns { messages, tasks }: messages to send
 * in order, then async tasks to run (admin alerts, rewards).
 */
export function handleInbound(msg) {
  const s = loadSession(msg);
  // Blocked customer: the message is still recorded so the dashboard shows it,
  // but nothing is sent back and no state changes.
  if (!s) {
    db.logMessage(msg.from, 'in', describeInbound(msg), msg.mediaId);
    logger.info(`Ignored a message from blocked customer ${msg.from}`);
    return { messages: [], tasks: [] };
  }
  db.logMessage(s.phone, 'in', describeInbound(msg), msg.mediaId);
  try {
    route(s, toInput(msg));
  } catch (err) {
    logger.error(`Engine error for ${s.phone} in ${s.state}:`, err.stack || err.message);
    s.out = [M.text(s.phone, tr(s, 'error'))];
    s.state = STATES.WELCOME;
    s.ctx = {};
  }
  db.saveConversation(s.phone, s.state, s.ctx);
  return { messages: s.out, tasks: s.tasks };
}

function route(s, input) {
  // With a person answering, voice notes and stickers are fine: they are shown in the dashboard.
  const human = s.state === STATES.HUMAN;
  if (input.type === 'audio' && !human) return reprompt(s, tr(s, 'voiceNotSupported'));
  if (input.type === 'unsupported' && !human) return reprompt(s, tr(s, 'unsupportedMessage'));
  if (input.cart) return receiveCatalogCart(s, input.cart);
  if (input.norm && handleKeyword(s, input)) return;
  if (s.state !== STATES.AWAIT_PROOF && attachLateProof(s, input)) return;
  HANDLERS[s.state].handle(s, input);
}

/* ------------------------------- helpers ------------------------------- */

const tr = (s, key, params) => t(s.locale, key, params);
const fmt = (s, amount) => money(s.locale, amount);
const join = (...parts) => parts.filter(Boolean).join('\n\n');
const say = (s, body) => s.out.push(M.text(s.phone, body));

function go(s, state, intro) {
  s.state = state;
  HANDLERS[state].enter(s, intro);
}

function reprompt(s, intro) {
  HANDLERS[s.state].enter(s, intro);
}

const INTERACTIVE_BODY_MAX = 1024;

/** Sends a set of options and remembers them so a typed number or name can be matched later. */
function offer(s, body, options, { buttonLabel, footer, header } = {}) {
  s.ctx.options = options.map((o) => ({ id: o.id, title: o.title }));
  // Interactive bodies are capped at 1024 chars: send long content (e.g. a big recap)
  // as plain text first, and keep only the final question on the interactive message.
  if ([...body].length > INTERACTIVE_BODY_MAX) {
    const paragraphs = body.split('\n\n');
    const question = paragraphs.pop();
    say(s, paragraphs.join('\n\n'));
    body = question;
  }
  s.out.push(
    M.choice(s.phone, body, options, {
      buttonLabel: buttonLabel || tr(s, 'listButton'),
      footer,
      header,
      numberHint: tr(s, 'replyWithNumber'),
    }),
  );
}

/** Asks an open question (no options to match). */
function ask(s, body) {
  s.ctx.options = [];
  say(s, body);
}

/** Resolves the customer's answer to one of the offered option ids: tap, number, or name. */
function pick(s, input) {
  const options = s.ctx.options || [];
  if (input.replyId) return options.some((o) => o.id === input.replyId) ? input.replyId : null;
  const typed = input.norm;
  if (!typed) return null;
  if (/^\d+$/.test(typed)) return options[Number(typed) - 1]?.id ?? null;
  const exact = options.filter((o) => normalize(o.title) === typed);
  if (exact.length === 1) return exact[0].id;
  if (typed.length >= 3) {
    const partial = options.filter((o) => {
      const title = normalize(o.title);
      return title.length >= 3 && (title.includes(typed) || typed.includes(title));
    });
    if (partial.length === 1) return partial[0].id;
  }
  return null;
}

const isYes = (input) => KEYWORDS.yes.has(input.norm);
const isNo = (input) => KEYWORDS.no.has(input.norm);

function setLocale(s, locale) {
  s.locale = normalizeLocale(locale);
  s.customer = db.updateCustomer(s.customer.id, { locale: s.locale });
}

const otherLocales = (s) => LOCALES.filter((l) => l !== s.locale);
const otherLocale = (s) => otherLocales(s)[0];

/** Served areas, from the `zones` table; DELIVERY_ZONES only seeds it on a fresh install. */
function servedZones() {
  const zones = db.listZones({ onlyActive: true });
  return zones.length ? zones : config.shop.zones.map((name) => ({ name, fee: config.shop.deliveryFee }));
}

const zoneNames = () => servedZones().map((z) => z.name);

const isServedZone = (zone) => servedZones().some((z) => normalize(z.name) === normalize(zone));

/** Delivery fee of an area, minus whatever the customer's loyalty tier takes off. */
function deliveryFeeFor(zoneName, customer = null) {
  const zone = servedZones().find((z) => normalize(z.name) === normalize(zoneName));
  const fee = zone ? zone.fee : settings.get().defaultDeliveryFee;
  return customer ? loyalty.deliveryFeeFor(customer.tier, fee) : fee;
}

/**
 * Prices a basket for the current delivery area, applying any coupon the
 * customer entered. An coupon that stopped being valid (basket changed, code
 * expired) is dropped silently rather than blocking the order.
 */
function priceFor(s, priced, availableCredit) {
  const deliveryFee = deliveryFeeFor(s.ctx.delivery?.zone, s.customer);
  let applied = null;
  if (s.ctx.coupon) {
    const result = coupons.evaluate(s.ctx.coupon, { customer: s.customer, subtotal: priced.subtotal, deliveryFee });
    if (result.ok) applied = result;
    else delete s.ctx.coupon;
  }
  const totals = cart.computeTotals(priced.subtotal, availableCredit, {
    deliveryFee,
    couponDiscount: applied?.discount || 0,
  });
  return { totals, coupon: applied?.coupon || null };
}

function cartText(s) {
  const { lines, subtotal } = cart.priceCart(s.ctx.cart || []);
  if (!lines.length) return tr(s, 'cartEmpty');
  return [
    tr(s, 'cartTitle'),
    ...lines.map((l) => `• ${cart.describeItem(s.locale, l.product, l.size, l.qty, l.extras)} — ${fmt(s, l.lineTotal)}`),
    RULE,
    tr(s, 'subtotalLine', { amount: fmt(s, subtotal) }),
  ].join('\n');
}

function orderSummary(locale, order) {
  return order.items.map((it) => cart.shortItem(locale, it, it.size, it.quantity)).join(', ');
}

function formatLocation(loc) {
  const label = [loc.name, loc.address].filter(Boolean).join(', ');
  return `${label ? `${label} ` : ''}📍 https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
}

/**
 * A shared location whose commune is a served zone becomes the full delivery
 * address (zone + map link), skipping the zone and address questions.
 * Returns true when it was applied.
 */
function applyDetectedLocation(s, input, name) {
  if (!input.location || !input.geo?.zone || !name) return false;
  const note = formatLocation({ ...input.location, name: input.location.name || input.geo.place });
  s.customer = db.updateCustomer(s.customer.id, { name, neighborhood: input.geo.zone, address_note: note });
  s.ctx.delivery = { name, zone: input.geo.zone, note };
  delete s.ctx.draft;
  go(s, STATES.RECAP, tr(s, 'zoneDetected', { zone: input.geo.zone }));
  return true;
}

/** Explains why a shared location could not be used as the delivery zone. */
function locationProblem(s, input) {
  if (input.geo?.place) return tr(s, 'zoneNotServed', { zone: input.geo.place, zones: zoneNames().join(', ') });
  return tr(s, 'zoneNotDetected');
}

const nowSqlite = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/* ------------------------------ global flow ---------------------------- */

function handleKeyword(s, input) {
  const k = input.norm;
  if (KEYWORDS.cancel.has(k)) {
    cancelFlow(s);
    return true;
  }
  if (KEYWORDS.menu.has(k)) {
    greetAndMenu(s);
    return true;
  }
  // A bare greeting, or one with a harmless word after it ("bonjour madame").
  // Anything longer is a real message that opens with a polite hello --
  // "bonjour, 2 tas de tomates", "bonjour EP3F9A21" -- and must fall through.
  const head = k.split(' ')[0];
  if (KEYWORDS.greeting.has(head) && !input.nlu && !REFERRAL_CODE.test(input.raw || '')) {
    const rest = k.slice(head.length).trim();
    const harmless =
      rest.split(' ').filter(Boolean).length <= 2 && !/\d/.test(rest)
      && !menuIntent(rest) && !pick(s, { ...input, norm: rest });
    if (!rest || harmless) {
      // Mid-order, a hello should not throw the basket away: just ask again.
      if (IDLE.has(s.state)) greetAndMenu(s);
      else reprompt(s);
      return true;
    }
  }
  if (KEYWORDS.thanks.has(k)) {
    say(s, tr(s, 'thanksReply'));
    return true;
  }
  if (KEYWORDS.help.has(k)) {
    say(s, tr(s, 'help', { zones: zoneNames().join(', ') }));
    if (IDLE.has(s.state)) greetAndMenu(s);
    else reprompt(s);
    return true;
  }
  const target = KEYWORDS.toEn.has(k) ? 'en' : KEYWORDS.toFr.has(k) ? 'fr' : KEYWORDS.language.has(k) ? otherLocale(s) : null;
  if (target && LOCALES.includes(target)) {
    setLocale(s, target);
    reprompt(s, tr(s, 'languageSet'));
    return true;
  }
  if (KEYWORDS.optOut.has(k)) {
    s.customer = db.updateCustomer(s.customer.id, { marketing_opt_out: 1 });
    say(s, tr(s, 'optedOut'));
    return true;
  }
  if (KEYWORDS.optIn.has(k)) {
    s.customer = db.updateCustomer(s.customer.id, { marketing_opt_out: 0 });
    say(s, tr(s, 'optedIn'));
    return true;
  }
  if (KEYWORDS.unsubscribe.has(k)) {
    const active = db.subscriptionsFor(s.customer.id).filter((sub) => sub.active);
    active.forEach((sub) => db.updateSubscription(sub.id, { active: 0 }));
    say(s, tr(s, active.length ? 'subscriptionCancelled' : 'subscriptionNone'));
    return true;
  }
  if (KEYWORDS.subscribe.has(k)) {
    go(s, STATES.SUBSCRIBE_DAY);
    return true;
  }
  if (KEYWORDS.human.has(k) && s.state !== STATES.HUMAN) {
    startHandoff(s);
    return true;
  }
  return false;
}

/** Pauses the bot for this customer and alerts the shop; they answer from the dashboard. */
function startHandoff(s) {
  publish('handoff', { phone: s.phone });
  s.state = STATES.HUMAN;
  s.ctx = { profileName: s.ctx.profileName };
  say(s, tr(s, 'handoffStarted'));
  const c = s.customer;
  s.tasks.push(() =>
    notifyAdmin(
      t(DEFAULT_LOCALE, 'adminHandoff', {
        name: c.name || s.ctx.profileName || '?',
        phone: c.phone,
        url: `${config.publicUrl}/admin/customers/${c.id}`,
      }),
      [c.name || c.phone, 'agent'],
    ),
  );
}

function cancelFlow(s) {
  if (IDLE.has(s.state) || s.state === STATES.HUMAN) return greetAndMenu(s);
  if (s.state === STATES.AWAIT_PROOF && s.ctx.orderId) {
    const order = db.getOrder(s.ctx.orderId);
    if (order?.status === 'awaiting_payment') db.setOrderStatus(order.id, 'cancelled');
  }
  s.state = STATES.DONE;
  s.ctx = {};
  say(s, tr(s, 'cancelled'));
}

function greetAndMenu(s, intro, extra) {
  s.ctx = { profileName: s.ctx.profileName };
  const c = s.customer;
  const greeting = s.isNew
    ? tr(s, 'welcomeNew', { shop: settings.get().name })
    : tr(s, 'welcomeBack', { name: c.name });
  const credit = c.credit > 0 ? tr(s, 'creditBalance', { amount: fmt(s, c.credit) }) : null;
  go(s, STATES.MENU, join(intro, greeting, extra, credit));
}

/** Credits a referral code found in a new customer's message. Returns a confirmation line or null. */
function applyReferral(s, raw) {
  const c = s.customer;
  const reward = settings.get().referralReward;
  if (reward <= 0 || c.referred_by || c.orders_count > 0) return null;
  const code = String(raw || '').match(REFERRAL_CODE)?.[0];
  if (!code) return null;
  const referrer = db.getCustomerByReferralCode(code);
  if (!referrer || referrer.id === c.id) return null;
  db.updateCustomer(c.id, { referred_by: referrer.id });
  db.recordCredit(c.id, reward, { reason: 'referral', detail: referrer.name || referrer.phone });
  s.customer = db.getCustomerById(c.id);
  return tr(s, 'referralApplied', { amount: fmt(s, reward) });
}

/** "We're closed" reply, with the next opening when there is one. */
function closedMessage(s) {
  const st = settings.get();
  const next = settings.nextOpening(new Date(), st);
  const when = !next
    ? null
    : next.today
      ? tr(s, 'closedUntilToday', { time: next.time })
      : next.tomorrow
        ? tr(s, 'closedUntilTomorrow', { time: next.time })
        : tr(s, 'closedUntilDay', { day: tr(s, `weekdays.${next.day}`), time: next.time });
  return join(tr(s, 'shopClosed'), st.closedNote || null, when);
}

/** The product a typed name refers to, when exactly one matches. */
const ALIASES = [
  // What people in Kinshasa actually call these, next to the catalogue name.
  [/pili ?pili|piri ?piri|pimo/, 'piment'],
  [/tomate?s/, 'tomate'],
  [/oignons?|ognon/, 'oignon'],
  [/gingembres?|tangawisi/, 'gingembre'],
  [/ails?|loso ya ail/, 'ail'],
];

function productByName(s, norm) {
  if (!norm || norm.length < 3) return null;
  const needle = ALIASES.find(([rx]) => rx.test(norm))?.[1] || norm;
  const hits = db.listProducts().filter((p) => {
    const name = normalize(productName(p, s.locale));
    return name.length >= 3 && (name.includes(needle) || needle.includes(name));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** "Where do you deliver?" -- the served areas with their own fees. */
function deliveryAnswer(s) {
  const lines = servedZones()
    .map((z) => `• ${z.name} — ${z.fee > 0 ? fmt(s, z.fee) : tr(s, 'zoneFeeFree')}`)
    .join('\n');
  return tr(s, 'deliveryAnswer', { lines });
}

/** "Are you open?" -- today's window when open, the next opening when not. */
function hoursAnswer(s) {
  const st = settings.get();
  if (!settings.isOpen(new Date(), st)) return closedMessage(s);
  const today = st.hours?.[new Date().getDay()];
  return today ? tr(s, 'openNow', { open: today.open, close: today.close }) : tr(s, 'openAlways');
}

function startOrder(s, { reorder = false, skipChecks = false } = {}) {
  if (!skipChecks) {
    const st = settings.get();
    if (!settings.isOpen(new Date(), st)) {
      s.state = STATES.DONE;
      s.ctx = { profileName: s.ctx.profileName };
      return say(s, closedMessage(s));
    }
    const cap = st.weeklyCapacity;
    if (cap > 0 && db.weeklyOrderCount() >= cap) return go(s, STATES.WAITLIST_OFFER);
    const open = db.openOrdersToday(s.customer.id)[0];
    if (open) {
      s.ctx.dup = { orderId: open.id, reorder };
      return go(s, STATES.DUPLICATE_CHECK);
    }
  }
  s.ctx.cart = s.ctx.cart || [];
  if (s.ctx.nluItems) return go(s, STATES.NLU_CONFIRM);
  if (!reorder) return go(s, STATES.PICK_PRODUCT);

  const { items, missing } = cart.fromOrder(db.lastOrder(s.customer.id));
  s.ctx.cart = items;
  const note = missing.length
    ? tr(s, 'reorderMissing', { items: missing.map((p) => productName(p, s.locale)).join(', ') })
    : null;
  if (!items.length) return go(s, STATES.PICK_PRODUCT, note);
  return goCheckout(s, join(note, cartText(s)));
}

/** A free-text order was understood: confirm it (after the usual capacity / duplicate checks). */
function startUnderstoodOrder(s, nlu) {
  s.ctx.nluItems = nlu.items;
  s.ctx.nluUnknown = nlu.unknown;
  if (s.state === STATES.PICK_PRODUCT || s.state === STATES.ADD_MORE || s.state === STATES.NLU_CONFIRM) {
    return go(s, STATES.NLU_CONFIRM);
  }
  return startOrder(s);
}

/** "de 1 000 FC à 3 500 FC", from the product's actual variants. */
function priceRangeLabel(s, product) {
  const { from, to } = catalogue.priceRange(product);
  return from === to ? fmt(s, from) : tr(s, 'priceRange', { from: fmt(s, from), to: fmt(s, to) });
}

/** "Livraison offerte (palier Or)" when the tier changed the fee. */
function tierPerk(s, totals) {
  const pct = loyalty.deliveryDiscountPct(s.customer.tier);
  if (!pct || !s.ctx.delivery) return null;
  const full = servedZones().find((z) => normalize(z.name) === normalize(s.ctx.delivery.zone))?.fee
    ?? settings.get().defaultDeliveryFee;
  if (full <= totals.deliveryFee) return null;
  return totals.deliveryFee === 0
    ? tr(s, 'tierFreeDelivery', { tier: tr(s, `tiers.${s.customer.tier}`) })
    : tr(s, 'tierDeliveryOff', { tier: tr(s, `tiers.${s.customer.tier}`), pct });
}

/** A cart built inside WhatsApp from the Meta catalog. */
function receiveCatalogCart(s, order) {
  const { items, unknown } = waCatalog.cartFromOrderMessage(order);
  if (!items.length) return reprompt(s, tr(s, 'cartEmpty'));
  s.ctx.cart = s.ctx.cart || [];
  for (const it of items) cart.addItem(s.ctx.cart, it.productId, it.size, it.qty);
  const missed = unknown.length ? tr(s, 'itemsRemovedOOS', { items: unknown.join(', ') }) : null;
  goCheckout(s, join(tr(s, 'cartReceived'), missed, cartText(s)));
}

/** Asks for a delivery window, or goes straight to the recap when none are defined. */
function goSlot(s, intro) {
  if (s.ctx.slot || !slots.available().length) return go(s, STATES.RECAP, intro);
  return go(s, STATES.PICK_SLOT, intro);
}

/** Commits the line being built (product, variant, quantity, extras) to the cart. */
function addPending(s) {
  const { productId, size, qty, extras = [] } = s.ctx.pending || {};
  const product = db.getProduct(productId);
  delete s.ctx.pending;
  if (!product?.in_stock) {
    return go(s, STATES.PICK_PRODUCT, tr(s, 'outOfStock', { product: product ? productName(product, s.locale) : '?' }));
  }
  s.ctx.cart = cart.addItem(s.ctx.cart || [], product.id, size, qty, extras);
  go(s, STATES.ADD_MORE, tr(s, 'added', { item: cart.describeItem(s.locale, product, size, qty, extras) }));
}

/** Public URL of a product photo, used for the picture the bot sends. */
function productPhotoUrl(product) {
  return `${config.publicUrl}/media/products/${encodeURIComponent(product.photo)}`;
}

function goCheckout(s, intro) {
  // Check the minimum before asking for a name and an address, not after.
  const minOrder = settings.get().minOrder;
  const { subtotal } = cart.priceCart(s.ctx.cart || []);
  if (minOrder > 0 && subtotal > 0 && subtotal < minOrder) {
    return go(s, STATES.PICK_PRODUCT, join(intro, tr(s, 'minOrderNotReached', { amount: fmt(s, minOrder) })));
  }
  if (s.ctx.delivery && isServedZone(s.ctx.delivery.zone)) return go(s, STATES.RECAP, intro);
  const c = s.customer;
  if (c.name && c.neighborhood && isServedZone(c.neighborhood)) return go(s, STATES.CONFIRM_ADDRESS, intro);
  return go(s, STATES.ASK_NAME, intro);
}

function confirmOrder(s) {
  const priced = cart.priceCart(s.ctx.cart || []);
  if (!priced.lines.length || priced.unavailable.length) return go(s, STATES.RECAP);

  // Merging into today's unpaid order: cancel it now (refunding its credit) so the new one replaces it.
  if (s.ctx.replacesOrderId) {
    const old = db.getOrder(s.ctx.replacesOrderId);
    if (old?.status === 'awaiting_payment') db.setOrderStatus(old.id, 'cancelled');
    delete s.ctx.replacesOrderId;
  }

  const customer = db.getCustomerById(s.customer.id);
  const { totals, coupon } = priceFor(s, priced, customer.credit);
  const d = s.ctx.delivery;
  const paymentMethod = s.ctx.payment === 'cash' ? 'cash' : 'momo';
  const order = db.createOrder({
    customer,
    items: priced.lines.map((l) => ({
      productId: l.productId,
      size: l.size,
      variantLabel: catalogue.variantLabel(l.variant, s.locale),
      extras: l.extras,
      quantity: l.qty,
      unitPrice: l.unitPrice,
    })),
    ...totals,
    paymentMethod,
    coupon,
    couponDiscount: totals.couponDiscount,
    name: d.name,
    neighborhood: d.zone,
    addressNote: d.note,
    slotId: s.ctx.slot?.id || null,
    slotLabel: s.ctx.slot?.label || null,
  });
  s.customer = db.getCustomerById(customer.id);
  publish('order', { reference: order.reference });

  if (order.total === 0) {
    const { order: paid } = db.setOrderStatus(order.id, 'paid');
    s.state = STATES.DONE;
    s.ctx = {};
    say(s, tr(s, 'paidByCredit', { ref: order.reference }));
    s.tasks.push(() => rewardsAfterPayment(paid), () => notifyAdminProof(paid, { paidByCredit: true }));
    return;
  }
  // Cash on delivery: nothing to prove, the rider collects. The order waits for
  // the shop to confirm it, exactly like an unpaid mobile-money order would.
  if (paymentMethod === 'cash') {
    s.state = STATES.DONE;
    s.ctx = {};
    say(s, tr(s, 'cashConfirmed', { ref: order.reference, total: fmt(s, order.total) }));
    s.tasks.push(() => notifyAdminProof(order, { cash: true }));
    return;
  }
  s.ctx = { orderId: order.id };
  go(s, STATES.AWAIT_PROOF);
}

/** Asks how the customer wants to pay, or skips the question when only one way is offered. */
function goPayment(s) {
  const st = settings.get();
  const methods = [st.momoEnabled ? 'momo' : null, st.cashEnabled ? 'cash' : null].filter(Boolean);
  if (methods.length < 2) {
    s.ctx.payment = methods[0] || 'momo';
    return confirmOrder(s);
  }
  if (s.ctx.payment) return confirmOrder(s);
  return go(s, STATES.PICK_PAYMENT);
}

const isProofMedia = (input) => Boolean(input.mediaId) && ['image', 'document'].includes(input.type);

function recordProof(s, orderId, mediaId) {
  db.setPaymentProof(orderId, mediaId);
  const order = db.getOrder(orderId);
  say(s, tr(s, 'proofReceived', { ref: order.reference }));
  s.tasks.push(() => notifyAdminProof(order), () => storeProof(order));
}

function receiveProof(s, orderId, mediaId) {
  s.state = STATES.DONE;
  s.ctx = {};
  recordProof(s, orderId, mediaId);
}

/**
 * A screenshot sent after the customer left the payment step still gets attached
 * to their pending order. A new order in progress is kept and its question re-asked.
 */
function attachLateProof(s, input) {
  if (!isProofMedia(input)) return false;
  const order = db.latestUnpaidOrderWithoutProof(s.customer.id);
  if (!order) return false;
  if (IDLE.has(s.state) || s.state === STATES.MENU) {
    receiveProof(s, order.id, input.mediaId);
  } else {
    recordProof(s, order.id, input.mediaId);
    reprompt(s);
  }
  return true;
}

function menuOptions(s) {
  const options = [{ id: 'menu:order', title: tr(s, 'btnOrder') }];
  if (db.lastOrder(s.customer.id)) {
    options.push({ id: 'menu:reorder', title: tr(s, 'btnReorder') });
    options.push({ id: 'menu:subscribe', title: tr(s, 'btnSubscribe') });
  }
  for (const other of otherLocales(s)) options.push({ id: `menu:lang:${other}`, title: t(other, 'localeLabel') });
  return options;
}

/** Builds the post-delivery survey (also used by the scheduler). */
export function surveyMessage(phone, locale, order) {
  const options = [1, 2, 3, 4, 5].map((n) => ({ id: `rate:${n}`, title: '⭐'.repeat(n) }));
  return M.list(phone, t(locale, 'surveyPrompt', { ref: order.reference }), t(locale, 'ratingButton'), options);
}

/* ------------------------------- handlers ------------------------------ */

const idle = {
  enter(s, intro) {
    greetAndMenu(s, intro);
  },
  handle(s, input) {
    if (input.replyId?.startsWith('menu:')) {
      s.ctx.options = menuOptions(s);
      s.state = STATES.MENU;
      return HANDLERS.MENU.handle(s, input);
    }
    if (input.nlu) {
      s.ctx = { profileName: s.ctx.profileName };
      return startUnderstoodOrder(s, input.nlu);
    }
    const referral = applyReferral(s, input.raw);
    greetAndMenu(s, null, referral);
  },
};

const HANDLERS = {
  [STATES.WELCOME]: idle,
  [STATES.DONE]: idle,

  [STATES.MENU]: {
    enter(s, intro) {
      const last = db.lastOrder(s.customer.id);
      const lastLine = last ? tr(s, 'menuLastOrder', { items: orderSummary(s.locale, last) }) : null;
      offer(s, join(intro, lastLine, tr(s, 'menuPrompt')), menuOptions(s), { footer: tr(s, 'menuFooter') });
    },
    handle(s, input) {
      const id = pick(s, input);
      if (id === 'menu:order') return startOrder(s);
      if (id === 'menu:reorder') return startOrder(s, { reorder: true });
      if (id === 'menu:subscribe') return go(s, STATES.SUBSCRIBE_DAY);
      if (id?.startsWith('menu:lang')) {
        // "menu:lang" (one other language) or "menu:lang:<code>" (several).
        const target = id.split(':')[2] || otherLocales(s)[0];
        if (target) setLocale(s, target);
        return reprompt(s, tr(s, 'languageSet'));
      }
      if (input.nlu) return startUnderstoodOrder(s, input.nlu);
      const referral = applyReferral(s, input.raw);
      if (referral) return reprompt(s, referral);
      // Free text at the menu: answer the question, or open the catalogue.
      const intent = menuIntent(input.norm);
      if (intent === 'delivery') return reprompt(s, deliveryAnswer(s));
      if (intent === 'hours') return reprompt(s, hoursAnswer(s));
      if (intent) return startOrder(s);
      // A product typed by name ("gingembre") opens the catalogue on it.
      if (productByName(s, input.norm)) return startOrder(s);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  // "Le même panier chaque samedi": the day first, then a confirmation of the
  // basket that will be repeated (the customer's last order).
  [STATES.SUBSCRIBE_DAY]: {
    enter(s, intro) {
      const last = db.lastOrder(s.customer.id);
      if (!last) return greetAndMenu(s, join(intro, tr(s, 'subscribeNoOrder')));
      const options = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ id: `subday:${d}`, title: tr(s, `weekdayNames.${d}`) }));
      offer(s, join(intro, tr(s, 'askSubscribeDay')), options, { buttonLabel: tr(s, 'subscribeButton') });
    },
    handle(s, input) {
      const id = pick(s, input);
      if (!id?.startsWith('subday:')) return reprompt(s, tr(s, 'invalidChoice'));
      s.ctx.subDay = Number(id.slice(7));
      go(s, STATES.SUBSCRIBE_CONFIRM);
    },
  },

  [STATES.SUBSCRIBE_CONFIRM]: {
    enter(s, intro) {
      const last = db.lastOrder(s.customer.id);
      const { items } = cart.fromOrder(last);
      if (!items.length) return greetAndMenu(s, join(intro, tr(s, 'subscribeNoOrder')));
      s.ctx.subItems = items;
      const summary = items
        .map((it) => cart.shortItem(s.locale, db.getProduct(it.productId), it.size, it.qty))
        .join(', ');
      offer(s, join(intro, tr(s, 'subscribeConfirm', { day: tr(s, `weekdayNames.${s.ctx.subDay}`), items: summary })), [
        { id: 'sub:yes', title: tr(s, 'btnSubscribeYes') },
        { id: 'sub:no', title: tr(s, 'btnSubscribeNo') },
      ]);
    },
    handle(s, input) {
      const id = pick(s, input) || (isYes(input) ? 'sub:yes' : isNo(input) ? 'sub:no' : null);
      if (id === 'sub:no') return greetAndMenu(s, tr(s, 'okNoProblem'));
      if (id !== 'sub:yes') return reprompt(s, tr(s, 'invalidChoice'));

      const day = s.ctx.subDay;
      const items = s.ctx.subItems || [];
      const existing = db.subscriptionsFor(s.customer.id).find((sub) => sub.active);
      if (existing) db.updateSubscription(existing.id, { weekday: day, items: JSON.stringify(items), active: 1 });
      else db.createSubscription({ customerId: s.customer.id, weekday: day, items });
      const label = tr(s, `weekdayNames.${day}`);
      greetAndMenu(s, tr(s, existing ? 'subscriptionExists' : 'subscribed', { day: label }));
    },
  },

  [STATES.DUPLICATE_CHECK]: {
    enter(s, intro) {
      const order = db.getOrder(s.ctx.dup?.orderId);
      if (!order) return startOrder(s, { reorder: s.ctx.dup?.reorder, skipChecks: true });
      const canMerge = order.status === 'awaiting_payment';
      const options = [];
      if (canMerge) options.push({ id: 'dup:merge', title: tr(s, 'btnDupMerge') });
      options.push({ id: 'dup:new', title: tr(s, 'btnDupNew') }, { id: 'dup:back', title: tr(s, 'btnBack') });
      const body = join(
        intro,
        tr(s, 'duplicateFound', { ref: order.reference, status: tr(s, `status.${order.status}`) }),
        canMerge ? tr(s, 'duplicateMergeHint') : null,
      );
      offer(s, body, options);
    },
    handle(s, input) {
      const id = pick(s, input);
      const dup = s.ctx.dup || {};
      if (id === 'dup:merge') {
        const order = db.getOrder(dup.orderId);
        if (order?.status === 'awaiting_payment') {
          s.ctx.cart = cart.fromOrder(order).items;
          s.ctx.replacesOrderId = order.id;
          delete s.ctx.dup;
          const intro = tr(s, 'mergeIntro', { ref: order.reference });
          return go(s, s.ctx.nluItems ? STATES.NLU_CONFIRM : STATES.PICK_PRODUCT, intro);
        }
      }
      if (id === 'dup:new') {
        delete s.ctx.dup;
        return startOrder(s, { reorder: dup.reorder, skipChecks: true });
      }
      if (id === 'dup:back') return greetAndMenu(s);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  [STATES.WAITLIST_OFFER]: {
    enter(s, intro) {
      offer(s, join(intro, tr(s, 'capacityFull')), [
        { id: 'wait:yes', title: tr(s, 'btnWaitYes') },
        { id: 'wait:no', title: tr(s, 'btnWaitNo') },
      ]);
    },
    handle(s, input) {
      const id = pick(s, input) || (isYes(input) ? 'wait:yes' : isNo(input) ? 'wait:no' : null);
      if (!id) return reprompt(s, tr(s, 'invalidChoice'));
      if (id === 'wait:yes') s.customer = db.updateCustomer(s.customer.id, { waitlist_since: nowSqlite() });
      s.state = STATES.DONE;
      s.ctx = {};
      say(s, tr(s, id === 'wait:yes' ? 'waitlistJoined' : 'okNoProblem'));
    },
  },

  [STATES.PICK_PRODUCT]: {
    enter(s, intro) {
      const all = db.listProducts();
      if (!all.length) {
        s.state = STATES.DONE;
        s.ctx = {};
        return say(s, join(intro, tr(s, 'noProducts')));
      }
      // Past ten products a flat list degrades to numbered text. Walking the
      // aisles first keeps it tappable however big the shop grows.
      const aisles = [...new Set(all.map((p) => p.category).filter(Boolean))];
      if (!s.ctx.aisle && aisles.length > 1 && all.length > M.LIST_ROWS_MAX) {
        return go(s, STATES.PICK_AISLE, intro);
      }
      const products = !s.ctx.aisle
        ? all
        : all.filter((p) => (s.ctx.aisle === NO_AISLE ? !p.category : p.category === s.ctx.aisle));
      const options = products.map((p) => ({
        id: `p:${p.id}`,
        title: productName(p, s.locale),
        description: priceRangeLabel(s, p),
        // Groups the list into aisles when the shop has filled them in.
        group: p.category || null,
      }));
      const hasCart = s.ctx.cart?.length > 0;
      if (s.ctx.aisle) options.push({ id: 'aisle:all', title: tr(s, 'btnAllAisles') });
      if (hasCart) options.push({ id: 'cart:checkout', title: tr(s, 'btnCheckoutCart') });

      const shop = settings.get();
      if (waCatalog.isEnabled(shop)) {
        // WhatsApp draws the products itself, with their pictures and a cart.
        s.ctx.options = [];
        if (intro || hasCart) say(s, join(intro, hasCart ? cartText(s) : null));
        s.out.push(M.productList(s.phone, {
          catalogId: shop.catalogId,
          header: tr(s, 'catalogHeader'),
          body: tr(s, 'catalogBody'),
          footer: tr(s, 'catalogFooter'),
          sections: waCatalog.sections(tr(s, 'catalogHeader')),
        }));
        return;
      }

      offer(s, join(intro, hasCart ? cartText(s) : null, tr(s, 'pickProduct')), options, {
        buttonLabel: tr(s, 'catalogButton'),
        header: tr(s, 'catalogHeaderLine'),
      });
    },
    handle(s, input) {
      const id = pick(s, input);
      if (id === 'cart:checkout') return goCheckout(s);
      if (id === 'aisle:all') {
        s.ctx.aisle = null;
        return go(s, STATES.PICK_AISLE);
      }
      if (id?.startsWith('p:')) {
        const product = db.getProduct(Number(id.slice(2)));
        if (!product?.in_stock) {
          const name = product ? productName(product, s.locale) : '?';
          return reprompt(s, tr(s, 'outOfStock', { product: name }));
        }
        s.ctx.pending = { productId: product.id };
        return go(s, STATES.PICK_SIZE);
      }
      if (input.nlu) return startUnderstoodOrder(s, input.nlu);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  // Shown only when the catalogue outgrows a single list: pick the shelf first.
  [STATES.PICK_AISLE]: {
    enter(s, intro) {
      const products = db.listProducts();
      const counts = new Map();
      for (const p of products) {
        const key = p.category || '';
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const options = [...counts.entries()]
        .filter(([key]) => key)
        .map(([key, n]) => ({ id: `aisle:${key}`, title: key, description: tr(s, 'aisleCount', { n }) }));
      // Products with no aisle would otherwise be unreachable from here.
      if (counts.get('')) {
        options.push({ id: 'aisle:', title: tr(s, 'aisleOther'), description: tr(s, 'aisleCount', { n: counts.get('') }) });
      }
      if (s.ctx.cart?.length) options.push({ id: 'cart:checkout', title: tr(s, 'btnCheckoutCart') });
      offer(s, join(intro, tr(s, 'pickAisle')), options, {
        buttonLabel: tr(s, 'catalogButton'),
        header: tr(s, 'catalogHeaderLine'),
      });
    },
    handle(s, input) {
      const id = pick(s, input);
      if (id === 'cart:checkout') return goCheckout(s);
      if (!id?.startsWith('aisle:')) return reprompt(s, tr(s, 'invalidChoice'));
      const aisle = id.slice('aisle:'.length);
      s.ctx.aisle = aisle || null;
      // An empty aisle name means "the ones with no aisle": mark it so
      // PICK_PRODUCT does not send us straight back here.
      if (!aisle) s.ctx.aisle = NO_AISLE;
      return go(s, STATES.PICK_PRODUCT);
    },
  },

  [STATES.PICK_SIZE]: {
    enter(s, intro) {
      const product = db.getProduct(s.ctx.pending?.productId);
      if (!product) return go(s, STATES.PICK_PRODUCT, intro);
      const variants = catalogue.variantsOf(product);
      if (!variants.length) return go(s, STATES.PICK_PRODUCT, join(intro, tr(s, 'outOfStock', { product: productName(product, s.locale) })));
      const options = variants.map((v) => ({
        id: `size:${v.sku}`,
        title: `${catalogue.variantLabel(v, s.locale)} · ${fmt(s, v.price)}`,
        description: catalogue.variantLabel(v, s.locale),
      }));
      // A photo makes the choice obvious for produce sold by heap.
      if (product.photo) s.out.push(M.image(s.phone, productPhotoUrl(product), productName(product, s.locale)));
      offer(s, join(intro, tr(s, 'pickSize', { product: productName(product, s.locale) })), options);
    },
    handle(s, input) {
      const id = pick(s, input);
      if (!id?.startsWith('size:')) return reprompt(s, tr(s, 'invalidChoice'));
      s.ctx.pending.size = id.slice(5);
      go(s, STATES.PICK_QTY);
    },
  },

  [STATES.PICK_QTY]: {
    enter(s, intro) {
      const { productId, size } = s.ctx.pending || {};
      const product = db.getProduct(productId);
      if (!product || !size) return go(s, STATES.PICK_PRODUCT, intro);
      const body = join(
        intro,
        tr(s, 'pickQty', {
          product: productName(product, s.locale),
          size: catalogue.variantLabel(catalogue.variantOf(product, size), s.locale),
        }),
        tr(s, 'qtyHint'),
      );
      offer(s, body, [1, 2, 3].map((n) => ({ id: `qty:${n}`, title: String(n) })));
    },
    handle(s, input) {
      let qty = null;
      if (input.replyId?.startsWith('qty:')) qty = Number(input.replyId.slice(4));
      else if (/^\d{1,3}$/.test(input.norm)) qty = Number(input.norm);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return reprompt(s, tr(s, 'invalidQty'));

      const { productId, size } = s.ctx.pending;
      const product = db.getProduct(productId);
      if (!product?.in_stock) {
        delete s.ctx.pending;
        return go(s, STATES.PICK_PRODUCT, tr(s, 'outOfStock', { product: product ? productName(product, s.locale) : '?' }));
      }
      s.ctx.pending.qty = qty;
      if (catalogue.extrasOf(product).length) return go(s, STATES.PICK_EXTRAS);
      addPending(s);
    },
  },

  // Optional add-ons ("préparé", "nettoyé"): tapping one toggles it, and the
  // customer confirms when the line is right.
  [STATES.PICK_EXTRAS]: {
    enter(s, intro) {
      const product = db.getProduct(s.ctx.pending?.productId);
      if (!product) return go(s, STATES.PICK_PRODUCT, intro);
      const chosen = s.ctx.pending.extras || [];
      const available = catalogue.extrasOf(product);
      const options = available.map((e) => ({
        id: `extra:${e.id}`,
        title: `${chosen.some((c) => c.id === e.id) ? '✅ ' : ''}${catalogue.extraLabel(e, s.locale)} +${fmt(s, e.price)}`,
      }));
      options.push({ id: 'extra:done', title: chosen.length ? tr(s, 'btnExtrasDone') : tr(s, 'btnExtrasNone') });
      const picked = chosen.length ? tr(s, 'extrasChosen', { items: catalogue.extrasLabel(chosen) }) : null;
      offer(s, join(intro, tr(s, 'pickExtras'), picked), options, { buttonLabel: tr(s, 'btnExtrasChoose') });
    },
    handle(s, input) {
      const id = pick(s, input);
      if (id === 'extra:done') return addPending(s);
      if (!id?.startsWith('extra:')) return reprompt(s, tr(s, 'invalidChoice'));
      const extraId = Number(id.slice(6));
      const product = db.getProduct(s.ctx.pending.productId);
      const extra = catalogue.extrasOf(product).find((e) => e.id === extraId);
      if (!extra) return reprompt(s, tr(s, 'invalidChoice'));
      const chosen = s.ctx.pending.extras || [];
      s.ctx.pending.extras = chosen.some((c) => c.id === extraId)
        ? chosen.filter((c) => c.id !== extraId)
        : [...chosen, { id: extra.id, label: catalogue.extraLabel(extra, s.locale), price: extra.price }];
      reprompt(s);
    },
  },

  [STATES.ADD_MORE]: {
    enter(s, intro) {
      // One suggestion, drawn from what this shop's customers actually buy
      // together. Never invented, never more than one: a nag is not a service.
      const inCart = [...new Set((s.ctx.cart || []).map((it) => it.productId))];
      const [suggestion] = db.boughtTogether(inCart, { limit: 1 });
      const options = [
        { id: 'more:add', title: tr(s, 'btnAddMore') },
        { id: 'more:checkout', title: tr(s, 'btnCheckout') },
        { id: 'more:edit', title: tr(s, 'btnEditCart') },
      ];
      if (suggestion) {
        options.unshift({ id: `p:${suggestion.id}`, title: productName(suggestion, s.locale) });
      }
      const nudge = suggestion
        ? tr(s, 'oftenWith', { product: productName(suggestion, s.locale) })
        : null;
      offer(s, join(intro, cartText(s), nudge, tr(s, 'addMorePrompt')), options);
    },
    handle(s, input) {
      const id = pick(s, input) || (isYes(input) ? 'more:add' : isNo(input) ? 'more:checkout' : null);
      // Tapping the suggestion goes straight to its size, skipping the catalogue.
      if (id?.startsWith('p:')) {
        const product = db.getProduct(Number(id.slice(2)));
        if (product?.in_stock) {
          s.ctx.pending = { productId: product.id };
          return go(s, STATES.PICK_SIZE);
        }
      }
      if (id === 'more:add') return go(s, STATES.PICK_PRODUCT);
      if (id === 'more:checkout') return goCheckout(s);
      if (id === 'more:edit') return go(s, STATES.EDIT_CART);
      if (input.nlu) return startUnderstoodOrder(s, input.nlu);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  [STATES.EDIT_CART]: {
    enter(s, intro) {
      const { lines } = cart.priceCart(s.ctx.cart || []);
      if (!lines.length) {
        s.ctx.cart = [];
        return go(s, STATES.PICK_PRODUCT, join(intro, tr(s, 'cartEmpty')));
      }
      const options = lines.map((l) => ({
        id: `rm:${l.productId}:${l.size}`,
        title: tr(s, 'removeItem', {
          item: `${productName(l.product, s.locale)} ${catalogue.variantLabel(l.variant, s.locale)}`,
        }),
        description: `× ${l.qty} — ${fmt(s, l.lineTotal)}`,
      }));
      options.push({ id: 'edit:add', title: tr(s, 'btnEditAdd') }, { id: 'edit:done', title: tr(s, 'btnEditDone') });
      offer(s, join(intro, tr(s, 'editCartPrompt')), options);
    },
    handle(s, input) {
      const id = pick(s, input);
      if (id?.startsWith('rm:')) {
        const [, productId, size] = id.split(':');
        const line = (s.ctx.cart || []).find((i) => i.productId === Number(productId) && i.size === size);
        s.ctx.cart = cart.removeItem(s.ctx.cart || [], Number(productId), size);
        const product = db.getProduct(Number(productId));
        const removed = line && product
          ? tr(s, 'itemRemoved', { item: cart.describeItem(s.locale, product, size, line.qty, line.extras || []) })
          : null;
        return go(s, STATES.EDIT_CART, removed);
      }
      if (id === 'edit:add') return go(s, STATES.PICK_PRODUCT);
      if (id === 'edit:done') return s.ctx.delivery ? go(s, STATES.RECAP) : go(s, STATES.ADD_MORE);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  [STATES.CONFIRM_ADDRESS]: {
    enter(s, intro) {
      const c = s.customer;
      offer(s, join(intro, tr(s, 'confirmAddress', { name: c.name, zone: c.neighborhood, note: c.address_note })), [
        { id: 'addr:yes', title: tr(s, 'btnYes') },
        { id: 'addr:change', title: tr(s, 'btnChangeAddress') },
      ]);
    },
    handle(s, input) {
      if (input.location) {
        if (applyDetectedLocation(s, input, s.customer.name)) return;
        return reprompt(s, locationProblem(s, input));
      }
      const id = pick(s, input) || (isYes(input) ? 'addr:yes' : isNo(input) ? 'addr:change' : null);
      if (id === 'addr:yes') {
        const c = s.customer;
        s.ctx.delivery = { name: c.name, zone: c.neighborhood, note: c.address_note };
        return go(s, STATES.RECAP);
      }
      if (id === 'addr:change') return go(s, STATES.ASK_NAME);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  [STATES.ASK_NAME]: {
    enter(s, intro) {
      const suggestion = s.customer.name || s.ctx.profileName;
      if (suggestion) {
        return offer(s, join(intro, tr(s, 'askName'), tr(s, 'askNameKeep')), [{ id: 'name:keep', title: suggestion }]);
      }
      ask(s, join(intro, tr(s, 'askName')));
    },
    handle(s, input) {
      let name = null;
      if (input.replyId === 'name:keep') name = s.customer.name || s.ctx.profileName;
      else if (!input.replyId && input.type === 'text') name = input.raw.replace(/\s+/g, ' ');
      if (!name || name.length < 2 || name.length > 60) return reprompt(s, tr(s, 'invalidName'));
      s.ctx.draft = { name };
      go(s, STATES.ASK_ZONE);
    },
  },

  [STATES.ASK_ZONE]: {
    enter(s, intro) {
      const zones = servedZones();
      const options = zones.map((z, i) => ({
        id: `zone:${i}`,
        title: z.name,
        description: z.fee ? tr(s, 'zoneFee', { amount: fmt(s, z.fee) }) : tr(s, 'zoneFeeFree'),
      }));
      options.push({ id: 'zone:other', title: tr(s, 'zoneOther') });
      // Reply buttons carry no description, so spell the fees out when they differ.
      const varyingFees = new Set(zones.map((z) => z.fee)).size > 1;
      const feeLines = varyingFees
        ? tr(s, 'zoneFeeList', {
          lines: zones.map((z) => `• ${z.name} — ${z.fee ? fmt(s, z.fee) : tr(s, 'zoneFeeFree')}`).join('\n'),
        })
        : null;
      offer(s, join(intro, tr(s, 'askZone'), feeLines), options, { buttonLabel: tr(s, 'zoneButton') });
    },
    handle(s, input) {
      if (input.location) {
        if (applyDetectedLocation(s, input, s.ctx.draft?.name || s.customer.name)) return;
        return reprompt(s, locationProblem(s, input));
      }
      const id = pick(s, input);
      if (id?.startsWith('zone:') && id !== 'zone:other') {
        s.ctx.draft = { ...(s.ctx.draft || { name: s.customer.name }), zone: servedZones()[Number(id.slice(5))]?.name };
        return go(s, STATES.ASK_ADDRESS);
      }
      const typed = id === 'zone:other' || input.type !== 'text' ? null : input.raw;
      reprompt(s, tr(s, 'zoneNotServed', { zone: typed, zones: zoneNames().join(', ') }));
    },
  },

  [STATES.ASK_ADDRESS]: {
    enter(s, intro) {
      const c = s.customer;
      if (c.address_note && s.ctx.draft && normalize(c.neighborhood) === normalize(s.ctx.draft.zone)) {
        return offer(s, join(intro, tr(s, 'askAddress')), [{ id: 'addr:same', title: tr(s, 'btnSameAddress') }]);
      }
      ask(s, join(intro, tr(s, 'askAddress')));
    },
    handle(s, input) {
      let note = null;
      if (input.replyId === 'addr:same') note = s.customer.address_note;
      else if (input.location) {
        if (input.geo?.zone) s.ctx.draft = { ...s.ctx.draft, zone: input.geo.zone };
        note = formatLocation({ ...input.location, name: input.location.name || input.geo?.place });
      }
      else if (!input.replyId && input.type === 'text' && input.raw.length >= 3) note = input.raw.slice(0, 300);
      if (!note) return reprompt(s, tr(s, 'invalidAddress'));

      const draft = s.ctx.draft || {};
      const delivery = { name: draft.name || s.customer.name, zone: draft.zone, note };
      if (!delivery.name || !delivery.zone) return go(s, STATES.ASK_NAME);
      s.customer = db.updateCustomer(s.customer.id, { name: delivery.name, neighborhood: delivery.zone, address_note: note });
      s.ctx.delivery = delivery;
      delete s.ctx.draft;
      goSlot(s);
    },
  },

  // "Quand souhaitez-vous être livré ?" — only windows that are still bookable.
  [STATES.PICK_SLOT]: {
    enter(s, intro) {
      const options = slots.available().map((a, i) => ({
        id: `slot:${i}`,
        title: `${tr(s, `slotWhen.${a.when}`)} · ${slots.slotLabel(a.slot, s.locale)}`,
        description: a.left !== null ? tr(s, 'slotLeft', { n: a.left }) : `${a.slot.start_time}–${a.slot.end_time}`,
      }));
      if (!options.length) return go(s, STATES.RECAP, intro);
      s.ctx.slotChoices = slots.available().map((a) => ({ id: a.slot.id, day: a.day, when: a.when }));
      offer(s, join(intro, tr(s, 'askSlot')), options, { buttonLabel: tr(s, 'slotButton') });
    },
    handle(s, input) {
      const id = pick(s, input);
      if (!id?.startsWith('slot:')) return reprompt(s, tr(s, 'invalidChoice'));
      const choice = (s.ctx.slotChoices || [])[Number(id.slice(5))];
      if (!choice) return reprompt(s, tr(s, 'invalidChoice'));
      if (!slots.stillFree(choice.id, choice.day)) return reprompt(s, tr(s, 'slotFull'));
      const slot = db.getSlot(choice.id);
      s.ctx.slot = {
        id: slot.id,
        day: choice.day,
        label: `${tr(s, `slotWhen.${choice.when}`)} · ${slots.slotLabel(slot, s.locale)}`,
      };
      delete s.ctx.slotChoices;
      go(s, STATES.RECAP);
    },
  },

  [STATES.RECAP]: {
    enter(s, intro) {
      const priced = cart.priceCart(s.ctx.cart || []);
      let soldOut = null;
      if (priced.unavailable.length) {
        s.ctx.cart = priced.lines.map((l) => ({ productId: l.productId, size: l.size, qty: l.qty }));
        const names = priced.unavailable.map((u) => (u.product ? productName(u.product, s.locale) : '?'));
        soldOut = tr(s, 'itemsRemovedOOS', { items: [...new Set(names)].join(', ') });
      }
      if (!priced.lines.length) return go(s, STATES.PICK_PRODUCT, join(intro, soldOut, tr(s, 'cartEmpty')));
      if (!s.ctx.delivery || !isServedZone(s.ctx.delivery.zone)) return go(s, STATES.ASK_NAME, join(intro, soldOut));

      // Credit from an order being merged is refunded on confirmation, so count it now.
      const merged = s.ctx.replacesOrderId ? db.getOrder(s.ctx.replacesOrderId) : null;
      const credit = s.customer.credit + (merged?.status === 'awaiting_payment' ? merged.discount : 0);
      const minOrder = settings.get().minOrder;
      if (minOrder > 0 && priced.subtotal < minOrder) {
        return go(s, STATES.PICK_PRODUCT, join(intro, soldOut, tr(s, 'minOrderNotReached', { amount: fmt(s, minOrder) })));
      }
      const { totals, coupon } = priceFor(s, priced, credit);
      const d = s.ctx.delivery;
      const lines = [
        tr(s, 'recapTitle'),
        ...priced.lines.map((l) => `• ${cart.describeItem(s.locale, l.product, l.size, l.qty, l.extras)} — ${fmt(s, l.lineTotal)}`),
        RULE,
        tr(s, 'subtotalLine', { amount: fmt(s, totals.subtotal) }),
        totals.deliveryFee ? tr(s, 'deliveryFeeLine', { amount: fmt(s, totals.deliveryFee) }) : null,
        tierPerk(s, totals),
        coupon ? tr(s, 'couponLine', { code: coupon.code, amount: fmt(s, totals.couponDiscount) }) : null,
        totals.discount ? tr(s, 'discountLine', { amount: fmt(s, totals.discount) }) : null,
        tr(s, 'totalLine', { amount: fmt(s, totals.total) }),
        RULE,
        tr(s, 'deliveryTo', { name: d.name, zone: d.zone, note: d.note }),
        s.ctx.slot ? tr(s, 'deliverySlotLine', { slot: s.ctx.slot.label }) : null,
      ].filter((l) => l !== null);
      const options = [
        { id: 'recap:confirm', title: tr(s, 'btnConfirm') },
        { id: 'recap:edit', title: tr(s, 'btnModify') },
      ];
      if (!coupon && db.listCoupons().some((c) => c.active)) options.push({ id: 'recap:coupon', title: tr(s, 'btnCoupon') });
      options.push({ id: 'recap:cancel', title: tr(s, 'btnCancel') });
      offer(s, join(intro, soldOut, lines.join('\n'), tr(s, 'recapPrompt')), options);
    },
    handle(s, input) {
      const id = pick(s, input) || (isYes(input) ? 'recap:confirm' : null);
      if (id === 'recap:confirm') return goPayment(s);
      if (id === 'recap:edit') return go(s, STATES.EDIT_CART);
      if (id === 'recap:coupon') return go(s, STATES.ASK_COUPON);
      if (id === 'recap:cancel') return cancelFlow(s);
      reprompt(s, tr(s, 'invalidChoice'));
    },
  },

  // "🎟️ J'ai un code promo" — one code per order, re-checked when the order is placed.
  [STATES.ASK_COUPON]: {
    enter(s, intro) {
      offer(s, join(intro, tr(s, 'askCoupon')), [{ id: 'coupon:skip', title: tr(s, 'btnSkipCoupon') }]);
    },
    handle(s, input) {
      if (pick(s, input) === 'coupon:skip') return go(s, STATES.RECAP);
      const code = coupons.normalizeCode(input.type === 'text' ? input.raw : '');
      if (!code) return reprompt(s, tr(s, 'invalidChoice'));
      const priced = cart.priceCart(s.ctx.cart || []);
      const result = coupons.evaluate(code, {
        customer: s.customer,
        subtotal: priced.subtotal,
        deliveryFee: deliveryFeeFor(s.ctx.delivery?.zone, s.customer),
      });
      if (!result.ok) {
        return reprompt(s, tr(s, `couponRejected.${result.reason}`, { code, min: fmt(s, result.min || 0) }));
      }
      s.ctx.coupon = result.coupon.code;
      go(s, STATES.RECAP, tr(s, 'couponApplied', { code: result.coupon.code, amount: fmt(s, result.discount) }));
    },
  },

  [STATES.PICK_PAYMENT]: {
    enter(s, intro) {
      offer(s, join(intro, tr(s, 'askPayment')), [
        { id: 'pay:momo', title: tr(s, 'btnPayMomo') },
        { id: 'pay:cash', title: tr(s, 'btnPayCash') },
        { id: 'pay:back', title: tr(s, 'btnModify') },
      ]);
    },
    handle(s, input) {
      const id = pick(s, input);
      if (id === 'pay:back') return go(s, STATES.RECAP);
      if (id !== 'pay:momo' && id !== 'pay:cash') return reprompt(s, tr(s, 'invalidChoice'));
      s.ctx.payment = id.slice(4);
      confirmOrder(s);
    },
  },

  [STATES.AWAIT_PROOF]: {
    enter(s, intro) {
      const order = db.getOrder(s.ctx.orderId);
      if (!order || order.status !== 'awaiting_payment') return greetAndMenu(s, intro);
      const { momoOrange, momoAirtel, momoHolder } = settings.get();
      ask(
        s,
        join(
          intro,
          tr(s, 'paymentInstructions', {
            ref: order.reference,
            total: fmt(s, order.total),
            orange: momoOrange,
            airtel: momoAirtel,
            holder: momoHolder,
          }),
        ),
      );
    },
    handle(s, input) {
      if (isProofMedia(input)) return receiveProof(s, s.ctx.orderId, input.mediaId);
      // A menu button from an earlier message: let the customer move on. The order stays
      // awaiting payment and a screenshot sent later is still attached to it.
      if (input.replyId?.startsWith('menu:')) return idle.handle(s, input);
      ask(s, tr(s, 'awaitingProof'));
    },
  },

  // "J'ai compris : 2 × Moyen tas Tomate... C'est correct ?" Nothing is added before the customer says yes.
  [STATES.NLU_CONFIRM]: {
    enter(s, intro) {
      const items = (s.ctx.nluItems || []).map((it) => ({ ...it, product: db.getProduct(it.productId) })).filter((it) => it.product);
      if (!items.length) {
        const missing = s.ctx.nluUnknown?.length ? tr(s, 'nluUnknown', { items: s.ctx.nluUnknown.join(', ') }) : null;
        delete s.ctx.nluItems;
        delete s.ctx.nluUnknown;
        return go(s, STATES.PICK_PRODUCT, join(intro, missing));
      }
      const lines = items.map((it) => `• ${cart.describeItem(s.locale, it.product, it.size, it.qty)} — ${fmt(s, cart.priceOf(it.product, it.size) * it.qty)}`);
      const unknown = s.ctx.nluUnknown?.length ? tr(s, 'nluUnknown', { items: s.ctx.nluUnknown.join(', ') }) : null;
      offer(s, join(intro, `${tr(s, 'nluUnderstood')}\n${lines.join('\n')}`, unknown, tr(s, 'nluConfirm')), [
        { id: 'nlu:yes', title: tr(s, 'btnYes') },
        { id: 'nlu:no', title: tr(s, 'btnNluChoose') },
      ]);
    },
    handle(s, input) {
      if (input.nlu) return startUnderstoodOrder(s, input.nlu); // the customer corrected the order in words
      const id = pick(s, input) || (isYes(input) ? 'nlu:yes' : isNo(input) ? 'nlu:no' : null);
      if (id === 'nlu:no') {
        delete s.ctx.nluItems;
        delete s.ctx.nluUnknown;
        return go(s, STATES.PICK_PRODUCT);
      }
      if (id !== 'nlu:yes') return reprompt(s, tr(s, 'invalidChoice'));
      const added = [];
      const soldOut = [];
      for (const it of s.ctx.nluItems || []) {
        const product = db.getProduct(it.productId);
        if (!product?.in_stock) {
          if (product) soldOut.push(productName(product, s.locale));
          continue;
        }
        s.ctx.cart = cart.addItem(s.ctx.cart || [], product.id, it.size, it.qty);
        added.push(cart.describeItem(s.locale, product, it.size, it.qty));
      }
      delete s.ctx.nluItems;
      delete s.ctx.nluUnknown;
      const note = soldOut.length ? tr(s, 'itemsRemovedOOS', { items: soldOut.join(', ') }) : null;
      if (!added.length) return go(s, STATES.PICK_PRODUCT, note);
      go(s, STATES.ADD_MORE, join(note, added.map((item) => tr(s, 'added', { item })).join('\n')));
    },
  },

  // A person from the shop is answering from the dashboard: the bot stays silent.
  // "menu" or "annuler" (handled as keywords) hand the conversation back to the bot.
  [STATES.HUMAN]: {
    enter(s, intro) {
      if (intro) say(s, intro);
    },
    handle() {},
  },

  [STATES.RATING]: {
    enter(s, intro) {
      const order = db.getOrder(s.ctx.ratingOrderId);
      if (!order) return greetAndMenu(s, intro);
      if (intro) say(s, intro);
      s.ctx.options = [];
      s.out.push(surveyMessage(s.phone, s.locale, order));
    },
    handle(s, input) {
      let rating = null;
      if (input.replyId?.startsWith('rate:')) rating = Number(input.replyId.slice(5));
      else if (/^[1-5]$/.test(input.norm)) rating = Number(input.norm);
      const order = db.getOrder(s.ctx.ratingOrderId);
      if (!rating || !order) {
        // Not a rating: do not trap the customer, handle it as a fresh conversation.
        s.state = STATES.DONE;
        return idle.handle(s, input);
      }
      db.setOrderRating(order.id, rating);
      s.state = STATES.DONE;
      s.ctx = {};
      say(s, tr(s, rating >= 4 ? 'thanksGood' : 'thanksBad'));
      if (rating <= 3) {
        const c = s.customer;
        s.tasks.push(() =>
          notifyAdmin(t(DEFAULT_LOCALE, 'adminBadRating', { rating, ref: order.reference, name: c.name || '?', phone: c.phone }), [
            order.reference,
            `${rating}/5`,
          ]),
        );
      }
    },
  },
};
