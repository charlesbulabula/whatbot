// English copy. Keys must stay in sync with fr.js (checked by test/i18n.test.js).
export default {
  localeLabel: '🇬🇧 English',

  welcomeNew: (p) => `Hello and welcome to *${p.shop}* 👋\nFresh spices and vegetables delivered to your door in Kinshasa.`,
  welcomeBack: (p) => (p.name ? `Welcome back ${p.name} 👋` : 'Welcome back 👋'),
  creditBalance: (p) => `💰 You have *${p.amount}* of credit, applied automatically to your next order.`,
  menuPrompt: 'What would you like to do?',
  menuLastOrder: (p) => `Your last order: ${p.items}`,
  menuFooter: 'Type "help" at any time',
  btnOrder: '🛒 Order',
  btnReorder: '🔁 Same order',
  languageSet: 'Got it, I will speak English 🇬🇧',
  help: (p) =>
    `*How it works*\n` +
    `1. Choose your products and heap size\n` +
    `2. Give your delivery address\n` +
    `3. Pay by mobile money and send the screenshot\n\n` +
    `*Useful words*\n` +
    `• *menu*: back to the start\n` +
    `• *cancel*: cancel the current order\n` +
    `• *français*: passer en français\n` +
    `• *agent*: talk to a person\n` +
    `• *stop*: no more reminders\n\n` +
    `Delivery areas: ${p.zones}`,
  cancelled: 'Order cancelled. Type *menu* whenever you want to start again.',
  invalidChoice: 'Sorry, I did not understand 🙏 Please pick an option below.',
  thanksReply: 'You are welcome 🙏',
  replyWithNumber: 'Reply with the number of your choice.',
  listButton: 'Choose',
  error: 'Oops, something went wrong on our side. Type *menu* to start again.',
  voiceNotSupported: 'I cannot listen to voice notes yet 🙏 Please use the buttons or type your answer.',
  unsupportedMessage: 'I cannot read this kind of message. Please use the buttons or type your answer.',

  pickProduct: 'Here are today’s products. Pick one:',
  catalogButton: 'See catalogue',
  catalogHeaderLine: '🧺 Today’s stall',
  pickAisle: 'Which aisle would you like to start with?',
  oftenWith: (p) => `💡 Often bought with: *${p.product}*`,
  aisleCount: (p) => `${p.n} product${p.n > 1 ? 's' : ''}`,
  aisleOther: 'Other products',
  btnAllAisles: '↩️ All aisles',
  priceRange: (p) => `${p.from} to ${p.to}`,
  btnCheckoutCart: '✅ Checkout',
  noProducts: 'Sorry, everything is sold out right now. Please come back a bit later 🙏',
  outOfStock: (p) => `Sorry, *${p.product}* just sold out.`,

  sizes: { small: 'Small heap', medium: 'Medium heap', large: 'Large heap' },
  sizesShort: { small: 'Small', medium: 'Medium', large: 'Large' },
  pickSize: (p) => `${p.product}: which heap size?`,
  pickQty: (p) => `How many *${p.size}* of ${p.product}?`,
  qtyHint: 'Or type a number (1 to 20).',
  invalidQty: 'Please give a number between 1 and 20.',
  added: (p) => `✅ Added: ${p.item}`,

  nluUnderstood: 'Here is what I understood:',
  nluConfirm: 'Is that right?',
  nluUnknown: (p) => `Not in our catalogue: ${p.items}.`,
  btnNluChoose: '✏️ I will choose',
  cartTitle: '🧺 *Your cart*',
  subtotalLine: (p) => `Subtotal: *${p.amount}*`,
  addMorePrompt: 'Would you like anything else?',
  btnAddMore: '➕ Add more',
  btnCheckout: '✅ Checkout',
  btnEditCart: '✏️ Edit',
  editCartPrompt: 'Tap an item to remove it:',
  removeItem: (p) => `➖ ${p.item}`,
  btnEditAdd: '➕ Add a product',
  btnEditDone: '✅ Continue',
  itemRemoved: (p) => `Removed: ${p.item}`,
  cartEmpty: 'Your cart is empty.',

  confirmAddress: (p) => `Deliver to *${p.name}*, ${p.zone}${p.note ? ` (${p.note})` : ''}?`,
  btnYes: '✅ Yes',
  btnChangeAddress: '📍 Change',
  askName: 'Whose name should the order be delivered to?',
  askNameKeep: 'Tap the button to keep this name, or type another one.',
  invalidName: 'Please type a name (2 to 60 characters).',
  askZone: 'Which area should we deliver to?\nYou can also share your location 📍',
  zoneButton: 'Areas',
  zoneOther: 'Other area',
  zoneNotServed: (p) =>
    `Sorry, we do not deliver ${p.zone ? `to *${p.zone}*` : 'to that area'} yet 🙏\nAreas we serve: ${p.zones}.`,
  zoneDetected: (p) => `📍 Location received: *${p.zone}*.`,
  zoneNotDetected: 'I could not recognise the area of this location 🙏 Please pick it from the list.',
  askAddress: 'Please give the address: street, number and a landmark.\nYou can also share your location 📍',
  btnSameAddress: '🏠 Same address',
  invalidAddress: 'Please give an address (at least 3 characters) or share your location.',

  recapTitle: '🧾 *Summary*',
  deliveryTo: (p) => `📍 ${p.name} — ${p.zone}${p.note ? `\n${p.note}` : ''}`,
  deliveryFeeLine: (p) => `Delivery: ${p.amount}`,
  discountLine: (p) => `Credit used: −${p.amount}`,
  totalLine: (p) => `*Total: ${p.amount}*`,
  recapPrompt: 'Shall we confirm?',
  btnConfirm: '✅ Confirm',
  btnModify: '✏️ Edit',
  btnCancel: '❌ Cancel',
  itemsRemovedOOS: (p) => `⚠️ Removed from your cart because sold out: ${p.items}`,

  paymentInstructions: (p) =>
    `Thank you! Order *${p.ref}* is registered 🙌\n\n` +
    `Please send *${p.total}* by mobile money:\n` +
    (p.orange ? `• Orange Money: *${p.orange}*\n` : '') +
    (p.airtel ? `• Airtel Money: *${p.airtel}*\n` : '') +
    (p.holder ? `Account name: ${p.holder}\n` : '') +
    `Reference: ${p.ref}\n\n` +
    `Then send me the payment *screenshot* here 📸`,
  awaitingProof: 'I am waiting for your payment screenshot 📸\nType *menu* to go back to the menu (the order stays pending) or *cancel* to cancel it.',
  proofReceived: (p) =>
    `📸 Screenshot received, thank you! We are checking the payment for order *${p.ref}* and will confirm shortly.`,
  paidByCredit: (p) => `🎉 Order *${p.ref}* is fully paid with your credit. We are preparing it!`,

  duplicateFound: (p) => `You already have an order today: *${p.ref}* (${p.status}).`,
  duplicateMergeHint: 'You can add products to it (single payment) or create a new one.',
  btnDupMerge: '➕ Add to it',
  btnDupNew: '🆕 New order',
  btnBack: '↩️ Back',
  mergeIntro: (p) => `Your cart now holds order ${p.ref}. Add what you need:`,
  reorderMissing: (p) => `⚠️ Not available today: ${p.items}`,

  capacityFull: 'Our stock for this week is fully booked 😔\nWould you like to be notified first when orders reopen?',
  btnWaitYes: '🔔 Notify me',
  btnWaitNo: 'No thanks',
  waitlistJoined: 'Done! You will be notified first 🔔',
  okNoProblem: 'No problem. Type *menu* whenever you like.',

  optedOut: 'You will no longer receive reminders or promotions. Type *subscribe* to turn them back on.',
  optedIn: 'Done, you will receive our reminders again 🔔',

  referralApplied: (p) => `🎁 Referral code accepted! *${p.amount}* of credit on your first order.`,
  referralShare: (p) =>
    `🎁 *Refer your friends!*\nYour code: *${p.code}*\n` +
    `Every friend who orders with this code gets ${p.amount} of credit, and so do you.` +
    (p.link ? `\nLink to share: ${p.link}` : ''),
  referralShareText: (p) => `Hello! My referral code: ${p.code}`,
  referralRewardEarned: (p) => `🎉 A friend ordered with your code: *${p.amount}* of credit added to your account!`,
  loyaltyRewardEarned: (p) =>
    `🎉 Thank you for your loyalty! This is your order #${p.count}: *${p.amount}* of credit for next time.`,

  customerFallbackName: 'dear customer',
  handoffStarted: 'Sure, I am letting the team know 🙋 Someone will answer you here as soon as possible.\nType *menu* to go back to the bot.',
  handoffEnded: 'The team has answered you. Type *menu* whenever you want to order 🙂',
  cartReminder: 'Still there? Your order is waiting for you 🙂',

  surveyPrompt: (p) => `How did order *${p.ref}* go? Please rate it from 1 to 5 ⭐`,
  ratingButton: 'Rate',
  thanksGood: 'Thank you so much for your rating ⭐ See you soon!',
  thanksBad: 'Thank you for your feedback, and sorry it was not perfect. We will get back to you shortly.',

  status: {
    awaiting_payment: 'awaiting payment',
    paid: 'paid',
    preparing: 'being prepared',
    on_the_way: 'out for delivery',
    delivered: 'delivered',
    cancelled: 'cancelled',
  },
  statusPaid: (p) => `✅ Payment received for order *${p.ref}*. Thank you!`,
  statusPreparing: (p) => `👩‍🍳 Your order *${p.ref}* is being prepared.`,
  statusOnTheWay: (p) => `🛵 Your rider is on the way${p.eta ? `, estimated arrival *${p.eta}*` : ''} (order ${p.ref}).`,
  statusDelivered: (p) => `📦 Order *${p.ref}* delivered. Enjoy!`,
  statusCancelled: (p) => `Your order *${p.ref}* has been cancelled. Message us if you have any question.`,

  weeklyReminder: (p) =>
    `Hello${p.name ? ` ${p.name}` : ''}! Time to restock your spices soon 🌶️\nType *menu* to order.`,
  waitlistOpen: (p) => `Good news${p.name ? ` ${p.name}` : ''} 🎉 Orders are open again! Type *menu* to order.`,

  adminProof: (p) => `🧾 Payment proof received\n${p.ref} — ${p.total}\n${p.name}, ${p.zone}\n${p.url}`,
  adminPaidByCredit: (p) => `🎁 Order paid with credit\n${p.ref}\n${p.name}, ${p.zone}\n${p.url}`,
  adminHandoff: (p) => `🙋 ${p.name} (+${p.phone}) asks to talk to someone\n${p.url}`,
  btnAdmValidate: '✅ Confirm payment',
  admValidated: (p) => `✅ Payment confirmed: *${p.ref}* — ${p.total}\n${p.name} has been told.`,
  admAlready: (p) => `ℹ️ *${p.ref}* is no longer waiting: ${p.status}.`,
  admUnknownOrder: 'Order not found. Reply *ok* followed by the reference, or tap the button on the alert.',
  adminPaidBy: (p) => `✅ Payment confirmed by *${p.by}*\n${p.ref} — ${p.total}\n${p.name}`,
  adminBadRating: (p) => `⚠️ Rating ${p.rating}/5 on ${p.ref} (${p.name}, +${p.phone})`,

  /* ------------------------- opening hours ----------------------------- */
  weekdays: {
    0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday',
  },
  shopClosed: 'We are closed right now 🙏',
  closedUntilToday: (p) => `We reopen today at *${p.time}*.`,
  closedUntilTomorrow: (p) => `We reopen tomorrow at *${p.time}*.`,
  closedUntilDay: (p) => `We reopen on ${p.day} at *${p.time}*.`,
  minOrderNotReached: (p) => `The minimum order is *${p.amount}*. Add one more item 🙂`,

  /* ------------------------ delivery areas ----------------------------- */
  zoneFee: (p) => `Delivery ${p.amount}`,
  zoneFeeList: (p) => `Delivery fees:\n${p.lines}`,
  zoneFeeFree: 'Free delivery',
  deliveryAnswer: (p) => `We deliver to these areas 🛵\n${p.lines}`,
  openNow: (p) => `We are open ✅ Today from *${p.open}* to *${p.close}*.`,
  openAlways: 'We are open ✅',

  /* --------------------------- coupons --------------------------------- */
  btnCoupon: '🎟️ Promo code',
  btnSkipCoupon: '← Back',
  askCoupon: 'Send your promo code:',
  couponApplied: (p) => `🎟️ Code *${p.code}* applied: −${p.amount}`,
  couponLine: (p) => `Code ${p.code}: −${p.amount}`,
  couponRejected: {
    unknown: (p) => `Code *${p.code}* does not exist. Check the spelling or go back.`,
    inactive: (p) => `Code *${p.code}* is no longer active.`,
    expired: (p) => `Code *${p.code}* has expired.`,
    exhausted: (p) => `Code *${p.code}* has reached its usage limit.`,
    used: (p) => `You have already used code *${p.code}*.`,
    min: (p) => `This code applies from ${p.min} of order value.`,
  },

  /* ------------------------ payment method ----------------------------- */
  askPayment: 'How would you like to pay?',
  btnPayMomo: '📱 Mobile money',
  btnPayCash: '💵 Cash on delivery',
  cashConfirmed: (p) =>
    `✅ Order *${p.ref}* placed!\nYou will pay *${p.total}* in cash on delivery.\n` +
    `Please have the exact amount ready if you can 🙏 We will confirm when the rider leaves.`,
  adminCashOrder: (p) => `💵 Cash-on-delivery order\n${p.ref} — ${p.total}\n${p.name}, ${p.zone}\n${p.url}`,


  /* --------------------------- daily report ---------------------------- */
  reportSubject: 'Daily summary',
  reportOrders: 'Orders',
  reportRevenue: 'Revenue collected',
  reportToCheck: 'Payments to check',
  reportCash: 'Cash to collect',
  reportShopping: 'To buy / prepare:',
  reportNothing: 'nothing for today',


  /* --------------------------- variants & extras ------------------------ */
  pickExtras: 'Would you like an extra?',
  btnExtrasChoose: 'See the extras',
  btnExtrasDone: '✅ That’s it',
  btnExtrasNone: 'No thanks',
  extrasChosen: (p) => `Extras: ${p.items}`,

  /* ---------------------------- WhatsApp catalog ------------------------ */
  catalogHeader: 'Our catalogue',
  catalogBody: 'Pick your products, add them to the cart, then send it to us.',
  catalogFooter: 'Type "menu" to go back',
  cartReceived: 'Cart received 👍',


  /* --------------------------- delivery slots -------------------------- */
  askSlot: 'When would you like your delivery?',
  slotButton: 'Pick a slot',
  slotWhen: { today: 'Today', tomorrow: 'Tomorrow' },
  slotLeft: (p) => `${p.n} slot${p.n > 1 ? 's' : ''} left`,
  slotFull: 'That slot just filled up 🙏 Please pick another one.',
  deliverySlotLine: (p) => `🕒 Slot: *${p.slot}*`,


  /* ---------------------------- loyalty tiers -------------------------- */
  tiers: { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' },
  tierReached: (p) => `🎉 Congratulations, you reached the *${p.tier}* tier!\n${p.perk}`,
  tierPerkFree: 'Your delivery is now free on every order.',
  tierPerkOff: (p) => `You get ${p.pct} % off delivery.`,
  tierFreeDelivery: (p) => `🎁 Free delivery (${p.tier} tier)`,
  tierDeliveryOff: (p) => `🎁 −${p.pct} % on delivery (${p.tier} tier)`,

  /* ---------------------------- subscriptions -------------------------- */
  btnSubscribe: '🔄 Subscription',
  askSubscribeDay: 'Which day would you like your weekly delivery?',
  subscribeButton: 'Pick the day',
  subscribeNoOrder: 'Place an order first: your subscription will repeat that basket.',
  subscribeConfirm: (p) => `Every *${p.day}* I will prepare: ${p.items}\nIs that right?`,
  btnSubscribeYes: '✅ Yes, subscribe me',
  btnSubscribeNo: 'No thanks',
  subscribed: (p) => `🔄 Done! Every *${p.day}* your basket will be prepared automatically.\nType *stop subscription* to stop whenever you like.`,
  subscriptionExists: (p) => `You already had a subscription on *${p.day}*. It has been updated.`,
  subscriptionCancelled: 'Your subscription is stopped. You can start a new one any time.',
  subscriptionNone: 'You have no active subscription.',
  subscriptionOrder: (p) =>
    `🔄 Your subscription basket is ready: *${p.ref}*\n${p.items}\nTotal: *${p.total}*\n` +
    `Reply *cancel* if you do not want a delivery this week.`,
  weekdayNames: { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' },

  /* ------------------------------ win-back ----------------------------- */
  winback: (p) =>
    `Hello${p.name ? ` ${p.name}` : ''} 👋 It has been a while!\n` +
    `Here is *${p.amount}* off with the code *${p.code}*, valid for ${p.days} days.\nType *menu* to order.`,

  adminSubscriptionOrder: (p) => `🔄 Subscription order created\n${p.ref} — ${p.total}\n${p.name}, ${p.zone}\n${p.url}`,


  /* ---------------------------- delivery tracking ---------------------- */
  trackTitle: 'Delivery tracking',
  trackOrder: (p) => `Order ${p.ref}`,
  trackDelivered: 'Delivered. Thank you!',
  trackAddress: 'Area',
  trackSlot: 'Slot',
  trackEta: 'Estimated time',
  trackAway: 'Your rider is about {km} km away.',
  trackNoPosition: 'The rider has not shared their position yet.',
  trackUnknown: 'Invalid tracking link.',
  trackLink: (p) => `📍 Follow your rider live: ${p.url}`,

};
