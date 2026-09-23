// Delivery slots: which windows a customer can still choose right now.
//
// A slot is offered for today only while its start time is still ahead (with a
// short lead time), and for tomorrow whenever the shop is open that day. A slot
// with a capacity disappears once it is full.
import * as db from '../db/index.js';
import * as settings from './settings.js';

const LEAD_MINUTES = 60; // no booking a window that starts within the hour

const minutes = (hhmm) => Number(String(hhmm).slice(0, 2)) * 60 + Number(String(hhmm).slice(3, 5));
const localDay = (date) => date.toLocaleDateString('en-CA');

export function slotLabel(slot, locale) {
  if (!slot) return '';
  if (locale === 'ln' && slot.label_ln) return slot.label_ln;
  return locale === 'en' ? slot.label_en : slot.label_fr;
}

/**
 * Bookable slots, today first then tomorrow.
 * Each entry is { slot, day, when: 'today' | 'tomorrow', left } where `left` is
 * null for an unlimited slot.
 */
export function available(now = new Date(), shop = settings.get()) {
  const slots = db.listSlots({ onlyActive: true });
  if (!slots.length) return [];

  const out = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  for (const [date, when] of [[now, 'today'], [tomorrow, 'tomorrow']]) {
    // A day the shop is closed is not a delivery day.
    if (!shop.hours[date.getDay()]) continue;
    const day = localDay(date);
    for (const slot of slots) {
      if (when === 'today' && minutes(slot.start_time) - nowMin < LEAD_MINUTES) continue;
      const left = slot.capacity > 0 ? slot.capacity - db.slotBookings(day, slot.id) : null;
      if (left !== null && left <= 0) continue;
      out.push({ slot, day, when, left });
    }
  }
  return out;
}

/** Re-checks a slot at order time: it may have filled up while the customer typed. */
export function stillFree(slotId, day) {
  const slot = db.getSlot(slotId);
  if (!slot || !slot.active) return false;
  if (slot.capacity <= 0) return true;
  return db.slotBookings(day, slot.id) < slot.capacity;
}
