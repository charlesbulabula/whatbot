// Live dashboard updates over Server-Sent Events.
//
// SSE rather than a WebSocket: the dashboard only needs server → browser pushes,
// it is plain HTTP (so it passes through the existing Nginx vhost and the Basic
// Auth the dashboard already uses), and the browser reconnects on its own.
import { bus } from '../utils/events.js';
import { logger } from '../utils/logger.js';

const MAX_CLIENTS = 25; // a shop has a handful of tabs open, not thousands
const PING_MS = 25_000; // keep Nginx and mobile networks from closing an idle stream

let clients = 0;

/** Mounts GET /admin/events on the (already authenticated) admin router. */
export function mountLiveUpdates(router) {
  router.get('/events', (req, res) => {
    if (clients >= MAX_CLIENTS) return res.status(503).end();
    clients += 1;

    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx must not buffer the stream
    });
    res.flushHeaders?.();
    res.write('retry: 5000\n\n'); // how long the browser waits before reconnecting

    const onUpdate = (payload) => {
      try {
        res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch (err) {
        logger.debug('SSE write failed:', err.message);
      }
    };
    bus.on('update', onUpdate);

    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);

    const close = () => {
      clearInterval(ping);
      bus.off('update', onUpdate);
      clients = Math.max(0, clients - 1);
    };
    req.on('close', close);
    res.on('error', close);
  });
}

export const liveClientCount = () => clients;
