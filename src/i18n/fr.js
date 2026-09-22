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
  replyWithNumber: 'Répondez avec le numéro de votre choix.',
  listButton: 'Choisir',
  error: 'Oups, une erreur est survenue de notre côté. Tapez *menu* pour recommencer.',
  voiceNotSupported: 'Je ne peux pas encore écouter les messages vocaux 🙏 Utilisez les boutons ou écrivez votre réponse.',
  unsupportedMessage: 'Je ne peux pas lire ce type de message. Utilisez les boutons ou écrivez votre réponse.',

  pickProduct: 'Voici nos produits du jour. Choisissez-en un :',
  catalogButton: 'Voir le catalogue',
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
};
