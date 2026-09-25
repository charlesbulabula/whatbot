import { pathToFileURL } from 'node:url';
import express from 'express';
import { config, assertConfig } from './config.js';
import * as settings from './shop/settings.js';
import { logger } from './utils/logger.js';
import { notFoundHandler, errorHandler } from './errors.js';
import { metaWebhookRouter } from './meta/webhook.js';
import { seedIfEmpty } from './db/seed.js';
import { db, ping, seedZonesIfEmpty, seedVariantsIfMissing } from './db/index.js';
import { webhookRouter } from './whatsapp/webhook.js';
import { adminRouter } from './admin/router.js';
import { routeRouter } from './admin/route.js';
import { legalRouter } from './legal.js';
import { verifyRouter } from './verify.js';
import { mediaRouter } from './media.js';
import { trackingRouter } from './tracking.js';
import { pwaRouter, push } from './pwa.js';
import { bus, onPush, notifyDevices } from './utils/events.js';
import { startScheduler } from './jobs/scheduler.js';

const missing = assertConfig();
if (missing.length) logger.warn(`Missing configuration, some features are disabled: ${missing.join(', ')}`);

const seeded = seedIfEmpty();
if (seeded) logger.info(`Seeded ${seeded} starter products`);

// DELIVERY_ZONES / DELIVERY_FEE only seed the areas table; the dashboard owns it afterwards.
const seededZones = seedZonesIfEmpty(config.shop.zones, config.shop.deliveryFee);
if (seededZones) logger.info(`Seeded ${seededZones} delivery areas`);

// Products created before variants existed keep their three heap sizes.
const seededVariants = seedVariantsIfMissing();
if (seededVariants) logger.info(`Seeded ${seededVariants} product variants`);

// Ring the installed dashboards on the events that need a person.
onPush(push);
bus.on('update', (event) => {
  const shop = settings.get();
  if (event.type === 'order') notifyDevices({ title: shop.name, body: `🧾 ${event.reference || ''}`, url: '/admin' });
  if (event.type === 'handoff') notifyDevices({ title: shop.name, body: '🙋', url: '/admin/customers' });
});

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // behind Nginx on the same host

// Keep the raw body: the webhook signature is computed over the exact bytes Meta sent.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.get('/healthz', (_req, res) => {
  try {
    res.json({ ok: ping(), uptime: Math.round(process.uptime()) });
  } catch (err) {
    logger.error('Health check failed:', err.message);
    res.status(503).json({ ok: false });
  }
});
app.use(webhookRouter);
app.use(metaWebhookRouter); // /meta/webhook — Messenger and Instagram
app.use('/admin', adminRouter);
app.use('/route', routeRouter);
app.use('/v', verifyRouter);
app.use('/media', mediaRouter);
app.use('/t', trackingRouter);
app.use(pwaRouter); // /manifest.webmanifest, /sw.js, /icon.svg
app.use(legalRouter);
app.get('/', (_req, res) => res.redirect('/admin'));

app.use(notFoundHandler);
app.use(errorHandler);

// Only listen when run directly (`node src/index.js`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(config.port, config.host, () => {
    logger.info(`whatbot listening on http://${config.host}:${config.port} (${config.env})`);
    startScheduler();
  });

  // systemd sends SIGTERM on restart/deploy: finish in-flight requests, then close
  // the database cleanly (checkpoints the SQLite write-ahead log).
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => {
      db.close();
      process.exit(0);
    }, 5000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
