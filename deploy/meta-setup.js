// Sets up (and audits) the Meta side of a real WhatsApp Business account.
//
// Everything Meta exposes through the Graph API is done here; what is left can
// only be done by a human in Meta's own interface, and is printed as a checklist
// at the end. Nothing secret is ever printed — this runs in public CI logs.
//
//   node deploy/meta-setup.js --check                 audit only, changes nothing
//   node deploy/meta-setup.js --apply                 subscribe + create templates
//   node deploy/meta-setup.js --apply --register PIN  also register the number
//
// Reads from the environment: WA_TOKEN, WA_APP_ID, WA_APP_SECRET, WA_WABA_ID,
// WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN, PUBLIC_URL.
import process from 'node:process';

const GRAPH = `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;

const env = {
  token: process.env.WA_TOKEN || '',
  appId: process.env.WA_APP_ID || '',
  appSecret: process.env.WA_APP_SECRET || '',
  waba: process.env.WA_WABA_ID || '',
  phoneId: process.env.WA_PHONE_NUMBER_ID || '',
  verifyToken: process.env.WA_VERIFY_TOKEN || '',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
};

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REGISTER_PIN = args.includes('--register') ? args[args.indexOf('--register') + 1] : null;

const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const title = (m) => console.log(`\n== ${m}`);

const todo = [];
const note = (m) => todo.push(m);

async function graph(path, { method = 'GET', body = null, asApp = false } = {}) {
  const auth = asApp ? `${env.appId}|${env.appSecret}` : env.token;
  const url = `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(auth)}`;
  const res = await fetch(url, {
    method,
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  const error = json.error && {
    ...json.error,
    // error_user_msg carries the reason a human can act on.
    message: [json.error.error_user_title, json.error.error_user_msg].filter(Boolean).join(' — ')
      || json.error.message,
  };
  return { status: res.status, json, error };
}

/* ------------------------------ the templates ---------------------------- */
//
// Parameter counts must match what the app sends (see src/bot/notify.js):
//   orderUpdate   {{1}} reference  {{2}} status
//   survey        {{1}} name       {{2}} reference
//   weeklyReminder{{1}} name
//   waitlistOpen  {{1}} name
//   winback       {{1}} name       {{2}} promo code
//   adminAlert    {{1}} who/what   {{2}} detail

const TEMPLATES = [
  {
    key: 'orderUpdate',
    name: 'order_update',
    category: 'UTILITY',
    bodies: {
      fr: 'Votre commande {{1}} est maintenant : {{2}}. Écrivez-nous pour toute question.',
      en: 'Your order {{1}} is now: {{2}}. Write to us with any question.',
    },
    example: ['CMD-20260101-001', 'en préparation'],
  },
  {
    key: 'survey',
    name: 'delivery_survey',
    category: 'UTILITY',
    bodies: {
      fr: 'Bonjour {{1}}, comment s’est passée la livraison de la commande {{2}} ? Répondez avec une note de 1 à 5 ⭐',
      en: 'Hello {{1}}, how did the delivery of order {{2}} go? Reply with a rating from 1 to 5 ⭐',
    },
    example: ['Mamie', 'CMD-20260101-001'],
  },
  {
    key: 'weeklyReminder',
    name: 'weekly_reminder',
    category: 'MARKETING',
    bodies: {
      fr: 'Bonjour {{1}} ! C’est bientôt le moment de refaire le plein d’épices 🌶️ Répondez *menu* pour commander.',
      en: 'Hello {{1}}! Time to stock up on fresh spices 🌶️ Reply *menu* to order.',
    },
    example: ['Mamie'],
  },
  {
    key: 'waitlistOpen',
    name: 'waitlist_open',
    category: 'UTILITY',
    bodies: {
      fr: 'Bonne nouvelle {{1}} 🎉 Les commandes sont rouvertes. Répondez *menu* pour commander.',
      en: 'Good news {{1}} 🎉 Orders are open again. Reply *menu* to order.',
    },
    example: ['Mamie'],
  },
  {
    key: 'winback',
    name: 'winback_offer',
    category: 'MARKETING',
    bodies: {
      fr: 'Bonjour {{1}} 👋 Cela fait un moment ! Voici le code {{2}} pour une réduction sur votre prochaine commande. Répondez *menu*.',
      en: 'Hello {{1}} 👋 It has been a while! Here is code {{2}} for a discount on your next order. Reply *menu*.',
    },
    example: ['Mamie', 'RETOUR001ABC'],
  },
  {
    key: 'adminAlert',
    name: 'shop_alert',
    category: 'UTILITY',
    bodies: {
      fr: 'Nouvelle activité sur votre boutique concernant {{1}} : {{2}}. Ouvrez le tableau de bord pour voir le détail et répondre.',
      en: 'New activity on your shop about {{1}}: {{2}}. Open the dashboard to see the details and reply.',
    },
    example: ['CMD-20260101-001', '12 000 FC'],
  },
];

const LANGUAGES = { fr: 'fr', en: 'en' };

/* --------------------------------- checks -------------------------------- */

async function checkToken() {
  title('Access token');
  if (!env.token) {
    bad('WA_TOKEN is empty');
    note('Create a System User token in Meta Business Settings and put it in the WA_TOKEN secret.');
    return false;
  }
  if (!env.appId || !env.appSecret) {
    info('WA_APP_ID / WA_APP_SECRET missing: cannot inspect the token, only use it.');
    return true;
  }
  const { json } = await graph(`debug_token?input_token=${encodeURIComponent(env.token)}`, { asApp: true });
  const d = json.data || {};
  if (!d.is_valid) {
    bad(`token rejected: ${d.error?.message || 'invalid'}`);
    note('Generate a new permanent System User token (no expiry).');
    return false;
  }
  ok(`valid, type ${d.type || '?'}`);
  if (d.expires_at) {
    const when = new Date(d.expires_at * 1000).toISOString().slice(0, 10);
    bad(`this token EXPIRES on ${when} — a temporary token`);
    note('Replace it with a System User token with no expiry, otherwise the bot stops that day.');
  } else {
    ok('never expires');
  }
  const scopes = d.scopes || [];
  for (const needed of ['whatsapp_business_messaging', 'whatsapp_business_management']) {
    if (scopes.includes(needed)) ok(`scope ${needed}`);
    else {
      bad(`missing scope ${needed}`);
      note(`Give the System User the ${needed} permission on the app, then regenerate the token.`);
    }
  }
  return true;
}

async function checkBusiness() {
  title('Business and WhatsApp account');
  if (!env.waba) {
    bad('WA_WABA_ID is empty');
    note('Copy the WhatsApp Business Account ID from the app’s WhatsApp > API Setup page.');
    return;
  }
  const { json, error } = await graph(`${env.waba}?fields=id,name,timezone_id,message_template_namespace,owner_business_info,account_review_status`);
  if (error) {
    bad(`cannot read the WABA: ${error.message}`);
    return;
  }
  ok(`WABA "${json.name || json.id}"`);
  if (json.account_review_status) info(`review status: ${json.account_review_status}`);
  const business = json.owner_business_info;
  if (business?.id) {
    const biz = await graph(`${business.id}?fields=id,name,verification_status`);
    if (!biz.error) {
      const status = biz.json.verification_status;
      if (status === 'verified') ok(`business "${biz.json.name}" is verified`);
      else {
        bad(`business "${biz.json.name}" is ${status || 'not verified'}`);
        note('Complete business verification in Meta Business Settings > Security Centre. Without it the shop stays limited to a small number of contacts.');
      }
    }
  }
}

async function checkNumbers() {
  title('Phone numbers');
  if (!env.waba) return;
  const { json, error } = await graph(
    `${env.waba}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,name_status`,
  );
  if (error) {
    bad(`cannot list the numbers: ${error.message}`);
    return;
  }
  const numbers = json.data || [];
  if (!numbers.length) {
    bad('this WhatsApp account has no phone number');
    note('Add your real number in the app: WhatsApp > API Setup > Add phone number, then verify it by SMS or call.');
    return;
  }
  for (const n of numbers) {
    const current = n.id === env.phoneId ? ' ← the one this bot uses' : '';
    ok(`${n.display_phone_number} "${n.verified_name}" (${n.platform_type || 'CLOUD_API'})${current}`);
    info(`  verification: ${n.code_verification_status} · name: ${n.name_status || '?'} · quality: ${n.quality_rating || '?'}`);
    if (n.id === env.phoneId && n.code_verification_status !== 'VERIFIED') {
      note('Finish the SMS/call verification of the number used by the bot.');
    }
    if (n.id === env.phoneId && n.name_status && n.name_status !== 'APPROVED') {
      note('Your display name is not approved yet: customers see the raw number until Meta approves it.');
    }
  }
  if (env.phoneId && !numbers.some((n) => n.id === env.phoneId)) {
    bad(`WA_PHONE_NUMBER_ID ${env.phoneId} does not belong to this WhatsApp account`);
    note('Update the WA_PHONE_NUMBER_ID secret with the id of your real number.');
  }
}

async function checkWebhook() {
  title('Webhook');
  if (!env.publicUrl) {
    bad('PUBLIC_URL is empty');
    return;
  }
  const url = `${env.publicUrl}/webhook`;
  info(`callback URL : ${url}`);
  info('fields to tick: messages');

  // Meta verifies the endpoint exactly this way, so do the same.
  try {
    const probe = `${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(env.verifyToken)}&hub.challenge=42`;
    const res = await fetch(probe, { signal: AbortSignal.timeout(15_000) });
    const text = (await res.text()).trim();
    if (res.status === 200 && text === '42') ok('the endpoint answers Meta’s verification handshake');
    else {
      bad(`handshake failed (HTTP ${res.status}, body "${text.slice(0, 40)}")`);
      note('Check that the WA_VERIFY_TOKEN secret matches the one typed in Meta.');
    }
  } catch (err) {
    bad(`endpoint unreachable: ${err.message}`);
  }

  if (env.appId && env.appSecret) {
    const { json } = await graph(`${env.appId}/subscriptions`, { asApp: true });
    const wa = (json.data || []).find((s) => s.object === 'whatsapp_business_account');
    if (!wa) {
      bad('the app has no whatsapp_business_account webhook');
      note('In the app: WhatsApp > Configuration > Edit, paste the callback URL and the verify token, then subscribe to "messages".');
    } else {
      ok(`app webhook → ${wa.callback_url}`);
      const fields = (wa.fields || []).map((f) => f.name || f);
      if (fields.includes('messages')) ok('subscribed to "messages"');
      else {
        bad('not subscribed to the "messages" field');
        note('Tick the "messages" field in the app’s webhook configuration.');
      }
      if (env.publicUrl && !String(wa.callback_url).startsWith(env.publicUrl)) {
        bad(`the app points at ${wa.callback_url}, not at ${url}`);
      }
    }
  }
}

async function subscribeWaba() {
  title('WhatsApp account → app subscription');
  if (!env.waba) return;
  const before = await graph(`${env.waba}/subscribed_apps`);
  const subscribed = (before.json?.data || []).length > 0;
  if (subscribed) {
    ok('already subscribed');
    return;
  }
  if (!APPLY) {
    bad('not subscribed (run with --apply to fix)');
    return;
  }
  const res = await graph(`${env.waba}/subscribed_apps`, { method: 'POST' });
  if (res.json?.success) ok('subscribed');
  else {
    bad(`could not subscribe: ${res.error?.message || JSON.stringify(res.json)}`);
    note('Subscribe the WhatsApp account to the app from Business Settings > Accounts > WhatsApp accounts.');
  }
}

async function registerNumber() {
  if (!REGISTER_PIN) return;
  title('Registering the number for Cloud API');
  if (!/^\d{6}$/.test(REGISTER_PIN)) {
    bad('the PIN must be exactly 6 digits');
    return;
  }
  const res = await graph(`${env.phoneId}/register`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', pin: REGISTER_PIN },
  });
  if (res.json?.success) ok('number registered (remember this PIN: it is the two-step code)');
  else bad(`registration refused: ${res.error?.message || JSON.stringify(res.json)}`);
}

/* -------------------------------- templates ------------------------------- */

async function syncTemplates() {
  title('Message templates');
  if (!env.waba) return;
  const existing = await graph(`${env.waba}/message_templates?fields=name,language,status,category&limit=200`);
  if (existing.error) {
    bad(`cannot list the templates: ${existing.error.message}`);
    return;
  }
  const have = new Map((existing.json.data || []).map((t) => [`${t.name}:${t.language}`, t]));

  for (const tpl of TEMPLATES) {
    for (const [locale, language] of Object.entries(LANGUAGES)) {
      const key = `${tpl.name}:${language}`;
      const found = have.get(key);
      if (found) {
        const mark = found.status === 'APPROVED' ? ok : info;
        mark(`${tpl.name} (${language}) — ${found.status}`);
        if (found.status === 'REJECTED') {
          note(`Template ${tpl.name} (${language}) was rejected: rewrite it in Meta’s template manager.`);
        }
        continue;
      }
      if (!APPLY) {
        bad(`${tpl.name} (${language}) — missing (run with --apply to create)`);
        continue;
      }
      const res = await graph(`${env.waba}/message_templates`, {
        method: 'POST',
        body: {
          name: tpl.name,
          language,
          category: tpl.category,
          components: [
            {
              type: 'BODY',
              text: tpl.bodies[locale],
              ...(tpl.example.length && { example: { body_text: [tpl.example] } }),
            },
          ],
        },
      });
      if (res.json?.id) ok(`${tpl.name} (${language}) — submitted, status ${res.json.status || 'PENDING'}`);
      else bad(`${tpl.name} (${language}) — ${res.error?.message || JSON.stringify(res.json)}`);
    }
  }

  console.log('\n  Put these names in the deployment secrets:');
  for (const tpl of TEMPLATES) {
    console.log(`    WA_TEMPLATE_${tpl.key.replace(/([A-Z])/g, '_$1').toUpperCase()}=${tpl.name}`);
  }
}

/* ---------------------------------- main ---------------------------------- */

const valid = await checkToken();
if (valid) {
  await checkBusiness();
  await checkNumbers();
  await subscribeWaba();
  await registerNumber();
  await syncTemplates();
}
await checkWebhook();

title(APPLY ? 'Left to do by hand in Meta' : 'What is missing (nothing was changed)');
if (!todo.length) console.log('  Nothing — the Meta side is ready.');
else todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
console.log('');
