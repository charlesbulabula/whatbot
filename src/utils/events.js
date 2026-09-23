// In-process event bus for live dashboard updates.
//
// Anything that changes what an open dashboard shows (an inbound message, a new
// order, a status change) publishes here; the SSE endpoint in admin/live.js
// forwards it to every connected browser. Single process, so no broker is needed.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open dashboard tab

/**
 * @param {'message'|'order'|'status'|'handoff'} type what happened
 * @param {object} data small, non-sensitive details (reference, phone, status)
 */
export function publish(type, data = {}) {
  bus.emit('update', { type, ...data, at: Date.now() });
}

/**
 * Push handler, installed by the app at boot. Kept as a hook so this module
 * stays dependency-free and the tests can run without a push stack.
 */
let pushHandler = null;

export function onPush(handler) {
  pushHandler = handler;
}

/** Fire-and-forget: a failed notification must never break an order. */
export function notifyDevices(payload) {
  if (!pushHandler) return;
  Promise.resolve(pushHandler(payload)).catch(() => {});
}
