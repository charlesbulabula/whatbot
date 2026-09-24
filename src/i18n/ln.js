// Lingala copy (Kinshasa). Technical words people actually use in Kinshasa are
// kept as they are said there ("mobile money", "code", "menu") rather than
// invented: the point is to be understood at first reading.
//
// Keys the shop owner sees (admin* alerts, the daily report) are deliberately
// absent: they fall back to the default locale, which is what the owner reads.
export default {
  localeLabel: '🇨🇩 Lingala',

  welcomeNew: (p) =>
    `Mbote mpe boyei malamu na *${p.shop}* 👋\nBiloko ya kolamba mpe ndunda ya sika, tokomemela yo na Kinshasa.`,
  welcomeBack: (p) => (p.name ? `Mbote lisusu ${p.name} 👋` : 'Mbote lisusu 👋'),
  creditBalance: (p) => `💰 Ozali na *${p.amount}* ya crédit, ekolongwa na commande na yo ya sima.`,
  menuPrompt: 'Olingi kosala nini ?',
  menuLastOrder: (p) => `Commande na yo ya suka : ${p.items}`,
  menuFooter: 'Koma « aide » tango nyonso',
  btnOrder: '🛒 Kosomba',
  btnReorder: '🔁 Commande wana kaka',
  languageSet: 'Malamu, nakolobaka na yo na Lingala 🇨🇩',
  help: (p) =>
    '*Ndenge esalemaka*\n'
    + '1. Pona biloko mpe monene ya mwa\n'
    + '2. Tinda adresse ya kokitisa\n'
    + '3. Futa na mobile money mpe tinda photo ya reçu\n\n'
    + '*Maloba ya ntina*\n'
    + '• *menu* : kozonga na ebandeli\n'
    + '• *annuler* : koboya commande ya sikoyo\n'
    + '• *français* : passer en français\n'
    + '• *agent* : koloba na moto\n'
    + '• *stop* : kozanga kozwa mesaje ya rappel\n\n'
    + `Bakartier oyo tokitisaka : ${p.zones}`,
  cancelled: 'Commande eboyami. Koma *menu* soki olingi kobanda lisusu.',
  invalidChoice: 'Nayoki te 🙏 Pona moko na kati ya oyo ezali awa.',
  thanksReply: 'Eloko te 🙏',
  replyWithNumber: 'Yanola na nimero ya oyo olingi.',
  listButton: 'Pona',
  error: 'Pardon, likambo esalemi epai na biso. Koma *menu* mpo kobanda lisusu.',
  voiceNotSupported: 'Nakoki naino koyoka mesaje ya mongongo te 🙏 Salela bouton to koma maloba na yo.',
  unsupportedMessage: 'Nakoki kotanga lolenge oyo ya mesaje te. Salela bouton to koma maloba na yo.',

  pickProduct: 'Tala biloko ya lelo. Pona moko :',
  catalogButton: 'Tala catalogue',
  catalogHeaderLine: '🧺 Biloko ya lelo',
  priceRange: (p) => `banda ${p.from} kino ${p.to}`,
  btnCheckoutCart: '✅ Kokokisa panier',
  noProducts: 'Pardon, biloko nyonso esili mpo na sikoyo. Zonga mwa moke 🙏',
  outOfStock: (p) => `Pardon, *${p.product}* esili sika.`,
  sizes: { small: 'Mwa moke', medium: 'Mwa ya kati', large: 'Mwa monene' },
  sizesShort: { small: 'Moke', medium: 'Kati', large: 'Monene' },
  pickSize: (p) => `Monene nini ya *${p.product}* olingi ?`,
  pickQty: (p) => `Mwa boni ya ${p.product} (${p.size}) ?`,
  qtyHint: 'Okoki mpe kokoma motango na yo.',
  invalidQty: 'Tinda motango ya solo, na kati ya 1 mpe 20.',
  added: (p) => `Ebakisami : ${p.item}`,

  nluUnderstood: (p) => `Nayoki : \n${p.items}`,
  nluConfirm: 'Ezali bongo ?',
  nluUnknown: (p) => `Nayebi te : ${p.items}`,
  btnNluChoose: 'Te, napona ngai moko',

  cartTitle: '🧺 *Panier na yo*',
  subtotalLine: (p) => `Motuya ya biloko : *${p.amount}*`,
  addMorePrompt: 'Olingi kobakisa eloko mosusu ?',
  btnAddMore: '➕ Kobakisa',
  btnCheckout: '✅ Kokokisa',
  btnEditCart: '✏️ Kobongisa panier',
  editCartPrompt: 'Eloko nini olingi kolongola ?',
  removeItem: (p) => `Longola ${p.item}`,
  btnEditAdd: '➕ Kobakisa mosusu',
  btnEditDone: '✅ Ezali malamu',
  itemRemoved: (p) => `Elongwe : ${p.item}`,
  cartEmpty: 'Panier na yo ezali mpamba.',

  confirmAddress: (p) => `Tokitisa epai ya *${p.name}*, ${p.zone} ?\n${p.note}`,
  btnYes: '✅ Iyo',
  btnChangeAddress: '📍 Adresse mosusu',
  askName: 'Na kombo ya nani tokitisa commande ?',
  askNameKeep: 'To pona kombo oyo :',
  invalidName: 'Tinda kombo ya solo (banzelo 2 na likolo).',
  askZone: 'Ozali na kartier nini ?',
  zoneButton: 'Pona kartier',
  zoneOther: 'Kartier mosusu',
  zoneNotServed: (p) =>
    `${p.zone ? `Pardon, tokitisaka te na *${p.zone}*.\n` : ''}Bakartier oyo tokitisaka : ${p.zones}`,
  zoneDetected: (p) => `📍 Namoni ozali na *${p.zone}*.`,
  zoneNotDetected: 'Nakoki koyeba kartier na yo te na esika oyo otindi. Pona na maboko.',
  askAddress: 'Lakisa adresse (balabala, nimero, esika ya koyeba).',
  btnSameAddress: '📍 Adresse wana kaka',
  invalidAddress: 'Tinda adresse ya solo (banzelo 3 na likolo).',

  recapTitle: '🧾 *Récapitulatif*',
  deliveryTo: (p) => `📍 Tokitisa epai ya *${p.name}*, ${p.zone}\n${p.note}`,
  deliveryFeeLine: (p) => `Kokitisa : ${p.amount}`,
  discountLine: (p) => `Crédit esalelami : −${p.amount}`,
  totalLine: (p) => `*Motuya nyonso : ${p.amount}*`,
  recapPrompt: 'Tokende na kofuta ?',
  btnConfirm: '✅ Ndima',
  btnModify: '✏️ Kobongisa',
  btnCancel: '❌ Koboya',
  itemsRemovedOOS: (p) => `Elongwe na panier (esili) : ${p.items}`,

  paymentInstructions: (p) =>
    `Commande *${p.ref}* ekomami ✅\n\n`
    + `Futa *${p.total}* na mobile money :\n`
    + `${p.orange ? `• Orange Money : *${p.orange}*\n` : ''}`
    + `${p.airtel ? `• Airtel Money : *${p.airtel}*\n` : ''}`
    + `${p.holder ? `Kombo ya compte : ${p.holder}\n` : ''}`
    + '\nSima, tinda photo ya reçu awa 📸',
  awaitingProof: 'Nazali kozela photo ya reçu 📸',
  proofReceived: (p) => `Photo ezwami ✅ Tokotala mpe tokoyebisa yo mpo na commande *${p.ref}*.`,
  paidByCredit: (p) => `✅ Commande *${p.ref}* efutami na crédit na yo. Matondi !`,

  duplicateFound: (p) => `Ozali na commande ya lelo oyo efutami naino te : *${p.ref}* (${p.items}).`,
  duplicateMergeHint: 'Olingi kobakisa na yango, to kosala commande ya sika ?',
  btnDupMerge: '➕ Bakisa na yango',
  btnDupNew: '🆕 Commande ya sika',
  btnBack: '← Zonga',
  mergeIntro: (p) => `Malamu, tozali kobakisa na commande *${p.ref}*.`,
  reorderMissing: (p) => `Elongwe (esili) : ${p.items}`,

  capacityFull: 'Commande ya poso oyo etondi 🙏 Olingi koyebisa yo tango place ekozala ?',
  btnWaitYes: '✅ Iyo, yebisa ngai',
  btnWaitNo: 'Te, matondi',
  waitlistJoined: 'Okomami na liste. Tokoyebisa yo tango place ekozala 🙏',
  okNoProblem: 'Malamu, likambo te.',
  optedOut: 'Okozwa lisusu mesaje ya rappel te. Koma *abonner* soki olingi kozonga.',
  optedIn: 'Okozwa lisusu mesaje na biso. Matondi !',

  referralApplied: (p) => `🎁 Code ya parrainage endimami : ozwi *${p.amount}* ya crédit.`,
  referralShare: (p) =>
    `🎁 Code na yo ya parrainage : *${p.code}*\n`
    + `Pesa yango na baninga : bino mibale bokozwa *${p.amount}* ya crédit.`
    + `${p.link ? `\n${p.link}` : ''}`,
  referralShareText: (p) => `Mbote ! Salela code ${p.code} na commande na yo ya liboso.`,
  referralRewardEarned: (p) => `🎁 Moninga na yo asombi : ozwi *${p.amount}* ya crédit. Matondi !`,
  loyaltyRewardEarned: (p) => `🎁 Commande na yo ya ${p.count} ! Ozwi *${p.amount}* ya crédit.`,
  customerFallbackName: 'client',

  handoffStarted: 'Malamu, moto ya solo akoyanola yo mwa moke 🙏',
  handoffEnded: 'Tozongi na bot. Koma *menu* soki olingi kosomba.',
  cartReminder: 'Ozali naino awa ? Panier na yo ezali kozela yo 🙂',
  surveyPrompt: (p) => `Commande *${p.ref}* ekitisami. Ndenge nini esalemi ?`,
  ratingButton: 'Pesa note',
  thanksGood: 'Matondi mingi 🙏 Kino mbala mosusu !',
  thanksBad: 'Bolimbisi 🙏 Tokoyeba mpe tokobongisa. Koma soki olingi koloba na moto.',

  status: {
    awaiting_payment: 'ezali kozela mbongo',
    paid: 'efutami',
    preparing: 'ezali kolengelama',
    on_the_way: 'ezali na nzela',
    delivered: 'ekitisami',
    cancelled: 'eboyami',
  },
  statusPaid: (p) => `✅ Mbongo ezwami mpo na commande *${p.ref}*. Matondi !`,
  statusPreparing: (p) => `👩‍🍳 Commande na yo *${p.ref}* ezali kolengelama.`,
  statusOnTheWay: (p) => `🛵 Molengeli azali na nzela${p.eta ? `, akokoma na *${p.eta}*` : ''} (commande ${p.ref}).`,
  statusDelivered: (p) => `📦 Commande *${p.ref}* ekitisami. Bolia malamu !`,
  statusCancelled: (p) => `Commande na yo *${p.ref}* eboyami. Koma soki ozali na motuna.`,

  weeklyReminder: (p) =>
    `Mbote${p.name ? ` ${p.name}` : ''} ! Ekomi tango ya kotonda biloko ya kolamba 🌶️\nKoma *menu* mpo kosomba.`,
  waitlistOpen: (p) => `Nsango malamu${p.name ? ` ${p.name}` : ''} 🎉 Commande efungwami lisusu ! Koma *menu*.`,

  weekdays: {
    0: 'eyenga', 1: 'mokolo ya liboso', 2: 'mokolo ya mibale', 3: 'mokolo ya misato',
    4: 'mokolo ya minei', 5: 'mokolo ya mitano', 6: 'mokolo ya motoba',
  },
  shopClosed: 'Tofungwami te mpo na sikoyo 🙏',
  closedUntilToday: (p) => `Tokofungola lelo na *${p.time}*.`,
  closedUntilTomorrow: (p) => `Tokofungola lobi na *${p.time}*.`,
  closedUntilDay: (p) => `Tokofungola ${p.day} na *${p.time}*.`,
  minOrderNotReached: (p) => `Commande esengeli kozala na *${p.amount}* na likolo. Bakisa eloko moko lisusu 🙂`,

  zoneFee: (p) => `Kokitisa ${p.amount}`,
  zoneFeeList: (p) => `Motuya ya kokitisa :\n${p.lines}`,
  zoneFeeFree: 'Kokitisa ya ofele',
  deliveryAnswer: (p) => `Tokokitisaka na bakartier oyo 🛵\n${p.lines}`,
  openNow: (p) => `Tofungwami ✅ Lelo banda *${p.open}* tii *${p.close}*.`,
  openAlways: 'Tofungwami ✅',

  btnCoupon: '🎟️ Code promo',
  btnSkipCoupon: '← Zonga',
  askCoupon: 'Tinda code promo na yo :',
  couponApplied: (p) => `🎟️ Code *${p.code}* endimami : −${p.amount}`,
  couponLine: (p) => `Code ${p.code} : −${p.amount}`,
  couponRejected: {
    unknown: (p) => `Code *${p.code}* ezali te. Tala malamu to zonga.`,
    inactive: (p) => `Code *${p.code}* esalaka lisusu te.`,
    expired: (p) => `Code *${p.code}* esili tango.`,
    exhausted: (p) => `Code *${p.code}* esalelami mingi, esili.`,
    used: (p) => `Osili kosalela code *${p.code}*.`,
    min: (p) => `Code oyo esalaka banda ${p.min} ya commande.`,
  },

  askPayment: 'Olingi kofuta ndenge nini ?',
  btnPayMomo: '📱 Mobile money',
  btnPayCash: '💵 Na kokitisa',
  cashConfirmed: (p) =>
    `✅ Commande *${p.ref}* ekomami !\nOkofuta *${p.total}* na mbongo tango tokokitisa.\n`
    + 'Lengela mbongo ya sikisiki soki okoki 🙏 Tokoyebisa yo tango molengeli akobima.',

  pickExtras: 'Olingi kobakisa eloko mosusu na yango ?',
  btnExtrasChoose: 'Tala oyo ekoki kobakisama',
  btnExtrasDone: '✅ Ezali malamu',
  btnExtrasNone: 'Te, matondi',
  extrasChosen: (p) => `Oyo ebakisami : ${p.items}`,

  catalogHeader: 'Catalogue na biso',
  catalogBody: 'Pona biloko, bakisa na panier, sima tinda yango epai na biso.',
  catalogFooter: 'Koma « menu » mpo kozonga',
  cartReceived: 'Panier ezwami 👍',

  askSlot: 'Olingi tokitisa tango nini ?',
  slotButton: 'Pona tango',
  slotWhen: { today: 'Lelo', tomorrow: 'Lobi' },
  slotLeft: (p) => `place ${p.n} etikali`,
  slotFull: 'Tango wana etondi sika 🙏 Pona mosusu.',
  deliverySlotLine: (p) => `🕒 Tango : *${p.slot}*`,

  tiers: { bronze: 'Bronze', silver: 'Argent', gold: 'Or' },
  tierReached: (p) => `🎉 Longonya, okomi na niveau *${p.tier}* !\n${p.perk}`,
  tierPerkFree: 'Kokitisa ekozala ofele na commande na yo nyonso.',
  tierPerkOff: (p) => `Ozwi ${p.pct} % ya kokita na motuya ya kokitisa.`,
  tierFreeDelivery: (p) => `🎁 Kokitisa ya ofele (niveau ${p.tier})`,
  tierDeliveryOff: (p) => `🎁 −${p.pct} % na kokitisa (niveau ${p.tier})`,

  btnSubscribe: '🔄 Abonnement',
  askSubscribeDay: 'Mokolo nini ya poso olingi tokitisela yo ?',
  subscribeButton: 'Pona mokolo',
  subscribeNoOrder: 'Sala commande liboso : abonnement ekozongisa panier wana.',
  subscribeConfirm: (p) => `Mokolo nyonso ya *${p.day}*, nakolengela : ${p.items}\nEzali malamu ?`,
  btnSubscribeYes: '✅ Iyo, komisa ngai',
  btnSubscribeNo: 'Te, matondi',
  subscribed: (p) =>
    `🔄 Ekomami ! Mokolo nyonso ya *${p.day}*, panier na yo ekolengelama yango moko.\n`
    + 'Koma *stop abonnement* mpo kotika.',
  subscriptionExists: (p) => `Ozalaki na abonnement ya *${p.day}*. Ebongisami.`,
  subscriptionCancelled: 'Abonnement na yo etiki. Okoki kosala mosusu tango olingi.',
  subscriptionNone: 'Ozali na abonnement te.',
  subscriptionOrder: (p) =>
    `🔄 Panier na yo ya abonnement ezali pene : *${p.ref}*\n${p.items}\nMotuya : *${p.total}*\n`
    + 'Yanola *annuler* soki olingi kokitisa te poso oyo.',
  weekdayNames: {
    0: 'eyenga', 1: 'mokolo ya liboso', 2: 'mokolo ya mibale', 3: 'mokolo ya misato',
    4: 'mokolo ya minei', 5: 'mokolo ya mitano', 6: 'mokolo ya motoba',
  },

  winback: (p) =>
    `Mbote${p.name ? ` ${p.name}` : ''} 👋 Esali kala !\n`
    + `Tala *${p.amount}* ya kokita na code *${p.code}*, esalaka mikolo ${p.days}.\nKoma *menu* mpo kosomba.`,

  trackTitle: 'Kolanda kokitisa',
  trackOrder: (p) => `Commande ${p.ref}`,
  trackDelivered: 'Ekitisami. Matondi !',
  trackAddress: 'Kartier',
  trackSlot: 'Tango',
  trackEta: 'Ngonga ya kokoma',
  trackAway: 'Molengeli azali pene na {km} km.',
  trackNoPosition: 'Molengeli atindi naino esika azali te.',
  trackUnknown: 'Lien ya kolanda ezali malamu te.',
  trackLink: (p) => `📍 Landa molengeli na yo : ${p.url}`,
};
