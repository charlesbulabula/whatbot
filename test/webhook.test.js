import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isValidSignature } from '../src/whatsapp/signature.js';
import { extractMessages } from '../src/whatsapp/webhook.js';

test('signature check accepts Meta-signed bodies only', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = 's3cret';
  const good = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(isValidSignature(body, good, secret), true);
  assert.equal(isValidSignature(body, good, 'other'), false);
  assert.equal(isValidSignature(Buffer.from('{}'), good, secret), false);
  assert.equal(isValidSignature(body, undefined, secret), false);
});

test('webhook payloads are flattened into inbound messages', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '123' },
              contacts: [{ wa_id: '243811111111', profile: { name: 'Mado' } }],
              messages: [
                { id: 'a', from: '243811111111', timestamp: '1', type: 'text', text: { body: 'Bonjour' } },
                { id: 'b', from: '243811111111', timestamp: '2', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'menu:order', title: '🛒 Commander' } } },
                { id: 'c', from: '243811111111', timestamp: '3', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'p:1', title: 'Tomate' } } },
                { id: 'd', from: '243811111111', timestamp: '4', type: 'image', image: { id: 'MEDIA', caption: 'paiement' } },
                { id: 'e', from: '243811111111', timestamp: '5', type: 'sticker', sticker: {} },
              ],
            },
          },
          { value: { statuses: [{ id: 'x', status: 'delivered' }] } },
        ],
      },
    ],
  };
  const msgs = extractMessages(payload);
  assert.equal(msgs.length, 5);
  assert.deepEqual(
    msgs.map((m) => [m.type, m.replyId ?? m.mediaId ?? m.text]),
    [
      ['text', 'Bonjour'],
      ['interactive', 'menu:order'],
      ['interactive', 'p:1'],
      ['image', 'MEDIA'],
      ['unsupported', undefined],
    ],
  );
  assert.equal(msgs[0].profileName, 'Mado');
});
