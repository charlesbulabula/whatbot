# whatbot — commandes d'épices fraîches par WhatsApp

Bot WhatsApp auto-hébergé pour la livraison d'épices et de légumes frais à Kinshasa.
Il suit `docs/architecture.md` : API WhatsApp Cloud de Meta en direct (sans Twilio ni
plateforme payante), Node.js + Express, SQLite, Nginx + Let's Encrypt, sur ton VPS.

Le bot parle **français par défaut**, et **anglais** au choix du client (bouton du menu
ou mot « english »). Le tableau de bord admin suit la même règle (lien « English » en haut).

## Ce que fait le bot

| Architecture (§) | Fonction |
|---|---|
| §4 | Parcours complet : catalogue → taille du tas → quantité → « autre chose ? » → adresse → récapitulatif → paiement mobile money → capture d'écran |
| §4 | Toujours des boutons ou des listes ; le client peut aussi répondre par numéro ou par nom (« tomate », « limete ») |
| §4 | **annuler** à tout moment ; **menu**, **aide**, **english / français**, **stop** (désabonnement des rappels) |
| §4 | Client connu : « Livrer à Mama Nzinga, Gombe ? » au lieu de redemander l'adresse |
| §4 | Relance automatique après 10 min d'inactivité en cours de commande (une seule fois) |
| §5.1 | « 🔁 Même commande » : répète la dernière commande en un clic |
| §5.2 | Produit marqué épuisé dans l'admin → retiré du catalogue et des paniers en cours |
| §5.3 | Messages de statut : paiement reçu, en préparation, livreur en route (avec heure estimée), livrée |
| §5.4 | Rappel hebdomadaire aux clients réguliers (vendredi 18 h par défaut) |
| §5.5 | Deuxième commande le même jour : « Y ajouter » (un seul paiement) ou « Nouvelle » |
| §5.6 | Tableau de bord protégé par mot de passe : commandes du jour par quartier, quantités à préparer, bouton « Livrée », CA jour et 7 jours |
| §5.7 | Segments automatiques : nouveau / régulier (2+) / VIP (6+) |
| §6 | Parrainage (code envoyé après la 2ᵉ commande, crédit pour les deux), carte de fidélité (crédit toutes les N commandes), liste d'attente quand le stock hebdo est plein, sondage 1-5 ⭐ 24 h après livraison, zones de livraison vérifiées, prévision d'achat sur 4 semaines, partage de position GPS comme adresse |

### Fonctions avancées

