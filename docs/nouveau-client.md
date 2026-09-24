# Installer le bot chez un nouveau client

Liste tirée du code : `src/config.js` pour les réglages, `deploy/deploy.sh`
pour le serveur, `.github/workflows/deploy.yml` pour les secrets.

Compter **une demi-journée de travail technique**, plus le délai de Meta
(quelques heures à quelques jours) s'il faut vérifier l'entreprise.

---

## 1. Ce que le client doit fournir

- [ ] **Une SIM dédiée** au bot, sur laquelle il peut recevoir un SMS ou un
      appel. **Aucun compte WhatsApp ne doit exister dessus** — s'il y en a un :
      *Réglages → Compte → Supprimer mon compte*, puis attendre quelques minutes.
      C'est le point qui bloque le plus souvent.
- [ ] **Le nom d'affichage** que verront les clients. Meta le relit ; il doit
      avoir un rapport évident avec l'entreprise.
- [ ] **Le nom légal, l'adresse et le téléphone** de l'entreprise, pour le
      profil Meta. Aucun document à ce stade.
- [ ] **Les numéros mobile money** — Orange, Airtel — et le nom du titulaire
      affiché au client.
- [ ] **Le catalogue** : produits, tailles, prix. Le bot démarre avec huit
      produits d'exemple, à remplacer.
- [ ] **Les quartiers livrés** et le tarif de livraison de chacun.
- [ ] **Les horaires** d'ouverture.
- [ ] **Un numéro WhatsApp** pour recevoir les alertes de la boutique.

Nécessaires seulement pour lever les plafonds de démarchage, **pas pour
démarrer** : RCCM ou équivalent, attestation fiscale, et une facture
d'électricité ou un relevé bancaire au nom et à l'adresse de l'entreprise.

---

## 2. Infrastructure

- [ ] **Un VPS Debian ou Ubuntu**, accès root en SSH. Le déploiement installe
      lui-même ce qui manque : Node 22, nginx, certbot, rsync. Il crée un
      utilisateur système `whatbot` et un service systemd. Il ne touche à aucun
      autre site déjà hébergé.
- [ ] **Un sous-domaine** pointant sur le VPS (`bot.exemple.com`). Le
      certificat HTTPS est obtenu automatiquement par certbot — le webhook de
      Meta exige HTTPS valide.
- [ ] **Un port libre** en local pour le service (3023 par défaut).
- [ ] **Une adresse e-mail** pour les avis d'expiration Let's Encrypt.
- [ ] **Un dépôt GitHub** (fork ou copie) pour le déploiement automatique.

Ressources : le bot est léger — 250 Ko de base après plusieurs mois, moins de
100 Mo de mémoire. Le plus petit VPS suffit.

Les trois variables à changer en tête de `deploy/deploy.sh` : `VPS`, `DOMAIN`,
`EMAIL`, et `PORT` s'il est déjà pris.

---

## 3. Comptes Meta

- [ ] **Un compte Facebook** pour le client, avec le rôle **administrateur**.
- [ ] **Un portefeuille d'entreprise** sur `business.facebook.com`,
      **profil complété** (§1). Tant qu'il ne l'est pas, un numéro ajouté reste
      en attente et n'enverra jamais.
- [ ] **Une application développeur** sur `developers.facebook.com`, produit
      *WhatsApp* ajouté, rattachée à ce portefeuille, passée en **mode Live**.
- [ ] **Les URLs légales** dans les paramètres de base de l'app — le bot les
      sert déjà : `https://<domaine>/privacy` et `https://<domaine>/terms`.
- [ ] **Le numéro ajouté et vérifié**, puis enregistré sur l'API Cloud avec un
      **code PIN à 6 chiffres** à conserver.
- [ ] **Un utilisateur système** et un **jeton permanent**, avec les portées
      `business_management`, `whatsapp_business_messaging`,
      `whatsapp_business_management`.
- [ ] **Le webhook** sur `https://<domaine>/webhook`, abonné au seul champ
      `messages`.
- [ ] **Les six modèles de message** soumis et approuvés (§5).

Le serveur MCP *WhatsApp Business Tools* de Meta fait la plupart de ces étapes
depuis une conversation avec Claude. Trois restent manuelles : compléter le
profil, générer le jeton, et gérer la liste blanche du numéro de test.

---

## 4. Secrets GitHub

*Dépôt → Settings → Secrets and variables → Actions.*

**Indispensables** — sans eux le service démarre mais refuse le trafic :

| Secret | Contenu |
|---|---|
| `WHATBOT_VPS` / `SSHPASS` | accès au serveur |
| `WHATBOT_WA_PHONE_NUMBER_ID` | identifiant du numéro |
| `WHATBOT_WA_TOKEN` | le jeton permanent |
| `WHATBOT_WA_VERIFY_TOKEN` | chaîne aléatoire, la même que côté Meta |
| `WHATBOT_WA_APP_SECRET` | secret de l'app, vérifie la signature des webhooks |
| `WHATBOT_ADMIN_PASSWORD` | mot de passe du tableau de bord |

**Recommandés :**

