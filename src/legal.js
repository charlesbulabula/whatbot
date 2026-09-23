// Public privacy policy and terms pages, required by Meta to publish the app.
import express from 'express';
import { config } from './config.js';
import { esc } from './admin/views.js';

const page = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(config.shop.name)}</title>
<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#f6f4ef;color:#1f1d1a}main{max-width:720px;margin:0 auto;padding:24px 16px}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.6rem}@media (prefers-color-scheme:dark){body{background:#161412;color:#f1ece4}a{color:#e0714a}}</style>
</head><body><main>${body}</main></body></html>`;

export const legalRouter = express.Router();

legalRouter.get('/privacy', (_req, res) => {
  const shop = esc(config.shop.name);
  res.send(
    page(
      'Politique de confidentialité',
      `<h1>Politique de confidentialité — ${shop}</h1>
<p>${shop} livre des épices et légumes frais à Kinshasa. Les commandes se passent sur WhatsApp avec un assistant automatique.</p>
<h2>Données collectées</h2>
<p>Votre numéro WhatsApp et votre nom de profil ; les messages que vous nous envoyez ; le nom, le quartier et l’adresse de livraison que vous indiquez (ou votre position si vous la partagez) ; le détail de vos commandes ; les captures d’écran de paiement ; votre langue préférée et vos notes de satisfaction.</p>
<h2>Utilisation</h2>
<p>Ces données servent uniquement à prendre, préparer, livrer et suivre vos commandes, à vérifier les paiements, à vous envoyer des informations sur vos commandes et, si vous ne vous y êtes pas opposé, des rappels. Elles ne sont ni vendues ni louées.</p>
<h2>Partage</h2>
<p>Les messages transitent par WhatsApp (Meta). Le livreur voit le nom, le téléphone, l’adresse et le contenu des commandes qu’il livre. Une position partagée est convertie en quartier via OpenStreetMap. Si l’assistant lit une commande écrite librement, le texte de ce message est analysé par un service d’intelligence artificielle (Anthropic), sans autre donnée personnelle.</p>
<h2>Conservation et sécurité</h2>
<p>Les données sont stockées sur notre serveur, accessible uniquement par la boutique, et conservées tant que nécessaire à la gestion des commandes et à la comptabilité.</p>
<h2>Vos droits</h2>
<p>Écrivez <b>stop</b> pour ne plus recevoir de rappels. Pour consulter, corriger ou supprimer vos données, écrivez <b>agent</b> dans la conversation WhatsApp ou contactez-nous à <a href="mailto:hello@ll-aca.site">hello@ll-aca.site</a>.</p>`,
    ),
  );
});

legalRouter.get('/terms', (_req, res) => {
  const shop = esc(config.shop.name);
  res.send(
    page(
      'Conditions d’utilisation',
      `<h1>Conditions d’utilisation — ${shop}</h1>
<p>Les commandes passées via notre assistant WhatsApp sont confirmées après réception et vérification du paiement mobile money. Les prix affichés sont ceux du jour ; les produits sont livrés dans les quartiers desservis. En cas de problème, écrivez <b>agent</b> pour parler à une personne ou contactez <a href="mailto:hello@ll-aca.site">hello@ll-aca.site</a>.</p>`,
    ),
  );
});