| Fonction | Ce que ça fait |
|---|---|
| **Commande en texte libre** (optionnel) | « 2 tas moyens de tomates et un petit gingembre » → le bot répond « J'ai compris : … C'est correct ? ». Utilise Claude (`ANTHROPIC_API_KEY`) ; sans clé, seuls les boutons sont proposés. Limite de 30 phrases analysées par client et par jour. |
| **Position GPS → quartier** | Le client partage sa position : le bot reconnaît la commune (OpenStreetMap, gratuit), vérifie qu'elle est desservie et saute les questions quartier + adresse. |
| **Parler à une personne** | Le client tape « agent » : le bot se tait, tu es alerté, tu réponds depuis la fiche client du tableau de bord (photos et vocaux lisibles). « Rendre la main au bot » quand c'est fini. |
| **Feuille de route du livreur** | Un lien secret par jour (sans mot de passe admin) à envoyer au livreur sur WhatsApp : ses livraisons avec appel, WhatsApp, itinéraire ; il marque « Je pars » et « Livrée », le client est prévenu. Le lien expire après 2 jours. |
| **Statistiques** | Chiffre d'affaires par jour, panier moyen, clients fidèles, note moyenne, produits et quartiers, sur 7, 30 ou 90 jours. |
| **Export CSV** | Toutes les commandes d'une période, lisible directement dans Excel. |
| **Horaires d'ouverture** | Un horaire par jour de la semaine, plus un interrupteur « fermer maintenant ». Hors horaires le bot répond poliment, indique la prochaine ouverture et n'enregistre aucune commande. |
| **Zones de livraison à frais variables** | Chaque quartier a ses propres frais de livraison, appliqués automatiquement. Une zone peut être suspendue sans être supprimée. |
| **Paiement à la livraison** | En plus du mobile money : le client choisit au moment de valider, et le livreur voit le montant exact à encaisser sur sa feuille de route (avec le total de la tournée). |
| **Codes promo** | Montant fixe, pourcentage ou livraison offerte ; panier minimum, date d'expiration, limite d'utilisations, une seule fois par client. Annuler une commande libère le code. |
| **Commande minimum** | En dessous du montant fixé, le bot renvoie au catalogue avant même de demander l'adresse. |
| **Réglages sans redéploiement** | Nom de la boutique, horaires, numéros mobile money, numéro d'alerte, frais, capacité et commande minimum se modifient depuis le tableau de bord. |
| **Tableau de bord en temps réel** | Nouveau message, nouvelle commande, changement de statut, demande d'agent : le tableau de bord se met à jour tout seul, sans rechargement manuel (Server-Sent Events). S'il est en train de taper, rien n'est perdu : une pastille propose d'actualiser. |
| **Alertes e-mail (SMTP)** | En plus de WhatsApp, chaque nouvelle commande et chaque demande d'agent part par e-mail. Indispensable : hors de la fenêtre de 24 h, WhatsApp refuse les messages libres, l'e-mail passe toujours. Bouton « Envoyer un e-mail de test » dans les réglages. |
| **Facture PDF avec QR vérifiable** | Chaque commande a une facture imprimable. Le QR code ouvre une page publique qui relit la commande en base : une facture authentique se vérifie en deux secondes, une facture inventée est refusée. Bon de préparation et bon d'achat du jour imprimables également. |
| **Recherche globale** | Une barre en haut de chaque page (raccourci `/`) qui trouve une commande, un client ou un code promo. |
| **Tableau de bord graphique** | Courbe du chiffre d'affaires avec les nouveaux clients en surimpression, répartition par statut, commandes par heure, meilleures ventes, et comparaison automatique avec la période précédente. |
| **Filtres, tri, pagination** | Sur les commandes et les clients : recherche, statut, quartier, moyen de paiement, plage de dates, segment, colonnes triables, export CSV du résultat filtré. |
| **Fiche client complète** | Aperçu avec historique d'activité, commandes, conversation, fidélité et notes — en onglets. Notes internes, étiquettes cherchables, blocage d'un client (le bot cesse alors de lui répondre). |
| **Grand livre de fidélité** | Chaque mouvement de crédit est expliqué : fidélité, parrainage, ajustement manuel, utilisation, remboursement. Ajustement manuel possible depuis la fiche, jamais en négatif. |
| **Page parrainage** | Total des filleuls, taux de conversion, classement des meilleurs parrains, et pour chaque client la liste de ses filleuls. |
| **Dépenses et marge** | Achats de stock, transport, salaires : le chiffre d'affaires devient une marge réelle, avec répartition par catégorie. |
| **Stock et alerte de seuil** | Quantité par produit et seuil d'alerte ; le tableau de bord prévient quand il reste peu. |
| **Diffusion ciblée** | Un message à tous les clients joignables, aux réguliers, aux VIP ou à la liste d'attente. Les désabonnés et les clients bloqués sont toujours exclus. |
| **Journal d'activité** | Tout ce que le tableau de bord modifie est tracé (qui, quoi, quand), conservé un an. |
| **Rapport quotidien par e-mail** | Un résumé chaque soir après la fermeture : commandes, encaissé, paiements à vérifier, à acheter pour demain. |
| **Sauvegarde en un clic** | Un fichier SQLite complet téléchargeable depuis les réglages, en plus de la sauvegarde automatique quotidienne. |
| **Messages vocaux compris** | Le vocal du client est transcrit puis traité comme du texte : mots-clés, boutons par leur nom, et commande en langage libre. Fournisseur au choix (`STT_PROVIDER=openai` ou `deepgram`) ; sans clé, le bot demande poliment d'utiliser les boutons. |
| **Comptes et rôles** | Patron / Vendeur / Livreur, chacun avec son identifiant et son mot de passe (haché en scrypt). Le vendeur ne voit ni les réglages ni la comptabilité, le livreur ne voit que les commandes. Le compte du `.env` reste la porte de secours. |
| **Créneaux de livraison** | « Ce matin », « demain après-midi », avec une capacité par créneau. Un créneau plein disparaît, un créneau qui commence dans moins d'une heure n'est plus proposé pour aujourd'hui. |
| **Photos produits** | Envoyées au client au moment de choisir la taille, et affichées dans le tableau de bord. |
| **Catalogue WhatsApp natif** | Avec un catalogue Meta (Commerce Manager), WhatsApp affiche les produits avec leurs vignettes et le client remplit un panier dans l'application ; le bot le reprend tel quel. |
| **Variantes et suppléments** | Au-delà de petit/moyen/grand : botte, kilo, ce que vous voulez, avec leur prix. Et des suppléments optionnels (« préparé », « nettoyé ») proposés après la quantité. |
| **Abonnement hebdomadaire** | « Le même panier chaque samedi » : le bot recrée la commande automatiquement et prévient le client, qui peut sauter la semaine ou arrêter. |
| **Relance des clients inactifs** | Après N jours sans commande, un message avec un code promo **personnel**, à usage unique et valable 14 jours. |
| **Paliers de fidélité** | Bronze / Argent / Or selon le nombre de commandes payées, avec une réduction automatique sur la livraison et un message de félicitations au passage de palier. |
| **Tournée optimisée** | Les adresses partagées en position GPS sont ordonnées par OSRM (gratuit), avec la distance et la durée estimées ; les autres restent groupées par quartier. |
| **Suivi livreur en direct** | Le livreur partage sa position depuis sa feuille de route ; le client reçoit un lien de suivi avec une carte, la distance et l'heure estimée. |
| **Lingala** | Troisième langue du bot, à côté du français et de l'anglais. |
| **Application installable (PWA)** | Le tableau de bord s'installe sur le téléphone et reçoit des notifications push à chaque nouvelle commande. |
| **Comptabilité** | Journal de caisse (ventes et dépenses), récapitulatif mensuel, ventilation TVA et export CSV exploitable par un comptable. |
| **Robustesse** | Captures de paiement copiées sur le serveur (les liens Meta expirent), sauvegarde quotidienne de la base (14 jours), migration automatique de la base à chaque mise à jour, blocage après 10 mauvais mots de passe admin, arrêt propre lors des redéploiements. |

