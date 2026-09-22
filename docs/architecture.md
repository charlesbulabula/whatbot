# Chatbot WhatsApp — Livraison d'épices fraîches
## Architecture complète, auto-hébergée, low-cost

---

## 1. Principe directeur

Choix assumé pour ce projet : **auto-hébergement sur VPS + API officielle WhatsApp Cloud (Meta) en direct**, sans intermédiaire payant (pas de Twilio, pas de Wati/Landbot).

**Pourquoi ce choix est le plus économique :**
- Twilio ajoute 0,005 $ par message *en plus* du tarif Meta → sur un volume mensuel de quelques milliers de messages, c'est un surcoût inutile.
- Les plateformes no-code (Wati, Landbot, Zoko) facturent un abonnement mensuel de 15 à 50 $, en plus de prendre parfois une marge sur les messages.
- L'API WhatsApp Cloud de Meta est **gratuite à l'usage** pour toute la conversation initiée par le client (fenêtre de service de 24h) — exactement ton cas d'usage, puisque ce sont les clients qui écrivent en premier pour commander.
- Le seul coût récurrent réel devient : le VPS (5-10 $/mois) et, éventuellement, quelques messages "template" hors fenêtre de 24h (rappels, promos) à ~0,004-0,022 $ chacun selon le type.

---

## 2. Architecture technique

```
┌─────────────┐      HTTPS       ┌──────────────────────────┐
│   Client     │ ───────────────▶ │   Meta WhatsApp Cloud API │
│  (WhatsApp)  │ ◀─────────────── │   (webhook + envoi msg)   │
└─────────────┘                  └──────────────┬────────────┘
                                                  │ Webhook (HTTPS)
                                                  ▼
                                   ┌─────────────────────────────┐
                                   │      VPS (ton serveur)       │
                                   │                               │
                                   │  Nginx (reverse proxy + SSL) │
                                   │           │                   │
                                   │           ▼                   │
                                   │  Backend (Node.js/Express     │
                                   │   ou Python/FastAPI)          │
                                   │           │                   │
                                   │   ┌───────┴────────┐          │
                                   │   ▼                ▼          │
                                   │ Base de données   Logique de  │
                                   │ (PostgreSQL/       conversation│
                                   │  SQLite)           (state machine)│
                                   └─────────────────────────────┘
                                                  │
                                                  ▼
                                   Interface d'administration
                                   (page web simple : commandes du jour,
                                    catalogue, statut livraison)
```

### Composants et rôle de chacun

