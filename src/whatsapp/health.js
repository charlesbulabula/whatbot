// Is the WhatsApp token actually usable right now?
//
// A token that expired is the single failure mode that costs orders: inbound
// messages keep arriving, the bot keeps answering, and every answer is refused.
// Nothing in the dashboard said so until now — this module is what makes it
// visible, on the dashboard and in the settings.
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { currentToken, tokenSource } from './token.js';

const TTL_OK_MS = 10 * 60 * 1000; // a healthy token is re-checked every 10 minutes
const TTL_BAD_MS = 60 * 1000; // a broken one, every minute, so a fix shows up fast

let cache = null; // { at, result }

/**
 * Returns { ok, reason, name, number, expiresAt } without ever throwing.
 * `reason` is 'unconfigured' | 'expired' | 'invalid' | 'unreachable' | null.
 */
export async function tokenHealth({ force = false } = {}) {
  if (!config.whatsapp.enabled) return { ok: true, reason: null, disabled: true };
  const token = currentToken();
  if (!token || !config.whatsapp.phoneNumberId) {
    return { ok: false, reason: 'unconfigured' };
  }
  const ttl = cache?.result?.ok ? TTL_OK_MS : TTL_BAD_MS;
  if (!force && cache && Date.now() - cache.at < ttl) return cache.result;

  const url = `https://graph.facebook.com/${config.whatsapp.graphVersion}/${encodeURIComponent(config.whatsapp.phoneNumberId)}`
    + '?fields=display_phone_number,verified_name,quality_rating';
  let result;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      // 190/463 is Meta's "this session has expired" pair.
      const expired = json.error.code === 190 && json.error.error_subcode === 463;
      result = {
        ok: false,
        source: tokenSource(),
        reason: expired ? 'expired' : 'invalid',
        message: json.error.message,
        expiresAt: expired ? expiryFrom(json.error.message) : null,
      };
    } else {
      result = {
        ok: true,
        reason: null,
        source: tokenSource(),
        number: json.display_phone_number || null,
        name: json.verified_name || null,
        quality: json.quality_rating || null,
      };
    }
  } catch (err) {
    // A network blip must not be reported as a dead token.
    logger.debug('Token health check failed:', err.message);
    result = { ok: false, reason: 'unreachable', message: err.message };
  }
  cache = { at: Date.now(), result };
  return result;
}

/** Meta puts the expiry date in the message text, so read it from there. */
function expiryFrom(message) {
  const m = String(message || '').match(/expired on ([^.]+)\./i);
  return m ? m[1].trim() : null;
}

/** Called after the settings change, so the next page reflects a new token. */
export function resetTokenHealth() {
  cache = null;
}
