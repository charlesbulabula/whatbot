// Signed session cookie for the dashboard. Basic Auth still works for scripts
// and curl, but a person gets a real login page instead of the browser's own
// grey credential box, which no theme can reach.
import crypto from 'node:crypto';
import * as db from '../db/index.js';

const COOKIE = 'admin_session';
const REMEMBER_MS = 30 * 864e5;
const SESSION_MS = 12 * 36e5;

function secret() {
  let value = db.getSetting('session_secret');
  if (!value) {
    value = crypto.randomBytes(32).toString('hex');
    db.setSetting('session_secret', value);
  }
  return value;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

/** Starts a session for `username`. The cookie carries no password, only a signature. */
export function issue(res, username, { remember = false, secure = false } = {}) {
  const maxAge = remember ? REMEMBER_MS : SESSION_MS;
  const payload = `${Buffer.from(String(username)).toString('base64url')}.${Date.now() + maxAge}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/admin',
    // Without maxAge the cookie dies with the browser session, which is what
    // "keep me signed in" being off should mean.
    ...(remember ? { maxAge } : {}),
  });
}

/** The username a valid, unexpired cookie names, or null. */
export function read(req) {
  const raw = String(req.get('cookie') || '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === COOKIE)?.[1];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [user, expires, mac] = parts;
  const expected = sign(`${user}.${expires}`);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (!Number(expires) || Number(expires) < Date.now()) return null;
  return Buffer.from(user, 'base64url').toString('utf8');
}

export const clear = (res) => res.clearCookie(COOKIE, { path: '/admin' });
