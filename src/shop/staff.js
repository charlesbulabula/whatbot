// Named dashboard accounts with a role, so the shop is no longer one shared
// password. ADMIN_USER / ADMIN_PASSWORD from .env stays valid as the owner, and
// is the way back in if every account is disabled or forgotten.
import crypto from 'node:crypto';
import { config } from '../config.js';
import * as db from '../db/index.js';

export const ROLES = ['owner', 'seller', 'rider'];

/**
 * What each role may reach. The owner has everything; a seller runs the shop
 * day to day but does not touch money settings, staff or the log; a rider only
 * sees the deliveries.
 */
const PERMISSIONS = {
  owner: ['orders', 'catalogue', 'customers', 'marketing', 'money', 'settings', 'staff', 'audit'],
  seller: ['orders', 'catalogue', 'customers', 'marketing'],
  rider: ['orders'],
};

export const can = (role, area) => (PERMISSIONS[role] || []).includes(area);

/** scrypt with a per-account salt: no plaintext password is ever stored. */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export const list = () => db.listStaff();
export const get = (id) => db.getStaff(id);
export const byUsername = (username) => db.getStaffByUsername(username);

export function create({ username, name, role, password }) {
  return db.createStaff({
    username: normalizeUsername(username),
    name: String(name || '').slice(0, 60),
    role: ROLES.includes(role) ? role : 'seller',
    password_hash: hashPassword(password),
  });
}

export function update(id, { name, role, active, password }) {
  const fields = {};
  if (name !== undefined) fields.name = String(name).slice(0, 60);
  if (role !== undefined && ROLES.includes(role)) fields.role = role;
  if (active !== undefined) fields.active = active ? 1 : 0;
  if (password) fields.password_hash = hashPassword(password);
  return db.updateStaff(id, fields);
}

export const remove = (id) => db.deleteStaff(id);

export const normalizeUsername = (v) =>
  String(v || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);

/**
 * Authenticates a dashboard login.
 * Returns { username, name, role } or null. The .env owner is checked first so
 * the shop can always get back in, even with an empty or broken staff table.
 */
export function authenticate(username, password) {
  const user = String(username || '');
  if (config.admin.password && sameSecret(user, config.admin.user) && sameSecret(password, config.admin.password)) {
    return { username: config.admin.user, name: config.admin.user, role: 'owner', builtin: true };
  }
  const account = byUsername(normalizeUsername(user));
  if (!account || !account.active) return null;
  if (!verifyPassword(password, account.password_hash)) return null;
  db.touchStaffLogin(account.id);
  return { id: account.id, username: account.username, name: account.name || account.username, role: account.role };
}

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
