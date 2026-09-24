// French copy (default locale). Keys must stay in sync with en.js (checked by test/i18n.test.js).
export default {
  localeLabel: '🇫🇷 Français',

  welcomeNew: (p) =>
    `Bonjour et bienvenue chez *${p.shop}* 👋\nÉpices et légumes frais livrés chez vous à Kinshasa.`,
  welcomeBack: (p) => (p.name ? `Re-bonjour ${p.name} 👋` : 'Re-bonjour 👋'),
  creditBalance: (p) => `💰 Vous avez *${p.amount}* de crédit, déduit automatiquement de votre prochaine commande.`,
  menuPrompt: 'Que souhaitez-vous faire ?',
  menuLastOrder: (p) => `Votre dernière commande : ${p.items}`,
  menuFooter: 'Tapez « aide » à tout moment',
  btnOrder: '🛒 Commander',
  btnReorder: '🔁 Même commande',
  languageSet: 'C’est noté, je vous parle en français 🇫🇷',
  help: (p) =>
    `*Comment ça marche*\n` +
    `1. Choisissez vos produits et la taille du tas\n` +
    `2. Indiquez votre adresse de livraison\n` +
    `3. Payez par mobile money et envoyez la capture d’écran\n\n` +
    `*Mots utiles*\n` +
    `• *menu* : revenir au début\n` +
    `• *annuler* : annuler la commande en cours\n` +
    `• *english* : switch to English\n` +
    `• *agent* : parler à une personne\n` +
    `• *stop* : ne plus recevoir de rappels\n\n` +
    `Zones livrées : ${p.zones}`,
  cancelled: 'Commande annulée. Tapez *menu* quand vous voulez recommencer.',
  invalidChoice: 'Je n’ai pas compris 🙏 Choisissez une option ci-dessous.',
  thanksReply: 'Avec plaisir 🙏',
  replyWithNumber: 'Répondez avec le numéro de votre choix.',
  listButton: 'Choisir',
  error: 'Oups, une erreur est survenue de notre côté. Tapez *menu* pour recommencer.',
  voiceNotSupported: 'Je ne peux pas encore écouter les messages vocaux 🙏 Utilisez les boutons ou écrivez votre réponse.',
  unsupportedMessage: 'Je ne peux pas lire ce type de message. Utilisez les boutons ou écrivez votre réponse.',

  pickProduct: 'Voici nos produits du jour. Choisissez-en un :',
  catalogButton: 'Voir le catalogue',
  catalogHeaderLine: '🧺 Notre étal du jour',
  priceRange: (p) => `de ${p.from} à ${p.to}`,
  btnCheckoutCart: '✅ Valider le panier',
  noProducts: 'Désolé, tous nos produits sont épuisés pour le moment. Revenez un peu plus tard 🙏',
  outOfStock: (p) => `Désolé, *${p.product}* vient d’être épuisé.`,

  sizes: { small: 'Petit tas', medium: 'Moyen tas', large: 'Grand tas' },
  sizesShort: { small: 'Petit', medium: 'Moyen', large: 'Grand' },
  pickSize: (p) => `${p.product} : quelle taille de tas ?`,
  pickQty: (p) => `Combien de *${p.size}* de ${p.product} ?`,
  qtyHint: 'Ou tapez un nombre (1 à 20).',
  invalidQty: 'Indiquez un nombre entre 1 et 20.',
  added: (p) => `✅ Ajouté : ${p.item}`,

  nluUnderstood: 'J’ai compris :',
  nluConfirm: 'C’est correct ?',
  nluUnknown: (p) => `Je n’ai pas trouvé dans notre catalogue : ${p.items}.`,
  btnNluChoose: '✏️ Je choisis',
  cartTitle: '🧺 *Votre panier*',
  subtotalLine: (p) => `Sous-total : *${p.amount}*`,
  addMorePrompt: 'Voulez-vous ajouter autre chose ?',
  btnAddMore: '➕ Ajouter',
  btnCheckout: '✅ Commander',
  btnEditCart: '✏️ Modifier',
  editCartPrompt: 'Touchez un article pour le retirer :',
  removeItem: (p) => `➖ ${p.item}`,
  btnEditAdd: '➕ Ajouter un produit',
  btnEditDone: '✅ Continuer',
  itemRemoved: (p) => `Retiré : ${p.item}`,
  cartEmpty: 'Votre panier est vide.',

  confirmAddress: (p) => `Livrer à *${p.name}*, ${p.zone}${p.note ? ` (${p.note})` : ''} ?`,
  btnYes: '✅ Oui',
  btnChangeAddress: '📍 Changer',
  askName: 'À quel nom faut-il livrer la commande ?',
  askNameKeep: 'Touchez le bouton pour garder ce nom, ou écrivez-en un autre.',
  invalidName: 'Merci d’écrire un nom (2 à 60 caractères).',
  askZone: 'Dans quel quartier faut-il livrer ?\nVous pouvez aussi partager votre position 📍',
  zoneButton: 'Quartiers',
  zoneOther: 'Autre quartier',
  zoneNotServed: (p) =>
    `Désolé, nous ne livrons pas encore ${p.zone ? `à *${p.zone}*` : 'dans ce quartier'} 🙏\nZones desservies : ${p.zones}.`,
  zoneDetected: (p) => `📍 Position reçue : *${p.zone}*.`,
  zoneNotDetected: 'Je n’ai pas reconnu le quartier de cette position 🙏 Choisissez-le dans la liste.',
  askAddress:
    'Précisez l’adresse : avenue, numéro et un point de repère.\nVous pouvez aussi partager votre position 📍',
  btnSameAddress: '🏠 Même adresse',
  invalidAddress: 'Merci d’indiquer une adresse (au moins 3 caractères) ou de partager votre position.',

  recapTitle: '🧾 *Récapitulatif*',
  deliveryTo: (p) => `📍 ${p.name} — ${p.zone}${p.note ? `\n${p.note}` : ''}`,
  deliveryFeeLine: (p) => `Livraison : ${p.amount}`,
  discountLine: (p) => `Crédit utilisé : −${p.amount}`,
  totalLine: (p) => `*Total : ${p.amount}*`,
  recapPrompt: 'On valide ?',
  btnConfirm: '✅ Confirmer',
  btnModify: '✏️ Modifier',
  btnCancel: '❌ Annuler',
  itemsRemovedOOS: (p) => `⚠️ Retiré de votre panier car épuisé : ${p.items}`,

  paymentInstructions: (p) =>
    `Merci ! Commande *${p.ref}* enregistrée 🙌\n\n` +
    `Envoyez *${p.total}* par mobile money :\n` +
    (p.orange ? `• Orange Money : *${p.orange}*\n` : '') +
    (p.airtel ? `• Airtel Money : *${p.airtel}*\n` : '') +
    (p.holder ? `Au nom de : ${p.holder}\n` : '') +
    `Motif : ${p.ref}\n\n` +
    `Ensuite, envoyez-moi ici la *capture d’écran* du paiement 📸`,
  awaitingProof: 'J’attends la capture d’écran de votre paiement 📸\nTapez *menu* pour revenir au menu (la commande reste en attente) ou *annuler* pour l’annuler.',
  proofReceived: (p) =>
    `📸 Capture reçue, merci ! Nous vérifions le paiement de la commande *${p.ref}* et vous confirmons très vite.`,
  paidByCredit: (p) => `🎉 Commande *${p.ref}* entièrement payée avec votre crédit. Nous la préparons !`,

  duplicateFound: (p) => `Vous avez déjà une commande aujourd’hui : *${p.ref}* (${p.status}).`,
  duplicateMergeHint: 'Vous pouvez y ajouter des produits (un seul paiement) ou en créer une nouvelle.',
  btnDupMerge: '➕ Y ajouter',
  btnDupNew: '🆕 Nouvelle',
  btnBack: '↩️ Retour',
  mergeIntro: (p) => `Votre panier reprend la commande ${p.ref}. Ajoutez ce qu’il vous faut :`,
  reorderMissing: (p) => `⚠️ Plus disponible aujourd’hui : ${p.items}`,

  capacityFull:
    'Notre stock de la semaine est complet 😔\nVoulez-vous être prévenu en priorité dès que les commandes rouvrent ?',
  btnWaitYes: '🔔 Me prévenir',
  btnWaitNo: 'Non merci',
  waitlistJoined: 'C’est noté ! Vous serez prévenu en priorité 🔔',
  okNoProblem: 'Pas de souci. Tapez *menu* quand vous voulez.',

  optedOut: 'Vous ne recevrez plus nos rappels et promotions. Tapez *abonner* pour les réactiver.',
  optedIn: 'C’est noté, vous recevrez à nouveau nos rappels 🔔',

  referralApplied: (p) => `🎁 Code parrain accepté ! *${p.amount}* de crédit offert sur votre première commande.`,
  referralShare: (p) =>
    `🎁 *Parrainez vos proches !*\nVotre code : *${p.code}*\n` +
    `Chaque ami qui commande avec ce code reçoit ${p.amount} de crédit, et vous aussi.` +
    (p.link ? `\nLien à partager : ${p.link}` : ''),
  referralShareText: (p) => `Bonjour ! Mon code parrain : ${p.code}`,
  referralRewardEarned: (p) => `🎉 Un ami a commandé avec votre code : *${p.amount}* de crédit ajouté à votre compte !`,
  loyaltyRewardEarned: (p) =>
    `🎉 Merci pour votre fidélité ! C’est votre ${p.count}ᵉ commande : *${p.amount}* de crédit offert pour la prochaine.`,

  customerFallbackName: 'cher client',
  handoffStarted: 'Très bien, je préviens l’équipe 🙋 Une personne vous répond ici dès que possible.\nTapez *menu* pour revenir au bot.',
  handoffEnded: 'L’équipe vous a répondu. Tapez *menu* quand vous voulez commander 🙂',
  cartReminder: 'Toujours là ? Votre commande vous attend 🙂',

  surveyPrompt: (p) => `Votre commande *${p.ref}* s’est-elle bien passée ? Donnez une note de 1 à 5 ⭐`,
  ratingButton: 'Noter',
  thanksGood: 'Merci beaucoup pour votre note ⭐ À très bientôt !',
  thanksBad: 'Merci pour votre retour, et désolé que tout n’ait pas été parfait. Nous revenons vers vous rapidement.',

  status: {
    awaiting_payment: 'en attente de paiement',
    paid: 'payée',
    preparing: 'en préparation',
    on_the_way: 'en livraison',
    delivered: 'livrée',
    cancelled: 'annulée',
  },
  statusPaid: (p) => `✅ Paiement reçu pour la commande *${p.ref}*. Merci !`,
  statusPreparing: (p) => `👩‍🍳 Votre commande *${p.ref}* est en préparation.`,
  statusOnTheWay: (p) => `🛵 Votre livreur est en route${p.eta ? `, arrivée estimée à *${p.eta}*` : ''} (commande ${p.ref}).`,
  statusDelivered: (p) => `📦 Commande *${p.ref}* livrée. Bon appétit !`,
  statusCancelled: (p) => `Votre commande *${p.ref}* a été annulée. Écrivez-nous en cas de question.`,

  weeklyReminder: (p) =>
    `Bonjour${p.name ? ` ${p.name}` : ''} ! C’est bientôt le moment de refaire le plein d’épices 🌶️\nTapez *menu* pour commander.`,
  waitlistOpen: (p) =>
    `Bonne nouvelle${p.name ? ` ${p.name}` : ''} 🎉 Les commandes sont rouvertes ! Tapez *menu* pour commander.`,

  adminProof: (p) => `🧾 Preuve de paiement reçue\n${p.ref} — ${p.total}\n${p.name}, ${p.zone}\n${p.url}`,
  adminPaidByCredit: (p) => `🎁 Commande payée par crédit\n${p.ref}\n${p.name}, ${p.zone}\n${p.url}`,
  adminHandoff: (p) => `🙋 ${p.name} (+${p.phone}) demande à parler à quelqu’un\n${p.url}`,
  adminBadRating: (p) => `⚠️ Note ${p.rating}/5 sur ${p.ref} (${p.name}, +${p.phone})`,

  /* ------------------------- opening hours ----------------------------- */
  weekdays: {
    0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi',
  },
  shopClosed: 'Nous sommes fermés pour le moment 🙏',
  closedUntilToday: (p) => `Nous rouvrons aujourd’hui à *${p.time}*.`,
  closedUntilTomorrow: (p) => `Nous rouvrons demain à *${p.time}*.`,
  closedUntilDay: (p) => `Nous rouvrons ${p.day} à *${p.time}*.`,
  minOrderNotReached: (p) => `Le montant minimum de commande est de *${p.amount}*. Ajoutez encore un article 🙂`,

  /* ------------------------ delivery areas ----------------------------- */
  zoneFee: (p) => `Livraison ${p.amount}`,
  zoneFeeList: (p) => `Frais de livraison :\n${p.lines}`,
  zoneFeeFree: 'Livraison offerte',
  deliveryAnswer: (p) => `Nous livrons dans ces quartiers 🛵\n${p.lines}`,
  openNow: (p) => `Nous sommes ouverts ✅ Aujourd’hui de *${p.open}* à *${p.close}*.`,
  openAlways: 'Nous sommes ouverts ✅',

  /* --------------------------- coupons --------------------------------- */
  btnCoupon: '🎟️ Code promo',
  btnSkipCoupon: '← Retour',
  askCoupon: 'Envoyez votre code promo :',
  couponApplied: (p) => `🎟️ Code *${p.code}* appliqué : −${p.amount}`,
  couponLine: (p) => `Code ${p.code} : −${p.amount}`,
  couponRejected: {
    unknown: (p) => `Le code *${p.code}* n’existe pas. Vérifiez l’orthographe ou revenez en arrière.`,
    inactive: (p) => `Le code *${p.code}* n’est plus actif.`,
    expired: (p) => `Le code *${p.code}* a expiré.`,
    exhausted: (p) => `Le code *${p.code}* a atteint sa limite d’utilisation.`,
    used: (p) => `Vous avez déjà utilisé le code *${p.code}*.`,
    min: (p) => `Ce code s’applique à partir de ${p.min} de commande.`,
  },

  /* ------------------------ payment method ----------------------------- */
  askPayment: 'Comment souhaitez-vous payer ?',
  btnPayMomo: '📱 Mobile money',
  btnPayCash: '💵 À la livraison',
  cashConfirmed: (p) =>
    `✅ Commande *${p.ref}* enregistrée !\nVous paierez *${p.total}* en espèces à la livraison.\n` +
    `Préparez l’appoint si possible 🙏 Nous vous confirmons le passage du livreur.`,
  adminCashOrder: (p) => `💵 Commande à payer à la livraison\n${p.ref} — ${p.total}\n${p.name}, ${p.zone}\n${p.url}`,


  /* --------------------------- daily report ---------------------------- */
  reportSubject: 'Résumé de la journée',
  reportOrders: 'Commandes',
  reportRevenue: 'Chiffre d’affaires encaissé',
  reportToCheck: 'Paiements à vérifier',
  reportCash: 'Espèces à encaisser',
  reportShopping: 'À acheter / préparer :',
  reportNothing: 'rien pour aujourd’hui',


  /* --------------------------- variants & extras ------------------------ */
  pickExtras: 'Souhaitez-vous un supplément ?',
  btnExtrasChoose: 'Voir les suppléments',
  btnExtrasDone: '✅ C’est bon',
  btnExtrasNone: 'Non merci',
  extrasChosen: (p) => `Suppléments : ${p.items}`,

  /* ---------------------------- WhatsApp catalog ------------------------ */
  catalogHeader: 'Notre catalogue',
  catalogBody: 'Choisissez vos produits, ajoutez-les au panier, puis envoyez-le nous.',
  catalogFooter: 'Tapez « menu » pour revenir',
  cartReceived: 'Panier bien reçu 👍',


  /* --------------------------- delivery slots -------------------------- */
  askSlot: 'Quand souhaitez-vous être livré ?',
  slotButton: 'Choisir un créneau',
  slotWhen: { today: 'Aujourd’hui', tomorrow: 'Demain' },
  slotLeft: (p) => `${p.n} place${p.n > 1 ? 's' : ''} restante${p.n > 1 ? 's' : ''}`,
  slotFull: 'Ce créneau vient d’être complet 🙏 Choisissez-en un autre.',
  deliverySlotLine: (p) => `🕒 Créneau : *${p.slot}*`,


  /* ---------------------------- loyalty tiers -------------------------- */
  tiers: { bronze: 'Bronze', silver: 'Argent', gold: 'Or' },
  tierReached: (p) => `🎉 Félicitations, vous passez au palier *${p.tier}* !\n${p.perk}`,
  tierPerkFree: 'Votre livraison est désormais offerte sur chaque commande.',
  tierPerkOff: (p) => `Vous avez ${p.pct} % de réduction sur la livraison.`,
  tierFreeDelivery: (p) => `🎁 Livraison offerte (palier ${p.tier})`,
  tierDeliveryOff: (p) => `🎁 −${p.pct} % sur la livraison (palier ${p.tier})`,

  /* ---------------------------- subscriptions -------------------------- */
  btnSubscribe: '🔄 Abonnement',
  askSubscribeDay: 'Quel jour souhaitez-vous être livré chaque semaine ?',
  subscribeButton: 'Choisir le jour',
  subscribeNoOrder: 'Passez d’abord une commande : votre abonnement reprendra ce panier.',
  subscribeConfirm: (p) => `Chaque *${p.day}*, je préparerai : ${p.items}\nC’est bon ?`,
  btnSubscribeYes: '✅ Oui, m’abonner',
  btnSubscribeNo: 'Non merci',
  subscribed: (p) => `🔄 C’est noté ! Chaque *${p.day}*, votre panier sera préparé automatiquement.\nTapez *stop abonnement* pour arrêter quand vous voulez.`,
  subscriptionExists: (p) => `Vous avez déjà un abonnement le *${p.day}*. Il a été mis à jour.`,
  subscriptionCancelled: 'Votre abonnement est arrêté. Vous pouvez en recréer un quand vous voulez.',
  subscriptionNone: 'Vous n’avez pas d’abonnement en cours.',
  subscriptionOrder: (p) =>
    `🔄 Votre panier d’abonnement est prêt : *${p.ref}*\n${p.items}\nTotal : *${p.total}*\n` +
    `Répondez *annuler* si vous ne voulez pas de livraison cette semaine.`,
  weekdayNames: { 0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi' },

  /* ------------------------------ win-back ----------------------------- */
  winback: (p) =>
    `Bonjour${p.name ? ` ${p.name}` : ''} 👋 Cela fait un moment !\n` +
    `Voici *${p.amount}* de réduction avec le code *${p.code}*, valable ${p.days} jours.\nTapez *menu* pour commander.`,

  adminSubscriptionOrder: (p) => `🔄 Commande d'abonnement créée\n${p.ref} — ${p.total}\n${p.name}, ${p.zone}\n${p.url}`,


  /* ---------------------------- delivery tracking ---------------------- */
  trackTitle: 'Suivi de livraison',
  trackOrder: (p) => `Commande ${p.ref}`,
  trackDelivered: 'Commande livrée. Merci !',
  trackAddress: 'Quartier',
  trackSlot: 'Créneau',
  trackEta: 'Heure estimée',
  trackAway: 'Votre livreur est à environ {km} km.',
  trackNoPosition: 'Le livreur n’a pas encore partagé sa position.',
  trackUnknown: 'Lien de suivi invalide.',
  trackLink: (p) => `📍 Suivez votre livreur en direct : ${p.url}`,

};
