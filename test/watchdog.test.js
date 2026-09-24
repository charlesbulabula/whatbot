// The part of supervision that decides whether to wake someone up.
import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { decide, nextState } = await import('../deploy/watchdog.js');

const healthy = { service: { problem: null, title: 'Service' } };
const broken = { service: { problem: 'le service est « failed »', title: 'Service' } };

test('a new problem is announced once, not on every run', () => {
  const first = decide(null, broken);
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, 'broken');

  // Five minutes later, still broken: silence.
  const state = nextState(null, broken, first);
  assert.deepEqual(decide(state, broken), []);
});

test('a problem that lasts is repeated after six hours, never sooner', () => {
  const state = nextState(null, broken, decide(null, broken), 0);
  assert.deepEqual(decide(state, broken, 5 * 36e5), [], 'quiet at five hours');

  const [again] = decide(state, broken, 6 * 36e5);
  assert.equal(again.kind, 'reminder');
});

test('recovery is announced too, so nobody wonders', () => {
  const state = nextState(null, broken, decide(null, broken));
  const [fixed] = decide(state, healthy);
  assert.equal(fixed.kind, 'fixed');

  // And once recovered, it stays quiet.
  assert.deepEqual(decide(nextState(state, healthy, [fixed]), healthy), []);
});

test('a reminder resets the clock, so it does not repeat every run after six hours', () => {
  let state = nextState(null, broken, decide(null, broken), 0);
  const alerts = decide(state, broken, 6 * 36e5);
  state = nextState(state, broken, alerts, 6 * 36e5);
  assert.deepEqual(decide(state, broken, 6 * 36e5 + 60_000), [], 'quiet a minute later');
  assert.equal(decide(state, broken, 12 * 36e5).length, 1, 'again six hours on');
});
