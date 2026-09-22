// Daily online backup of the SQLite database (run by cron, see deploy/whatbot.cron).
// Keeps the 14 most recent copies in data/backups/.
import fs from 'node:fs';
import path from 'node:path';
import { db } from './index.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const KEEP = 14;
const dir = path.join(path.dirname(config.dbPath), 'backups');
fs.mkdirSync(dir, { recursive: true });

const file = path.join(dir, `whatbot-${new Date().toLocaleDateString('en-CA')}.db`);
await db.backup(file);

const copies = fs.readdirSync(dir).filter((f) => /^whatbot-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
for (const old of copies.slice(0, -KEEP)) fs.unlinkSync(path.join(dir, old));

logger.info(`Backup written to ${file} (${copies.length > KEEP ? KEEP : copies.length} kept)`);
