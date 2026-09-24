# Checklist : passer le bot en production

À cocher dans l'ordre. Les quatre blocs sont indépendants sauf le bloc 3, qui
exige que le bloc 1 soit terminé.

Portefeuille : **megamatgroup** — `804383151763933`
Application : **whatbot** — `1803892427276261` (déjà rattachée, déjà publiée)

---

## 1. Profil de l'entreprise — *bloquant, 5 minutes, aucun document*

<https://business.facebook.com/settings/info/?business_id=804383151763933>

Tant que ce profil est incomplet, WhatsApp refuse d'autoriser le moindre envoi :
un numéro ajouté avant resterait en attente indéfiniment.

- [ ] **Nom légal** — exactement celui du RCCM, à la lettre et à la casse près
- [ ] **Adresse complète** — rue, numéro, commune, ville, pays
- [ ] **Téléphone de l'entreprise** — pas forcément celui du bot
- [ ] **Site web** — `https://ll-aca.site`
- [ ] **E-mail** — `hello@ll-aca.site` (même domaine que le site : c'est mieux vu)

> La règle qui fait échouer les dossiers : ces valeurs doivent correspondre
> **mot pour mot** à celles des documents du bloc 2. « Av. » d'un côté et
> « Avenue » de l'autre suffit à faire refuser la vérification.

---

## 2. Vérification de l'entreprise — *documents*

*Paramètres d'entreprise → Centre de sécurité → Vérification*

Meta demande deux choses : prouver que l'entreprise **existe légalement**, et
prouver qu'elle est **à cette adresse**. En RDC, sont généralement acceptés :

**Existence légale** (un seul suffit)
- [ ] Extrait **RCCM**
- [ ] Attestation d'**identification nationale**
- [ ] Attestation fiscale / **NIF**

**Adresse** (un seul suffit, daté de moins de 3 mois, au nom et à l'adresse de l'entreprise)
- [ ] Facture **SNEL** ou **REGIDESO**
- [ ] Relevé bancaire d'entreprise
- [ ] Contrat de bail enregistré

Délai de réponse : de quelques heures à quelques jours.

> Sans vérification, le compte reste plafonné à un petit nombre de contacts et
> certains modèles de message sont refusés. Ce n'est pas bloquant pour démarrer,
> ça l'est pour grandir.

---

## 3. Le numéro — *exige le bloc 1 terminé*

- [ ] Une **SIM dédiée**, sur laquelle vous pouvez recevoir un SMS ou un appel
- [ ] **Aucun compte WhatsApp** sur ce numéro — ni normal, ni Business app.
      S'il y en a un : *Réglages → Compte → Supprimer mon compte*, puis
      attendre quelques minutes
- [ ] Le **nom d'affichage** que verront les clients (« Épices Fraîches »).
      Meta le relit ; tant qu'il n'est pas approuvé, les clients voient le
      numéro brut
- [ ] Un **code PIN à 6 chiffres** de votre choix, à noter : c'est la
      vérification en deux étapes du numéro, redemandée à chaque
      réenregistrement

Une fois ces quatre points réunis, les sept étapes suivantes se font **depuis la
conversation avec Claude**, via le serveur MCP de Meta :

1. ajouter le numéro et créer le compte WhatsApp ;
2. envoyer le code de vérification (SMS ou appel) ;
3. vérifier le numéro avec le code reçu ;
4. enregistrer le numéro sur l'API Cloud avec le PIN ;
5. poser le webhook sur `https://bot.ll-aca.site/webhook` ;
6. abonner le compte à l'application ;
7. recréer les douze modèles de message.

> **Aucune de ces écritures n'est annulable** depuis le MCP — ni retirer un
> numéro, ni supprimer un compte. On ne les lance qu'avec la SIM définitive.

---

## 4. Moyen de paiement

- [ ] Une **carte** valide sur le compte WhatsApp

Les conversations ouvertes par le client sont gratuites — c'est le cas de
presque tout ce que fait ce bot. Seuls les modèles coûtent : quelques centimes
pour les utilitaires, environ 0,022 $ en RDC pour les marketing (le rappel
hebdomadaire et la relance des inactifs).

---

## 5. Basculer

- [ ] Secret GitHub `WA_PHONE_NUMBER_ID` → l'identifiant du nouveau numéro
- [ ] Secret GitHub `WA_TOKEN` → le jeton permanent d'utilisateur système
- [ ] Secret GitHub `WA_BUSINESS_NUMBER` → le numéro sans « + », pour les liens
      de parrainage
- [ ] Les six secrets `WA_TEMPLATE_*` → les noms des modèles approuvés
- [ ] Relancer *Actions → Test & deploy*
- [ ] Écrire « Bonjour » au nouveau numéro : la conversation doit apparaître en
      direct dans le tableau de bord
- [ ] Purger les données de démonstration : `node deploy/seed-demo.js --purge`

Le jeton permanent se génère ici — personne ne peut le faire à votre place, la
génération est une action sécurisée en page :
<https://business.facebook.com/latest/settings/system_users/?business_id=804383151763933>

---

## Ce qui reste utile mais pas bloquant

- [ ] Ajouter `+33764534909` à la liste blanche du numéro de test
      (*WhatsApp → API Setup* dans le tableau de bord de l'app) — seul moyen de
      continuer à tester d'ici là
- [ ] Clé d'API pour la transcription des messages vocaux
- [ ] Photos des produits
- [ ] Identifiant du catalogue Meta, pour le catalogue WhatsApp natif
- [ ] Changer les mots de passe des deux comptes d'équipe créés
