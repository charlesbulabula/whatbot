// The shop answering its own alerts.
//
// The alert about a payment already carries everything needed to decide: the
// reference, the amount, the screenshot a tap away. Asking the owner to open a
// laptop to say "yes" is the kind of friction that gets work done late, or not
// at all.
//
// Deliberately additive: the admin's number is also the one used to test the
// bot as a customer, so anything that is not an explicit admin command falls
// through to the normal conversation.
import * as db from '../db/index.js';
import * as settings from '../shop/settings.js';
import { t, normalizeLocale, money, DEFAULT_LOCALE } from '../i18n/index.js';
import { text } from './messages.js';

export const VALIDATE_PREFIX = 'adm:pay:';

/** True when this phone is the number the shop's alerts go to. */
export function isAdminPhone(phone) {
  const admin = settings.get().adminNotifyNumber;
  return Boolean(admin) && String(phone) === String(admin);
}

/** "ok CMD-20260924-003", "paye CMD-…", or the button on the alert itself. */
function orderFrom(input) {
  if (input.replyId?.startsWith(VALIDATE_PREFIX)) {
    return db.getOrder(Number(input.replyId.slice(VALIDATE_PREFIX.length)));
  }
  const m = /^(?:ok|paye|payé|valider|valide)\s+(\S+)$/i.exec((input.raw || '').trim());
  return m ? db.getOrderByReference(m[1].toUpperCase()) : null;
}

/**
 * Handles an admin command, or returns null so the message continues as a
 * normal conversation. `confirm` is awaited by the caller as a task.
 */
export function adminCommand(phone, input, { markPaid }) {
  if (!isAdminPhone(phone)) return null;
  const isCommand = input.replyId?.startsWith(VALIDATE_PREFIX)
    || /^(?:ok|paye|payé|valider|valide)\s+\S+$/i.test((input.raw || '').trim());
  if (!isCommand) return null;

  const locale = DEFAULT_LOCALE;
  const order = orderFrom(input);
  if (!order) return { messages: [text(phone, t(locale, 'admUnknownOrder'))], tasks: [] };
  if (order.status !== 'awaiting_payment') {
    return {
      messages: [text(phone, t(locale, 'admAlready', {
        ref: order.reference,
        status: t(locale, `status.${order.status}`),
      }))],
      tasks: [],
    };
  }
  return {
    messages: [text(phone, t(locale, 'admValidated', {
      ref: order.reference,
      total: money(normalizeLocale(order.customer.locale), order.total),
      name: order.customer_name || order.customer.phone,
    }))],
    // The customer is told by changeOrderStatus, as if it came from the dashboard.
    tasks: [() => markPaid(order.id)],
  };
}
