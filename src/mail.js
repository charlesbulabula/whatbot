// Email alerts, as a backup for the WhatsApp admin alerts.
//
// WhatsApp only lets the bot message the owner inside the 24h service window (or
// through an approved template). Email has no such rule, so a new order always
// reaches the shop even when the window is closed and no template is configured.
//
// The SMTP server itself is a deployment secret (.env); the recipient and the
// on/off switch live in the dashboard settings.
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import * as settings from './shop/settings.js';

let transport = null;

/** True when the .env has enough to talk to an SMTP server. */
export const smtpConfigured = () => Boolean(config.smtp.host && config.smtp.from);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: config.smtp.secure ?? config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

/** Recipient of the alerts: the dashboard setting wins over ALERT_EMAIL. */
export function alertRecipient(shop = settings.get()) {
  return shop.alertEmail || config.smtp.to || '';
}

/**
 * Sends one alert. Never throws: a mail problem must not break an order.
 * Returns 'sent' | 'skipped' | 'failed'.
 */
export async function sendAlert({ subject, text }) {
  const shop = settings.get();
  const to = alertRecipient(shop);
  if (!smtpConfigured() || !to || !shop.emailAlerts) return 'skipped';
  try {
    await getTransport().sendMail({
      from: config.smtp.from,
      to,
      subject: `[${shop.name}] ${subject}`,
      text,
    });
    return 'sent';
  } catch (err) {
    logger.error('Email alert failed:', err.message);
    return 'failed';
  }
}

/**
 * Checks the SMTP settings and sends one test message, for the button in the
 * dashboard. Returns { ok, error } so the page can show what went wrong.
 */
export async function sendTestEmail() {
  const shop = settings.get();
  const to = alertRecipient(shop);
  if (!smtpConfigured()) return { ok: false, error: 'SMTP_HOST / SMTP_FROM' };
  if (!to) return { ok: false, error: 'ALERT_EMAIL' };
  try {
    await getTransport().verify();
    await getTransport().sendMail({
      from: config.smtp.from,
      to,
      subject: `[${shop.name}] Test`,
      text: 'Test email from the whatbot dashboard. If you received this, email alerts work.',
    });
    return { ok: true, to };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Forgets the cached connection, e.g. after the .env changed. */
export function resetTransport() {
  transport?.close?.();
  transport = null;
}
