# Passer au vrai compte WhatsApp Business

Aujourd'hui le bot tourne sur le **numéro de test** de Meta : pratique pour
développer, mais il n'envoie qu'à 5 numéros déclarés à la main et son jeton
expire toutes les 24 h. Ce document décrit le passage à un vrai compte.

L'outil `deploy/meta-setup.js` (workflow **Meta - setup**) fait tout ce que
l'API de Meta permet de faire et vous dit précisément ce qui reste à faire à la
main. Lancez-le en mode `check` à chaque étape : il vous dira où vous en êtes.

---

## 0. Avant de commencer

**Un numéro de téléphone qui n'est utilisé sur aucun WhatsApp.** C'est le point
qui bloque le plus souvent. Si le numéro a déjà un compte WhatsApp (normal ou
Business app), il faut d'abord **supprimer ce compte** dans l'application :
*Réglages → Compte → Supprimer mon compte*. Comptez quelques minutes avant de
pouvoir le réutiliser côté API.

Il faut aussi :

- pouvoir recevoir un SMS ou un appel sur ce numéro ;
- les documents de l'entreprise pour la vérification (RCCM, attestation fiscale,
  facture d'électricité ou relevé bancaire au nom et à l'adresse de l'entreprise).

Le numéro de test actuel continue de fonctionner pendant toute l'opération :
vous ne coupez rien tant que vous ne changez pas `WA_PHONE_NUMBER_ID`.

---

## 1. Le portefeuille d'entreprise

1. Ouvrez [business.facebook.com](https://business.facebook.com) et créez (ou
   ouvrez) le portefeuille d'entreprise.
2. *Paramètres d'entreprise → Informations sur l'entreprise* : nom légal exact,
   adresse, téléphone, site web (`https://ll-aca.site`).
   Ces informations doivent correspondre **mot pour mot** aux documents.
3. *Paramètres d'entreprise → Centre de sécurité → Vérification de l'entreprise*
   → lancer la vérification et téléverser les documents.

> **Pourquoi c'est indispensable.** Sans vérification, le compte reste bloqué à
> un nombre réduit de contacts et certains modèles de message sont refusés. La
> réponse de Meta prend en général de quelques heures à quelques jours.

---

## 2. L'application

