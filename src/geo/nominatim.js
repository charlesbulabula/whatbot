// Reverse geocoding with OpenStreetMap Nominatim (free, architecture §3.3):
// a location shared on WhatsApp is turned into a commune, matched against the
// delivery zones. Usage policy: identify the app, at most 1 request/second.
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { listZones } from '../db/index.js';

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const ADDRESS_FIELDS = ['suburb', 'city_district', 'municipality', 'county', 'quarter', 'neighbourhood', 'town', 'village', 'city'];

const cache = new Map();
let lastCall = 0;

const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(commune|quartier|cite) (de |du |d')?/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The areas the shop serves: the `zones` table, or DELIVERY_ZONES while the
 * table is still empty (fresh install, before the first boot seeds it).
 */
function servedZoneNames() {
  const zones = listZones({ onlyActive: true });
  return zones.length ? zones.map((z) => z.name) : config.shop.zones;
}

/** Finds which served zone a Nominatim address belongs to (most specific field first). */
export function matchZone(address, zones = servedZoneNames()) {
  const byName = new Map(zones.map((z) => [fold(z), z]));
  for (const field of ADDRESS_FIELDS) {
    const zone = byName.get(fold(address?.[field]));
    if (zone) return zone;
  }
  return null;
}

/** Most local place name, used to tell the customer where we think they are. */
export function placeLabel(address) {
  return ADDRESS_FIELDS.map((f) => address?.[f]).find(Boolean) || null;
}

/** Returns { zone, place } or null if geocoding is off or fails (the bot then asks for the zone). */
export async function locate(latitude, longitude) {
  if (!config.geo.enabled || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `${ENDPOINT}?format=jsonv2&addressdetails=1&zoom=16&accept-language=fr&lat=${latitude}&lon=${longitude}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': `whatbot/1.0 (${config.publicUrl || 'self-hosted WhatsApp bot'})` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = { zone: matchZone(json.address), place: placeLabel(json.address) };
    if (cache.size > 1000) cache.clear();
    cache.set(key, result);
    return result;
  } catch (err) {
    logger.warn('Reverse geocoding failed:', err.message);
    return null;
  }
}
