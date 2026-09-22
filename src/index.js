import { pathToFileURL } from 'node:url';
import express from 'express';
import { config, assertConfig } from './config.js';
import { logger } from './utils/logger.js';
import { seedIfEmpty } from './db/seed.js';
import { webhookRouter } from './whatsapp/webhook.js';
import { adminRouter } from './admin/router.js';
import { routeRouter } from './admin/route.js';
import { startScheduler } from './jobs/scheduler.js';

const missing = assertConfig();
if (missing.length) logger.warn(`Missing configuration, some features are disabled: ${missing.join(', ')}`);

const seeded = seedIfEmpty();
if (seeded) logger.info(`Seeded ${seeded} starter products`);

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

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use(webhookRouter);
app.use('/admin', adminRouter);
app.use('/route', routeRouter);
app.get('/', (_req, res) => res.redirect('/admin'));

app.use((err, _req, res, _next) => {
  logger.error('Unhandled error:', err.stack || err.message);
  res.status(err.status || 500).send('Internal error');
});

// Only listen when run directly (`node src/index.js`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(config.port, config.host, () => {
    logger.info(`whatbot listening on http://${config.host}:${config.port} (${config.env})`);
    startScheduler();
  });
}
