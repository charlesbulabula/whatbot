// Upserts KEY=VALUE lines read from stdin into a dotenv file, keeping its
// comments and every other line. Used by deploy.sh to apply settings coming
// from GitHub secrets (or the local environment) without printing them.
//
//   printf 'WA_TOKEN=abc\n' | node deploy/merge-env.js /opt/whatbot/.env
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node deploy/merge-env.js <.env path> < KEY=VALUE lines');
  process.exit(2);
}

const updates = new Map();
for (const line of fs.readFileSync(0, 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  if (eq > 0 && /^[A-Z][A-Z0-9_]*$/.test(key) && value) updates.set(key, value);
}

// dotenv has no escape sequences inside quotes, so pick a quote character the
// value does not contain: plain, 'single' or `backtick` (all read literally).
function quote(key, v) {
  if (/^[A-Za-z0-9_\-.,:/@+=]*$/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('`')) return `\`${v}\``;
  throw new Error(`${key}: a value cannot contain both ' and \` characters`);
}

const seen = new Set();
const lines = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n').map((line) => {
  const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1];
  if (!key || !updates.has(key)) return line;
  seen.add(key);
  return `${key}=${quote(key, updates.get(key))}`;
});
while (lines.length && lines.at(-1) === '') lines.pop();
for (const [key, value] of updates) if (!seen.has(key)) lines.push(`${key}=${quote(key, value)}`);

fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
console.log(updates.size ? `Settings applied: ${[...updates.keys()].join(', ')}` : 'No settings to apply');
