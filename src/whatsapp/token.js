// Which access token the bot actually uses.
//
// Normally it is the one from .env, put there by the deployment secrets. But a
// shop still on Meta's test number gets a token that expires every 24 hours,
// and asking the owner to SSH in or redeploy every morning is not workable.
// So the dashboard can store a replacement, which wins over .env and survives
// deployments (a deploy rewrites .env, never the database).
//
// Once a permanent System User token is in place, the override is cleared and
// .env is the single source again.
import { config } from '../config.js';
import * as db from '../db/index.js';

const KEY = 'wa_token_override';

export function overrideToken() {
  return db.getSetting(KEY) || '';
}

/** The token every call to Meta should use. */
export function currentToken() {
  return overrideToken() || config.whatsapp.token;
}

/** Where the current token comes from, for the settings page. */
export const tokenSource = () => (overrideToken() ? 'dashboard' : 'env');

export function setOverrideToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return false;
  db.setSetting(KEY, clean);
  return true;
}

export function clearOverrideToken() {
  db.setSetting(KEY, '');
}

/** Last four characters only, so the settings page can show which token is live. */
export const tokenFingerprint = (token = currentToken()) =>
  (token ? `…${String(token).slice(-6)}` : '');
