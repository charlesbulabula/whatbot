// Public invoice check: the QR code on a printed invoice opens this page.
// No login, no personal data beyond a first name — just enough for the holder
// of the paper to confirm it matches what the shop actually recorded.
import crypto from 'node:crypto';
import express from 'express';
import * as db from './db/index.js';
import { DEFAULT_LOCALE } from './i18n/index.js';
import * as settings from './shop/settings.js';
import { adminDictionaries } from './admin/i18n.js';
import { verifyPage } from './admin/pages/orders.js';
import { invoiceToken } from './admin/router.js';

export const verifyRouter = express.Router();

verifyRouter.use((_req, res, next) => {
  res.set({ 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  next();
});

verifyRouter.get('/:reference/:token', (req, res) => {
  const L = adminDictionaries[DEFAULT_LOCALE];
  const shop = settings.get();
  const { reference, token } = req.params;

  const order = /^[A-Za-z0-9-]{1,40}$/.test(reference) ? db.getOrderByReference(reference) : null;
  let valid = false;
  if (order && /^[0-9a-f]{24}$/.test(String(token))) {
    const expected = Buffer.from(invoiceToken(order));
    const given = Buffer.from(String(token));
    valid = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  res.status(valid ? 200 : 404).send(verifyPage(L, DEFAULT_LOCALE, { order, shop, valid }));
});
