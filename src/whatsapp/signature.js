import crypto from 'node:crypto';

/** Validates Meta's X-Hub-Signature-256 header against the raw request body. */
export function isValidSignature(rawBody, header, appSecret) {
  if (!rawBody || !header || !appSecret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