**Pas encore fait :** vérification automatique du paiement via les API Orange Money /
Airtel Money (aujourd'hui : capture d'écran vérifiée à la main dans l'admin). Le reste de
la phase 2 est en place.

## Mise en ligne

> **Réglages `.env` ou tableau de bord ?** Les variables `.env` du bloc *Shop*
> (`SHOP_NAME`, `DELIVERY_FEE`, `DELIVERY_ZONES`, `SHOP_HOURS`, `MOMO_*`,
> `ADMIN_NOTIFY_NUMBER`) ne servent qu'à **initialiser** une installation neuve.
> Ensuite, tout se règle dans *Réglages* et *Zones de livraison* : pas de redéploiement,
> pas de secret GitHub à changer. Les identifiants Meta et `ADMIN_PASSWORD` restent
> dans `.env`.

### 1. DNS : créer `bot.ll-aca.site` (une seule fois)

Chez LWS : Espace client → domaine **ll-aca.site** → **Zone DNS** → Ajouter un enregistrement :

| Type | Nom | Valeur |
|---|---|---|
| A | `bot` | `72.62.238.174` |

Ne modifie **pas** l'enregistrement `@` existant : il sert ton site et ta messagerie LWS.
Le sous-domaine est prêt en général en quelques minutes (parfois jusqu'à une heure).

### 2. Déployer

#### Option A — automatiquement par GitHub (recommandé, aucun terminal)

Chaque `push` sur la branche par défaut lance les tests, puis déploie s'ils passent.
Il suffit d'enregistrer les réglages comme **secrets** du repo, une seule fois :
https://github.com/charlesbulabula/whatbot/settings/secrets/actions/new

| Secret | Valeur |
|---|---|
| `VPS_PASSWORD` | mot de passe root du VPS (obligatoire pour déployer) |
| `ADMIN_PASSWORD` | mot de passe du tableau de bord |
| `WA_VERIFY_TOKEN` | un mot de ton choix, à recopier dans Meta |
| `WA_PHONE_NUMBER_ID`, `WA_TOKEN`, `WA_APP_SECRET`, `WA_BUSINESS_NUMBER` | fournis par Meta (étape 3) |
| `MOMO_ORANGE`, `MOMO_AIRTEL`, `MOMO_HOLDER`, `ADMIN_NOTIFY_NUMBER` | réglages de la boutique |
| `ANTHROPIC_API_KEY` | facultatif : commandes en texte libre |

Pour redéployer sans modifier le code (par exemple après avoir ajouté un secret) :
onglet **Actions** → *Test & deploy* → **Run workflow**. Le repo étant public, ses logs
le sont aussi : le script n'y affiche jamais la valeur d'un secret, seulement ✔ / ✘.

#### Option B — depuis ton Mac

```bash
cd ~/whatbot
git pull
./deploy/deploy.sh
```

Le mot de passe root est demandé **une seule fois**. Le script :

- est **additif** : il n'écrit que dans `/opt/whatbot`, un service `whatbot`, un vhost Nginx
  `whatbot` et une tâche de sauvegarde. Il ne touche pas aux autres sites du VPS (1fluence…),
  n'active aucun pare-feu, et s'arrête si le port 3023 ou le dossier appartiennent à autre chose ;
- installe Node 22, Nginx et Certbot seulement s'ils manquent ;
- crée `/opt/whatbot/.env` au premier passage avec un **mot de passe admin** et un **jeton de
  vérification webhook** aléatoires, puis ne le touche plus jamais ;
- démarre le service, pose le certificat HTTPS dès que le DNS pointe vers le VPS ;
- affiche à la fin l'URL du webhook, le jeton et le mot de passe admin.

Relance `./deploy/deploy.sh` après chaque modification du code : la base de données et
`.env` sont conservés.

Autre domaine ou autre port : `DOMAIN=autre.exemple.com PORT=3030 ./deploy/deploy.sh`.

### 3. Configurer Meta (WhatsApp Cloud API)

1. **business.facebook.com** : crée (ou choisis) ton portefeuille Business.
2. **developers.facebook.com** → Créer une app → type **Business** → ajoute le produit **WhatsApp**.
3. WhatsApp → **API Setup** : ajoute ton numéro professionnel et vérifie-le par SMS.
   Note le **Phone number ID**. Le numéro ne doit pas être utilisé en même temps dans
   l'application WhatsApp du téléphone.
4. **Jeton permanent** : Paramètres Business → Utilisateurs → **Utilisateurs système** →
   Ajouter (admin) → Attribuer les ressources (l'app + le compte WhatsApp) → Générer un jeton
   avec `whatsapp_business_messaging` et `whatsapp_business_management`, expiration **Jamais**.
5. **App secret** : Paramètres de l'app → Général → Clé secrète.
6. Renseigne ces valeurs : en secrets GitHub puis *Run workflow* (option A), ou sur le serveur (option B) :

   ```bash
   ssh root@72.62.238.174
   nano /opt/whatbot/.env      # WA_PHONE_NUMBER_ID, WA_TOKEN, WA_APP_SECRET,
                               # WA_BUSINESS_NUMBER, MOMO_*, ADMIN_NOTIFY_NUMBER, prix livraison…
   systemctl restart whatbot
   ```

7. WhatsApp → **Configuration** → Webhook : URL `https://bot.ll-aca.site/webhook` et le
   jeton affiché par le script → **Vérifier et enregistrer** → abonne le champ **messages**.
8. Publie l'app (mode **Live**). En mode développement, seuls les numéros de test ajoutés
   peuvent parler au bot.

Écris « Bonjour » au numéro du bot : le menu doit s'afficher.

### 4. Modèles de messages (facultatif, mais recommandé)

Meta n'autorise les messages libres que dans les **24 h** suivant le dernier message du
client. Au-delà (rappel du vendredi, sondage le lendemain de la livraison, statut envoyé
tard), il faut un **modèle approuvé**. Sans modèle, le bot saute simplement ces envois.

Crée-les dans WhatsApp Manager → Modèles de message, en **français (fr)** et **anglais (en)**
sous le même nom, puis mets ce nom dans `.env` :

| Variable `.env` | Nom conseillé | Catégorie | Texte FR (variables) |
|---|---|---|---|
| `WA_TEMPLATE_ORDER_UPDATE` | `order_update` | Utilitaire | Bonjour, votre commande {{1}} est maintenant : {{2}}. Merci de votre confiance ! |
| `WA_TEMPLATE_WEEKLY_REMINDER` | `weekly_reminder` | Marketing | Bonjour {{1}} ! C'est bientôt le moment de refaire le plein d'épices 🌶️ Répondez à ce message pour commander. |
| `WA_TEMPLATE_SURVEY` | `delivery_survey` | Utilitaire | Bonjour {{1}}, votre commande {{2}} s'est-elle bien passée ? Répondez par une note de 1 à 5 ⭐ |
| `WA_TEMPLATE_WAITLIST_OPEN` | `waitlist_open` | Utilitaire | Bonne nouvelle {{1}} : les commandes sont rouvertes ! Répondez à ce message pour commander. |
| `WA_TEMPLATE_ADMIN_ALERT` | `admin_alert` | Utilitaire | Nouvelle preuve de paiement pour la commande {{1}} ({{2}}). Ouvrez le tableau de bord pour la vérifier. |

Coût indicatif (architecture §3.1) : ~0,004-0,005 $ par message utilitaire hors fenêtre,
~0,022 $ par message marketing. Tout le reste (la commande elle-même) est gratuit.

## Au quotidien

- **Tableau de bord** : `https://bot.ll-aca.site/admin` (utilisateur `admin`, mot de passe dans `.env`).
  - Commandes du jour groupées par quartier, lien vers la capture de paiement,
    boutons de statut : chaque clic prévient le client sur WhatsApp.
  - « À préparer ce jour » : total par produit et taille de tas.
  - « Prévision d'achat » : moyenne hebdomadaire des 4 dernières semaines, pour ton achat du samedi.
  - **Produits** : prix, ajout, et « Marquer épuisé » en un clic.
  - **Zones de livraison** : frais par quartier, et suspension d'une zone sans la supprimer.
  - **Codes promo** : création, limites, activation/désactivation.
  - **Clients** : recherche par nom, téléphone ou quartier, filtre par segment, crédit,
    code parrain, conversation complète.
  - **Réglages** : horaires d'ouverture, fermeture immédiate, mobile money,
    paiement à la livraison, commande minimum, capacité, numéro d'alerte.
  - Thème clair / sombre (icône en haut à droite) ; par défaut celui de l'appareil.
  - Mise à jour en temps réel : pas besoin de recharger la page.
  - Recherche globale en haut de page (raccourci clavier `/`), menu de compte à droite.
  - **Fidélité** : crédits en circulation, mouvements, meilleurs parrains.
  - **Dépenses** : saisie des achats et calcul de la marge.
  - **Diffusion** : message ciblé aux clients joignables.
  - **Journal** : tout ce qui a été modifié depuis le tableau de bord.
  - **Créneaux** : horaires de livraison et capacité par créneau.
  - **Abonnements** : les paniers hebdomadaires en cours.
  - **Équipe** : comptes et rôles.
  - **Comptabilité** : journal de caisse et export.
  - Fiche produit : variantes, suppléments, photo et identifiant catalogue Meta.
- **Alerte admin** : mets ton numéro perso dans `ADMIN_NOTIFY_NUMBER` pour recevoir chaque
  capture de paiement. Écris « Bonjour » au bot une fois par jour depuis ce numéro pour
  garder la fenêtre de 24 h ouverte, ou crée le modèle `admin_alert`.
- **Statistiques** et **export CSV** : onglet *Statistiques* du tableau de bord.
- **Alertes e-mail** : renseigne `SMTP_HOST`, `SMTP_FROM` (et `SMTP_USER` / `SMTP_PASS`) dans le
  `.env` du serveur, puis l'adresse destinataire dans *Réglages → Alertes*. Le bouton
  « Envoyer un e-mail de test » vérifie la connexion. C'est le filet de sécurité quand la
  fenêtre WhatsApp de 24 h est fermée. Active aussi *Rapport quotidien* pour recevoir
  le résumé du soir.
- **Facture** : bouton *Facture* sur une commande → impression ou PDF (via la boîte
  d'impression du navigateur). Le QR code mène à une page publique de vérification ;
  aucune donnée personnelle n'y figure à part le prénom.
- **Impression** : les listes (commandes, clients, dépenses, statistiques) s'impriment
  proprement — menu, filtres et boutons sont retirés à l'impression.
- **Livreur** : bouton « 🛵 Feuille de route du livreur » sur le tableau de bord → « Envoyer au livreur par WhatsApp ».
- **Coût de la commande en texte libre** : environ 1 centime de dollar par phrase analysée avec
  le modèle par défaut (`ANTHROPIC_MODEL=claude-opus-5`). Un modèle plus léger coûte moins
  cher, au prix d'une compréhension moins fine : à toi de choisir.
- **Capacité** : *Réglages → Capacité hebdomadaire*. À `40`, les nouvelles commandes basculent
  en liste d'attente au-delà de 40 commandes sur 7 jours ; les clients en attente sont prévenus
  dès qu'une place se libère. (`WEEKLY_STOCK_CAPACITY` ne sert plus qu'à la valeur initiale.)
- **Fermer la boutique** : *Réglages → Fermer la boutique maintenant*, avec un message
  affiché aux clients (« Stock en cours de réapprovisionnement »). Le bandeau du tableau de
  bord et la pastille de la barre latérale rappellent en permanence que la boutique est fermée.
- **Paiement à la livraison** : à activer dans *Réglages → Paiement*. Une commande en espèces
  reste « en attente de paiement » jusqu'à ce que tu la confirmes ; le tableau de bord affiche
  le total d'espèces à encaisser sur la journée, et la feuille de route du livreur le détail.

## Diagnostic

```bash
ssh root@72.62.238.174 'systemctl status whatbot'
ssh root@72.62.238.174 'journalctl -u whatbot -n 100 --no-pager'
ssh root@72.62.238.174 'ls /opt/whatbot/data/backups'     # sauvegarde quotidienne, 14 jours
```

## Développement local

```bash
npm install
cp .env.example .env        # WA_ENABLED=false pour ne rien envoyer à Meta
npm test                    # 50 tests : parcours client, webhook signé, admin, livreur, IA, migrations…
npm run dev                 # http://127.0.0.1:3023/admin
```

```
src/
  bot/engine.js        state machine de la conversation (un état + un contexte JSON par client)
  bot/cart.js          panier, prix, crédit
  bot/orders.js        changements de statut, fidélité, parrainage, alertes admin
  bot/notify.js        envoi hors conversation (fenêtre 24 h, sinon modèle)
  bot/messages.js      boutons / listes / texte selon les limites WhatsApp
  i18n/fr.js, en.js    textes du bot (mêmes clés, vérifié par les tests)
  whatsapp/            webhook Meta, signature HMAC, client Graph API
  admin/               tableau de bord (FR/EN), feuille de route du livreur, statistiques
  ai/                  commande en texte libre (Claude, optionnel)
  geo/                 position GPS → quartier (OpenStreetMap)
  jobs/scheduler.js    relances, sondages, rappel hebdo, liste d'attente
  db/                  schéma SQLite, requêtes, catalogue de départ, sauvegarde
deploy/                script de déploiement, service systemd, vhost Nginx, cron de sauvegarde
.github/workflows/     tests + déploiement automatique
```

Écart assumé avec l'architecture : le processus est géré par **systemd** plutôt que PM2.
Le rôle est le même (redémarrage en cas de crash et au boot), et c'est ce qu'utilisent
déjà les autres sites de ce VPS.
