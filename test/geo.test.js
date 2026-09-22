import { customer, optionIds } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db/index.js';
import { matchZone, placeLabel } from '../src/geo/nominatim.js';

// Shapes returned by Nominatim for Kinshasa (address part only).
const LIMETE = { road: 'Boulevard Lumumba', suburb: 'Limete', city: 'Kinshasa', country: 'République démocratique du Congo' };
const GOMBE = { road: 'Avenue du Commerce', city_district: 'Commune de la Gombe', city: 'Kinshasa' };
const MASINA = { road: 'Route de Matadi', suburb: 'Masina', city: 'Kinshasa' };

test('Nominatim addresses are matched to served zones, commune prefixes and accents ignored', () => {
  const zones = ['Gombe', 'Limete', 'Ngaliema'];
  assert.equal(matchZone(LIMETE, zones), 'Limete');
  assert.equal(matchZone(GOMBE, zones), null, '"de la Gombe" keeps its article');
  assert.equal(matchZone({ city_district: 'Commune de Gombe' }, zones), 'Gombe');
  assert.equal(matchZone({ suburb: 'NGALIÉMA' }, zones), 'Ngaliema');
  assert.equal(matchZone(MASINA, zones), null);
  assert.equal(matchZone({ city: 'Kinshasa' }, zones), null);
  assert.equal(placeLabel(MASINA), 'Masina');
});

const toZone = (c, name) => {
  c.say('Bonjour');
  c.tap('menu:order');
  c.tap('p:1');
  c.tap('size:small');
  c.tap('qty:1');
  c.tap('more:checkout');
  return c.say(name);
};

test('a location in a served zone fills zone and address and goes straight to the recap', () => {
  const c = customer('243850000001');
  toZone(c, 'Aline');
  const { last } = c.location(-4.3701, 15.3462, { zone: 'Limete', place: 'Limete' });
  assert.match(last.body, /Position reçue : \*Limete\*/);
  assert.match(last.body, /Récapitulatif/);
  assert.match(last.body, /Aline — Limete/);
  assert.match(last.body, /maps\.google\.com\/\?q=-4\.3701,15\.3462/);
  assert.equal(db.getCustomer(c.phone).neighborhood, 'Limete');
});

test('a location outside the served zones is refused by name; unknown places ask for the list', () => {
  const c = customer('243850000002');
  toZone(c, 'Bob');
  assert.match(c.location(-4.4, 15.4, { zone: null, place: 'Masina' }).last.body, /pas encore à \*Masina\*/);
  const unknown = c.location(-4.4, 15.4, null).last;
  assert.match(unknown.body, /pas reconnu le quartier/);
  assert.ok(optionIds(unknown).includes('zone:0'));
  assert.equal(c.state(), 'ASK_ZONE');
});

test('a known customer can share a new location instead of confirming the old address', () => {
  const c = customer('243850000003');
  toZone(c, 'Chantal');
  c.tap('zone:0');
  c.say('Av. A 1');
  c.tap('recap:confirm');
  c.say('menu');
  c.tap('menu:order');
  c.tap('dup:new');
  c.tap('p:2');
  c.tap('size:small');
  c.tap('qty:1');
  assert.match(c.tap('more:checkout').last.body, /Livrer à \*Chantal\*, Gombe/);
  const recap = c.location(-4.37, 15.34, { zone: 'Limete', place: 'Limete' }).last;
  assert.match(recap.body, /Chantal — Limete/);
});
