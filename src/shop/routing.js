// Delivery round ordering.
//
// Addresses shared as a WhatsApp location carry their coordinates in the address
// note; those stops are sequenced with OSRM's free routing service (the public
// demo server, so the result is cached for the day and the round still works
// when it is unreachable). Stops without coordinates keep their zone grouping.
import { logger } from '../utils/logger.js';
import * as db from '../db/index.js';

const OSRM = 'https://router.project-osrm.org/trip/v1/driving';
const TIMEOUT_MS = 8000;

/** Pulls "lat,lng" out of the map link the bot stored with the address. */
export function coordsOf(order) {
  const m = String(order?.address_note || '').match(/q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

/** Orders grouped by area, which is the sensible order without coordinates. */
function byZone(orders) {
  const zones = [...new Set(orders.map((o) => o.neighborhood || ''))].sort();
  return zones.flatMap((zone) => orders.filter((o) => (o.neighborhood || '') === zone));
}

/**
 * Returns { orders, distanceKm, durationMin, optimised } — the stops in the
 * order the rider should drive them. Falls back to the zone grouping whenever
 * OSRM cannot be used, which is never an error the shop needs to see.
 */
export async function optimise(orders, { start = null, day = null } = {}) {
  const withCoords = orders.map((o) => ({ order: o, at: coordsOf(o) })).filter((x) => x.at);
  const without = orders.filter((o) => !coordsOf(o));

  if (withCoords.length < 2) {
    return { orders: byZone(orders), distanceKm: null, durationMin: null, optimised: false };
  }

  const cacheKey = day ? `route:${day}:${orders.map((o) => o.id).join(',')}` : null;
  if (cacheKey) {
    const cached = db.getSetting(cacheKey);
    if (cached) {
      try {
        const { order: ids, distanceKm, durationMin } = JSON.parse(cached);
        const byId = new Map(orders.map((o) => [o.id, o]));
        const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
        if (sorted.length === orders.length) return { orders: sorted, distanceKm, durationMin, optimised: true };
      } catch {
        /* stale cache entry, recompute */
      }
    }
  }

  // OSRM wants lon,lat pairs; the shop (or the rider) is the first stop.
  const points = [
    ...(start ? [`${start.longitude},${start.latitude}`] : []),
    ...withCoords.map((x) => `${x.at.longitude},${x.at.latitude}`),
  ];
  try {
    const url = `${OSRM}/${points.join(';')}?source=first&roundtrip=false&destination=any`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'whatbot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 'Ok' || !json.waypoints) throw new Error(json.code || 'no route');

    // waypoint_index is the position of each input point along the trip.
    const offset = start ? 1 : 0;
    const sequence = withCoords
      .map((x, i) => ({ order: x.order, at: json.waypoints[i + offset]?.waypoint_index ?? i }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.order);

    const trip = json.trips?.[0] || {};
    const distanceKm = trip.distance ? Math.round(trip.distance / 100) / 10 : null;
    const durationMin = trip.duration ? Math.round(trip.duration / 60) : null;
    const result = [...sequence, ...byZone(without)];

    if (cacheKey) {
      db.setSetting(cacheKey, JSON.stringify({ order: result.map((o) => o.id), distanceKm, durationMin }));
    }
    return { orders: result, distanceKm, durationMin, optimised: true };
  } catch (err) {
    logger.warn('Route optimisation unavailable:', err.message);
    return { orders: byZone(orders), distanceKm: null, durationMin: null, optimised: false };
  }
}

/** Straight-line distance in km, used for the customer's "rider is N km away". */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