| Composant | Rôle | Choix recommandé (low-cost) |
|---|---|---|
| VPS | Héberge le backend en continu | Contabo, Hetzner ou VPS local — voir §3 |
| Reverse proxy | Sécurise et route les requêtes HTTPS (obligatoire pour le webhook Meta) | Nginx + Certbot (Let's Encrypt, gratuit) |
| Backend applicatif | Reçoit les messages, exécute la logique de conversation, déclenche les réponses | Node.js (Express) — léger et rapide à développer |
| Base de données | Stocke catalogue, commandes, clients, état de conversation | PostgreSQL (robuste) ou SQLite (encore plus léger si le volume reste petit) |
| Process manager | Garde le serveur actif en permanence, redémarre en cas de crash | PM2 |
| Domaine | Nécessaire pour le HTTPS du webhook | Un nom de domaine low-cost (~10 $/an) |

---

## 3. APIs utilisées

### 3.1 API principale : WhatsApp Cloud API (Meta)
- **Rôle** : recevoir les messages entrants (webhook) et envoyer les réponses
- **Coût** : gratuit pour toute réponse envoyée dans les 24h suivant un message client ; tarif réduit (~0,004-0,005 $) pour les messages "utilitaires" hors fenêtre ; ~0,022 $ pour les messages "marketing" en RDC
- **Mise en place** : nécessite un compte Meta Business, un numéro WhatsApp Business vérifié, et l'inscription à l'app Meta for Developers

### 3.2 API de paiement mobile (optionnel, phase 2)
- **Orange Money API** et/ou **Airtel Money API** — pour vérifier automatiquement un paiement au lieu de demander une capture d'écran manuelle
- Coût : dépend des frais de transaction de l'opérateur, pas de coût d'intégration fixe généralement
- Recommandation : démarrer en phase 1 avec confirmation manuelle (capture d'écran), intégrer l'API plus tard une fois le volume justifiant l'automatisation

### 3.3 API de géolocalisation (optionnel)
- **OpenStreetMap / Nominatim** (gratuit) pour estimer les zones de livraison et calculer des temps de trajet approximatifs, si tu veux automatiser le découpage en tournées

### 3.4 Ce qu'on n'utilise PAS (et pourquoi)
- ❌ Twilio — surcoût de 0,005 $/message sans bénéfice pour ton cas
- ❌ Plateforme no-code payante — abonnement récurrent inutile puisque tu développes toi-même

---

## 4. Le flow de conversation (state machine)

Chaque client a un **état de conversation** stocké en base de données, qui détermine comment le bot interprète son prochain message.

```
[DÉBUT]
   │
   ▼
ACCUEIL ──────────────▶ Affiche catalogue du jour
   │
   ▼
CHOIX_PRODUIT ────────▶ Client sélectionne un ou plusieurs produits
   │
   ▼
CHOIX_QUANTITÉ ───────▶ Pour chaque produit : petit/moyen/grand tas
   │
   ▼
AJOUT_SUPPLÉMENTAIRE ─▶ "Voulez-vous ajouter autre chose ?" (Oui/Non)
   │           │
   │ Oui       │ Non
   └───────────┘
        │
        ▼
INFOS_LIVRAISON ──────▶ Nom, quartier, numéro (pré-rempli si client connu)
   │
   ▼
RÉCAPITULATIF ────────▶ Affiche total, demande confirmation
   │
   ▼
PAIEMENT ─────────────▶ Envoie instructions mobile money
   │
   ▼
EN_ATTENTE_PREUVE ────▶ Client envoie capture d'écran
   │
   ▼
CONFIRMÉE ────────────▶ Commande enregistrée en base, notification interne
   │
   ▼
[SUIVI] ──────────────▶ Messages de statut (voir cas d'usage avancés)
```

### Règle de simplicité pour l'expérience client
- **Toujours des listes numérotées ou des boutons**, jamais de texte libre à interpréter quand une option fixe suffit — ça réduit les erreurs de compréhension du bot et accélère la commande
- **Un client reconnu (numéro déjà en base) saute l'étape "infos livraison"** — le bot propose directement "Livrer à [adresse habituelle] ? (Oui/Non)"
- **Limite du temps de réponse** : si le client ne répond pas sous 10 minutes en cours de commande, un message de relance automatique ("Toujours là ? Votre commande vous attend 🙂")
- **Annulation à tout moment** : le mot "annuler" doit être reconnu à n'importe quelle étape pour repartir de zéro

---

## 5. Cas d'usage avancés

### 5.1 Client récurrent — commande en un clic
Pour les clients ayant déjà commandé, le bot propose : *"Voulez-vous répéter votre dernière commande (Tomate moyen + Gingembre petit) ? (Oui/Non)"* — passe directement au récapitulatif si Oui.

### 5.2 Rupture de stock en temps réel
Si un produit vient à manquer en cours de journée (toi ou ton livreur mets à jour un simple statut "en rupture" en base via l'interface admin), le bot retire automatiquement ce produit du catalogue affiché aux nouveaux clients, sans que tu aies à surveiller les conversations.

### 5.3 Notification de statut de commande
Le bot envoie automatiquement (message "utilitaire", donc peu coûteux) :
- Confirmation de réception de paiement
- "Votre commande est en préparation"
- "Votre livreur est en route, arrivée estimée à [heure]"

### 5.4 Relance intelligente de commande hebdomadaire
Puisque tu achètes le stock une fois par semaine, le bot peut envoyer un rappel automatique le jeudi ou vendredi soir aux clients réguliers : *"C'est bientôt le moment de refaire le plein d'épices 🌶️ — voulez-vous passer votre commande ?"*

### 5.5 Gestion des doublons et de la fraude légère
Si un client tente de passer deux commandes le même jour, le bot peut détecter le doublon et demander confirmation ("Vous avez déjà une commande en cours aujourd'hui, voulez-vous l'ajouter à celle-ci ou en créer une nouvelle ?").

### 5.6 Tableau de bord admin simple
Une page web minimaliste (protégée par mot de passe) accessible depuis ton téléphone, listant :
- Les commandes du jour, triées par zone de livraison
- Le total à acheter par produit (calcul automatique)
- Un bouton pour marquer une commande "livrée"
- Le chiffre d'affaires du jour/de la semaine

### 5.7 Segmentation client automatique
Le bot peut catégoriser automatiquement les clients (nouveau / régulier / VIP selon fréquence d'achat) pour te permettre plus tard de cibler des offres différentes.

---

## 6. Idées avancées supplémentaires (pas encore abordées)

- **Commande vocale simplifiée** : beaucoup de clients à Kinshasa préfèrent envoyer un message vocal plutôt que taper. Ajouter une transcription automatique (speech-to-text) pour convertir le vocal en texte interprétable par le bot, avec confirmation ("J'ai compris : 2 tas de tomates, c'est correct ?")
- **Programme de parrainage** : le bot propose automatiquement un code de parrainage après une 2e commande réussie — "Partagez ce code à un ami, vous gagnez tous les deux une réduction sur votre prochaine commande"
- **Prévision de la demande** : en analysant l'historique des commandes en base de données, générer chaque vendredi une estimation automatique des quantités à acheter le samedi, pour affiner (et non remplacer) ton jugement
- **Alerte de dépassement de capacité** : si le nombre de commandes reçues dépasse ce que ton stock hebdomadaire permet de couvrir, le bot bascule automatiquement en liste d'attente et prévient le client ("Stock complet pour cette semaine, voulez-vous être notifié en priorité la semaine prochaine ?")
- **Mini-sondage post-livraison** : un message automatique 24h après la livraison ("Tout s'est bien passé ? 1-5 ⭐") pour construire une réputation et détecter les problèmes tôt
- **Multi-langue** : proposer le choix Français/Lingala dès le premier message, pour élargir ta base de clients
- **Carte de fidélité numérique** : après X commandes, un message automatique propose une remise ou un produit offert, sans gestion manuelle de ta part
- **Zone de livraison dynamique** : si tu élargis progressivement tes quartiers couverts, le bot peut vérifier automatiquement (via le quartier renseigné) si la zone est actuellement desservie avant de laisser le client continuer sa commande

---

## 7. Budget récapitulatif (mensuel, low-cost)

| Poste | Coût estimé |
|---|---|
| VPS (Contabo/Hetzner, config basique) | 5-10 $/mois |
| Nom de domaine | ~1 $/mois (payé annuellement) |
| Certificat SSL (Let's Encrypt) | Gratuit |
| API WhatsApp Cloud (messages dans la fenêtre 24h) | Gratuit |
| Messages "utilitaires" hors fenêtre (rappels, statuts) | Quelques dollars/mois selon volume |
| **Total estimé** | **~8-15 $/mois** une fois développé |

Le seul investissement significatif reste le **temps de développement initial** (ou le coût d'un freelance si tu ne codes pas toi-même, voir estimation précédente de 300-500 $ pour un bot de cette complexité).
