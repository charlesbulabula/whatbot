// One conversation, three doors.
import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/index.js'); // seeds the starter catalogue
const { handleInbound } = await import('../src/bot/engine.js');
const { extractMessages } = await import('../src/meta/webhook.js');
const { toPayload } = await import('../src/meta/messenger.js');
const ch = await import('../src/channels.js');

test('an address says which channel it belongs to, and phones are untouched', () => {
  assert.equal(ch.channelOf('243810000001'), ch.WHATSAPP);
  assert.equal(ch.channelOf('m:9876543210'), ch.MESSENGER);
  assert.equal(ch.channelOf('i:1234567890'), ch.INSTAGRAM);
  assert.equal(ch.idOf('i:1234567890'), '1234567890');
  assert.equal(ch.idOf('243810000001'), '243810000001', 'a phone is its own id');
  assert.equal(ch.addressFor(ch.MESSENGER, '42'), 'm:42');
});

test('a Page webhook is flattened into what the engine already understands', () => {
  const [msg] = extractMessages({
    object: 'instagram',
    entry: [{ messaging: [{
      sender: { id: '555' }, timestamp: 1700000000000,
      message: { mid: 'abc', text: 'Bonjour' },
    }] }],
  });
  assert.equal(msg.from, 'i:555');
  assert.equal(msg.type, 'text');
  assert.equal(msg.text, 'Bonjour');

  // Our own messages coming back, and read receipts, are not conversation.
  assert.equal(extractMessages({
    object: 'page',
    entry: [{ messaging: [
      { sender: { id: '1' }, message: { mid: 'x', text: 'hi', is_echo: true } },
      { sender: { id: '1' }, read: { watermark: 1 } },
    ] }],
  }).length, 0);
});

test('the whole ordering flow runs on Instagram, not just the greeting', () => {
  const from = 'i:900001';
  const say = (text) => handleInbound({ from, id: `t${Math.random()}`, type: 'text', text });
  const tap = (replyId) => handleInbound({ from, id: `t${Math.random()}`, type: 'interactive', replyId, text: '' });

  assert.match(say('Bonjour').messages[0].body, /bienvenue|Que souhaitez-vous/);
  tap('menu:order');
  const sizes = tap('p:1');
  assert.ok(sizes.messages.length, 'the catalogue answered');
  const qty = tap('size:medium');
  assert.ok(qty.messages.length);
  const added = tap('qty:2');
  assert.match(added.messages.map((m) => m.body).join('\n'), /Votre panier/);
});

test('a list with no Messenger equivalent degrades to numbered text, keeping its aisles', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `p:${i}`, title: `Produit ${i}` }));
  const payload = toPayload({
    kind: 'list', to: 'm:1', body: 'Choisissez', rows: many,
    sections: [{ title: 'Légumes', rows: many.slice(0, 10) }, { title: 'Épices', rows: many.slice(10) }],
  });
  assert.ok(!payload.message.quick_replies, 'too many for quick replies');
  assert.match(payload.message.text, /\*Légumes\*/);
  assert.match(payload.message.text, /\*Épices\*/);
  assert.match(payload.message.text, /\*20\.\* Produit 19/, 'nothing is truncated away');
});

test('a short list becomes quick replies, within Messenger’s own limits', () => {
  const payload = toPayload({
    kind: 'buttons', to: 'm:1', body: 'On valide ?',
    buttons: [{ id: 'yes', title: 'Confirmer' }, { id: 'no', title: 'Annuler' }],
  });
  assert.equal(payload.recipient.id, '1', 'the prefix is ours, not Meta’s');
  assert.equal(payload.message.quick_replies.length, 2);
  assert.equal(payload.message.quick_replies[0].payload, 'yes');
});

test('the dashboard never shows a Messenger id as a phone number', async () => {
  const { waLink, channelBadge } = await import('../src/admin/ui.js');
  assert.match(waLink('243810000001'), /wa\.me\/243810000001/);
  assert.match(waLink('243810000001'), /\+243810000001/);
  assert.equal(channelBadge('243810000001'), '', 'WhatsApp is the norm, it needs no mark');

  const ig = waLink('i:555');
  assert.match(ig, /ig\.me\/m\/555/);
  assert.doesNotMatch(ig, /\+i:/, 'never a fake phone number');
  assert.match(channelBadge('i:555'), /Instagram/);
  assert.match(waLink('m:42'), /m\.me\/42/);
});
