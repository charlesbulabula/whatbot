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

Il existe déjà : **megamatgroup**, identifiant `804383151763933`. L'application
`whatbot` y est bien rattachée — vérifié auprès de Meta via le serveur MCP.

Une seule chose y manque, et elle bloque tout le reste : **le profil de
l'entreprise est incomplet**. WhatsApp contrôle ce profil avant d'autoriser le
moindre envoi ; tant qu'il l'est, un numéro ajouté maintenant resterait en
attente sans jamais pouvoir écrire. Ça ne demande aucun document :

→ <https://business.facebook.com/settings/info/?business_id=804383151763933>

Renseignez le nom légal exact, l'adresse, le téléphone et le site web
(`https://ll-aca.site`). Ces informations doivent correspondre **mot pour mot**
à celles des documents téléversés ensuite.

Puis *Paramètres d'entreprise → Centre de sécurité → Vérification de
l'entreprise* → lancer la vérification et téléverser les documents.

> **Pourquoi c'est indispensable.** Sans vérification, le compte reste bloqué à
> un nombre réduit de contacts et certains modèles de message sont refusés. La
> réponse de Meta prend en général de quelques heures à quelques jours.

> **Vérifiez toujours dans quel portefeuille vous êtes.** Vous en administrez
> neuf, dont un nommé « Whatbot » (`39227276943530030`) qui est entièrement
> vide. C'est en travaillant depuis celui-là qu'apparaît « Cette application ne
> vous appartient pas » : l'app est sur megamatgroup, pas ailleurs. Le nom
> affiché en haut à gauche de Business Settings est ce qu'il faut regarder
> avant d'agir.

---

## 2. L'application

L'application existe déjà (`1803892427276261`). Il reste à la préparer pour la
production, sur [developers.facebook.com](https://developers.facebook.com) :

1. *Paramètres → De base* :
   - **URL de la politique de confidentialité** : `https://bot.ll-aca.site/privacy`
   - **URL des conditions d'utilisation** : `https://bot.ll-aca.site/terms`
   - catégorie, icône, e-mail de contact.
2. Le rattachement au portefeuille et le passage en **mode Live** sont **déjà
   faits** (*Paramètres → De base → Compte professionnel* affiche megamatgroup).
   Rien à toucher ici.

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

Lien direct vers la page, pour megamatgroup :
<https://business.facebook.com/latest/settings/system_users/?business_id=804383151763933>

> **Personne ne peut le générer à votre place**, pas même le serveur MCP de
> Meta : la génération est une action sécurisée qui doit se faire dans la page.
> Le MCP ne sait qu'ouvrir la bonne page. Ce portefeuille a déjà un utilisateur
> système, il n'y a donc qu'à générer le jeton dessus.

> **Ce n'est pas urgent.** Le jeton actuel a été échangé contre un jeton longue
> durée : il est valide **jusqu'au 23/11/2026**. Le jeton permanent ne devient
> nécessaire que pour le vrai numéro.

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

## Une alternative : le serveur MCP de Meta

Meta publie un serveur MCP **WhatsApp Business Tools** (bêta) qui expose, à un
assistant comme Claude, exactement les opérations bloquées ici : lister les
portefeuilles et comptes WhatsApp administrés, ajouter et vérifier un numéro,
gérer les modèles, configurer le webhook, **et générer un jeton d'utilisateur
système**.

- URL : `https://mcp.facebook.com/whatsapp_business_tools`
- Authentification : OAuth avec votre compte développeur Meta
- Portées demandées : `business_management`, `whatsapp_business_management`,
  `whatsapp_business_messaging`

Il n'est pas dans l'annuaire de connecteurs de Claude : ajoutez-le comme
**connecteur personnalisé** avec cette URL, puis connectez-vous à Meta.
C'est fait : le connecteur est actif.

Ses prérequis : rôle **admin** sur le portefeuille, et rôle admin sur une app
**rattachée à ce portefeuille**. Il ne remplace rien dans le bot — c'est un
outil de configuration, pas un composant d'exécution.

**Ce qu'il sait faire.** Lister les portefeuilles et les comptes, dire
exactement où en est l'installation d'un portefeuille (profil, app, numéro,
webhook, abonnement, publication, paiement), ajouter et vérifier un numéro,
gérer les modèles de message, configurer le webhook, lancer la vérification
d'entreprise.

**Ce qu'il ne sait pas faire**, et qu'il faut donc faire à la main :

- **générer le jeton d'utilisateur système** — action sécurisée en page ;
- **gérer la liste blanche du numéro de test** — elle n'existe que dans la page
  *WhatsApp → API Setup* du tableau de bord de l'app ; c'est là qu'il faut
  ajouter `+33764534909` pour recevoir les messages du bot ;
- **envoyer depuis le numéro de test** — les numéros de test sont exclus de
  toutes ses listes.

## Rester sur le numéro de test

Tant que vous n'avez pas les documents pour la vérification d'entreprise, le
numéro de test fait très bien l'affaire — avec une seule contrainte : **son
jeton expire toutes les 24 h**.

Pas besoin de SSH ni de redéploiement pour le renouveler. Chaque matin :

1. [Console WhatsApp](https://developers.facebook.com/apps/1803892427276261/whatsapp-business/wa-dev-console/)
   → **Créer un nouveau token d'accès** → copier.
2. Tableau de bord → *Réglages → Système → **Jeton WhatsApp*** → coller →
   **Vérifier et enregistrer**.

Le jeton est testé auprès de Meta **avant** d'être gardé : s'il est refusé,
rien ne change et le message d'erreur de Meta s'affiche. Une fois accepté, le
bandeau rouge disparaît immédiatement.

Ce jeton est stocké en base, pas dans le `.env` : il **survit aux
déploiements**. Le jour où vous aurez un jeton permanent, mettez-le dans le
secret `WA_TOKEN` et cliquez sur *Revenir au jeton du serveur*.

## Le piège du secret GitHub

**Chaque déploiement réécrit le `.env` du serveur à partir des secrets GitHub.**
Si vous posez un jeton frais directement sur le serveur mais que le secret
`WA_TOKEN` contient encore l'ancien, le prochain déploiement remet l'ancien — et
le bot cesse de répondre sans prévenir.

Deux protections sont en place :

- le déploiement teste le jeton auprès de Meta et affiche en clair
  `!! REFUSED BY META` si le secret est périmé ;
- le tableau de bord affiche un bandeau rouge sur toutes les pages tant que le
  jeton ne passe pas.

Mais la règle simple reste : **le secret GitHub est la source de vérité.**
Mettez-y le jeton, pas seulement sur le serveur.

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
