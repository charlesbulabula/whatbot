import { logger } from './logger.js';

const chains = new Map();

/**
 * Runs jobs for the same key one after another (messages from one customer are
 * processed in order), while different keys run concurrently.
 */
export function enqueue(key, job) {
  const previous = chains.get(key) || Promise.resolve();
  const next = previous
    .then(job)
    .catch((err) => logger.error(`Job failed for ${key}:`, err.stack || err.message))
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  chains.set(key, next);
  return next;
}
