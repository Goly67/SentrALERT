import test from 'node:test';
import assert from 'node:assert/strict';

import { readIncidentStatusMap, writeIncidentStatusMap } from './incidentStatusStore.js';

function createStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
  };
}

test('restores persisted fire statuses and ignores unknown values', () => {
  const storage = createStorage({
    'fire-watch-surigao:incident-status-map': JSON.stringify({
      a: 'under_control',
      b: 'fire_out',
      c: 'bad-status',
      d: 'active',
    }),
  });

  assert.deepEqual(readIncidentStatusMap(storage), {
    a: 'under_control',
    b: 'fire_out',
    d: 'active',
  });
});

test('writes only valid incident statuses to storage', () => {
  const storage = createStorage();

  writeIncidentStatusMap(storage, {
    a: 'under_control',
    b: 'fire_out',
    c: 'fake',
    d: 'active',
  });

  assert.deepEqual(JSON.parse(storage.getItem('fire-watch-surigao:incident-status-map')), {
    a: 'under_control',
    b: 'fire_out',
    d: 'active',
  });
});
