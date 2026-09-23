// Installable dashboard (PWA) and push notifications.
//
// The manifest and the service worker are served from the app itself, so there
// is nothing to build and no binary asset to ship. Push uses VAPID keys that are
// generated once and kept in the settings table.
import express from 'express';
import webpush from 'web-push';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import * as db from './db/index.js';
import * as settings from './shop/settings.js';
import { FAVICON_SOURCE } from './admin/theme.js';

/** Creates the VAPID pair on first use; the public half goes to the browser. */
export function vapid() {
  let keys = null;
  try {
    keys = JSON.parse(db.getSetting('vapid') || 'null');
  } catch {
    keys = null;
  }
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    db.setSetting('vapid', JSON.stringify(keys));
    logger.info('Generated a VAPID key pair for push notifications');
  }
  return keys;
}

function configured() {
  const keys = vapid();
  const contact = config.smtp.from || `mailto:admin@${new URL(config.publicUrl || 'https://localhost').hostname}`;
  webpush.setVapidDetails(contact.includes('mailto:') ? contact : `mailto:${contact.replace(/.*<|>.*/g, '')}`,
    keys.publicKey, keys.privateKey);
  return keys;
}

/**
 * Sends one notification to every registered dashboard.
 * A subscription the browser has dropped (410/404) is removed rather than retried.
 */
export async function push({ title, body, url = '/admin' }) {
  const subs = db.listPushSubscriptions();
  if (!subs.length) return 0;
  configured();
  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) db.deletePushSubscription(sub.endpoint);
      else logger.warn('Push failed:', err.message);
    }
  }
  return sent;
}

export const pwaRouter = express.Router();

pwaRouter.get('/manifest.webmanifest', (_req, res) => {
  const shop = settings.get();
  res.type('application/manifest+json').send(JSON.stringify({
    name: shop.name,
    short_name: shop.name.slice(0, 12),
    description: 'Tableau de bord',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#007D88',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  }));
});

pwaRouter.get('/icon.svg', (_req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(FAVICON_SOURCE);
});

// The service worker must be served from the root to control the whole site.
pwaRouter.get('/sw.js', (_req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(SERVICE_WORKER);
});

/**
 * Deliberately cache-less: the dashboard is live data, and a stale order list
 * would be worse than an offline message. The worker exists for install and push.
 */
const SERVICE_WORKER = `
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function(event){
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || 'whatbot', {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/admin' },
    tag: data.tag || 'whatbot',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
    }
    return clients.openWindow(url);
  }));
});
`;
