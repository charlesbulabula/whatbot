// Public product pictures.
//
// They must be reachable without a login: WhatsApp fetches the image by URL when
// the bot sends it. Only files the dashboard wrote are served, under a fixed
// directory, and the file name is validated rather than trusted.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

export const TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Where uploaded pictures live: next to the database, so backups cover them. */
export function mediaDir(kind = 'products') {
  const base = config.dbPath === ':memory:' ? path.join(process.cwd(), 'data') : path.dirname(config.dbPath);
  const dir = path.join(base, 'media', kind);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const mediaPath = (kind, file) => path.join(mediaDir(kind), file);

export function deleteMedia(kind, file) {
  if (!file || !SAFE_NAME.test(file)) return;
  fs.rm(mediaPath(kind, file), { force: true }, () => {});
}

export const mediaRouter = express.Router();

mediaRouter.get('/products/:file', (req, res) => {
  const { file } = req.params;
  if (!SAFE_NAME.test(file)) return res.status(404).end();
  const full = mediaPath('products', file);
  if (!fs.existsSync(full)) return res.status(404).end();
  // Pictures are content-addressed by name, so they can be cached hard.
  res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(full);
});
