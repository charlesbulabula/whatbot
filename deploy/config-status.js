// Prints which settings are filled in the server's .env, never their values
// (deploy logs of this public repository are public).
import fs from 'node:fs';
import dotenv from 'dotenv';

const KEYS = [
  ['ADMIN_PASSWORD', 'required'],
  ['WA_VERIFY_TOKEN', 'required'],
  ['WA_PHONE_NUMBER_ID', 'Meta'],
  ['WA_TOKEN', 'Meta'],
  ['WA_APP_SECRET', 'Meta'],
  ['WA_BUSINESS_NUMBER', 'referral links'],
  ['MOMO_ORANGE', 'payment'],
  ['MOMO_AIRTEL', 'payment'],
  ['ADMIN_NOTIFY_NUMBER', 'alerts'],
  ['ANTHROPIC_API_KEY', 'optional: free-text orders'],
];

const env = dotenv.parse(fs.readFileSync(process.argv[2] || '.env'));
for (const [key, role] of KEYS) console.log(`  ${env[key] ? '✔' : '✘'} ${key.padEnd(20)} ${env[key] ? '' : `(empty — ${role})`}`);
