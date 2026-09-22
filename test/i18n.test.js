import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dictionariesForTest } from '../src/i18n/index.js';
import { adminDictionaries } from '../src/admin/i18n.js';

const keys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  ).sort();

test('bot copy: French and English define the same keys', () => {
  assert.deepEqual(keys(dictionariesForTest.en), keys(dictionariesForTest.fr));
});

test('dashboard copy: French and English define the same keys', () => {
  assert.deepEqual(keys(adminDictionaries.en), keys(adminDictionaries.fr));
});