L'application existe déjà (`1803892427276261`). Il reste à la préparer pour la
production, sur [developers.facebook.com](https://developers.facebook.com) :

1. *Paramètres → De base* :
   - **URL de la politique de confidentialité** : `https://bot.ll-aca.site/privacy`
   - **URL des conditions d'utilisation** : `https://bot.ll-aca.site/terms`
   - catégorie, icône, e-mail de contact.
2. Vérifiez que l'app appartient bien au portefeuille d'entreprise de l'étape 1
   (*Paramètres → De base → Compte professionnel*).
3. Passez l'application en **mode Live** (interrupteur en haut de la page).

---

## 3. Le numéro

Dans l'app : *WhatsApp → Configuration de l'API*.

1. **Ajouter un numéro de téléphone.**
2. **Nom d'affichage** : ce que les clients verront. Il doit avoir un rapport
   évident avec l'entreprise (« Épices Fraîches » convient). Meta le relit ;
   tant qu'il n'est pas approuvé, les clients voient le numéro brut.
3. Vérifiez le numéro par SMS ou par appel.
4. Notez les deux identifiants affichés :
   - **Phone number ID** → secret GitHub `WA_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** (WABA) → paramètre du workflow

---

## 4. Le jeton permanent

C'est ce qui remplace le jeton de 24 h qui expire aujourd'hui.

1. [business.facebook.com](https://business.facebook.com) → *Paramètres
   d'entreprise → Utilisateurs → *Utilisateurs système** → **Ajouter**.
   Nom : `whatbot`, rôle : **Administrateur**.
2. **Ajouter des actifs** :
   - l'application → *Gérer l'app* (contrôle total) ;
   - le compte WhatsApp → *Gérer le compte* (contrôle total).
3. **Générer un nouveau jeton** :
   - application : la vôtre ;
   - **expiration : Jamais** ;
   - permissions : `whatsapp_business_messaging` **et**
     `whatsapp_business_management`.
4. Copiez-le immédiatement (il n'est affiché qu'une fois) et mettez-le dans le
   secret GitHub `WA_TOKEN`.

---

## 5. Le webhook

Dans l'app : *WhatsApp → Configuration → Webhook → Modifier*.

| Champ | Valeur |
|---|---|
| URL de rappel | `https://bot.ll-aca.site/webhook` |
| Jeton de vérification | la valeur du secret `WA_VERIFY_TOKEN` |

Puis **s'abonner au champ `messages`** (et à lui seul : le reste est du bruit).

Meta appelle l'URL immédiatement pour la vérifier. Si elle répond, la
configuration est enregistrée ; sinon, c'est que le jeton de vérification ne
correspond pas.

---

## 6. Lancer l'outil

Dans GitHub : *Actions → **Meta - setup** → Run workflow*.

1. `mode: check` d'abord. Le rapport liste, sans rien modifier :
   - la validité du jeton, son type et sa date d'expiration ;
   - l'état de la vérification de l'entreprise ;
   - les numéros du compte, leur vérification, leur nom, leur qualité ;
   - l'abonnement du compte WhatsApp à l'app ;
   - la poignée de main du webhook, refaite exactement comme Meta la fait ;
   - les modèles de message présents ou manquants ;
   - **la liste numérotée de ce qui reste à faire à la main.**
2. `mode: apply` ensuite. Il abonne le compte WhatsApp à l'app et **soumet les
   six modèles de message** en français et en anglais.
3. Si le rapport demande d'enregistrer le numéro pour l'API Cloud, relancez avec
   `register_pin` = un code à 6 chiffres de votre choix. **Notez ce code** :
   c'est la vérification en deux étapes du numéro.

---

## 7. Les modèles de message

Hors de la fenêtre de 24 h, WhatsApp n'accepte que des modèles approuvés. Le bot
en utilise six, tous créés par `apply` :

| Secret | Modèle | Sert à |
|---|---|---|
| `WA_TEMPLATE_ORDER_UPDATE` | `order_update` | changement de statut d'une commande |
| `WA_TEMPLATE_SURVEY` | `delivery_survey` | demande de note 24 h après livraison |
| `WA_TEMPLATE_WEEKLY_REMINDER` | `weekly_reminder` | rappel hebdomadaire |
| `WA_TEMPLATE_WAITLIST_OPEN` | `waitlist_open` | une place se libère |
| `WA_TEMPLATE_WINBACK` | `winback_offer` | relance d'un client inactif |
| `WA_TEMPLATE_ADMIN_ALERT` | `shop_alert` | alerte à la boutique |

L'approbation prend de quelques minutes à 24 h. Une fois approuvés, mettez les
noms ci-dessus dans les secrets GitHub correspondants et redéployez.

---

## 8. Basculer

1. Mettez à jour les secrets GitHub : `WA_TOKEN`, `WA_PHONE_NUMBER_ID`,
   `WA_BUSINESS_NUMBER` (le numéro lui-même, sans « + », pour les liens de
   parrainage), et les six `WA_TEMPLATE_*`.
2. Relancez le déploiement (*Actions → Test & deploy → Run workflow*).
3. Écrivez « Bonjour » au nouveau numéro depuis un téléphone : la conversation
   doit apparaître **en direct** dans le tableau de bord, et le bot répondre.

---

## Ce qu'il faut savoir ensuite

**Limite d'envoi.** Un nouveau compte peut démarrer une conversation avec 250
contacts par 24 h. La limite monte toute seule (1 000, 10 000, illimité) si la
qualité reste bonne. Les réponses dans la fenêtre de 24 h ne comptent pas.

**Qualité du numéro.** Elle baisse si des clients bloquent ou signalent le
numéro. Deux règles simples : n'écrivez jamais à quelqu'un qui n'a pas écrit en
premier, et laissez toujours « stop » fonctionner (le bot le gère déjà).

**Coût.** Les conversations ouvertes par le client sont gratuites — c'est le cas
de presque tout ce que fait ce bot. Les modèles utilitaires coûtent quelques
centimes ; les modèles marketing environ 0,022 $ en RDC. Le rappel hebdomadaire
et la relance des inactifs sont les seuls messages marketing : gardez-les rares.

**Le numéro de test.** Il reste utilisable pour essayer des changements sans
toucher au vrai numéro. Il suffit de rebasculer `WA_PHONE_NUMBER_ID`.
