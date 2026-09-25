// Who we are talking to, and where.
//
// The conversation engine keys everything on one address string, and every
// table already does the same. Rather than thread a second column through the
// whole codebase, a non-WhatsApp address carries its channel as a prefix:
//
//   243810000001      WhatsApp (unchanged -- no migration, no risk)
//   m:9876543210      Messenger, a Page-scoped id
//   i:1234567890      Instagram, an Instagram-scoped id
//
// Everything that needs to know the channel asks here, and nothing else has to
// care. The prefixes are single letters followed by a colon, which no phone
// number can contain.
export const WHATSAPP = 'whatsapp';
export const MESSENGER = 'messenger';
export const INSTAGRAM = 'instagram';

const PREFIX = { 'm:': MESSENGER, 'i:': INSTAGRAM };

/** The channel an address belongs to. Anything unprefixed is WhatsApp. */
export function channelOf(address) {
  const key = String(address || '').slice(0, 2);
  return PREFIX[key] || WHATSAPP;
}

/** The id the platform knows, without our prefix. */
export function idOf(address) {
  const a = String(address || '');
  return channelOf(a) === WHATSAPP ? a : a.slice(2);
}

/** Builds an address from a platform id. */
export const addressFor = (channel, id) =>
  (channel === MESSENGER ? `m:${id}` : channel === INSTAGRAM ? `i:${id}` : String(id));

export const isWhatsApp = (address) => channelOf(address) === WHATSAPP;

/**
 * How long a business may answer for free after the customer's last message.
 * WhatsApp: 24h, then an approved template or nothing. Messenger and Instagram:
 * 24h, extended to 7 days when a human is answering (Meta's human agent tag),
 * which is why a handed-over conversation there is far less constrained.
 */
export const WINDOW_MS = { [WHATSAPP]: 24 * 36e5, [MESSENGER]: 24 * 36e5, [INSTAGRAM]: 24 * 36e5 };
export const HUMAN_AGENT_WINDOW_MS = 7 * 864e5;

/** What the dashboard shows next to a conversation. */
export const CHANNEL_LABEL = {
  [WHATSAPP]: 'WhatsApp',
  [MESSENGER]: 'Messenger',
  [INSTAGRAM]: 'Instagram',
};