| Secret | Sert à |
|---|---|
| `WHATBOT_WA_APP_ID` | échanger un jeton court contre un jeton long |
| `WHATBOT_WA_BUSINESS_NUMBER` | les liens de parrainage (sans « + ») |
| `WHATBOT_MOMO_ORANGE`, `WHATBOT_MOMO_AIRTEL`, `WHATBOT_MOMO_HOLDER` | les instructions de paiement |
| `WHATBOT_ADMIN_NOTIFY_NUMBER` | les alertes WhatsApp à la boutique |
| `WHATBOT_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`, `_FROM`, `WHATBOT_ALERT_EMAIL` | les alertes par e-mail |

**Optionnels** — chaque clé vide désactive proprement sa fonction :

| Secret | Fonction |
|---|---|
| `WHATBOT_ANTHROPIC_API_KEY` | comprendre une commande écrite en langage libre |
| `WHATBOT_STT_PROVIDER`, `WHATBOT_STT_API_KEY` | transcrire les messages vocaux |

> **Le secret GitHub fait foi.** Chaque déploiement réécrit le `.env` du serveur
> à partir des secrets. Un jeton posé seulement sur le serveur est écrasé au
> déploiement suivant. Seul le jeton collé dans *Réglages → Système* du tableau
> de bord survit, parce qu'il est stocké en base.

---

## 5. Modèles de message

Six modèles, en français et en anglais, créés par
`node deploy/meta-setup.js --apply`. Ils ne servent qu'en dehors de la fenêtre
de 24 h — presque tout le trafic du bot se passe dedans.

| Secret | Modèle | Sert à |
|---|---|---|
| `WA_TEMPLATE_ORDER_UPDATE` | `order_update` | changement de statut |
| `WA_TEMPLATE_SURVEY` | `delivery_survey` | note 24 h après livraison |
| `WA_TEMPLATE_WEEKLY_REMINDER` | `weekly_reminder` | rappel hebdomadaire |
| `WA_TEMPLATE_WAITLIST_OPEN` | `waitlist_open` | une place se libère |
| `WA_TEMPLATE_WINBACK` | `winback_offer` | relance d'un client inactif |
| `WA_TEMPLATE_ADMIN_ALERT` | `shop_alert` | alerte à la boutique |

L'approbation prend de quelques minutes à 24 h. Une fois approuvés, mettre les
noms dans les secrets correspondants et redéployer.

---

## 6. Réglages depuis le tableau de bord

Tout le reste se règle sans toucher au code, dans *Réglages* :

- [ ] Nom de la boutique, devise, montant minimum de commande
- [ ] Horaires d'ouverture, et l'interrupteur « fermé maintenant »
- [ ] Quartiers livrés et tarif de chacun
- [ ] Produits, variantes (tailles), suppléments, photos, stock et seuil d'alerte
- [ ] Créneaux de livraison
- [ ] Codes promo
- [ ] Fidélité : paliers, récompenses, parrainage
- [ ] Comptes de l'équipe et leurs rôles — propriétaire, vendeur, livreur
- [ ] Paiement : mobile money, espèces à la livraison, ou les deux
- [ ] Langues proposées au client — français, anglais, lingala

---

## 7. Ordre de marche

1. Créer le dépôt, changer `VPS`, `DOMAIN`, `EMAIL`, `PORT` dans `deploy/deploy.sh`.
2. Faire pointer le sous-domaine sur le VPS.
3. Poser les six secrets indispensables (un `WA_VERIFY_TOKEN` inventé suffit
   pour l'instant).
4. Lancer le déploiement. Le tableau de bord doit répondre en HTTPS.
5. Côté Meta : profil, app, numéro, jeton, webhook.
6. Mettre les vrais secrets WhatsApp, redéployer.
7. `node deploy/meta-setup.js --check` : le rapport liste ce qui manque encore.
8. `--apply` : soumet les modèles.
9. Saisir le catalogue, les quartiers, les horaires, l'équipe.
10. Écrire « Bonjour » au numéro depuis un téléphone. La conversation doit
    apparaître en direct dans le tableau de bord.
11. Purger les données d'exemple : `node deploy/seed-demo.js --purge`.

---

## 8. Ce qu'il faut savoir avant de s'engager

**Sauvegarde.** Le déploiement installe une sauvegarde quotidienne à 03:15,
rotation sur 14 jours, dans `/opt/whatbot/data/backups`. Elle est **sur le même
disque que la base** : prévoir une copie hors-site.

**Supervision.** Rien ne prévient si le bot s'arrête ou si le jeton expire. Un
bandeau rouge apparaît dans le tableau de bord, mais encore faut-il l'ouvrir.

**Coût d'exploitation.** Les conversations ouvertes par le client sont
gratuites — c'est l'essentiel du trafic. Les modèles utilitaires coûtent
quelques centimes, les modèles marketing environ 0,022 $ en RDC. S'ajoutent le
VPS, le domaine, et la clé IA si elle est activée.

**Plafonds.** Un compte non vérifié peut démarcher 250 contacts par 24 h. Les
réponses aux clients ne sont pas comptées. La limite monte seule si la qualité
du numéro reste bonne.

**Qualité du numéro.** Elle baisse si des clients bloquent ou signalent. Deux
règles : ne jamais écrire à quelqu'un qui n'a pas écrit en premier, et laisser
« stop » fonctionner — le bot le gère déjà.
