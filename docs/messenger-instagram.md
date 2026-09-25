# Brancher Messenger et Instagram

Le même bot, sur la Page Facebook et le compte Instagram professionnel de la
boutique. Le client commande de la même façon, et tout arrive dans le même
tableau de bord, avec une pastille indiquant par où il est passé.

Tant que `META_PAGE_ID` et `META_PAGE_TOKEN` sont vides, **le canal est éteint**
et `/meta/webhook` répond 404. Rien ne change pour WhatsApp.

---

## Ce qu'il faut côté Meta

1. **Une Page Facebook** pour la boutique, et un **compte Instagram
   professionnel** relié à cette Page (*Paramètres Instagram → Compte → Outils
   professionnels*).
2. Dans l'application développeur, ajouter les produits **Messenger** et
   **Instagram**.
3. **Lier la Page à l'application** et générer un **jeton de Page**.
4. **S'abonner aux webhooks** — champ `messages` pour Messenger comme pour
   Instagram, sur `https://<domaine>/meta/webhook`. Le jeton de vérification est
   `META_VERIFY_TOKEN`, ou à défaut le même que celui de WhatsApp.
5. Demander la permission **Human Agent** dans *Autorisations et
   fonctionnalités*. Elle autorise à répondre **jusqu'à 7 jours** après le
   dernier message du client, au lieu de 24 heures — c'est bien plus souple que
   WhatsApp, qui exige un modèle approuvé au-delà.

## Les secrets à poser

| Secret GitHub | Contenu |
|---|---|
| `META_PAGE_ID` | l'identifiant de la Page Facebook |
| `META_PAGE_TOKEN` | le jeton de Page |
| `META_INSTAGRAM_ID` | le compte Instagram professionnel lié (facultatif) |

## Ce qui change dans le bot, et ce qui ne change pas

**Rien dans la conversation.** `src/bot/engine.js` n'importe rien de
`src/whatsapp/` : il produit des messages neutres que chaque canal traduit. Le
catalogue, les rayons, le panier, les créneaux, la fidélité, les suggestions,
la reprise de commande — tout fonctionne à l'identique.

**L'adressage** porte le canal en préfixe, pour ne rien migrer :

| Adresse | Canal |
|---|---|
| `243810000001` | WhatsApp (inchangé) |
| `m:9876543210` | Messenger |
| `i:1234567890` | Instagram |

**Le rendu** s'adapte. Messenger n'a pas de listes : jusqu'à 13 options de 20
caractères, elles deviennent des réponses rapides ; au-delà, une liste
numérotée **qui conserve les titres de rayons**. Un message que Messenger ne
sait pas rendre n'est jamais tronqué en silence.

**Le tableau de bord** n'affiche jamais un identifiant Messenger comme un
numéro de téléphone. Le lien pointe vers `m.me` ou `ig.me`, et une pastille
indique le canal — seulement hors WhatsApp, puisque WhatsApp est la norme ici.

## Ce qui reste à faire

- **Les captures de paiement** arrivent sur Messenger comme une URL, non comme
  un identifiant de média : le téléchargement côté serveur reste à écrire.
- **Les commentaires** sous les publications ne sont pas traités — seuls les
  messages privés le sont.
- **Les stories** ne sont pas publiées par le bot ; l'API Instagram le permet
  (`media_type=STORIES`, 100 publications par 24 h, JPEG uniquement) mais c'est
  un autre chantier.
