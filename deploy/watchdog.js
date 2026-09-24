// Tells the shop when the bot goes quiet.
//
// Runs from cron, deliberately OUTSIDE the application: a supervisor that dies
// with what it supervises is decoration. It reads the same .env and the same
// database, but owns nothing of the running process.
//
// It sends mail directly rather than through src/mail.js, because that path is
// gated by a dashboard switch. Supervision must not be silenceable by a
// setting someone toggled six months ago and forgot.
//
//   node deploy/watchdog.js           run the checks, alert on a change
//   node deploy/watchdog.js --check   print the status, alert nothing
//   node deploy/watchdog.js --test    send a test alert and exit
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../src/config.js';
import { currentToken } from '../src/whatsapp/token.js';

const exec = promisify(execFile);
const STATE_FILE = path.join(path.dirname(config.dbPath), 'watchdog-state.json');
// A problem that persists is repeated this often, so it is not forgotten.
const REMIND_AFTER_MS = 6 * 60 * 60 * 1000;

/* ------------------------------- the checks ----------------------------- */

async function serviceRunning() {
  try {
    const { stdout } = await exec('systemctl', ['is-active', 'whatbot']);
    return stdout.trim() === 'active' ? null : `le service est « ${stdout.trim()} »`;
  } catch (err) {
    // is-active exits non-zero when the service is down; that is the answer.
    return `le service est « ${(err.stdout || '').trim() || 'arrêté'} »`;
  }
}

async function answersLocally() {
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/healthz`, { signal: AbortSignal.timeout(8000) });
    return res.ok ? null : `/healthz répond ${res.status}`;
  } catch (err) {
    return `/healthz ne répond pas (${err.message})`;
  }
}

async function tokenAccepted() {
  if (!config.whatsapp.enabled) return null;
  const token = currentToken();
  if (!token || !config.whatsapp.phoneNumberId) return 'aucun jeton WhatsApp configuré';
  const url = `https://graph.facebook.com/${config.whatsapp.graphVersion}`
    + `/${encodeURIComponent(config.whatsapp.phoneNumberId)}?fields=display_phone_number`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    return json.error ? `Meta refuse le jeton : ${json.error.message}` : null;
  } catch {
    // The internet being briefly unreachable is not a dead token. Silence here
    // is deliberate: the next run settles it, and false alarms teach people to
    // ignore the real ones.
    return null;
  }
}

async function diskHasRoom() {
  try {
    const { stdout } = await exec('df', ['-P', path.dirname(config.dbPath)]);
    const used = Number(stdout.trim().split('\n').pop().split(/\s+/)[4]?.replace('%', ''));
    if (!Number.isFinite(used)) return null;
    return used >= 90 ? `le disque est plein à ${used} %` : null;
  } catch {
    return null;
  }
}

const CHECKS = [
  { key: 'service', title: 'Le service est arrêté', run: serviceRunning },
  { key: 'health', title: 'Le bot ne répond plus', run: answersLocally },
  { key: 'token', title: 'Le bot ne peut plus écrire aux clients', run: tokenAccepted },
  { key: 'disk', title: 'Le disque est presque plein', run: diskHasRoom },
];

/* ------------------------------ the decision ---------------------------- */

/**
 * What to say, given what was true last time and what is true now. Pure, so
 * the part that decides whether to wake someone at 4am can be tested.
 * Returns [{ kind: 'broken' | 'fixed' | 'reminder', key, title, detail }].
 */
export function decide(previous, current, now = Date.now()) {
  const out = [];
  for (const [key, state] of Object.entries(current)) {
    const before = previous?.[key];
    if (state.problem && !before?.problem) {
      out.push({ kind: 'broken', key, title: state.title, detail: state.problem });
    } else if (!state.problem && before?.problem) {
      out.push({ kind: 'fixed', key, title: state.title, detail: before.problem });
    } else if (state.problem && before?.problem && now - (before.notifiedAt || 0) >= REMIND_AFTER_MS) {
      out.push({ kind: 'reminder', key, title: state.title, detail: state.problem });
    }
  }
  return out;
}

/** Carries the last notification time forward, so reminders are paced. */
export function nextState(previous, current, alerts, now = Date.now()) {
  const notified = new Set(alerts.map((a) => a.key));
  const state = {};
  for (const [key, value] of Object.entries(current)) {
    const before = previous?.[key];
    state[key] = {
      problem: value.problem,
      title: value.title,
      notifiedAt: value.problem
        ? (notified.has(key) ? now : before?.notifiedAt || now)
        : null,
    };
  }
  return state;
}

/* -------------------------------- output -------------------------------- */

const SUBJECT = {
  broken: (t) => `⚠️ ${t}`,
  reminder: (t) => `⚠️ Toujours en panne : ${t}`,
  fixed: (t) => `✅ Rétabli : ${t}`,
};

function body(alerts, shopName) {
  const lines = alerts.map((a) => `${SUBJECT[a.kind](a.title)}\n  ${a.detail}`);
  return [
    `Boutique : ${shopName}`,
    `Heure : ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa' })}`,
    '',
    ...lines,
    '',
    config.publicUrl ? `Tableau de bord : ${config.publicUrl}/admin` : '',
    '',
    'Envoyé par la surveillance automatique du serveur.',
  ].filter((l) => l !== null).join('\n');
}

async function sendMail(subject, text) {
  const to = config.smtp.to;
  if (!config.smtp.host || !config.smtp.from || !to) {
    console.error('Pas de SMTP configuré : impossible de prévenir.');
    return false;
  }
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure ?? config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
  return true;
}

/* --------------------------------- main --------------------------------- */

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const mode = process.argv[2] || '';
  const shopName = config.shop.name;

  if (mode === '--test') {
    const ok = await sendMail(
      `✅ Test de la surveillance — ${shopName}`,
      body([{ kind: 'fixed', title: 'Test', detail: 'Si vous lisez ceci, les alertes fonctionnent.' }], shopName),
    );
    console.log(ok ? `Message de test envoyé à ${config.smtp.to}` : 'Échec : SMTP non configuré');
    return;
  }

  const current = {};
  for (const check of CHECKS) {
    current[check.key] = { problem: await check.run(), title: check.title };
  }

  const broken = Object.entries(current).filter(([, v]) => v.problem);
  if (mode === '--check') {
    for (const check of CHECKS) {
      const problem = current[check.key].problem;
      console.log(`${problem ? '✗' : '✓'} ${check.key.padEnd(8)} ${problem || 'ok'}`);
    }
    return;
  }

  const previous = await readState();
  const alerts = decide(previous, current);
  if (alerts.length) {
    const worst = alerts.find((a) => a.kind !== 'fixed') || alerts[0];
    try {
      await sendMail(`${SUBJECT[worst.kind](worst.title)} — ${shopName}`, body(alerts, shopName));
      console.log(`Alerte envoyée : ${alerts.map((a) => `${a.kind}/${a.key}`).join(', ')}`);
    } catch (err) {
      // Mail failing must not stop the state from advancing, or every run
      // would retry forever and fill the log.
      console.error('Envoi de l’alerte impossible :', err.message);
    }
  }
  await fs.writeFile(STATE_FILE, JSON.stringify(nextState(previous, current, alerts), null, 2));
  if (!alerts.length && broken.length) console.log(`Toujours en panne : ${broken.map(([k]) => k).join(', ')}`);
}

// Only run when invoked directly, so the tests can import decide()/nextState().
if (process.argv[1] && process.argv[1].endsWith('watchdog.js')) {
  main().catch((err) => {
    console.error('Surveillance en échec :', err.stack || err.message);
    process.exit(1);
  });
}
