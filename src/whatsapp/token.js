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
import { logger } from '../utils/logger.js';
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

/**
 * Turns the console's 24-hour token into a long-lived one (about 60 days).
 *
 * Meta exchanges a valid short-lived user token for a long-lived one against
 * the app secret. It is the difference between pasting a token every morning
 * and pasting one every two months, so it is always worth trying — and if the
 * exchange is refused the original token is still perfectly usable.
 *
 * Returns { token, expiresAt } or null.
 */
export async function exchangeForLongLived(shortLived) {
  if (!config.whatsapp.appSecret || !config.appId) return null;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.appId,
    client_secret: config.whatsapp.appSecret,
    fb_exchange_token: shortLived,
  });
  try {
    const res = await fetch(`https://graph.facebook.com/${config.whatsapp.graphVersion}/oauth/access_token?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.access_token) {
      logger.info(`Long-lived exchange declined: ${json.error?.message || 'no token returned'}`);
      return null;
    }
    // expires_in is seconds; Meta returns about 60 days, or omits it for a
    // token that never expires.
    const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
    return { token: json.access_token, expiresAt };
  } catch (err) {
    logger.info(`Long-lived exchange failed: ${err.message}`);
    return null;
  }
}

/** Last four characters only, so the settings page can show which token is live. */
export const tokenFingerprint = (token = currentToken()) =>
  (token ? `…${String(token).slice(-6)}` : '');
