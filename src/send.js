// One door out, whatever the channel.
//
// Everything that messages a customer outside the conversation loop -- status
// updates, reminders, win-backs, admin alerts -- used to import the WhatsApp
// client directly. It now asks here, and the address decides.
import { isWhatsApp } from './channels.js';
import { send as sendWhatsApp } from './whatsapp/client.js';
import { send as sendMeta } from './meta/messenger.js';

/**
 * Sends one channel-neutral message to whoever it is addressed to.
 * `humanAgent` only means anything off WhatsApp, where Meta's human agent tag
 * buys 7 days instead of 24 hours.
 */
export const send = (msg, opts = {}) =>
  (isWhatsApp(msg.to) ? sendWhatsApp(msg) : sendMeta(msg, opts));
